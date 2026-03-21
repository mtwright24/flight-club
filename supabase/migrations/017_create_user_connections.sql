-- Migration: Create user_connections table for Crew Connect (mutual connections)
CREATE TABLE IF NOT EXISTS public.user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_1 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id_2 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id_1, user_id_2),
  CHECK (user_id_1 <> user_id_2)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_connections_user1 ON public.user_connections(user_id_1);
CREATE INDEX IF NOT EXISTS idx_user_connections_user2 ON public.user_connections(user_id_2);
CREATE INDEX IF NOT EXISTS idx_user_connections_status ON public.user_connections(status);

-- RLS: Only allow users to manage their own connections
ALTER TABLE public.user_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can request connection" ON public.user_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id_1 OR auth.uid() = user_id_2);
CREATE POLICY "Users can update own connection" ON public.user_connections
  FOR UPDATE USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);
CREATE POLICY "Users can delete own connection" ON public.user_connections
  FOR DELETE USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);
CREATE POLICY "Anyone can view connections" ON public.user_connections
  FOR SELECT USING (true);
