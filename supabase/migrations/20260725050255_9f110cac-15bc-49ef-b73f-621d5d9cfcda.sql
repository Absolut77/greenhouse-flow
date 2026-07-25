CREATE OR REPLACE FUNCTION public.prevent_event_delete_with_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_items WHERE event_id = OLD.id) THEN
    RAISE EXCEPTION 'Impossible de supprimer cet événement car il contient des mouvements de stock. Utilisez un événement de type destruction ou expédition.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_event_delete_with_items ON public.events;
CREATE TRIGGER prevent_event_delete_with_items
BEFORE DELETE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_event_delete_with_items();