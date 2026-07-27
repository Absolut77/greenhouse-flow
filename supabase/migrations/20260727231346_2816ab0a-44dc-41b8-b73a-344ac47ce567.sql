ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS dry_cap_grams numeric,
  ADD COLUMN IF NOT EXISTS dry_cap_locked_at timestamptz;

CREATE OR REPLACE FUNCTION public.enforce_batch_dry_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap numeric;
  bnum text;
  total numeric;
BEGIN
  IF NEW.batch_id IS NULL THEN RETURN NEW; END IF;

  SELECT dry_cap_grams, batch_number INTO cap, bnum
  FROM public.batches WHERE id = NEW.batch_id;

  IF cap IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(quantity_grams), 0) INTO total
  FROM public.inventory_lots
  WHERE batch_id = NEW.batch_id AND id <> NEW.id;

  total := total + COALESCE(NEW.quantity_grams, 0);

  IF total > cap + 0.001 THEN
    RAISE EXCEPTION 'Plafond de stock dépassé pour la batch % : total demandé % g, plafond bulk packaging % g.',
      COALESCE(bnum, NEW.batch_id::text), round(total, 2), round(cap, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_batch_dry_cap_trg ON public.inventory_lots;
CREATE TRIGGER enforce_batch_dry_cap_trg
BEFORE INSERT OR UPDATE OF quantity_grams, batch_id ON public.inventory_lots
FOR EACH ROW EXECUTE FUNCTION public.enforce_batch_dry_cap();