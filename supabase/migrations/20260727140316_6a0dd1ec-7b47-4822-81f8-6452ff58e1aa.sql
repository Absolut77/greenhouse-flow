-- 1. CARTONS
CREATE TABLE public.stock_cartons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid REFERENCES public.inventory_lots(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  carton_code text NOT NULL,
  location text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_cartons TO authenticated;
GRANT ALL ON public.stock_cartons TO service_role;
ALTER TABLE public.stock_cartons ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_cartons_select ON public.stock_cartons FOR SELECT TO authenticated USING (true);
CREATE POLICY stock_cartons_write ON public.stock_cartons FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::app_role[]));
CREATE TRIGGER stock_cartons_updated_at BEFORE UPDATE ON public.stock_cartons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. CONTENANTS / SACS
CREATE TABLE public.stock_containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.inventory_lots(id) ON DELETE CASCADE,
  carton_id uuid REFERENCES public.stock_cartons(id) ON DELETE SET NULL,
  container_code text NOT NULL,
  container_type text NOT NULL DEFAULT 'bulk',
  unit_count integer NOT NULL DEFAULT 1,
  unit_weight_grams numeric NOT NULL DEFAULT 0,
  net_weight_grams numeric NOT NULL DEFAULT 0,
  gross_weight_grams numeric,
  location text,
  status text NOT NULL DEFAULT 'available',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_containers_type_chk CHECK (container_type IN ('bulk','packaged','sample','retention','preroll','trim','other')),
  CONSTRAINT stock_containers_status_chk CHECK (status IN ('available','reserved','shipped','destroyed')),
  CONSTRAINT stock_containers_unit_count_chk CHECK (unit_count >= 0),
  CONSTRAINT stock_containers_unit_weight_chk CHECK (unit_weight_grams >= 0),
  CONSTRAINT stock_containers_net_chk CHECK (net_weight_grams >= 0),
  CONSTRAINT stock_containers_gross_chk CHECK (gross_weight_grams IS NULL OR gross_weight_grams >= 0),
  CONSTRAINT stock_containers_code_uniq UNIQUE (lot_id, container_code)
);
CREATE INDEX stock_containers_lot_idx ON public.stock_containers(lot_id);
CREATE INDEX stock_containers_carton_idx ON public.stock_containers(carton_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_containers TO authenticated;
GRANT ALL ON public.stock_containers TO service_role;
ALTER TABLE public.stock_containers ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_containers_select ON public.stock_containers FOR SELECT TO authenticated USING (true);
CREATE POLICY stock_containers_write ON public.stock_containers FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::app_role[]));
CREATE TRIGGER stock_containers_updated_at BEFORE UPDATE ON public.stock_containers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Poids net auto si non saisi
CREATE OR REPLACE FUNCTION public.stock_container_fill_net()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.net_weight_grams IS NULL OR NEW.net_weight_grams = 0 THEN
    NEW.net_weight_grams := COALESCE(NEW.unit_count,0) * COALESCE(NEW.unit_weight_grams,0);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stock_containers_fill_net BEFORE INSERT OR UPDATE ON public.stock_containers
  FOR EACH ROW EXECUTE FUNCTION public.stock_container_fill_net();

-- Audit
CREATE TRIGGER audit_stock_containers AFTER INSERT OR UPDATE OR DELETE ON public.stock_containers
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- 3. LIEN EVENT_ITEMS -> SAC
ALTER TABLE public.event_items
  ADD COLUMN container_id uuid REFERENCES public.stock_containers(id) ON DELETE SET NULL;
CREATE INDEX event_items_container_idx ON public.event_items(container_id);

