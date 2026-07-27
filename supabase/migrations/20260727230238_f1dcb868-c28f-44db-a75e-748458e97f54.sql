ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS parent_batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL;
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS external_processor text;
CREATE INDEX IF NOT EXISTS batches_parent_batch_id_idx ON public.batches(parent_batch_id);

ALTER TABLE public.stock_containers DROP CONSTRAINT IF EXISTS stock_containers_type_chk;
ALTER TABLE public.stock_containers ADD CONSTRAINT stock_containers_type_chk
  CHECK (container_type = ANY (ARRAY['bulk'::text,'packaged'::text,'sample'::text,'lab_sample'::text,'master_case'::text,'preroll'::text,'retention'::text,'trim'::text,'other'::text]));