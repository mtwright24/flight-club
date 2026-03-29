-- Expo push send tickets / receipt tracking (server-side Edge or backend jobs)
create table if not exists public.expo_push_ticket_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  push_token text not null,
  ticket_id text,
  batch_id text,
  send_http_status int,
  send_status text,
  send_error text,
  receipt_status text,
  receipt_error text,
  receipt_checked_at timestamptz,
  raw_send jsonb,
  raw_receipt jsonb
);

create index if not exists idx_expo_push_ticket_log_user on public.expo_push_ticket_log(user_id, created_at desc);
create index if not exists idx_expo_push_ticket_log_ticket on public.expo_push_ticket_log(ticket_id)
  where ticket_id is not null;
create index if not exists idx_expo_push_ticket_log_receipt_pending
  on public.expo_push_ticket_log(created_at)
  where ticket_id is not null and receipt_checked_at is null;

alter table public.expo_push_ticket_log enable row level security;

comment on table public.expo_push_ticket_log is
  'Expo push ticket IDs for getReceipts polling; inserted by service role (Edge).';
