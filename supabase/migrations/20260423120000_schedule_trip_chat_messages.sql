-- Trip-scoped chat (not DMs). Messages expire with the chat window (set per row by the app: trip release + 24h).

CREATE TABLE IF NOT EXISTS public.schedule_trip_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_trip_chat_trip_id ON public.schedule_trip_chat_messages (trip_id);
CREATE INDEX IF NOT EXISTS idx_schedule_trip_chat_expires ON public.schedule_trip_chat_messages (expires_at);

ALTER TABLE public.schedule_trip_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY schedule_trip_chat_select ON public.schedule_trip_chat_messages
  FOR SELECT
  TO authenticated
  USING (expires_at > now());

CREATE POLICY schedule_trip_chat_insert ON public.schedule_trip_chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND expires_at > now()
  );

COMMENT ON TABLE public.schedule_trip_chat_messages IS 'Per-trip crew chat; not linked to dm_messages or room_messages. Client sets expires_at to trip end + 24h.';
