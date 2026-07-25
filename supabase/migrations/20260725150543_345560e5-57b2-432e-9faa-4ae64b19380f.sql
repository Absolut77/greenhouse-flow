
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS reception_kind text,
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS reference_number text,
  ADD COLUMN IF NOT EXISTS linked_shipment_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.non_cannabis_receptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  category text,
  quantity numeric,
  unit text,
  location text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.non_cannabis_receptions TO authenticated;
GRANT ALL ON public.non_cannabis_receptions TO service_role;

ALTER TABLE public.non_cannabis_receptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read non_cannabis_receptions" ON public.non_cannabis_receptions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write non_cannabis_receptions" ON public.non_cannabis_receptions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS non_cannabis_receptions_event_id_idx
  ON public.non_cannabis_receptions(event_id);
