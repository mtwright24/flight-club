-- Add expiration to room_messages table
ALTER TABLE public.room_messages
ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + interval '24 hours');

-- Create function to automatically set expires_at
CREATE OR REPLACE FUNCTION set_message_expiration()
RETURNS TRIGGER AS $$
BEGIN
  NEW.expires_at = NEW.created_at + interval '24 hours';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS set_message_expiration_trigger ON public.room_messages;

-- Create trigger to set expiration on insert
CREATE TRIGGER set_message_expiration_trigger
BEFORE INSERT ON public.room_messages
FOR EACH ROW
EXECUTE FUNCTION set_message_expiration();

-- Create index for faster expiration queries
CREATE INDEX IF NOT EXISTS idx_room_messages_expires_at ON public.room_messages(expires_at);

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a cron job to delete expired messages every hour
SELECT cron.schedule(
  'delete-expired-messages',
  '0 * * * *',  -- Every hour
  'DELETE FROM public.room_messages WHERE expires_at < now()'
);
