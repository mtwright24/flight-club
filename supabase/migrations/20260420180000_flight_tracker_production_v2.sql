-- Flight Tracker production v2: user tracked flights, alerts, caches, schedule links, API logs
-- Extends 20260408153000_flight_tracker_core.sql — keeps tracked_flights_cache + user_tracked_flights for compatibility.

-- ---------------------------------------------------------------------------
-- tracked_flights: user-owned saved / tracked flights (denormalized snapshot + keys)
-- ---------------------------------------------------------------------------
create table if not exists public.tracked_flights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  carrier_code text not null,
  flight_number text not null,
  display_flight_number text,
  flight_date date not null,
  departure_airport text not null,
  arrival_airport text not null,
  flight_key text references public.tracked_flights_cache(flight_key) on delete set null,
  scheduled_departure_utc timestamptz,
  scheduled_arrival_utc timestamptz,
  estimated_departure_utc timestamptz,
  estimated_arrival_utc timestamptz,
  actual_departure_utc timestamptz,
  actual_arrival_utc timestamptz,
  departure_terminal text,
  arrival_terminal text,
  departure_gate text,
  arrival_gate text,
  status text,
  tail_number text,
  aircraft_type text,
  api_provider text not null default 'flightaware',
  api_flight_id text,
  alerts_enabled boolean not null default true,
  is_pinned boolean not null default false,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracked_flights_carrier_chk check (char_length(carrier_code) between 2 and 4),
  constraint tracked_flights_flight_number_chk check (char_length(flight_number) between 1 and 8)
);

create unique index if not exists tracked_flights_user_flight_day_uidx
  on public.tracked_flights (user_id, carrier_code, flight_number, flight_date);
create index if not exists tracked_flights_user_idx on public.tracked_flights (user_id, updated_at desc);
create index if not exists tracked_flights_carrier_fn_date_idx
  on public.tracked_flights (carrier_code, flight_number, flight_date);
create index if not exists tracked_flights_api_flight_id_idx on public.tracked_flights (api_flight_id);
create index if not exists tracked_flights_is_pinned_idx on public.tracked_flights (user_id, is_pinned desc);

-- ---------------------------------------------------------------------------
-- flight_watch_alerts
-- ---------------------------------------------------------------------------
create table if not exists public.flight_watch_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tracked_flight_id uuid not null references public.tracked_flights(id) on delete cascade,
  alert_type text not null,
  is_enabled boolean not null default true,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tracked_flight_id, alert_type),
  constraint flight_watch_alerts_type_chk check (
    alert_type in (
      'delay', 'gate_change', 'cancelled', 'equipment_change',
      'arrived', 'boarding', 'inbound_delay'
    )
  )
);

create index if not exists flight_watch_alerts_user_idx on public.flight_watch_alerts (user_id);

-- ---------------------------------------------------------------------------
-- flight_status_cache (server-managed normalized flight lookups)
-- ---------------------------------------------------------------------------
create table if not exists public.flight_status_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  carrier_code text,
  flight_number text,
  flight_date date,
  payload_json jsonb not null,
  provider text not null default 'flightaware',
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists flight_status_cache_expires_idx on public.flight_status_cache (expires_at);
create index if not exists flight_status_cache_carrier_fn_date_idx
  on public.flight_status_cache (carrier_code, flight_number, flight_date);

-- ---------------------------------------------------------------------------
-- airport_boards_cache (server-managed)
-- ---------------------------------------------------------------------------
create table if not exists public.airport_boards_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  airport_code text not null,
  board_type text not null,
  date_key text not null,
  payload_json jsonb not null,
  provider text not null default 'flightaware',
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint airport_boards_cache_board_type_chk check (board_type in ('arrivals', 'departures'))
);

create index if not exists airport_boards_cache_airport_idx on public.airport_boards_cache (airport_code);
create index if not exists airport_boards_cache_expires_idx on public.airport_boards_cache (expires_at);

