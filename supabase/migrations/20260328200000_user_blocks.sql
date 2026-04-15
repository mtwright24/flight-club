-- User blocking (recipient blocks requester from DM request thread, etc.)

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;

create index if not exists user_blocks_blocked_id_idx on public.user_blocks (blocked_id);

create policy "User blocks: select own rows"
  on public.user_blocks
  for select
  to authenticated
  using (blocker_id = auth.uid());

create policy "User blocks: insert as blocker"
  on public.user_blocks
  for insert
  to authenticated
  with check (blocker_id = auth.uid() and blocked_id <> auth.uid());

create policy "User blocks: delete own rows"
  on public.user_blocks
  for delete
  to authenticated
  using (blocker_id = auth.uid());
