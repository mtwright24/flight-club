-- Pairing detail: crew + hotel rows + extended pairing summary fields (FLICA direct import).

-- ---------------------------------------------------------------------------
-- schedule_pairings — detail fields (add only if missing)
-- ---------------------------------------------------------------------------
alter table public.schedule_pairings add column if not exists route_summary text;
alter table public.schedule_pairings add column if not exists report_time text;
alter table public.schedule_pairings add column if not exists layover_total_minutes integer;
alter table public.schedule_pairings add column if not exists raw_pairing_html text;
alter table public.schedule_pairings add column if not exists raw_pairing_text text;
alter table public.schedule_pairings add column if not exists pairing_block_minutes integer;
alter table public.schedule_pairings add column if not exists pairing_credit_minutes integer;
alter table public.schedule_pairings add column if not exists pairing_tafb_minutes integer;

create index if not exists idx_schedule_pairings_user_import_pairing_txt
  on public.schedule_pairings (user_id, import_id, pairing_id);

-- ---------------------------------------------------------------------------
-- schedule_pairing_crew
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_pairing_crew (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  import_batch_id uuid references public.schedule_import_batches (id) on delete cascade,
  pairing_id text not null,
  pairing_db_id uuid references public.schedule_pairings (id) on delete set null,
  position text,
  employee_number text,
  crew_name text,
  role_label text,
  is_current_user boolean not null default false,
  raw_text text,
  created_at timestamptz not null default now()
);

create index if not exists idx_schedule_pairing_crew_user_batch_pairing
  on public.schedule_pairing_crew (user_id, import_batch_id, pairing_id);

create index if not exists idx_schedule_pairing_crew_pairing_db
  on public.schedule_pairing_crew (pairing_db_id);

alter table public.schedule_pairing_crew enable row level security;

drop policy if exists "schedule_pairing_crew_select_own" on public.schedule_pairing_crew;
create policy "schedule_pairing_crew_select_own"
  on public.schedule_pairing_crew for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "schedule_pairing_crew_insert_own" on public.schedule_pairing_crew;
create policy "schedule_pairing_crew_insert_own"
  on public.schedule_pairing_crew for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "schedule_pairing_crew_update_own" on public.schedule_pairing_crew;
create policy "schedule_pairing_crew_update_own"
  on public.schedule_pairing_crew for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "schedule_pairing_crew_delete_own" on public.schedule_pairing_crew;
create policy "schedule_pairing_crew_delete_own"
  on public.schedule_pairing_crew for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- schedule_pairing_hotels
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_pairing_hotels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  import_batch_id uuid references public.schedule_import_batches (id) on delete cascade,
  pairing_id text not null,
  pairing_db_id uuid references public.schedule_pairings (id) on delete set null,
  duty_date date,
  layover_city text,
  hotel_name text,
  hotel_phone text,
  nights integer,
  raw_text text,
  created_at timestamptz not null default now()
);

create index if not exists idx_schedule_pairing_hotels_user_batch_pairing
  on public.schedule_pairing_hotels (user_id, import_batch_id, pairing_id);

create index if not exists idx_schedule_pairing_hotels_pairing_db
  on public.schedule_pairing_hotels (pairing_db_id);

alter table public.schedule_pairing_hotels enable row level security;

drop policy if exists "schedule_pairing_hotels_select_own" on public.schedule_pairing_hotels;
create policy "schedule_pairing_hotels_select_own"
  on public.schedule_pairing_hotels for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "schedule_pairing_hotels_insert_own" on public.schedule_pairing_hotels;
create policy "schedule_pairing_hotels_insert_own"
  on public.schedule_pairing_hotels for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "schedule_pairing_hotels_update_own" on public.schedule_pairing_hotels;
create policy "schedule_pairing_hotels_update_own"
  on public.schedule_pairing_hotels for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "schedule_pairing_hotels_delete_own" on public.schedule_pairing_hotels;
create policy "schedule_pairing_hotels_delete_own"
  on public.schedule_pairing_hotels for delete to authenticated
  using (user_id = auth.uid());
