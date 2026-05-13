-- Read-model cache for FLICA Tradeboard / Open Time native parses (per user, not schedule pairings).

CREATE TABLE IF NOT EXISTS public.crew_tradeboard_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'fl',
  bcid text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_tradeboard_cache_user_source_bcid UNIQUE (user_id, source, bcid)
);

CREATE INDEX IF NOT EXISTS idx_crew_tradeboard_cache_user_refreshed
  ON public.crew_tradeboard_cache (user_id, refreshed_at DESC);

ALTER TABLE public.crew_tradeboard_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY crew_tradeboard_cache_select_own ON public.crew_tradeboard_cache
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY crew_tradeboard_cache_insert_own ON public.crew_tradeboard_cache
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY crew_tradeboard_cache_update_own ON public.crew_tradeboard_cache
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY crew_tradeboard_cache_delete_own ON public.crew_tradeboard_cache
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

COMMENT ON TABLE public.crew_tradeboard_cache IS 'Cached Tradeboard parse payload (JSON) from FLICA native refresh; RLS user-owned.';

CREATE TABLE IF NOT EXISTS public.crew_opentime_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'fl',
  bcid text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_opentime_cache_user_source_bcid UNIQUE (user_id, source, bcid)
);

CREATE INDEX IF NOT EXISTS idx_crew_opentime_cache_user_refreshed
  ON public.crew_opentime_cache (user_id, refreshed_at DESC);

ALTER TABLE public.crew_opentime_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY crew_opentime_cache_select_own ON public.crew_opentime_cache
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY crew_opentime_cache_insert_own ON public.crew_opentime_cache
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY crew_opentime_cache_update_own ON public.crew_opentime_cache
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY crew_opentime_cache_delete_own ON public.crew_opentime_cache
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

COMMENT ON TABLE public.crew_opentime_cache IS 'Cached Open Time pot parse payload (JSON) from FLICA native refresh; RLS user-owned.';
