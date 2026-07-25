
CREATE OR REPLACE FUNCTION public.delete_batch_cascade(_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  blocking_items integer;
  blocking_stamps integer;
BEGIN
  IF _batch_id IS NULL THEN
    RAISE EXCEPTION 'Batch introuvable';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Seuls les administrateurs peuvent supprimer une batch.' USING ERRCODE = 'insufficient_privilege';
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

  -- Delete inventory lots created from this batch (safe now)
  DELETE FROM public.inventory_lots WHERE batch_id = _batch_id;

  -- Delete the batch itself (cascade handles stages, destructions, curing_containers, packaging_bags, drying_logs, samples, weights)
  DELETE FROM public.batches WHERE id = _batch_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_batch_cascade(uuid) TO authenticated;
