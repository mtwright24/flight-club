-- Create room_post_comment_reactions table
CREATE TABLE IF NOT EXISTS public.room_post_comment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.room_post_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('solid', 'love', 'dead', 'yikes', 'tea', 'heads_up', 'cap', 'yeah_sure', 'nah')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_comment_user_reaction UNIQUE (comment_id, user_id)
);

-- Enable RLS
ALTER TABLE public.room_post_comment_reactions ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read reactions for comments
-- Simplified policy: authenticated users can read all reactions
-- TODO: tighten to verify room membership via room_post_comments -> room_posts -> rooms -> room_members join
CREATE POLICY "Users can read comment reactions"
  ON public.room_post_comment_reactions
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: authenticated users can insert their own reactions
CREATE POLICY "Users can insert their own comment reactions"
  ON public.room_post_comment_reactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: authenticated users can update their own reactions
CREATE POLICY "Users can update their own comment reactions"
  ON public.room_post_comment_reactions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: authenticated users can delete their own reactions
CREATE POLICY "Users can delete their own comment reactions"
  ON public.room_post_comment_reactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_room_post_comment_reactions_comment_id ON public.room_post_comment_reactions(comment_id);
CREATE INDEX idx_room_post_comment_reactions_user_id ON public.room_post_comment_reactions(user_id);
