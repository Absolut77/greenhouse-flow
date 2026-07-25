
-- ============================================================
-- 1. CHECK constraints (validated against existing data)
-- ============================================================
ALTER TABLE public.inventory_lots
  ADD CONSTRAINT inventory_lots_quantity_grams_non_negative
  CHECK (quantity_grams IS NULL OR quantity_grams >= 0);

ALTER TABLE public.inventory_lots
  ADD CONSTRAINT inventory_lots_units_non_negative
  CHECK (units IS NULL OR units >= 0);

ALTER TABLE public.event_items
  ADD CONSTRAINT event_items_quantity_grams_positive
  CHECK (quantity_grams IS NULL OR quantity_grams > 0);

ALTER TABLE public.destructions
  ADD CONSTRAINT destructions_weight_positive_unless_sanitation
  CHECK (is_sanitation_log OR weight_grams > 0);

ALTER TABLE public.stamp_movements
  ADD CONSTRAINT stamp_movements_quantity_positive
  CHECK (quantity > 0);

-- ============================================================
-- 2. Role-gate SECURITY DEFINER RPCs
-- ============================================================

-- apply_event_item_stock: called only by triggers, but also SECURITY DEFINER.
-- Keep callable from triggers (auth.uid() may be null in trigger context if
-- called from another SECURITY DEFINER). Only enforce when a user is present.
CREATE OR REPLACE FUNCTION public.apply_event_item_stock(_lot_id uuid, _direction text, _grams numeric, _units integer, _sign integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  delta_g numeric := 0;
  delta_u integer := 0;
  cur_g numeric;
  cur_u integer;
  lot_num text;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::app_role[]) THEN
    RAISE EXCEPTION 'Permission refusée' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _lot_id IS NULL OR _direction IS NULL THEN
    RETURN;
  END IF;

  IF _direction = 'out' THEN
    delta_g := -COALESCE(_grams, 0) * _sign;
    delta_u := -COALESCE(_units, 0) * _sign;
  ELSIF _direction = 'in' THEN
    delta_g := COALESCE(_grams, 0) * _sign;
    delta_u := COALESCE(_units, 0) * _sign;
  ELSE
    RETURN;
  END IF;

  SELECT quantity_grams, units, lot_number
    INTO cur_g, cur_u, lot_num
  FROM public.inventory_lots
  WHERE id = _lot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot introuvable';
  END IF;

  IF COALESCE(cur_g, 0) + delta_g < 0 THEN
    RAISE EXCEPTION 'Stock insuffisant pour le lot %: disponible %g, demandé %g',
      lot_num, COALESCE(cur_g, 0), -delta_g;
  END IF;

  IF COALESCE(cur_u, 0) + delta_u < 0 THEN
    RAISE EXCEPTION 'Unités insuffisantes pour le lot %: disponibles %, demandées %',
      lot_num, COALESCE(cur_u, 0), -delta_u;
  END IF;

  UPDATE public.inventory_lots
  SET quantity_grams = COALESCE(quantity_grams, 0) + delta_g,
      units = COALESCE(units, 0) + delta_u,
      updated_at = now()
  WHERE id = _lot_id;
END;
$function$;

