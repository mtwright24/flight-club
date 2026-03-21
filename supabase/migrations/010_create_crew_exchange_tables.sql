-- Migration: Create Crew Exchange (Trade Board) tables
-- Purpose: Support modern, high-density tradeboard with filtering, sorting, and saved alerts

-- Create trade_boards table (separated by airline/base/role)
CREATE TABLE IF NOT EXISTS public.trade_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  airline text NOT NULL,
  base text NOT NULL,
  role text NOT NULL,
  fleet text,
  name text GENERATED ALWAYS AS (airline || ' • ' || base || ' • ' || role || ' • Tradeboard') STORED,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(airline, base, role, fleet)
);

-- Create trade_posts table (individual trades/swaps/drops)
CREATE TABLE IF NOT EXISTS public.trade_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.trade_boards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Trade details
  type text NOT NULL CHECK (type IN ('swap', 'drop', 'pickup')),
  pairing_date date NOT NULL,
  end_date date,
  report_time time,
  route_from text,
  route_to text,
  trip_number text,
  
  -- Minutes/hours metrics
  credit_minutes integer,
  block_minutes integer,
  duty_minutes integer,
  tafb_minutes integer,
  
  -- Notes & description
  notes text,
  
  -- Screenshot attachment
  has_screenshot boolean DEFAULT false,
  screenshot_url text,
  
  -- Incentive (optional payment offer)
  has_incentive boolean DEFAULT false,
  incentive_amount integer, -- stored in dollars
  incentive_note text,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- For soft-delete or archival later
  is_active boolean DEFAULT true
);

-- Create saved_alerts table (MVP scaffolding for future premium alerts)
CREATE TABLE IF NOT EXISTS public.saved_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES public.trade_boards(id) ON DELETE CASCADE,
  
  name text NOT NULL,
  filter_json jsonb, -- stores full filter + sort state
  is_enabled boolean DEFAULT true,
  
  -- For future: alert delivery settings
  notify_email boolean DEFAULT false,
  notify_push boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create trade_interests table (MVP: simple interest/reactions)
CREATE TABLE IF NOT EXISTS public.trade_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.trade_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  interested_at timestamptz DEFAULT now(),
  UNIQUE(trade_id, user_id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_trade_posts_board_id ON public.trade_posts(board_id);
CREATE INDEX IF NOT EXISTS idx_trade_posts_user_id ON public.trade_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_posts_pairing_date ON public.trade_posts(pairing_date);
CREATE INDEX IF NOT EXISTS idx_trade_posts_created_at ON public.trade_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_posts_is_active ON public.trade_posts(is_active);
CREATE INDEX IF NOT EXISTS idx_trade_posts_type ON public.trade_posts(type);
CREATE INDEX IF NOT EXISTS idx_saved_alerts_user_id ON public.saved_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_alerts_board_id ON public.saved_alerts(board_id);

-- RLS: Row Level Security for trade_posts
ALTER TABLE public.trade_posts ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read active trade posts (MVP: simplest approach)
CREATE POLICY "Anyone can read active trades" ON public.trade_posts
  FOR SELECT USING (is_active = true);

-- Policy: Users can create trades on their assigned board
CREATE POLICY "Users can create own trades" ON public.trade_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own trades
CREATE POLICY "Users can update own trades" ON public.trade_posts
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own trades
CREATE POLICY "Users can delete own trades" ON public.trade_posts
  FOR DELETE USING (auth.uid() = user_id);

-- RLS: saved_alerts
ALTER TABLE public.saved_alerts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own alerts
CREATE POLICY "Users can read own alerts" ON public.saved_alerts
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can create alerts
CREATE POLICY "Users can create alerts" ON public.saved_alerts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own alerts
CREATE POLICY "Users can update own alerts" ON public.saved_alerts
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own alerts
CREATE POLICY "Users can delete own alerts" ON public.saved_alerts
  FOR DELETE USING (auth.uid() = user_id);

-- RLS: trade_interests
ALTER TABLE public.trade_interests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read interests on public trades
CREATE POLICY "Anyone can read interests" ON public.trade_interests
  FOR SELECT USING (true);

-- Policy: Users can create their own interests
CREATE POLICY "Users can create own interests" ON public.trade_interests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own interests
CREATE POLICY "Users can delete own interests" ON public.trade_interests
  FOR DELETE USING (auth.uid() = user_id);

-- Create storage bucket for trade screenshots
-- Note: Run this separately or uncomment if your Supabase setup allows
-- INSERT INTO storage.buckets (id, name, public) VALUES ('trade-screenshots', 'trade-screenshots', true)
-- ON CONFLICT (id) DO NOTHING;

-- Storage policies for trade-screenshots bucket
-- (Run after bucket is created in Supabase console or via separate setup)
-- CREATE POLICY "Anyone can read trade screenshots" ON storage.objects
--   FOR SELECT USING (bucket_id = 'trade-screenshots');
-- CREATE POLICY "Authenticated users can upload screenshots" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'trade-screenshots' AND auth.role() = 'authenticated');
-- CREATE POLICY "Users can delete own screenshots" ON storage.objects
--   FOR DELETE USING (bucket_id = 'trade-screenshots' AND auth.role() = 'authenticated');
