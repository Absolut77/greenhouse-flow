
CREATE OR REPLACE FUNCTION public.delete_packaged_lot(_lot_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  child RECORD;
  parent RECORD;
BEGIN
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
$$;

REVOKE ALL ON FUNCTION public.delete_packaged_lot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_packaged_lot(uuid) TO authenticated;
