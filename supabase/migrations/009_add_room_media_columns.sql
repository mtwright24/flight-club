-- Migration: Add avatar_url and cover_url to rooms table
-- Allows groups to have custom avatar and cover photos

ALTER TABLE public.rooms 
ADD COLUMN IF NOT EXISTS avatar_url text null,
ADD COLUMN IF NOT EXISTS cover_url text null;

-- Create storage buckets for room media
INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('room-avatars', 'room-avatars', true),
  ('room-covers', 'room-covers', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: anyone can read room avatars
CREATE POLICY "Public read room avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'room-avatars');

-- RLS policy: authenticated users can upload to their room avatar
CREATE POLICY "Users can upload room avatars" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'room-avatars' 
    AND auth.role() = 'authenticated'
  );

-- RLS policy: room owners/admins can update room avatars
CREATE POLICY "Owners can update room avatars" ON storage.objects
  FOR UPDATE USING (bucket_id = 'room-avatars' AND auth.role() = 'authenticated');

-- RLS policy: anyone can read room covers
CREATE POLICY "Public read room covers" ON storage.objects
  FOR SELECT USING (bucket_id = 'room-covers');

-- RLS policy: authenticated users can upload to room covers
CREATE POLICY "Users can upload room covers" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'room-covers' 
    AND auth.role() = 'authenticated'
  );

-- RLS policy: room owners/admins can update room covers
CREATE POLICY "Owners can update room covers" ON storage.objects
  FOR UPDATE USING (bucket_id = 'room-covers' AND auth.role() = 'authenticated');
