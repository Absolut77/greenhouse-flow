
DROP POLICY IF EXISTS "batch-photos read" ON storage.objects;
DROP POLICY IF EXISTS "batch-photos insert" ON storage.objects;
DROP POLICY IF EXISTS "batch-photos update" ON storage.objects;
DROP POLICY IF EXISTS "batch-photos delete" ON storage.objects;

CREATE POLICY "batch-photos read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'batch-photos');

CREATE POLICY "batch-photos insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'batch-photos');

CREATE POLICY "batch-photos update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'batch-photos');

CREATE POLICY "batch-photos delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'batch-photos');
