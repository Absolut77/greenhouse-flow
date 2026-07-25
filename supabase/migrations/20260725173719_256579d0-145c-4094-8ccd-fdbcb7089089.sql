
REVOKE EXECUTE ON FUNCTION public.close_event(uuid, text, integer, numeric, numeric, numeric, timestamptz, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.delete_packaged_lot(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.delete_batch_cascade(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.apply_event_item_stock(uuid, text, numeric, integer, integer) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.close_event(uuid, text, integer, numeric, numeric, numeric, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_packaged_lot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_batch_cascade(uuid) TO authenticated;
-- apply_event_item_stock is called by triggers only; no direct authenticated grant needed.
