
-- 1. lot_kind on inventory_lots
ALTER TABLE public.inventory_lots
  ADD COLUMN IF NOT EXISTS lot_kind text NOT NULL DEFAULT 'bulk';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_lots_lot_kind_chk') THEN
    ALTER TABLE public.inventory_lots
      ADD CONSTRAINT inventory_lots_lot_kind_chk
      CHECK (lot_kind IN ('bulk','packaged','sample','retention'));
  END IF;
END $$;

-- Backfill from existing metadata
UPDATE public.inventory_lots SET lot_kind = 'sample'
  WHERE product_type = 'sample' AND lot_kind = 'bulk';
UPDATE public.inventory_lots SET lot_kind = 'packaged'
  WHERE parent_lot_id IS NOT NULL AND product_type <> 'sample' AND lot_kind = 'bulk';

-- 2. events extra columns
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS processing_loss_grams numeric;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS dry_destroyed_grams numeric;

-- 3. destructions.phase
ALTER TABLE public.destructions ADD COLUMN IF NOT EXISTS phase text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'destructions_phase_chk') THEN
    ALTER TABLE public.destructions
      ADD CONSTRAINT destructions_phase_chk
      CHECK (phase IS NULL OR phase IN ('fresh','dry'));
  END IF;
END $$;

-- 4. Block retention lots in event_items
CREATE OR REPLACE FUNCTION public.block_retention_in_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text;
BEGIN
  IF NEW.inventory_lot_id IS NULL THEN RETURN NEW; END IF;
  SELECT lot_kind INTO k FROM public.inventory_lots WHERE id = NEW.inventory_lot_id;
  IF k = 'retention' THEN
    RAISE EXCEPTION 'Les lots de rétention sont bloqués et ne peuvent pas être utilisés dans un événement.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS block_retention_events ON public.event_items;
CREATE TRIGGER block_retention_events
  BEFORE INSERT OR UPDATE ON public.event_items
  FOR EACH ROW EXECUTE FUNCTION public.block_retention_in_events();

-- Also block retention in stamp_movements (lot_id)
CREATE OR REPLACE FUNCTION public.block_retention_in_stamp_movements()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text;
BEGIN
  IF NEW.lot_id IS NULL THEN RETURN NEW; END IF;
  SELECT lot_kind INTO k FROM public.inventory_lots WHERE id = NEW.lot_id;
  IF k = 'retention' THEN
    RAISE EXCEPTION 'Les lots de rétention ne peuvent pas être associés à un mouvement de timbres.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS block_retention_stamps ON public.stamp_movements;
CREATE TRIGGER block_retention_stamps
  BEFORE INSERT OR UPDATE ON public.stamp_movements
  FOR EACH ROW EXECUTE FUNCTION public.block_retention_in_stamp_movements();

-- 5. close_event RPC
CREATE OR REPLACE FUNCTION public.close_event(
  _event_id uuid,
  _lot_name text,
  _units integer,
  _unit_weight_g numeric,
  _used_g numeric,
  _dry_destroyed_g numeric,
  _completed_at timestamptz DEFAULT now()
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev record;
  src_out_g numeric;
  produced_g numeric;
  surplus numeric;
  loss_g numeric;
  parent_lot_id uuid;
  batch_id_v uuid;
  new_lot_id uuid;
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

  -- Identify parent lot (largest out) for surplus return + parenting
  SELECT il.id, il.batch_id INTO parent_lot_id, batch_id_v
    FROM public.event_items ei
    JOIN public.inventory_lots il ON il.id = ei.inventory_lot_id
   WHERE ei.event_id = _event_id AND ei.direction = 'out'
   ORDER BY ei.quantity_grams DESC NULLS LAST
   LIMIT 1;

  -- Return surplus to source lot
  IF surplus > 0.001 AND parent_lot_id IS NOT NULL THEN
    UPDATE public.inventory_lots
      SET quantity_grams = COALESCE(quantity_grams,0) + surplus,
          updated_at = now()
      WHERE id = parent_lot_id;
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
$$;

GRANT EXECUTE ON FUNCTION public.close_event(uuid, text, integer, numeric, numeric, numeric, timestamptz) TO authenticated;
