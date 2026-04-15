-- Staff Loads knowledge: structured airline notes, route/airport context, optional travel offer templates.
-- Migrates legacy public.airline_notes rows into staff_loads_airline_note_entries (idempotent).

-- ---------------------------------------------------------------------------
-- Structured airline notes (many per carrier)
-- ---------------------------------------------------------------------------
create table if not exists public.staff_loads_airline_note_entries (
  id uuid primary key default gen_random_uuid(),
  airline_code text not null,
  note_category text not null,
  title text not null,
  body text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.staff_loads_airline_note_entries drop constraint if exists staff_loads_airline_note_entries_category_check;
  alter table public.staff_loads_airline_note_entries add constraint staff_loads_airline_note_entries_category_check
    check (note_category in (
      'standby', 'embargo', 'checkin', 'priority', 'nominee', 'baggage', 'general', 'other'
    ));
exception when others then null; end $$;

create index if not exists idx_staff_loads_airline_notes_airline
  on public.staff_loads_airline_note_entries(airline_code, active, sort_order);

-- Migrate legacy single-row airline_notes into general category (once)
insert into public.staff_loads_airline_note_entries (airline_code, note_category, title, body, sort_order)
select upper(trim(a.airline_code)), 'general', a.title, a.body, 0
from public.airline_notes a
where not exists (
  select 1 from public.staff_loads_airline_note_entries e
  where upper(e.airline_code) = upper(trim(a.airline_code))
    and e.note_category = 'general'
);

-- ---------------------------------------------------------------------------
-- Airport → IANA timezone (reference data for client-side comparisons)
-- ---------------------------------------------------------------------------
create table if not exists public.staff_loads_airport_timezones (
  airport_code text primary key,
  iana_tz text not null,
  updated_at timestamptz not null default now()
);

insert into public.staff_loads_airport_timezones (airport_code, iana_tz) values
  ('JFK', 'America/New_York'),
  ('LGA', 'America/New_York'),
  ('EWR', 'America/New_York'),
  ('BOS', 'America/New_York'),
  ('DCA', 'America/New_York'),
  ('IAD', 'America/New_York'),
  ('BWI', 'America/New_York'),
  ('ATL', 'America/New_York'),
  ('MIA', 'America/New_York'),
  ('FLL', 'America/New_York'),
  ('TPA', 'America/New_York'),
  ('MCO', 'America/New_York'),
  ('CLT', 'America/New_York'),
  ('PHL', 'America/New_York'),
  ('DTW', 'America/New_York'),
  ('ORD', 'America/Chicago'),
  ('MDW', 'America/Chicago'),
  ('MSP', 'America/Chicago'),
  ('DFW', 'America/Chicago'),
  ('IAH', 'America/Chicago'),
  ('HOU', 'America/Chicago'),
  ('AUS', 'America/Chicago'),
  ('BNA', 'America/Chicago'),
  ('STL', 'America/Chicago'),
  ('DEN', 'America/Denver'),
  ('SLC', 'America/Denver'),
  ('PHX', 'America/Phoenix'),
  ('LAS', 'America/Los_Angeles'),
  ('LAX', 'America/Los_Angeles'),
  ('SNA', 'America/Los_Angeles'),
  ('SAN', 'America/Los_Angeles'),
  ('SFO', 'America/Los_Angeles'),
  ('OAK', 'America/Los_Angeles'),
  ('SEA', 'America/Los_Angeles'),
  ('PDX', 'America/Los_Angeles')
on conflict (airport_code) do update set iana_tz = excluded.iana_tz, updated_at = now();

-- ---------------------------------------------------------------------------
-- Route / destination knowledge blocks (data-driven good-to-know)
-- ---------------------------------------------------------------------------
create table if not exists public.staff_loads_route_knowledge (
  id uuid primary key default gen_random_uuid(),
  from_airport text,
  to_airport text,
  travel_date date,
  block_kind text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.staff_loads_route_knowledge drop constraint if exists staff_loads_route_knowledge_block_kind_check;
  alter table public.staff_loads_route_knowledge add constraint staff_loads_route_knowledge_block_kind_check
    check (block_kind in ('timezone', 'weather', 'route_context', 'arrival', 'misc'));
exception when others then null; end $$;

create index if not exists idx_staff_loads_route_knowledge_match
  on public.staff_loads_route_knowledge(from_airport, to_airport, travel_date, active, sort_order);

-- No fake weather/route filler rows: ops can insert via SQL or admin later.

-- ---------------------------------------------------------------------------
-- Optional travel / deals templates (secondary; often empty)
-- ---------------------------------------------------------------------------
create table if not exists public.staff_loads_travel_offer_templates (
  id uuid primary key default gen_random_uuid(),
  offer_kind text not null,
  title text not null,
  subtitle text,
  detail_url text,
  image_url text,
  applicable_airports text[] default null,
  sort_order integer not null default 0,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.staff_loads_travel_offer_templates drop constraint if exists staff_loads_travel_offer_templates_kind_check;
  alter table public.staff_loads_travel_offer_templates add constraint staff_loads_travel_offer_templates_kind_check
    check (offer_kind in ('hotel', 'car', 'esim', 'other'));
exception when others then null; end $$;

create index if not exists idx_staff_loads_travel_offers_active
  on public.staff_loads_travel_offer_templates(active, sort_order)
  where active = true;

-- ---------------------------------------------------------------------------
-- RLS (read-only reference data for authenticated app users)
-- ---------------------------------------------------------------------------
alter table public.staff_loads_airline_note_entries enable row level security;
alter table public.staff_loads_airport_timezones enable row level security;
alter table public.staff_loads_route_knowledge enable row level security;
alter table public.staff_loads_travel_offer_templates enable row level security;

drop policy if exists "staff_loads_airline_notes_select" on public.staff_loads_airline_note_entries;
create policy "staff_loads_airline_notes_select" on public.staff_loads_airline_note_entries
  for select to authenticated using (true);

drop policy if exists "staff_loads_airport_tz_select" on public.staff_loads_airport_timezones;
create policy "staff_loads_airport_tz_select" on public.staff_loads_airport_timezones
  for select to authenticated using (true);

drop policy if exists "staff_loads_route_knowledge_select" on public.staff_loads_route_knowledge;
create policy "staff_loads_route_knowledge_select" on public.staff_loads_route_knowledge
  for select to authenticated using (true);

drop policy if exists "staff_loads_travel_offers_select" on public.staff_loads_travel_offer_templates;
create policy "staff_loads_travel_offers_select" on public.staff_loads_travel_offer_templates
  for select to authenticated using (true);
