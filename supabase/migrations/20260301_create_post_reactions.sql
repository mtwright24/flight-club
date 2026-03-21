-- Create post_reactions table for social feed multi-emoji reactions
CREATE TABLE IF NOT EXISTS public.post_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('solid', 'love', 'dead', 'yikes', 'tea', 'heads_up', 'cap', 'yeah_sure', 'nah')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_post_user_reaction UNIQUE (post_id, user_id)
);

-- Enable RLS
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read all reactions
CREATE POLICY IF NOT EXISTS "Users can read post reactions"
  ON public.post_reactions
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: authenticated users can insert their own reactions
CREATE POLICY IF NOT EXISTS "Users can insert their own post reactions"
  ON public.post_reactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: authenticated users can update their own reactions
CREATE POLICY IF NOT EXISTS "Users can update their own post reactions"
  ON public.post_reactions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: authenticated users can delete their own reactions
CREATE POLICY IF NOT EXISTS "Users can delete their own post reactions"
  ON public.post_reactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id ON public.post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_user_id ON public.post_reactions(user_id);