-- ---------------------------------------------------------------------------
-- inbound_aircraft_links
-- ---------------------------------------------------------------------------
create table if not exists public.inbound_aircraft_links (
  id uuid primary key default gen_random_uuid(),
  tracked_flight_id uuid not null references public.tracked_flights(id) on delete cascade,
  inbound_api_flight_id text,
  inbound_carrier_code text,
  inbound_flight_number text,
  inbound_departure_airport text,
  inbound_arrival_airport text,
  inbound_scheduled_arrival_utc timestamptz,
  inbound_estimated_arrival_utc timestamptz,
  inbound_actual_arrival_utc timestamptz,
  risk_level text,
  minutes_late integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inbound_aircraft_links_tracked_idx on public.inbound_aircraft_links (tracked_flight_id);
create unique index if not exists inbound_aircraft_links_tracked_uidx on public.inbound_aircraft_links (tracked_flight_id);

-- ---------------------------------------------------------------------------
-- schedule_flight_links
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_flight_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schedule_item_id uuid not null references public.schedule_entries(id) on delete cascade,
  carrier_code text not null,
  flight_number text not null,
  flight_date date not null,
  api_flight_id text,
  tracked_flight_id uuid references public.tracked_flights(id) on delete set null,
  sync_status text not null default 'pending',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_flight_links_sync_status_chk check (
    sync_status in ('pending', 'matched', 'not_found', 'error')
  )
);

create index if not exists schedule_flight_links_user_idx on public.schedule_flight_links (user_id);
create index if not exists schedule_flight_links_schedule_item_idx on public.schedule_flight_links (schedule_item_id);
create unique index if not exists schedule_flight_links_user_schedule_uidx
  on public.schedule_flight_links (user_id, schedule_item_id);

-- ---------------------------------------------------------------------------
-- flight_api_request_logs (debug)
-- ---------------------------------------------------------------------------
create table if not exists public.flight_api_request_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  endpoint text not null,
  request_key text,
  status_code integer,
  error_message text,
  response_excerpt text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Extend flight_search_history
-- ---------------------------------------------------------------------------
alter table public.flight_search_history
  add column if not exists search_type text;
alter table public.flight_search_history
  add column if not exists query_text text;
alter table public.flight_search_history
  add column if not exists normalized_query text;
alter table public.flight_search_history
  add column if not exists metadata_json jsonb default '{}'::jsonb;

update public.flight_search_history
  set search_type = coalesce(search_type, query_type),
      query_text = coalesce(query_text, query)
  where search_type is null or query_text is null;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_tracked_flights_updated_at on public.tracked_flights;
create trigger trg_tracked_flights_updated_at
  before update on public.tracked_flights
  for each row execute function public.set_flight_tracker_updated_at();

drop trigger if exists trg_inbound_aircraft_links_updated_at on public.inbound_aircraft_links;
create trigger trg_inbound_aircraft_links_updated_at
  before update on public.inbound_aircraft_links
  for each row execute function public.set_flight_tracker_updated_at();

drop trigger if exists trg_schedule_flight_links_updated_at on public.schedule_flight_links;
create trigger trg_schedule_flight_links_updated_at
  before update on public.schedule_flight_links
  for each row execute function public.set_flight_tracker_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.tracked_flights enable row level security;
alter table public.flight_watch_alerts enable row level security;
alter table public.schedule_flight_links enable row level security;

alter table public.flight_status_cache enable row level security;
alter table public.airport_boards_cache enable row level security;
alter table public.inbound_aircraft_links enable row level security;
alter table public.flight_api_request_logs enable row level security;

