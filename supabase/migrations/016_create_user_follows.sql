-- Migration: Create user_follows table for social following
CREATE TABLE IF NOT EXISTS public.user_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON public.user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON public.user_follows(following_id);

-- RLS: Only allow users to follow/unfollow as themselves
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can follow/unfollow" ON public.user_follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow" ON public.user_follows
  FOR DELETE USING (auth.uid() = follower_id);
CREATE POLICY "Anyone can view follows" ON public.user_follows
  FOR SELECT USING (true);
