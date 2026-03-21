-- Notifications table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null,
  entity_type text not null,
  entity_id uuid not null,
  secondary_id uuid null,
  title text null,
  body text null,
  is_read boolean not null default false,
  data jsonb not null default '{}'::jsonb
);

-- Enable RLS
alter table public.notifications enable row level security;

-- SELECT: Only recipient can read
create policy "Notifications: recipient can select" on public.notifications
  for select using (user_id = auth.uid());

-- UPDATE: Only recipient can mark as read
create policy "Notifications: recipient can update is_read" on public.notifications
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- INSERT: Only allow if actor is current user and not self-notify
create policy "Notifications: safe insert" on public.notifications
  for insert with check (
    user_id is not null
    and actor_id = auth.uid()
    and user_id != auth.uid()
  );

-- (Optional) Service role or RPC can insert for system notifications
