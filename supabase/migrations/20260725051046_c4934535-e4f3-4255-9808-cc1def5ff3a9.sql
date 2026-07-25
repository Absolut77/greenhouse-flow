
CREATE OR REPLACE FUNCTION public.prevent_event_delete_with_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_items WHERE event_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.stamp_movements WHERE event_id = OLD.id) THEN
    RAISE EXCEPTION 'Impossible de supprimer cet événement car il contient des mouvements de stock ou de timbres. Utilisez un événement de type destruction ou expédition.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_reel_delete_with_movements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stamp_movements WHERE reel_id = OLD.id) THEN
    RAISE EXCEPTION 'Impossible de supprimer ce rouleau car il contient des mouvements de timbres.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_reel_delete_with_movements() FROM PUBLIC;

DROP TRIGGER IF EXISTS prevent_reel_delete_with_movements ON public.excise_reels;
CREATE TRIGGER prevent_reel_delete_with_movements
BEFORE DELETE ON public.excise_reels
FOR EACH ROW EXECUTE FUNCTION public.prevent_reel_delete_with_movements();
