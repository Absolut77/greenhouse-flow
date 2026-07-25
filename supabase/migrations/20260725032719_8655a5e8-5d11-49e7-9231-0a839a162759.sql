
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'operator', 'viewer');

-- ============ PROFILES (replaces requested "users" table; auth.users is managed by Supabase) ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  initials text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============ USER_ROLES ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles));
$$;

CREATE POLICY "user_roles_select_own_or_admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_manage" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, initials)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'initials', upper(substr(split_part(NEW.email,'@',1),1,2)))
  )
  ON CONFLICT (id) DO NOTHING;
  -- Give first ever user 'admin', otherwise 'viewer'
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ BATCHES ============
CREATE TABLE public.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number text UNIQUE NOT NULL,
  strain text,
  plant_count integer,
  weight_per_plant numeric,
  harvest_date date,
  harvest_room text,
  drying_location text,
  status text NOT NULL DEFAULT 'in_progress',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batches TO authenticated;
GRANT ALL ON public.batches TO service_role;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "batches_select_all_auth" ON public.batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "batches_write_ops" ON public.batches FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]));
CREATE POLICY "batches_update_ops" ON public.batches FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]));
CREATE POLICY "batches_delete_admin_super" ON public.batches FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','supervisor']::public.app_role[]));

-- ============ BATCH STAGES ============
CREATE TABLE public.batch_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  stage_type text NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  operators_count integer,
  duration_minutes integer,
  comments text,
  settings jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_stages TO authenticated;
GRANT ALL ON public.batch_stages TO service_role;
ALTER TABLE public.batch_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batch_stages_select" ON public.batch_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "batch_stages_write" ON public.batch_stages FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]));

-- ============ DRYING LOGS ============
CREATE TABLE public.drying_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  room_number text,
  temp_current numeric,
  humidity_current numeric,
  temp_setpoint numeric,
  humidity_setpoint numeric,
  temp_external numeric,
  humidity_external numeric,
  comments text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drying_logs TO authenticated;
GRANT ALL ON public.drying_logs TO service_role;
ALTER TABLE public.drying_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drying_logs_select" ON public.drying_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "drying_logs_write" ON public.drying_logs FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]));

-- ============ SAMPLES ============
CREATE TABLE public.samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.batch_stages(id) ON DELETE SET NULL,
  sample_type text,
  weight_grams numeric,
  is_destruction boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.samples TO authenticated;
GRANT ALL ON public.samples TO service_role;
ALTER TABLE public.samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "samples_select" ON public.samples FOR SELECT TO authenticated USING (true);
CREATE POLICY "samples_write" ON public.samples FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]));

-- ============ WEIGHTS ============
CREATE TABLE public.weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  stage text,
  category text,
  weight_grams numeric,
  container_count integer,
  comments text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weights TO authenticated;
GRANT ALL ON public.weights TO service_role;
ALTER TABLE public.weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weights_select" ON public.weights FOR SELECT TO authenticated USING (true);
CREATE POLICY "weights_write" ON public.weights FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]));

-- ============ INVENTORY LOTS ============
CREATE TABLE public.inventory_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_number text UNIQUE NOT NULL,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  product_type text,
  format text,
  flower_size text,
  quantity_grams numeric,
  units integer,
  location text,
  status text,
  parent_lot_id uuid REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_lots TO authenticated;
GRANT ALL ON public.inventory_lots TO service_role;
ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_select" ON public.inventory_lots FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_write" ON public.inventory_lots FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]));

-- ============ EVENTS ============
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_number text UNIQUE NOT NULL,
  event_type text,
  status text,
  related_batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_select" ON public.events FOR SELECT TO authenticated USING (true);
CREATE POLICY "events_write" ON public.events FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]));

CREATE TABLE public.event_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  inventory_lot_id uuid REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  quantity_grams numeric,
  units integer,
  direction text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_items TO authenticated;
GRANT ALL ON public.event_items TO service_role;
ALTER TABLE public.event_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_items_select" ON public.event_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "event_items_write" ON public.event_items FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]));

-- ============ EXCISE STAMPS ============
CREATE TABLE public.excise_reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number text UNIQUE NOT NULL,
  province text,
  box_id text,
  original_quantity integer,
  spoiled_at_reception integer NOT NULL DEFAULT 0,
  status text,
  received_at date
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.excise_reels TO authenticated;
GRANT ALL ON public.excise_reels TO service_role;
ALTER TABLE public.excise_reels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reels_select" ON public.excise_reels FOR SELECT TO authenticated USING (true);
CREATE POLICY "reels_write" ON public.excise_reels FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','supervisor']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','supervisor']::public.app_role[]));

CREATE TABLE public.stamp_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id uuid NOT NULL REFERENCES public.excise_reels(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  lot_id uuid REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  movement_type text,
  quantity integer,
  moved_at timestamptz NOT NULL DEFAULT now(),
  comments text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stamp_movements TO authenticated;
GRANT ALL ON public.stamp_movements TO service_role;
ALTER TABLE public.stamp_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "moves_select" ON public.stamp_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "moves_write" ON public.stamp_movements FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','supervisor','operator']::public.app_role[]));

CREATE TABLE public.packaging_formats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  net_weight_grams numeric,
  is_active boolean NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packaging_formats TO authenticated;
GRANT ALL ON public.packaging_formats TO service_role;
ALTER TABLE public.packaging_formats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pf_select" ON public.packaging_formats FOR SELECT TO authenticated USING (true);
CREATE POLICY "pf_admin" ON public.packaging_formats FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
