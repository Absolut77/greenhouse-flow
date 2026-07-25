ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS sample_date DATE;
UPDATE public.samples SET sample_date = created_at::date WHERE sample_date IS NULL;
ALTER TABLE public.samples ALTER COLUMN sample_date SET DEFAULT CURRENT_DATE;
ALTER TABLE public.samples ALTER COLUMN sample_date SET NOT NULL;