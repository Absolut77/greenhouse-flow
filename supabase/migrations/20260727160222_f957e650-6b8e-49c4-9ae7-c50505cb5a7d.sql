CREATE OR REPLACE FUNCTION public.close_event(_event_id uuid, _lot_name text, _units integer, _unit_weight_g numeric, _used_g numeric, _dry_destroyed_g numeric, _completed_at timestamp with time zone DEFAULT now(), _surplus_returns jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ev record;
  src_out_g numeric;
  produced_g numeric;
  surplus numeric;
  loss_g numeric;
  parent_lot_id uuid;
  batch_id_v uuid;
  new_lot_id uuid;
  ret record;
  ret_sum numeric := 0;
  lot_out_g numeric;
  lot_num text;
  cont record;
  agg record;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::app_role[]) THEN
    RAISE EXCEPTION 'Permission refusée' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO ev FROM public.events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Événement introuvable'; END IF;
  IF ev.status = 'completed' THEN RAISE EXCEPTION 'Événement déjà clôturé'; END IF;

  SELECT COALESCE(SUM(quantity_grams),0) INTO src_out_g
    FROM public.event_items WHERE event_id = _event_id AND direction = 'out';

  produced_g := COALESCE(_units,0) * COALESCE(_unit_weight_g,0);
  loss_g := GREATEST(COALESCE(_used_g,0) - produced_g, 0);
  surplus := src_out_g - COALESCE(_used_g,0) - COALESCE(_dry_destroyed_g,0);

  IF surplus < -0.001 THEN
    RAISE EXCEPTION 'Utilisé (% g) + destruction dry (% g) dépasse la sortie totale (% g).',
      _used_g, _dry_destroyed_g, src_out_g;
  END IF;

  SELECT il.id, il.batch_id INTO parent_lot_id, batch_id_v
    FROM public.event_items ei
    JOIN public.inventory_lots il ON il.id = ei.inventory_lot_id
   WHERE ei.event_id = _event_id AND ei.direction = 'out'
   ORDER BY ei.quantity_grams DESC NULLS LAST
   LIMIT 1;

  IF surplus > 0.001 THEN
    IF _surplus_returns IS NOT NULL AND jsonb_typeof(_surplus_returns) = 'array' AND jsonb_array_length(_surplus_returns) > 0 THEN
      SELECT COALESCE(SUM((elem->>'grams')::numeric), 0) INTO ret_sum
        FROM jsonb_array_elements(_surplus_returns) elem;
      IF ABS(ret_sum - surplus) > 0.01 THEN
        RAISE EXCEPTION 'La somme des retours (% g) ne correspond pas au surplus (% g).', ret_sum, surplus;
      END IF;

      -- Per-lot cap: a return can never exceed what left that lot in this event.
      FOR agg IN
        SELECT (elem->>'lot_id')::uuid AS lot_id,
               SUM((elem->>'grams')::numeric) AS grams
          FROM jsonb_array_elements(_surplus_returns) elem
         GROUP BY 1
      LOOP
        SELECT COALESCE(SUM(quantity_grams), 0) INTO lot_out_g
          FROM public.event_items
         WHERE event_id = _event_id AND direction = 'out' AND inventory_lot_id = agg.lot_id;

        IF lot_out_g <= 0 THEN
          RAISE EXCEPTION 'Le lot % n''est pas un lot source de cet événement.', agg.lot_id;
        END IF;

        IF agg.grams > lot_out_g + 0.001 THEN
          SELECT lot_number INTO lot_num FROM public.inventory_lots WHERE id = agg.lot_id;
          RAISE EXCEPTION 'Retour (% g) sur le lot % dépasse la quantité sortie (% g).',
            agg.grams, COALESCE(lot_num, agg.lot_id::text), lot_out_g;
        END IF;
      END LOOP;

      FOR ret IN
        SELECT (elem->>'lot_id')::uuid AS lot_id,
               (elem->>'grams')::numeric AS grams,
               NULLIF(elem->>'container_id','')::uuid AS container_id,
               NULLIF(elem->>'units','')::integer AS units
          FROM jsonb_array_elements(_surplus_returns) elem
      LOOP
        IF ret.grams IS NULL OR ret.grams <= 0 THEN CONTINUE; END IF;

        IF ret.container_id IS NOT NULL THEN
          SELECT id, lot_id, container_code, container_type
            INTO cont
            FROM public.stock_containers
           WHERE id = ret.container_id;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'Sac introuvable pour le retour.';
          END IF;
          IF cont.lot_id IS DISTINCT FROM ret.lot_id THEN
            RAISE EXCEPTION 'Le sac % n''appartient pas au lot retourné.', cont.container_code;
          END IF;
          IF cont.container_type = 'retention' THEN
            RAISE EXCEPTION 'Les sacs de rétention sont bloqués et ne peuvent pas recevoir de retour.'
              USING ERRCODE = 'restrict_violation';
          END IF;
        END IF;

        -- Traceable return line: triggers re-apply stock on the lot AND the bag.
        INSERT INTO public.event_items (event_id, inventory_lot_id, container_id, quantity_grams, units, direction)
        VALUES (_event_id, ret.lot_id, ret.container_id, ret.grams, COALESCE(ret.units, 0), 'in');
      END LOOP;
    ELSIF parent_lot_id IS NOT NULL THEN
      SELECT COALESCE(SUM(quantity_grams), 0) INTO lot_out_g
        FROM public.event_items
       WHERE event_id = _event_id AND direction = 'out' AND inventory_lot_id = parent_lot_id;
      IF surplus > lot_out_g + 0.001 THEN
        RAISE EXCEPTION 'Surplus (% g) dépasse la sortie du lot principal (% g). Fournissez une répartition par lot.',
          surplus, lot_out_g;
      END IF;
      INSERT INTO public.event_items (event_id, inventory_lot_id, container_id, quantity_grams, units, direction)
      VALUES (_event_id, parent_lot_id, NULL, surplus, 0, 'in');
    END IF;
  END IF;

  IF COALESCE(_units,0) > 0 AND produced_g > 0 THEN
    INSERT INTO public.inventory_lots (
      lot_number, batch_id, parent_lot_id, product_type, format,
      quantity_grams, units, status, lot_kind, notes
    ) VALUES (
      _lot_name,
      batch_id_v,
      parent_lot_id,
      'packaged',
      'finished',
      produced_g,
      COALESCE(_units,0),
      'available',
      'packaged',
      format('Clôture événement %s : %s unités × %s g = %s g. Utilisé source : %s g. Loss : %s g. Destruction dry : %s g. Surplus retourné : %s g.',
        ev.event_number, _units, _unit_weight_g, produced_g,
        _used_g, loss_g, COALESCE(_dry_destroyed_g,0), GREATEST(surplus,0))
    ) RETURNING id INTO new_lot_id;
  END IF;

  IF COALESCE(_dry_destroyed_g,0) > 0 AND batch_id_v IS NOT NULL THEN
    INSERT INTO public.destructions (
      batch_id, stage_code, weight_grams, comments, is_sanitation_log, phase, sanitation_type
    ) VALUES (
      batch_id_v, 'event_close', _dry_destroyed_g,
      format('Destruction dry lors de la clôture de l''événement %s', ev.event_number),
      false, 'dry', 'destruction'
    );
  END IF;

  UPDATE public.events
    SET status = 'completed',
        completed_at = _completed_at,
        processing_loss_grams = loss_g,
        dry_destroyed_grams = COALESCE(_dry_destroyed_g,0)
    WHERE id = _event_id;

  RETURN new_lot_id;
END;
$function$;