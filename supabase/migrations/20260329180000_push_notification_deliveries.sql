create extension if not exists pgcrypto;

create table if not exists public.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  push_token text not null,
  notification_id uuid references public.notifications(id) on delete set null,
  expo_ticket_id text,
  expo_receipt_id text,
  status text,
  error_code text,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_notification_deliveries_ticket
  on public.push_notification_deliveries(expo_ticket_id);

create index if not exists idx_push_notification_deliveries_user
  on public.push_notification_deliveries(user_id);

create or replace function public.set_updated_at_push_notification_deliveries()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_push_notification_deliveries
on public.push_notification_deliveries;

create trigger trg_set_updated_at_push_notification_deliveries
before update on public.push_notification_deliveries
for each row
execute procedure public.set_updated_at_push_notification_deliveries();
