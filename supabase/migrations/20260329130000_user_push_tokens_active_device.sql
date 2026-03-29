-- Extend push tokens for lifecycle + device metadata (client sync)
alter table if exists public.user_push_tokens
  add column if not exists active boolean not null default true;

alter table if exists public.user_push_tokens
  add column if not exists device_name text;

create index if not exists idx_user_push_tokens_user_active on public.user_push_tokens(user_id, active);