CREATE OR REPLACE FUNCTION public.apply_event_item_container(
  _container_id uuid, _direction text, _grams numeric, _units integer, _sign integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta_g numeric := 0;
  delta_u integer := 0;
  cur RECORD;
BEGIN
  IF _container_id IS NULL OR _direction IS NULL THEN RETURN; END IF;

  IF _direction = 'out' THEN
    delta_g := -COALESCE(_grams,0) * _sign;
    delta_u := -COALESCE(_units,0) * _sign;
  ELSIF _direction = 'in' THEN
    delta_g := COALESCE(_grams,0) * _sign;
    delta_u := COALESCE(_units,0) * _sign;
  ELSE
    RETURN;
  END IF;

  SELECT * INTO cur FROM public.stock_containers WHERE id = _container_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contenant introuvable'; END IF;

  IF cur.container_type = 'retention' THEN
    RAISE EXCEPTION 'Les contenants de rétention sont bloqués et ne peuvent pas être utilisés.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF COALESCE(cur.net_weight_grams,0) + delta_g < -0.0001 THEN
    RAISE EXCEPTION 'Stock insuffisant dans le sac %: disponible % g, demandé % g',
      cur.container_code, COALESCE(cur.net_weight_grams,0), -delta_g;
  END IF;
  IF COALESCE(cur.unit_count,0) + delta_u < 0 THEN
    RAISE EXCEPTION 'Unités insuffisantes dans le sac %: disponibles %, demandées %',
      cur.container_code, COALESCE(cur.unit_count,0), -delta_u;
  END IF;

  UPDATE public.stock_containers
  SET net_weight_grams = GREATEST(COALESCE(net_weight_grams,0) + delta_g, 0),
      unit_count = GREATEST(COALESCE(unit_count,0) + delta_u, 0),
      status = CASE
        WHEN GREATEST(COALESCE(net_weight_grams,0) + delta_g, 0) <= 0.0001 THEN 'shipped'
        WHEN status = 'shipped' THEN 'available'
        ELSE status END,
      updated_at = now()
  WHERE id = _container_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_items_container_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.apply_event_item_container(NEW.container_id, NEW.direction, NEW.quantity_grams, NEW.units, 1);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.apply_event_item_container(OLD.container_id, OLD.direction, OLD.quantity_grams, OLD.units, -1);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.apply_event_item_container(OLD.container_id, OLD.direction, OLD.quantity_grams, OLD.units, -1);
    PERFORM public.apply_event_item_container(NEW.container_id, NEW.direction, NEW.quantity_grams, NEW.units, 1);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER event_items_container_sync AFTER INSERT OR DELETE OR UPDATE ON public.event_items
  FOR EACH ROW EXECUTE FUNCTION public.event_items_container_trigger();

REVOKE EXECUTE ON FUNCTION public.apply_event_item_container(uuid, text, numeric, integer, integer) FROM anon, public;

-- 4. VUE DE SYNTHESE PAR LOT
CREATE OR REPLACE VIEW public.lot_container_summary
WITH (security_invoker = true) AS
SELECT
  c.lot_id,
  c.container_type,
  COUNT(*) FILTER (WHERE c.status = 'available')::int AS available_containers,
  COUNT(*)::int AS total_containers,
  COALESCE(SUM(c.unit_count) FILTER (WHERE c.status = 'available'), 0)::int AS available_units,
  COALESCE(SUM(c.net_weight_grams) FILTER (WHERE c.status = 'available'), 0)::numeric AS available_grams
FROM public.stock_containers c
GROUP BY c.lot_id, c.container_type;
GRANT SELECT ON public.lot_container_summary TO authenticated;

-- 5. REPRISE DES LOTS EXISTANTS -> 1 sac par lot
INSERT INTO public.stock_containers (lot_id, container_code, container_type, unit_count, unit_weight_grams, net_weight_grams, location, status, notes)
SELECT
  l.id,
  l.lot_number || '-S1',
  CASE WHEN l.lot_kind IN ('bulk','packaged','sample','retention') THEN l.lot_kind ELSE 'other' END,
  GREATEST(COALESCE(l.units, 1), 1),
  CASE WHEN COALESCE(l.units,0) > 0 THEN COALESCE(l.quantity_grams,0) / l.units ELSE COALESCE(l.quantity_grams,0) END,
  COALESCE(l.quantity_grams, 0),
  l.location,
  CASE WHEN COALESCE(l.quantity_grams,0) <= 0 THEN 'shipped' ELSE COALESCE(l.status,'available') END,
  'Contenant généré automatiquement lors de la migration vers la gestion par sacs'
FROM public.inventory_lots l
WHERE NOT EXISTS (SELECT 1 FROM public.stock_containers c WHERE c.lot_id = l.id);