-- delete_packaged_lot
CREATE OR REPLACE FUNCTION public.delete_packaged_lot(_lot_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  child RECORD;
  parent RECORD;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','supervisor']::app_role[]) THEN
    RAISE EXCEPTION 'Permission refusée' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _lot_id IS NULL THEN
    RAISE EXCEPTION 'Lot introuvable';
  END IF;

  SELECT id, parent_lot_id, quantity_grams, units, lot_number
    INTO child
  FROM public.inventory_lots
  WHERE id = _lot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot introuvable';
  END IF;

  IF child.parent_lot_id IS NOT NULL THEN
    SELECT id, quantity_grams, units
      INTO parent
    FROM public.inventory_lots
    WHERE id = child.parent_lot_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lot source introuvable — restitution impossible';
    END IF;

    UPDATE public.inventory_lots
    SET quantity_grams = COALESCE(quantity_grams, 0) + COALESCE(child.quantity_grams, 0),
        units = COALESCE(units, 0) + COALESCE(child.units, 0),
        updated_at = now()
    WHERE id = parent.id;
  END IF;

  DELETE FROM public.inventory_lots WHERE id = child.id;
END;
$function$;

-- close_event: role gate + per-lot surplus cap
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
  lot_out_g numeric;
  lot_num text;
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
      FOR ret IN
        SELECT (elem->>'lot_id')::uuid AS lot_id, (elem->>'grams')::numeric AS grams
        FROM jsonb_array_elements(_surplus_returns) elem
      LOOP
        IF ret.grams IS NULL OR ret.grams <= 0 THEN CONTINUE; END IF;

        -- Total sorti de ce lot dans cet événement (0 si le lot n'est pas source)
        SELECT COALESCE(SUM(quantity_grams), 0) INTO lot_out_g
          FROM public.event_items
         WHERE event_id = _event_id AND direction = 'out' AND inventory_lot_id = ret.lot_id;

        IF lot_out_g <= 0 THEN
          RAISE EXCEPTION 'Le lot % n''est pas un lot source de cet événement.', ret.lot_id;
        END IF;

        IF ret.grams > lot_out_g + 0.001 THEN
          SELECT lot_number INTO lot_num FROM public.inventory_lots WHERE id = ret.lot_id;
          RAISE EXCEPTION 'Retour (% g) sur le lot % dépasse la quantité sortie (% g).',
            ret.grams, COALESCE(lot_num, ret.lot_id::text), lot_out_g;
        END IF;

        UPDATE public.inventory_lots
          SET quantity_grams = COALESCE(quantity_grams,0) + ret.grams,
              updated_at = now()
          WHERE id = ret.lot_id;
      END LOOP;
    ELSIF parent_lot_id IS NOT NULL THEN
      -- Fallback legacy : tout sur le plus gros lot (borné à sa quantité sortie)
      SELECT COALESCE(SUM(quantity_grams), 0) INTO lot_out_g
        FROM public.event_items
       WHERE event_id = _event_id AND direction = 'out' AND inventory_lot_id = parent_lot_id;
      IF surplus > lot_out_g + 0.001 THEN
        RAISE EXCEPTION 'Surplus (% g) dépasse la sortie du lot principal (% g). Fournissez une répartition par lot.',
          surplus, lot_out_g;
      END IF;
      UPDATE public.inventory_lots
        SET quantity_grams = COALESCE(quantity_grams,0) + surplus,
            updated_at = now()
        WHERE id = parent_lot_id;
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

-- delete_batch_cascade already has an admin check; re-affirm using has_any_role for consistency.
CREATE OR REPLACE FUNCTION public.delete_batch_cascade(_batch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  blocking_items integer;
  blocking_stamps integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Seuls les administrateurs peuvent supprimer une batch.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _batch_id IS NULL THEN
    RAISE EXCEPTION 'Batch introuvable';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.batches WHERE id = _batch_id) THEN
    RAISE EXCEPTION 'Batch introuvable';
  END IF;

  SELECT COUNT(*) INTO blocking_items
  FROM public.event_items ei
  JOIN public.inventory_lots il ON il.id = ei.inventory_lot_id
  WHERE il.batch_id = _batch_id;

  SELECT COUNT(*) INTO blocking_stamps
  FROM public.stamp_movements sm
  JOIN public.inventory_lots il ON il.id = sm.lot_id
  WHERE il.batch_id = _batch_id;

  IF blocking_items > 0 OR blocking_stamps > 0 THEN
    RAISE EXCEPTION 'Impossible de supprimer cette batch : des lots issus de cette batch sont utilisés dans des événements ou des mouvements de timbres.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  DELETE FROM public.inventory_lots WHERE batch_id = _batch_id;
  DELETE FROM public.batches WHERE id = _batch_id;
END;
$function$;
