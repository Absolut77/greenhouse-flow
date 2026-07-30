-- 1) Free-weight flag
ALTER TABLE public.packaging_formats
  ADD COLUMN IF NOT EXISTS is_free_weight boolean NOT NULL DEFAULT false;

-- 2) Allow bulk / sample / retention families
ALTER TABLE public.packaging_formats
  DROP CONSTRAINT IF EXISTS packaging_formats_format_type_check;
ALTER TABLE public.packaging_formats
  ADD CONSTRAINT packaging_formats_format_type_check
  CHECK (format_type = ANY (ARRAY['flower','preroll','bulk','sample','retention']));

-- 3) No duplicate names in the catalogue
CREATE UNIQUE INDEX IF NOT EXISTS packaging_formats_name_key ON public.packaging_formats (name);

-- 4) Seed / re-seed (idempotent)
INSERT INTO public.packaging_formats
  (name, format_type, units_per_pack, unit_weight_grams, net_weight_grams, is_active, is_free_weight, sort_order)
VALUES
  ('Bulk',        'bulk',      1,  0,    NULL, true, true,  1),
  ('1 g',         'flower',    1,  1,    1,    true, false, 5),
  ('3,5 g',       'flower',    1,  3.5,  3.5,  true, false, 10),
  ('7 g',         'flower',    1,  7,    7,    true, false, 20),
  ('14 g',        'flower',    1,  14,   14,   true, false, 30),
  ('28 g',        'flower',    1,  28,   28,   true, false, 40),
  ('0,35 g',      'preroll',   1,  0.35, 0.35, true, false, 50),
  ('0,5 g',       'preroll',   1,  0.5,  0.5,  true, false, 60),
  ('3 × 0,5 g',   'preroll',   3,  0.5,  1.5,  true, false, 70),
  ('5 × 0,5 g',   'preroll',   5,  0.5,  2.5,  true, false, 80),
  ('10 × 0,35 g', 'preroll',   10, 0.35, 3.5,  true, false, 90),
  ('2 × 1 g',     'preroll',   2,  1,    2,    true, false, 100),
  ('Échantillon', 'sample',    1,  0,    NULL, true, true,  200),
  ('Rétention',   'retention', 1,  0,    NULL, true, true,  210)
ON CONFLICT (name) DO UPDATE SET
  format_type       = EXCLUDED.format_type,
  units_per_pack    = EXCLUDED.units_per_pack,
  unit_weight_grams = EXCLUDED.unit_weight_grams,
  net_weight_grams  = EXCLUDED.net_weight_grams,
  is_active         = true,
  is_free_weight    = EXCLUDED.is_free_weight,
  sort_order        = EXCLUDED.sort_order,
  updated_at        = now();

-- 5) Deactivate legacy duplicates not part of the catalogue
UPDATE public.packaging_formats
   SET is_active = false, updated_at = now()
 WHERE name NOT IN (
   'Bulk','1 g','3,5 g','7 g','14 g','28 g','0,35 g','0,5 g',
   '3 × 0,5 g','5 × 0,5 g','10 × 0,35 g','2 × 1 g','Échantillon','Rétention'
 );