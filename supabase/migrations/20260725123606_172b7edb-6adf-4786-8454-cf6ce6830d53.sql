
-- Curing containers
CREATE TABLE public.curing_containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES public.batch_stages(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  content TEXT,
  weight_in_grams NUMERIC NOT NULL DEFAULT 0,
  weight_out_grams NUMERIC,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.curing_containers TO authenticated;
GRANT ALL ON public.curing_containers TO service_role;

ALTER TABLE public.curing_containers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "curing_containers_select" ON public.curing_containers FOR SELECT USING (true);
CREATE POLICY "curing_containers_write" ON public.curing_containers FOR ALL
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'supervisor'::app_role,'operator'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'supervisor'::app_role,'operator'::app_role]));

CREATE TRIGGER curing_containers_updated
  BEFORE UPDATE ON public.curing_containers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Packaging bags
CREATE TABLE public.packaging_bags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES public.batch_stages(id) ON DELETE SET NULL,
  flower_type TEXT NOT NULL,
  bag_type TEXT NOT NULL CHECK (bag_type IN ('bulk','sample')),
  bag_count INTEGER NOT NULL DEFAULT 1 CHECK (bag_count > 0),
  net_weight_grams NUMERIC NOT NULL CHECK (net_weight_grams > 0),
  gross_weight_grams NUMERIC,
  notes TEXT,
  inventory_lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.packaging_bags TO authenticated;
GRANT ALL ON public.packaging_bags TO service_role;

ALTER TABLE public.packaging_bags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "packaging_bags_select" ON public.packaging_bags FOR SELECT USING (true);
CREATE POLICY "packaging_bags_write" ON public.packaging_bags FOR ALL
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'supervisor'::app_role,'operator'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'supervisor'::app_role,'operator'::app_role]));

CREATE TRIGGER packaging_bags_updated
  BEFORE UPDATE ON public.packaging_bags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Reason on destructions (sample kind / manual)
ALTER TABLE public.destructions
  ADD COLUMN IF NOT EXISTS reason TEXT;
