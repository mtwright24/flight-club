-- Storage bucket policies for room-posts
-- Make room-posts bucket public so images are readable without auth
-- Users still need auth to upload via RLS policies

-- First, ensure the storage bucket exists as PUBLIC
-- (This allows anyone to read images, but RLS still restricts uploads)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('room-posts', 'room-posts', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- Enable RLS on storage.objects
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone (authenticated or not) can read images from the public bucket
-- (This is implicit for public buckets, but we can be explicit)
CREATE POLICY "Anyone can read public room post images"
ON storage.objects FOR SELECT
USING (bucket_id = 'room-posts');

-- Policy: Authenticated users can upload images
CREATE POLICY "Authenticated users can upload to room-posts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'room-posts' AND auth.role() = 'authenticated');

-- Policy: Users can update/delete their own images
CREATE POLICY "Users can update their own images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'room-posts' AND auth.uid() = owner_id)
WITH CHECK (bucket_id = 'room-posts' AND auth.uid() = owner_id);

CREATE POLICY "Users can delete their own images"
ON storage.objects FOR DELETE
USING (bucket_id = 'room-posts' AND auth.uid() = owner_id);
