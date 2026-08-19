DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'bukti-transfer'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('bukti-transfer', 'bukti-transfer', FALSE);
  END IF;
END $$;

DROP POLICY IF EXISTS "anon_upload_bukti_transfer" ON storage.objects;
CREATE POLICY "anon_upload_bukti_transfer"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'bukti-transfer'
  AND (
    name LIKE 'proofs/%'
    OR name LIKE 'gifts/%'
  )
);

DROP POLICY IF EXISTS "anon_update_bukti_transfer" ON storage.objects;
CREATE POLICY "anon_update_bukti_transfer"
ON storage.objects
FOR UPDATE
TO anon
USING (
  bucket_id = 'bukti-transfer'
  AND (
    name LIKE 'proofs/%'
    OR name LIKE 'gifts/%'
  )
)
WITH CHECK (
  bucket_id = 'bukti-transfer'
  AND (
    name LIKE 'proofs/%'
    OR name LIKE 'gifts/%'
  )
);

DROP POLICY IF EXISTS "anon_read_bukti_transfer" ON storage.objects;
CREATE POLICY "anon_read_bukti_transfer"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'bukti-transfer'
  AND (
    name LIKE 'proofs/%'
    OR name LIKE 'gifts/%'
  )
);
