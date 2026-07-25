ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS shipment_kind text,
  ADD COLUMN IF NOT EXISTS destination text,
  ADD COLUMN IF NOT EXISTS carrier text;