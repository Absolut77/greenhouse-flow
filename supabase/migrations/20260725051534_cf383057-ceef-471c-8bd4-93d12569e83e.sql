
-- ============ Table ============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  user_initials TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  entity_label TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_user_idx ON public.audit_logs (user_id);
CREATE INDEX audit_logs_action_idx ON public.audit_logs (action);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Lecture: admin ou supervisor uniquement
CREATE POLICY "audit_logs_select_admin_supervisor"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin','supervisor']::app_role[])
);

-- Insertion: tout utilisateur authentifié peut ajouter une entrée le concernant
CREATE POLICY "audit_logs_insert_self"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Pas de policy UPDATE / DELETE => append-only pour les utilisateurs.

-- ============ Fonction utilitaire: profil utilisateur courant ============
CREATE OR REPLACE FUNCTION public.current_user_display()
RETURNS TABLE(uid UUID, uname TEXT, uinitials TEXT)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    uname := NULL; uinitials := NULL;
    RETURN NEXT; RETURN;
  END IF;
  SELECT COALESCE(full_name, email), initials
    INTO uname, uinitials
  FROM public.profiles
  WHERE id = uid;
  RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.current_user_display() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_display() TO authenticated;

-- ============ Fonction générique de trigger d'audit ============
CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_name TEXT;
  v_initials TEXT;
  v_action TEXT;
  v_entity_type TEXT := TG_TABLE_NAME;
  v_entity_id UUID;
  v_label TEXT;
  v_details JSONB := '{}'::jsonb;
  v_old JSONB;
  v_new JSONB;
BEGIN
  SELECT uid, uname, uinitials INTO v_uid, v_name, v_initials FROM public.current_user_display();

  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_new := to_jsonb(NEW);
    v_entity_id := (v_new->>'id')::uuid;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_entity_id := (v_new->>'id')::uuid;
    -- Détection changement de statut
    IF v_old ? 'status' AND v_new ? 'status' AND v_old->>'status' IS DISTINCT FROM v_new->>'status' THEN
      v_action := 'status_change';
      v_details := jsonb_build_object('from', v_old->>'status', 'to', v_new->>'status');
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_old := to_jsonb(OLD);
    v_entity_id := (v_old->>'id')::uuid;
  END IF;

  -- Label lisible selon la table
  IF TG_TABLE_NAME = 'batches' THEN
    v_label := COALESCE(v_new->>'batch_number', v_old->>'batch_number');
  ELSIF TG_TABLE_NAME = 'inventory_lots' THEN
    v_label := COALESCE(v_new->>'lot_number', v_old->>'lot_number');
  ELSIF TG_TABLE_NAME = 'events' THEN
    v_label := COALESCE(v_new->>'name', v_old->>'name', v_new->>'event_type', v_old->>'event_type');
  ELSIF TG_TABLE_NAME = 'event_items' THEN
    v_action := CASE TG_OP WHEN 'INSERT' THEN 'stock_movement_add' WHEN 'DELETE' THEN 'stock_movement_remove' ELSE 'stock_movement_update' END;
    v_label := COALESCE(v_new->>'direction', v_old->>'direction');
    v_details := v_details || jsonb_build_object(
      'event_id', COALESCE(v_new->>'event_id', v_old->>'event_id'),
      'inventory_lot_id', COALESCE(v_new->>'inventory_lot_id', v_old->>'inventory_lot_id'),
      'quantity_grams', COALESCE(v_new->>'quantity_grams', v_old->>'quantity_grams'),
      'units', COALESCE(v_new->>'units', v_old->>'units'),
      'direction', COALESCE(v_new->>'direction', v_old->>'direction')
    );
  ELSIF TG_TABLE_NAME = 'excise_reels' THEN
    v_label := COALESCE(v_new->>'reel_number', v_old->>'reel_number');
  ELSIF TG_TABLE_NAME = 'stamp_movements' THEN
    v_action := CASE TG_OP WHEN 'INSERT' THEN 'stamp_movement_add' WHEN 'DELETE' THEN 'stamp_movement_remove' ELSE 'stamp_movement_update' END;
    v_label := COALESCE(v_new->>'movement_type', v_old->>'movement_type');
    v_details := v_details || jsonb_build_object(
      'reel_id', COALESCE(v_new->>'reel_id', v_old->>'reel_id'),
      'event_id', COALESCE(v_new->>'event_id', v_old->>'event_id'),
      'quantity', COALESCE(v_new->>'quantity', v_old->>'quantity'),
      'movement_type', COALESCE(v_new->>'movement_type', v_old->>'movement_type')
    );
  ELSIF TG_TABLE_NAME = 'samples' THEN
    v_label := COALESCE(v_new->>'sample_number', v_old->>'sample_number', v_new->>'name', v_old->>'name');
  ELSIF TG_TABLE_NAME = 'weights' THEN
    v_label := COALESCE(v_new->>'category', v_old->>'category');
    v_details := v_details || jsonb_build_object(
      'batch_id', COALESCE(v_new->>'batch_id', v_old->>'batch_id'),
      'grams', COALESCE(v_new->>'grams', v_old->>'grams')
    );
  ELSIF TG_TABLE_NAME = 'drying_logs' THEN
    v_label := 'log ' || to_char(COALESCE((v_new->>'logged_at')::timestamptz, (v_old->>'logged_at')::timestamptz, now()), 'YYYY-MM-DD HH24:MI');
  ELSIF TG_TABLE_NAME = 'batch_stages' THEN
    v_label := COALESCE(v_new->>'stage_type', v_old->>'stage_type', v_new->>'name', v_old->>'name');
  END IF;

  -- Diff des champs modifiés pour un update simple
  IF TG_OP = 'UPDATE' AND v_action = 'update' THEN
    SELECT jsonb_object_agg(k, jsonb_build_object('from', v_old->k, 'to', v_new->k))
      INTO v_details
    FROM (
      SELECT key AS k FROM jsonb_each(v_new)
      WHERE key NOT IN ('updated_at','created_at')
        AND v_old->key IS DISTINCT FROM v_new->key
    ) diff;
    v_details := COALESCE(v_details, '{}'::jsonb);
  END IF;

  INSERT INTO public.audit_logs (user_id, user_name, user_initials, action, entity_type, entity_id, entity_label, details)
  VALUES (v_uid, v_name, v_initials, v_action, v_entity_type, v_entity_id, v_label, v_details);

  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.write_audit_log() FROM PUBLIC, anon, authenticated;

-- ============ Attachement des triggers ============
CREATE TRIGGER audit_batches
AFTER INSERT OR UPDATE OR DELETE ON public.batches
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE TRIGGER audit_inventory_lots
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_lots
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE TRIGGER audit_events
AFTER INSERT OR UPDATE OR DELETE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE TRIGGER audit_event_items
AFTER INSERT OR UPDATE OR DELETE ON public.event_items
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE TRIGGER audit_excise_reels
AFTER INSERT OR UPDATE OR DELETE ON public.excise_reels
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE TRIGGER audit_stamp_movements
AFTER INSERT OR UPDATE OR DELETE ON public.stamp_movements
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE TRIGGER audit_samples
AFTER INSERT OR UPDATE OR DELETE ON public.samples
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE TRIGGER audit_weights
AFTER INSERT OR UPDATE OR DELETE ON public.weights
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE TRIGGER audit_drying_logs
AFTER INSERT OR UPDATE OR DELETE ON public.drying_logs
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE TRIGGER audit_batch_stages
AFTER INSERT OR UPDATE OR DELETE ON public.batch_stages
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
