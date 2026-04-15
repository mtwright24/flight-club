-- Ensure core profile columns exist and create a covers bucket for profile headers

-- Add commonly used profile fields if they don't exist yet
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS full_name text,
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS username text,
ADD COLUMN IF NOT EXISTS bio text,
ADD COLUMN IF NOT EXISTS avatar_url text,
ADD COLUMN IF NOT EXISTS cover_url text;

-- Create storage bucket for profile covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-covers', 'profile-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for profile-covers bucket
CREATE POLICY "Authenticated users can upload their own cover"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Authenticated users can update their own cover"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Anyone can view profile covers"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile-covers');

CREATE POLICY "Users can delete their own cover"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'profile-covers' AND (storage.foldername(name))[1] = auth.uid()::text);
