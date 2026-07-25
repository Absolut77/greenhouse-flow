ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS container_id uuid REFERENCES public.curing_containers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS analysis_weight_grams numeric,
  ADD COLUMN IF NOT EXISTS analysis_data jsonb;

ALTER TABLE public.packaging_bags
  ADD COLUMN IF NOT EXISTS location text;

CREATE INDEX IF NOT EXISTS samples_container_id_idx ON public.samples(container_id);