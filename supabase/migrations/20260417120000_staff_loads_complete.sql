-- Staff Loads: ensure all tables + RLS for search, requests, wallet, and non-rev flows.
-- Safe to run on DBs missing earlier 010/013 nonrev migrations (idempotent).

-- ---------------------------------------------------------------------------
-- Tables (mirror 010 + 013 where still needed)
-- ---------------------------------------------------------------------------

create table if not exists public.nonrev_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  airline_code text not null,
  from_airport text not null,
  to_airport text not null,
  travel_date date not null,
  created_at timestamptz default now() not null
);

create table if not exists public.nonrev_load_flights (
  id uuid primary key default gen_random_uuid(),
  airline_code text not null,
  flight_number text not null,
  from_airport text not null,
  to_airport text not null,
  depart_at timestamptz not null,
  arrive_at timestamptz not null,
  travel_date date not null,
  created_at timestamptz default now() not null,
  unique(airline_code, flight_number, depart_at, travel_date)
);

create table if not exists public.nonrev_load_reports (
  id uuid primary key default gen_random_uuid(),
  flight_id uuid references public.nonrev_load_flights(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  status text not null check (status in ('LIGHT', 'MEDIUM', 'HEAVY', 'FULL')),
  notes text,
  media_url text,
  created_at timestamptz default now() not null
);

create table if not exists public.nonrev_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  airline_code text not null,
  from_airport text not null,
  to_airport text not null,
  travel_date date not null,
  notify_new_reports boolean default true,
  enabled boolean default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  loads_plan text default 'NONE' check (loads_plan in ('NONE', 'LOADS_BASIC', 'LOADS_PRO')),
  loads_requests_remaining integer default 0,
  loads_access_expires_at timestamptz,
  alerts_plan text default 'NONE' check (alerts_plan in ('NONE', 'ALERTS_BASIC', 'ALERTS_PRO')),
  alerts_access_expires_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.load_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  airline_code text not null,
  from_airport text not null,
  to_airport text not null,
  travel_date date not null,
  options jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.load_answers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.load_requests(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  load_level text not null,
  notes text,
  as_of timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.credits_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount int not null,
  reason text,
  source text,
  created_at timestamptz not null default now()
);

-- Credits on profiles (app reads here for entitlements)
alter table public.profiles
  add column if not exists credits_balance integer default 0;

create index if not exists idx_nonrev_searches_user_id on public.nonrev_searches(user_id);
create index if not exists idx_nonrev_load_flights_route_date on public.nonrev_load_flights(from_airport, to_airport, travel_date);
create index if not exists idx_nonrev_load_reports_flight_id on public.nonrev_load_reports(flight_id);
create index if not exists idx_nonrev_alerts_user_id on public.nonrev_alerts(user_id);
create index if not exists idx_load_requests_status on public.load_requests(status);
create index if not exists idx_credits_ledger_user_id on public.credits_ledger(user_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.nonrev_searches enable row level security;
alter table public.nonrev_load_flights enable row level security;
alter table public.nonrev_load_reports enable row level security;
alter table public.nonrev_alerts enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.load_requests enable row level security;
alter table public.load_answers enable row level security;
alter table public.user_credits enable row level security;
alter table public.credits_ledger enable row level security;

-- nonrev_searches
drop policy if exists "users_can_read_own_searches" on public.nonrev_searches;
drop policy if exists "users_can_create_searches" on public.nonrev_searches;
drop policy if exists "users_can_delete_own_searches" on public.nonrev_searches;
create policy "users_can_read_own_searches" on public.nonrev_searches for select using (auth.uid() = user_id);
create policy "users_can_create_searches" on public.nonrev_searches for insert with check (auth.uid() = user_id);
create policy "users_can_delete_own_searches" on public.nonrev_searches for delete using (auth.uid() = user_id);

-- nonrev_load_flights: read all; upsert from app needs insert/update
drop policy if exists "anyone_can_read_flights" on public.nonrev_load_flights;
drop policy if exists "authenticated_insert_flights" on public.nonrev_load_flights;
drop policy if exists "authenticated_update_flights" on public.nonrev_load_flights;
create policy "anyone_can_read_flights" on public.nonrev_load_flights for select using (true);
create policy "authenticated_insert_flights" on public.nonrev_load_flights for insert to authenticated with check (true);
create policy "authenticated_update_flights" on public.nonrev_load_flights for update to authenticated using (true) with check (true);

-- nonrev_load_reports
drop policy if exists "anyone_can_read_reports" on public.nonrev_load_reports;
drop policy if exists "users_can_create_reports" on public.nonrev_load_reports;
drop policy if exists "users_can_delete_own_reports" on public.nonrev_load_reports;
create policy "anyone_can_read_reports" on public.nonrev_load_reports for select using (true);
create policy "users_can_create_reports" on public.nonrev_load_reports for insert with check (auth.uid() = user_id);
create policy "users_can_delete_own_reports" on public.nonrev_load_reports for delete using (auth.uid() = user_id);

-- nonrev_alerts
drop policy if exists "users_can_read_own_alerts" on public.nonrev_alerts;
drop policy if exists "users_can_create_alerts" on public.nonrev_alerts;
drop policy if exists "users_can_update_own_alerts" on public.nonrev_alerts;
drop policy if exists "users_can_delete_own_alerts" on public.nonrev_alerts;
create policy "users_can_read_own_alerts" on public.nonrev_alerts for select using (auth.uid() = user_id);
create policy "users_can_create_alerts" on public.nonrev_alerts for insert with check (auth.uid() = user_id);
create policy "users_can_update_own_alerts" on public.nonrev_alerts for update using (auth.uid() = user_id);
create policy "users_can_delete_own_alerts" on public.nonrev_alerts for delete using (auth.uid() = user_id);

-- user_entitlements
drop policy if exists "users_can_read_own_entitlements" on public.user_entitlements;
create policy "users_can_read_own_entitlements" on public.user_entitlements for select using (auth.uid() = user_id);

-- load_requests: community list (all authenticated can read)
drop policy if exists "select_own_load_requests" on public.load_requests;
drop policy if exists "insert_own_load_requests" on public.load_requests;
drop policy if exists "update_own_load_requests" on public.load_requests;
drop policy if exists "load_requests_select_authenticated" on public.load_requests;
drop policy if exists "load_requests_insert_own" on public.load_requests;
drop policy if exists "load_requests_update_own" on public.load_requests;
create policy "load_requests_select_authenticated" on public.load_requests for select to authenticated using (true);
create policy "load_requests_insert_own" on public.load_requests for insert to authenticated with check (auth.uid() = user_id);
create policy "load_requests_update_own" on public.load_requests for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- load_answers: read all; insert own rows
drop policy if exists "select_own_load_answers" on public.load_answers;
drop policy if exists "insert_own_load_answers" on public.load_answers;
drop policy if exists "load_answers_select_authenticated" on public.load_answers;
drop policy if exists "load_answers_insert_own" on public.load_answers;
create policy "load_answers_select_authenticated" on public.load_answers for select to authenticated using (true);
create policy "load_answers_insert_own" on public.load_answers for insert to authenticated with check (auth.uid() = user_id);

-- user_credits + credits_ledger: own rows; RPC (security definer) writes
drop policy if exists "select_own_user_credits" on public.user_credits;
drop policy if exists "select_own_credits_ledger" on public.credits_ledger;
create policy "select_own_user_credits" on public.user_credits for select using (auth.uid() = user_id);
create policy "select_own_credits_ledger" on public.credits_ledger for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Credit RPCs (idempotent)
-- ---------------------------------------------------------------------------

create or replace function public.rpc_spend_credit(amount int, reason text, source text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rows_updated int;
begin
  if amount is null or amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  update public.user_credits
  set balance = balance - amount, updated_at = now()
  where user_id = auth.uid() and balance >= amount;
  get diagnostics rows_updated = row_count;
  if rows_updated = 0 then
    raise exception 'insufficient balance';
  end if;
  insert into public.credits_ledger (user_id, amount, reason, source)
  values (auth.uid(), -amount, reason, source);
  update public.profiles
  set credits_balance = greatest(0, coalesce(credits_balance, 0) - amount)
  where id = auth.uid();
end;
$$;

create or replace function public.rpc_grant_credits(amount int, reason text, source text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if amount is null or amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  insert into public.user_credits (user_id, balance, updated_at)
  values (auth.uid(), amount, now())
  on conflict (user_id) do update
  set balance = public.user_credits.balance + excluded.balance, updated_at = now();
  insert into public.credits_ledger (user_id, amount, reason, source)
  values (auth.uid(), amount, reason, source);
  update public.profiles
  set credits_balance = coalesce(credits_balance, 0) + amount
  where id = auth.uid();
end;
$$;

grant execute on function public.rpc_spend_credit(int, text, text) to authenticated;
grant execute on function public.rpc_grant_credits(int, text, text) to authenticated;
