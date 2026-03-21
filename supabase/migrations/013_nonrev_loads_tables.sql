-- Create tables for Non-Rev / Staff Loads feature

-- nonrev_searches: track user search history
create table if not exists public.nonrev_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  airline_code text not null,
  from_airport text not null,
  to_airport text not null,
  travel_date date not null,
  created_at timestamptz default now() not null
);

-- nonrev_load_flights: flights available (seeded or crowdsourced)
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

-- nonrev_load_reports: community reports on seat availability (Light/Medium/Heavy/Full)
create table if not exists public.nonrev_load_reports (
  id uuid primary key default gen_random_uuid(),
  flight_id uuid references public.nonrev_load_flights(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  status text not null check (status in ('LIGHT', 'MEDIUM', 'HEAVY', 'FULL')),
  notes text,
  media_url text,
  created_at timestamptz default now() not null
);

-- nonrev_alerts: saved load search alerts
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

-- user_entitlements: tracks loads/alerts plans and credit balances
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

-- loads_requests: user-posted requests for flight information (MVP: crowdsourced)
create table if not exists public.loads_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  airline_code text not null,
  flight_number text,
  depart_airport text not null,
  arrive_airport text not null,
  depart_date date not null,
  status text default 'OPEN' check (status in ('OPEN', 'ANSWERED', 'CLOSED')),
  created_at timestamptz default now() not null
);

-- loads_answers: community answers to loads requests (future: responses from crew)
create table if not exists public.loads_answers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.loads_requests(id) on delete cascade not null,
  responder_user_id uuid references auth.users(id) on delete cascade,
  standby_listed integer,
  available integer,
  notes text,
  created_at timestamptz default now() not null
);

-- credit_transactions: track all credit additions/removals
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null check (provider in ('APPLE_IAP', 'PROMO', 'ADMIN')),
  product_id text,
  credits_delta integer not null,
  amount_usd numeric,
  currency text default 'USD',
  receipt_data text,
  created_at timestamptz default now() not null
);

-- Add columns to user_profiles if not already present
alter table public.user_profiles 
add column if not exists credits_balance integer default 0;

-- Create indexes for common queries
create index if not exists idx_nonrev_searches_user_id on public.nonrev_searches(user_id);
create index if not exists idx_nonrev_load_flights_route_date on public.nonrev_load_flights(from_airport, to_airport, travel_date);
create index if not exists idx_nonrev_load_reports_flight_id on public.nonrev_load_reports(flight_id);
create index if not exists idx_nonrev_alerts_user_id on public.nonrev_alerts(user_id);
create index if not exists idx_loads_requests_user_id on public.loads_requests(user_id);
create index if not exists idx_credit_transactions_user_id on public.credit_transactions(user_id);
