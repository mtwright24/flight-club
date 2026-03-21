-- Add crew details and settings fields to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS airline text,
ADD COLUMN IF NOT EXISTS role text,
ADD COLUMN IF NOT EXISTS base text,
ADD COLUMN IF NOT EXISTS fleet text,
ADD COLUMN IF NOT EXISTS crew_number text,
ADD COLUMN IF NOT EXISTS hide_crew_number boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create storage bucket for profile avatars
INSERT INTO storage.buckets (id, name, public) 
VALUES ('profile-avatars', 'profile-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for profile-avatars bucket
CREATE POLICY "Authenticated users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Authenticated users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Anyone can view profile avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile-avatars');

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
