-- Storage policies for entity-images bucket
-- The bucket must already exist in Supabase Storage (created via dashboard)
-- These policies allow authenticated users to manage their own images
-- Uses DROP IF EXISTS to avoid conflicts with dashboard-created policies

-- Clean up any existing policies for this bucket
DROP POLICY IF EXISTS "Users can upload own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for entity images" ON storage.objects;

-- Upload: users can upload to their own folder (path starts with their uid)
CREATE POLICY "Users can upload own images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'entity-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Read: authenticated users can view their own images
CREATE POLICY "Users can view own images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'entity-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update: users can update their own images
CREATE POLICY "Users can update own images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'entity-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete: users can delete their own images
CREATE POLICY "Users can delete own images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'entity-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