-- User-owned
drop policy if exists "tracked_flights_select_own" on public.tracked_flights;
create policy "tracked_flights_select_own" on public.tracked_flights
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "tracked_flights_insert_own" on public.tracked_flights;
create policy "tracked_flights_insert_own" on public.tracked_flights
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "tracked_flights_update_own" on public.tracked_flights;
create policy "tracked_flights_update_own" on public.tracked_flights
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "tracked_flights_delete_own" on public.tracked_flights;
create policy "tracked_flights_delete_own" on public.tracked_flights
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "flight_watch_alerts_select_own" on public.flight_watch_alerts;
create policy "flight_watch_alerts_select_own" on public.flight_watch_alerts
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "flight_watch_alerts_insert_own" on public.flight_watch_alerts;
create policy "flight_watch_alerts_insert_own" on public.flight_watch_alerts
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "flight_watch_alerts_update_own" on public.flight_watch_alerts;
create policy "flight_watch_alerts_update_own" on public.flight_watch_alerts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "flight_watch_alerts_delete_own" on public.flight_watch_alerts;
create policy "flight_watch_alerts_delete_own" on public.flight_watch_alerts
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "schedule_flight_links_select_own" on public.schedule_flight_links;
create policy "schedule_flight_links_select_own" on public.schedule_flight_links
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "schedule_flight_links_insert_own" on public.schedule_flight_links;
create policy "schedule_flight_links_insert_own" on public.schedule_flight_links
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "schedule_flight_links_update_own" on public.schedule_flight_links;
create policy "schedule_flight_links_update_own" on public.schedule_flight_links
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "schedule_flight_links_delete_own" on public.schedule_flight_links;
create policy "schedule_flight_links_delete_own" on public.schedule_flight_links
  for delete to authenticated using (auth.uid() = user_id);

-- Server-only cache / logs (no client access)
drop policy if exists "flight_status_cache_no_client" on public.flight_status_cache;
create policy "flight_status_cache_no_client" on public.flight_status_cache
  for all to authenticated using (false) with check (false);

drop policy if exists "airport_boards_cache_no_client" on public.airport_boards_cache;
create policy "airport_boards_cache_no_client" on public.airport_boards_cache
  for all to authenticated using (false) with check (false);

drop policy if exists "inbound_aircraft_links_no_client" on public.inbound_aircraft_links;
create policy "inbound_aircraft_links_no_client" on public.inbound_aircraft_links
  for all to authenticated using (false) with check (false);

drop policy if exists "flight_api_logs_no_client" on public.flight_api_request_logs;
create policy "flight_api_logs_no_client" on public.flight_api_request_logs
  for all to authenticated using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Backfill tracked_flights from legacy user_tracked_flights + cache (best-effort)
-- ---------------------------------------------------------------------------
insert into public.tracked_flights (
  user_id,
  carrier_code,
  flight_number,
  display_flight_number,
  flight_date,
  departure_airport,
  arrival_airport,
  flight_key,
  scheduled_departure_utc,
  scheduled_arrival_utc,
  estimated_departure_utc,
  estimated_arrival_utc,
  actual_departure_utc,
  actual_arrival_utc,
  departure_terminal,
  arrival_terminal,
  departure_gate,
  arrival_gate,
  status,
  tail_number,
  aircraft_type,
  api_provider,
  api_flight_id,
  alerts_enabled,
  is_pinned,
  last_synced_at
)
select
  u.user_id,
  c.airline_code,
  c.flight_number,
  c.airline_code || ' ' || c.flight_number,
  c.service_date,
  c.origin_airport,
  c.destination_airport,
  c.flight_key,
  c.scheduled_departure,
  c.scheduled_arrival,
  c.estimated_departure,
  c.estimated_arrival,
  c.actual_departure,
  c.actual_arrival,
  c.terminal,
  null,
  c.gate,
  null,
  c.normalized_status,
  c.registration,
  c.aircraft_type,
  'flightaware',
  c.provider_flight_id,
  true,
  false,
  c.updated_at
from public.user_tracked_flights u
join public.tracked_flights_cache c on c.flight_key = u.flight_key
on conflict (user_id, carrier_code, flight_number, flight_date) do nothing;
