-- Migration: Create room_posts table for group posts
-- Add this to supabase/migrations or run manually in SQL editor

CREATE TABLE IF NOT EXISTS public.room_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  media_urls text[] DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_room_posts_room ON public.room_posts(room_id);
CREATE INDEX IF NOT EXISTS idx_room_posts_user ON public.room_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_room_posts_created ON public.room_posts(created_at DESC);

-- RLS Policy: Anyone who is a room member can read posts
CREATE POLICY room_posts_read ON public.room_posts
  FOR SELECT USING (
    room_id IN (SELECT room_id FROM public.room_members WHERE user_id = auth.uid())
  );

-- RLS Policy: Users can only create posts in rooms they're members of
CREATE POLICY room_posts_create ON public.room_posts
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    room_id IN (SELECT room_id FROM public.room_members WHERE user_id = auth.uid())
  );

-- Enable RLS on room_posts
ALTER TABLE public.room_posts ENABLE ROW LEVEL SECURITY;
