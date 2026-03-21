-- Migration: Create room_post_comments table for post comments

CREATE TABLE IF NOT EXISTS public.room_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.room_posts(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_room_post_comments_post ON public.room_post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_room_post_comments_room ON public.room_post_comments(room_id);
CREATE INDEX IF NOT EXISTS idx_room_post_comments_created ON public.room_post_comments(created_at ASC);

-- RLS policies
CREATE POLICY room_post_comments_read ON public.room_post_comments
  FOR SELECT USING (
    room_id IN (SELECT room_id FROM public.room_members WHERE user_id = auth.uid())
  );

CREATE POLICY room_post_comments_create ON public.room_post_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    room_id IN (SELECT room_id FROM public.room_members WHERE user_id = auth.uid())
  );

ALTER TABLE public.room_post_comments ENABLE ROW LEVEL SECURITY;
