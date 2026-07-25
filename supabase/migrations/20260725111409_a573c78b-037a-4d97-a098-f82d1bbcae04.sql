
ALTER TABLE public.batch_stages
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'locked',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.destructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.batch_stages(id) ON DELETE SET NULL,
  stage_code text,
  weight_grams numeric NOT NULL DEFAULT 0,
  person_count integer,
  sanitation_products text,
  duration_minutes integer,
  comments text,
  photos text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.destructions TO authenticated;
GRANT ALL ON public.destructions TO service_role;

ALTER TABLE public.destructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "destructions_select_auth" ON public.destructions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "destructions_write_staff" ON public.destructions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::app_role[]));

CREATE POLICY "destructions_update_staff" ON public.destructions
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::app_role[]));

CREATE POLICY "destructions_delete_staff" ON public.destructions
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','supervisor']::app_role[]));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER destructions_updated_at
  BEFORE UPDATE ON public.destructions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX destructions_batch_idx ON public.destructions(batch_id);
CREATE INDEX destructions_stage_idx ON public.destructions(stage_id);
