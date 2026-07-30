ALTER TABLE public.inventory_lots ADD COLUMN IF NOT EXISTS strain text;

UPDATE public.inventory_lots il
SET strain = NULLIF(trim(substring(il.notes from 'Variété\s*:\s*([^—]+)')), '')
WHERE il.strain IS NULL AND il.notes ~ 'Variété\s*:';

UPDATE public.inventory_lots il
SET strain = b.strain
FROM public.batches b
WHERE il.batch_id = b.id AND il.strain IS NULL AND b.strain IS NOT NULL;