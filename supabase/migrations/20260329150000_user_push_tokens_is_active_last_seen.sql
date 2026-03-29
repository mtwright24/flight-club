-- Canonical lifecycle columns for push token rows (client + server)
alter table if exists public.user_push_tokens
  add column if not exists is_active boolean not null default true;

alter table if exists public.user_push_tokens
  add column if not exists last_seen_at timestamptz;

-- Backfill from legacy `active` column when present (older migration)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_push_tokens'
      and column_name = 'active'
  ) then
    execute 'update public.user_push_tokens set is_active = active';
  end if;
end $$;

-- Touch last_seen_at on existing rows once
update public.user_push_tokens
set last_seen_at = coalesce(last_seen_at, updated_at, created_at)
where last_seen_at is null;

create index if not exists idx_user_push_tokens_user_is_active
  on public.user_push_tokens(user_id, is_active);
