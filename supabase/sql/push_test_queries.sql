-- Verification queries for push (run in Supabase SQL Editor).
-- Postgres cannot send Expo push notifications by itself — delivery is via HTTPS to Expo's API
-- or your own server/Edge Function that calls https://exp.host/--/api/v2/push/send

-- 1) Any device tokens saved for your users?
select
  id,
  user_id,
  left(push_token, 48) || '…' as push_token_prefix,
  platform,
  is_active,
  last_seen_at,
  updated_at
from public.user_push_tokens
order by coalesce(updated_at, created_at) desc
limit 25;

-- 2) Row count
select count(*)::int as user_push_tokens_count from public.user_push_tokens;

-- 3) Example: send a test push from your laptop (replace TOKEN with full push_token from query 1):
-- curl -sS -H "Content-Type: application/json" \
--   -X POST "https://exp.host/--/api/v2/push/send" \
--   -d '{"to":"TOKEN","title":"SQL reminder","body":"Token row exists — use curl to hit Expo"}'
