
CREATE TABLE IF NOT EXISTS public.number_sequences (
  kind TEXT NOT NULL,
  year INTEGER NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, year)
);

GRANT SELECT ON public.number_sequences TO authenticated;
GRANT ALL ON public.number_sequences TO service_role;

ALTER TABLE public.number_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "number_sequences read" ON public.number_sequences;
CREATE POLICY "number_sequences read"
  ON public.number_sequences FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.next_number(_kind TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y INTEGER := EXTRACT(YEAR FROM now())::integer;
  n INTEGER;
  prefix TEXT;
BEGIN
  IF _kind IS NULL THEN
    RAISE EXCEPTION 'kind requis';
  END IF;

  prefix := CASE lower(_kind)
    WHEN 'batch' THEN 'BATCH'
    WHEN 'event' THEN 'EVT'
    WHEN 'lot' THEN 'LOT'
    WHEN 'reel' THEN 'REEL'
    WHEN 'sample' THEN 'SMP'
    ELSE upper(_kind)
  END;

  INSERT INTO public.number_sequences (kind, year, current_value)
  VALUES (lower(_kind), y, 1)
  ON CONFLICT (kind, year) DO UPDATE
    SET current_value = public.number_sequences.current_value + 1,
        updated_at = now()
  RETURNING current_value INTO n;

  RETURN prefix || '-' || y::text || '-' || lpad(n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_number(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_number(TEXT) TO authenticated;
