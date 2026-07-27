ALTER TABLE public.packaging_formats
  ADD COLUMN IF NOT EXISTS format_type text NOT NULL DEFAULT 'flower',
  ADD COLUMN IF NOT EXISTS units_per_pack integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_weight_grams numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.packaging_formats
  DROP CONSTRAINT IF EXISTS packaging_formats_format_type_check;
ALTER TABLE public.packaging_formats
  ADD CONSTRAINT packaging_formats_format_type_check CHECK (format_type IN ('flower','preroll'));

ALTER TABLE public.packaging_formats
  DROP CONSTRAINT IF EXISTS packaging_formats_positive_check;
ALTER TABLE public.packaging_formats
  ADD CONSTRAINT packaging_formats_positive_check CHECK (
    units_per_pack >= 1 AND unit_weight_grams >= 0 AND COALESCE(net_weight_grams,0) >= 0
  );

CREATE UNIQUE INDEX IF NOT EXISTS packaging_formats_name_key ON public.packaging_formats (name);

DROP TRIGGER IF EXISTS packaging_formats_set_updated_at ON public.packaging_formats;
CREATE TRIGGER packaging_formats_set_updated_at
  BEFORE UPDATE ON public.packaging_formats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lier les sacs et les sacs de packaging à un format
ALTER TABLE public.stock_containers
  ADD COLUMN IF NOT EXISTS format_id uuid REFERENCES public.packaging_formats(id) ON DELETE SET NULL;
ALTER TABLE public.packaging_bags
  ADD COLUMN IF NOT EXISTS format_id uuid REFERENCES public.packaging_formats(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_lots
  ADD COLUMN IF NOT EXISTS format_id uuid REFERENCES public.packaging_formats(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stock_containers_format_id_idx ON public.stock_containers (format_id);
CREATE INDEX IF NOT EXISTS packaging_bags_format_id_idx ON public.packaging_bags (format_id);
CREATE INDEX IF NOT EXISTS inventory_lots_format_id_idx ON public.inventory_lots (format_id);

-- Formats standards par défaut (idempotent)
INSERT INTO public.packaging_formats (name, format_type, units_per_pack, unit_weight_grams, net_weight_grams, sort_order, is_active)
VALUES
  ('3.5 g',        'flower',  1,  3.5,  3.5,  10, true),
  ('7 g',          'flower',  1,  7,    7,    20, true),
  ('14 g',         'flower',  1, 14,   14,    30, true),
  ('28 g',         'flower',  1, 28,   28,    40, true),
  ('5 × 0.5 g',    'preroll', 5,  0.5,  2.5,  50, true),
  ('3 × 0.5 g',    'preroll', 3,  0.5,  1.5,  60, true),
  ('10 × 0.35 g',  'preroll',10,  0.35, 3.5,  70, true)
ON CONFLICT (name) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.packaging_formats TO authenticated;
GRANT ALL ON public.packaging_formats TO service_role;