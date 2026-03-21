-- Direct Messaging core tables: conversations, participants, messages, message_requests

create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.dm_conversations enable row level security;

create table if not exists public.dm_conversation_participants (
  conversation_id uuid references public.dm_conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (conversation_id, user_id)
);

alter table public.dm_conversation_participants enable row level security;

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.dm_conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete cascade,
  message_text text null,
  message_type text default 'text',
  media_url text null,
  post_id uuid null,
  created_at timestamptz default now(),
  is_read boolean not null default false
);

alter table public.dm_messages enable row level security;

create table if not exists public.dm_message_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  status text not null default 'pending'
);

alter table public.dm_message_requests enable row level security;

-- Indexes
create index if not exists dm_messages_conversation_id_created_at_idx on public.dm_messages(conversation_id, created_at desc);
create index if not exists dm_conversation_participants_user_id_idx on public.dm_conversation_participants(user_id);
create index if not exists dm_message_requests_to_user_id_idx on public.dm_message_requests(to_user_id);

-- RLS policies

-- Conversations: participants can select; any authenticated user can insert; participants can update
create policy "DM Conversations: participants select" on public.dm_conversations
  for select using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = id and cp.user_id = auth.uid()
    )
  );

create policy "DM Conversations: authenticated insert" on public.dm_conversations
  for insert to authenticated
  with check (true);

create policy "DM Conversations: participants update" on public.dm_conversations
  for update using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = id and cp.user_id = auth.uid()
    )
  );

-- Conversation participants: users can select their own memberships; authenticated can insert rows (for both members)
create policy "DM Conversation participants: select own" on public.dm_conversation_participants
  for select using (user_id = auth.uid());

create policy "DM Conversation participants: authenticated insert" on public.dm_conversation_participants
  for insert to authenticated
  with check (true);

-- Messages: participants can select; only participants can insert where sender_id = auth.uid()
create policy "DM Messages: participants select" on public.dm_messages
  for select using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversation_id and cp.user_id = auth.uid()
    )
  );

create policy "DM Messages: participants insert" on public.dm_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversation_id and cp.user_id = auth.uid()
    )
  );

-- Message requests: visible to sender or recipient; sender can insert
create policy "DM Message requests: sender or recipient select" on public.dm_message_requests
  for select using (from_user_id = auth.uid() or to_user_id = auth.uid());

create policy "DM Message requests: sender insert" on public.dm_message_requests
  for insert to authenticated
  with check (
    from_user_id = auth.uid() and to_user_id <> auth.uid()
  );
