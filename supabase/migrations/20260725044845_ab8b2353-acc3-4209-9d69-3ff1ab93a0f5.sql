CREATE OR REPLACE FUNCTION public.recompute_reel_status(_reel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  orig integer;
  spoil integer;
  used_q integer;
  destroyed_q integer;
  returned_q integer;
  bal integer;
  cur_status text;
BEGIN
  IF _reel_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(original_quantity, 0), COALESCE(spoiled_at_reception, 0), status
    INTO orig, spoil, cur_status
  FROM public.excise_reels
  WHERE id = _reel_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(CASE WHEN movement_type = 'used' THEN quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN movement_type = 'destroyed' THEN quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN movement_type = 'returned' THEN quantity ELSE 0 END), 0)
  INTO used_q, destroyed_q, returned_q
  FROM public.stamp_movements
  WHERE reel_id = _reel_id;

  bal := orig - spoil - used_q - destroyed_q + returned_q;

  IF bal <= 0 AND cur_status IS DISTINCT FROM 'depleted' THEN
    UPDATE public.excise_reels SET status = 'depleted' WHERE id = _reel_id;
  ELSIF bal > 0 AND cur_status = 'depleted' THEN
    UPDATE public.excise_reels SET status = 'available' WHERE id = _reel_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.stamp_movements_status_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM public.recompute_reel_status(NEW.reel_id);
    IF TG_OP = 'UPDATE' AND OLD.reel_id IS DISTINCT FROM NEW.reel_id THEN
      PERFORM public.recompute_reel_status(OLD.reel_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_reel_status(OLD.reel_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS stamp_movements_status_sync ON public.stamp_movements;
CREATE TRIGGER stamp_movements_status_sync
AFTER INSERT OR UPDATE OR DELETE ON public.stamp_movements
FOR EACH ROW EXECUTE FUNCTION public.stamp_movements_status_trigger();

-- Recompute status for existing reels
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.excise_reels LOOP
    PERFORM public.recompute_reel_status(r.id);
  END LOOP;
END $$;