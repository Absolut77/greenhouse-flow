
ALTER TABLE public.destructions
  ADD COLUMN IF NOT EXISTS sanitation_type text,
  ADD COLUMN IF NOT EXISTS is_sanitation_log boolean NOT NULL DEFAULT false;

ALTER TABLE public.destructions
  DROP CONSTRAINT IF EXISTS destructions_sanitation_type_check;
ALTER TABLE public.destructions
  ADD CONSTRAINT destructions_sanitation_type_check
  CHECK (sanitation_type IS NULL OR sanitation_type IN ('soft','full'));

CREATE INDEX IF NOT EXISTS destructions_stage_code_idx ON public.destructions(stage_code);
CREATE INDEX IF NOT EXISTS destructions_is_sanitation_log_idx ON public.destructions(is_sanitation_log);
