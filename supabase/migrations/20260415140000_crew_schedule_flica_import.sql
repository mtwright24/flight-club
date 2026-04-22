-- JetBlue FLICA HTML import: one row per user/month (jsonb pairings + stats + raw HTML for re-parse)

CREATE TABLE IF NOT EXISTS public.crew_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  airline text NOT NULL DEFAULT 'jetblue',
  month_key text NOT NULL,
  pairings jsonb NOT NULL DEFAULT '[]'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_html text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_schedule_user_airline_month UNIQUE (user_id, airline, month_key)
);

CREATE INDEX IF NOT EXISTS idx_crew_schedule_user_month ON public.crew_schedule (user_id, month_key);
CREATE INDEX IF NOT EXISTS idx_crew_schedule_month_key ON public.crew_schedule (month_key);

ALTER TABLE public.crew_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY crew_schedule_select_own ON public.crew_schedule FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY crew_schedule_insert_own ON public.crew_schedule FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY crew_schedule_update_own ON public.crew_schedule FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY crew_schedule_delete_own ON public.crew_schedule FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.crew_schedule IS 'FLICA (and future) crew line imports: pairings/stats snapshot per calendar month.';
