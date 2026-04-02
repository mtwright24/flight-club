-- Flight Tracker core shared data layer
-- Powers user-facing tracker, delay watcher, and cross-feature enrichment.

create table if not exists public.tracked_flights_cache (
  id uuid primary key default gen_random_uuid(),
  flight_key text not null unique,
  provider_flight_id text,
  airline_code text not null,
  airline_name text,
  flight_number text not null,
  origin_airport text not null,
  destination_airport text not null,
  service_date date not null,
  normalized_status text not null default 'unknown',
  flight_status_raw text,
  scheduled_departure timestamptz,
  scheduled_arrival timestamptz,
  estimated_departure timestamptz,
  estimated_arrival timestamptz,
  actual_departure timestamptz,
  actual_arrival timestamptz,
  delay_minutes integer,
  aircraft_type text,
  registration text,
  terminal text,
  gate text,
  altitude integer,
  speed integer,
  heading integer,
  latitude double precision,
  longitude double precision,
  route_data jsonb,
  last_provider_update_at timestamptz,
  cache_state text not null default 'warm',
  cache_expires_at timestamptz,
  cached_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracked_flights_cache_airline_code_chk check (char_length(airline_code) between 2 and 4),
  constraint tracked_flights_cache_flight_number_chk check (char_length(flight_number) between 1 and 8),
  constraint tracked_flights_cache_airports_chk check (
    char_length(origin_airport) = 3 and char_length(destination_airport) = 3
  )
);

create index if not exists tracked_flights_cache_service_date_idx
  on public.tracked_flights_cache(service_date);
create index if not exists tracked_flights_cache_status_idx
  on public.tracked_flights_cache(normalized_status);
create index if not exists tracked_flights_cache_cache_expires_idx
  on public.tracked_flights_cache(cache_expires_at);
create index if not exists tracked_flights_cache_airline_flight_idx
  on public.tracked_flights_cache(airline_code, flight_number, service_date);

create table if not exists public.user_tracked_flights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  flight_key text not null references public.tracked_flights_cache(flight_key) on delete cascade,
  alert_on_delay boolean not null default true,
  alert_on_cancel boolean not null default true,
  alert_on_departure boolean not null default true,
  alert_on_arrival boolean not null default true,
  alert_on_gate_change boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, flight_key)
);

create index if not exists user_tracked_flights_user_idx
  on public.user_tracked_flights(user_id, updated_at desc);
create index if not exists user_tracked_flights_flight_idx
  on public.user_tracked_flights(flight_key);

create table if not exists public.flight_search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  query_type text not null,
  flight_key text references public.tracked_flights_cache(flight_key) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists flight_search_history_user_idx
  on public.flight_search_history(user_id, created_at desc);
create index if not exists flight_search_history_query_type_idx
  on public.flight_search_history(query_type);

create table if not exists public.flight_status_change_events (
  id uuid primary key default gen_random_uuid(),
  flight_key text not null references public.tracked_flights_cache(flight_key) on delete cascade,
  old_status text,
  new_status text,
  old_snapshot jsonb,
  new_snapshot jsonb,
  changed_at timestamptz not null default now(),
  event_type text not null
);

create index if not exists flight_status_change_events_flight_idx
  on public.flight_status_change_events(flight_key, changed_at desc);
create index if not exists flight_status_change_events_type_idx
  on public.flight_status_change_events(event_type, changed_at desc);

create table if not exists public.airport_board_cache (
  id uuid primary key default gen_random_uuid(),
  board_key text not null unique,
  airport_code text not null,
  board_type text not null check (board_type in ('arrivals', 'departures')),
  data jsonb not null default '[]'::jsonb,
  cache_expires_at timestamptz not null,
  cached_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists airport_board_cache_airport_idx
  on public.airport_board_cache(airport_code, board_type);
create index if not exists airport_board_cache_expires_idx
  on public.airport_board_cache(cache_expires_at);

create or replace function public.set_flight_tracker_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_tracked_flights_cache_updated_at on public.tracked_flights_cache;
create trigger trg_tracked_flights_cache_updated_at
before update on public.tracked_flights_cache
for each row execute function public.set_flight_tracker_updated_at();

drop trigger if exists trg_user_tracked_flights_updated_at on public.user_tracked_flights;
create trigger trg_user_tracked_flights_updated_at
before update on public.user_tracked_flights
for each row execute function public.set_flight_tracker_updated_at();

drop trigger if exists trg_airport_board_cache_updated_at on public.airport_board_cache;
create trigger trg_airport_board_cache_updated_at
before update on public.airport_board_cache
for each row execute function public.set_flight_tracker_updated_at();

alter table public.tracked_flights_cache enable row level security;
alter table public.user_tracked_flights enable row level security;
alter table public.flight_search_history enable row level security;
alter table public.flight_status_change_events enable row level security;
alter table public.airport_board_cache enable row level security;

drop policy if exists "TrackedFlightsCache read auth users" on public.tracked_flights_cache;
create policy "TrackedFlightsCache read auth users"
on public.tracked_flights_cache
for select
to authenticated
using (true);

drop policy if exists "TrackedFlightsCache writes service role only" on public.tracked_flights_cache;
create policy "TrackedFlightsCache writes service role only"
on public.tracked_flights_cache
for all
to authenticated
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "UserTrackedFlights own select" on public.user_tracked_flights;
create policy "UserTrackedFlights own select"
on public.user_tracked_flights
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "UserTrackedFlights own insert" on public.user_tracked_flights;
create policy "UserTrackedFlights own insert"
on public.user_tracked_flights
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "UserTrackedFlights own update" on public.user_tracked_flights;
create policy "UserTrackedFlights own update"
on public.user_tracked_flights
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "UserTrackedFlights own delete" on public.user_tracked_flights;
create policy "UserTrackedFlights own delete"
on public.user_tracked_flights
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "FlightSearchHistory own select" on public.flight_search_history;
create policy "FlightSearchHistory own select"
on public.flight_search_history
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "FlightSearchHistory own insert" on public.flight_search_history;
create policy "FlightSearchHistory own insert"
on public.flight_search_history
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "FlightSearchHistory own delete" on public.flight_search_history;
create policy "FlightSearchHistory own delete"
on public.flight_search_history
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "FlightStatusEvents read auth users" on public.flight_status_change_events;
create policy "FlightStatusEvents read auth users"
on public.flight_status_change_events
for select
to authenticated
using (true);

drop policy if exists "FlightStatusEvents writes service role only" on public.flight_status_change_events;
create policy "FlightStatusEvents writes service role only"
on public.flight_status_change_events
for all
to authenticated
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "AirportBoardCache read auth users" on public.airport_board_cache;
create policy "AirportBoardCache read auth users"
on public.airport_board_cache
for select
to authenticated
using (true);

drop policy if exists "AirportBoardCache writes service role only" on public.airport_board_cache;
create policy "AirportBoardCache writes service role only"
on public.airport_board_cache
for all
to authenticated
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
