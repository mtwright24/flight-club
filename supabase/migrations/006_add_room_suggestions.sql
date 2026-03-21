-- Add has_seen_room_suggestions to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS has_seen_room_suggestions boolean DEFAULT false;

-- Create index for first-time user detection
CREATE INDEX IF NOT EXISTS idx_profiles_has_seen_suggestions 
  ON public.profiles(has_seen_room_suggestions);
