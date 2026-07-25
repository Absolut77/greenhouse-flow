
CREATE OR REPLACE FUNCTION public.close_event(
  _event_id uuid,
  _lot_name text,
  _units integer,
  _unit_weight_g numeric,
  _used_g numeric,
  _dry_destroyed_g numeric,
  _completed_at timestamp with time zone DEFAULT now(),
  _surplus_returns jsonb DEFAULT NULL
)
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
  is_source boolean;
BEGIN
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

  -- Identify parent lot (largest out) for parenting new packaged lot
  SELECT il.id, il.batch_id INTO parent_lot_id, batch_id_v
    FROM public.event_items ei
    JOIN public.inventory_lots il ON il.id = ei.inventory_lot_id
   WHERE ei.event_id = _event_id AND ei.direction = 'out'
   ORDER BY ei.quantity_grams DESC NULLS LAST
   LIMIT 1;

  -- Handle surplus return
  IF surplus > 0.001 THEN
    IF _surplus_returns IS NOT NULL AND jsonb_typeof(_surplus_returns) = 'array' AND jsonb_array_length(_surplus_returns) > 0 THEN
      -- Validate sum
      SELECT COALESCE(SUM((elem->>'grams')::numeric), 0) INTO ret_sum
        FROM jsonb_array_elements(_surplus_returns) elem;
      IF ABS(ret_sum - surplus) > 0.01 THEN
        RAISE EXCEPTION 'La somme des retours (% g) ne correspond pas au surplus (% g).', ret_sum, surplus;
      END IF;
      FOR ret IN
        SELECT (elem->>'lot_id')::uuid AS lot_id, (elem->>'grams')::numeric AS grams
        FROM jsonb_array_elements(_surplus_returns) elem
      LOOP
        IF ret.grams IS NULL OR ret.grams <= 0 THEN CONTINUE; END IF;
        -- Ensure lot was actually a source of this event
        SELECT EXISTS(
          SELECT 1 FROM public.event_items
           WHERE event_id = _event_id AND direction = 'out' AND inventory_lot_id = ret.lot_id
        ) INTO is_source;
        IF NOT is_source THEN
          RAISE EXCEPTION 'Le lot % n''est pas un lot source de cet événement.', ret.lot_id;
        END IF;
        UPDATE public.inventory_lots
          SET quantity_grams = COALESCE(quantity_grams,0) + ret.grams,
              updated_at = now()
          WHERE id = ret.lot_id;
      END LOOP;
    ELSIF parent_lot_id IS NOT NULL THEN
      -- Fallback: return all surplus to biggest source lot (legacy behaviour)
      UPDATE public.inventory_lots
        SET quantity_grams = COALESCE(quantity_grams,0) + surplus,
            updated_at = now()
        WHERE id = parent_lot_id;
    END IF;
  END IF;

  -- Create packaged lot
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

  -- Dry destruction record
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
