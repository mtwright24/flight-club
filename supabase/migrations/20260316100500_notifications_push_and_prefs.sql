-- Extend notifications table with additional reference columns and useful indexes
alter table if exists public.notifications
  add column if not exists reference_type text,
  add column if not exists reference_id uuid,
  add column if not exists secondary_reference_id uuid,
  add column if not exists image_url text,
  add column if not exists conversation_id uuid,
  add column if not exists group_id uuid,
  add column if not exists post_id uuid,
  add column if not exists comment_id uuid,
  add column if not exists listing_id uuid;

create index if not exists idx_notifications_user_id on public.notifications(user_id);
create index if not exists idx_notifications_user_unread on public.notifications(user_id, is_read);
create index if not exists idx_notifications_created_at on public.notifications(created_at desc);

-- Push tokens table for Expo / FCM
create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  push_token text not null,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, push_token)
);

alter table public.user_push_tokens enable row level security;

create index if not exists idx_user_push_tokens_user_id on public.user_push_tokens(user_id);

create policy "PushTokens: user can select own" on public.user_push_tokens
  for select using (auth.uid() = user_id);

create policy "PushTokens: user can upsert own" on public.user_push_tokens
  for insert with check (auth.uid() = user_id);

create policy "PushTokens: user can update own" on public.user_push_tokens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Notification preferences table used by NotificationSettingsScreen
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  master_push boolean not null default true,
  messages boolean not null default true,
  crew_rooms boolean not null default true,
  follows boolean not null default true,
  comments boolean not null default true,
  replies boolean not null default true,
  mentions boolean not null default true,
  tags boolean not null default true,
  likes boolean not null default true,
  updates boolean not null default true,
  email boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "NotificationPrefs: user can select own" on public.notification_preferences
  for select using (auth.uid() = user_id);

create policy "NotificationPrefs: user can upsert own" on public.notification_preferences
  for insert with check (auth.uid() = user_id);

create policy "NotificationPrefs: user can update own" on public.notification_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
