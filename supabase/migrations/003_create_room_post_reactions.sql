-- Create room_post_reactions table
CREATE TABLE IF NOT EXISTS public.room_post_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.room_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('solid', 'love', 'dead', 'yikes', 'tea', 'heads_up', 'cap', 'yeah_sure', 'nah')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_post_user_reaction UNIQUE (post_id, user_id)
);

-- Enable RLS
ALTER TABLE public.room_post_reactions ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read reactions for posts in rooms they belong to
-- Simplified policy: authenticated users can read all reactions
-- TODO: tighten to verify room membership via room_posts -> rooms -> room_members join
CREATE POLICY "Users can read reactions"
  ON public.room_post_reactions
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: authenticated users can insert their own reactions
CREATE POLICY "Users can insert their own reactions"
  ON public.room_post_reactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: authenticated users can update their own reactions
CREATE POLICY "Users can update their own reactions"
  ON public.room_post_reactions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: authenticated users can delete their own reactions
CREATE POLICY "Users can delete their own reactions"
  ON public.room_post_reactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_room_post_reactions_post_id ON public.room_post_reactions(post_id);
CREATE INDEX idx_room_post_reactions_user_id ON public.room_post_reactions(user_id);
