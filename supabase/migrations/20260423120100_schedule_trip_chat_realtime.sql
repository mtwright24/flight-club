-- Realtime for trip chat INSERT subscriptions (TripChatScreen). Safe if already added.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_trip_chat_messages;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE = '42710' THEN
      NULL;
    ELSE
      RAISE;
    END IF;
END $$;
