-- JetBlue FA FLICA template-based import sessions: schedule_imports, images, issues; links batches/pairings; duties view.
-- Business rules: JetBlue Inflight CBA (IFC) — pairings Base-to-Base, footprints, RIG components stored separately.

-- ---------------------------------------------------------------------------
-- schedule_imports — one guided import session (1–4 screenshots, template-scoped)
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  airline_code text not null default 'B6',
  crew_role text not null default 'flight_attendant',
  source_type text not null default 'screenshot',
  schedule_system text not null default 'FLICA',
  template_key text not null default 'jetblue_fa_flica_month_detail',
  import_month smallint not null,
  import_year smallint not null,
  overall_confidence numeric,
  status text not null default 'draft',
  needs_review boolean not null default false,
  raw_ocr_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_imports_status_check check (
    status in ('draft', 'processing', 'review', 'partial', 'saved', 'failed')
  )
);

create index if not exists idx_schedule_imports_user_created
  on public.schedule_imports (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- schedule_import_images — each screenshot in a session
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_import_images (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.schedule_imports (id) on delete cascade,
  storage_path text not null,
  image_order smallint not null default 1,
  ocr_text text,
  template_detected boolean,
  image_confidence numeric,
  width integer,
  height integer,
  legacy_batch_id uuid references public.schedule_import_batches (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_schedule_import_images_import
  on public.schedule_import_images (import_id, image_order);

-- ---------------------------------------------------------------------------
-- schedule_import_issues — low-confidence / validation flags (never silent fail)
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_import_issues (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.schedule_imports (id) on delete cascade,
  pairing_id uuid references public.schedule_pairings (id) on delete cascade,
  issue_type text not null,
  field_name text,
  severity text,
  message text,
  resolution_status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_import_issues_resolution_check check (
    resolution_status in ('open', 'ignored', 'fixed', 'deferred')
  )
);

create index if not exists idx_schedule_import_issues_import
  on public.schedule_import_issues (import_id);

-- ---------------------------------------------------------------------------
-- Link legacy OCR batches to a guided import session
-- ---------------------------------------------------------------------------
alter table public.schedule_import_batches
  add column if not exists schedule_import_id uuid references public.schedule_imports (id) on delete set null;

create index if not exists idx_schedule_import_batches_session
  on public.schedule_import_batches (schedule_import_id);

-- ---------------------------------------------------------------------------
-- Extend schedule_pairings — template + RIG + JetBlue FLICA column names
-- ---------------------------------------------------------------------------
alter table public.schedule_pairings
  add column if not exists schedule_import_id uuid references public.schedule_imports (id) on delete cascade;

alter table public.schedule_pairings
  add column if not exists operate_start_date date;

alter table public.schedule_pairings
  add column if not exists operate_end_date date;

alter table public.schedule_pairings
  add column if not exists report_time_local text;

alter table public.schedule_pairings
  add column if not exists base_code text;

alter table public.schedule_pairings
  add column if not exists equipment_code text;

alter table public.schedule_pairings
  add column if not exists trip_rig text;

alter table public.schedule_pairings
  add column if not exists pairing_confidence numeric;

alter table public.schedule_pairings
  add column if not exists needs_review boolean;

alter table public.schedule_pairings
  add column if not exists raw_shown_credit numeric;

alter table public.schedule_pairings
  add column if not exists tafb_rig_credit numeric;

alter table public.schedule_pairings
  add column if not exists average_mdpc_credit numeric;

alter table public.schedule_pairings
  add column if not exists duty_rig_credit numeric;

alter table public.schedule_pairings
  add column if not exists final_pairing_credit numeric;

update public.schedule_pairings
set
  operate_start_date = coalesce(operate_start_date, pairing_start_date),
  operate_end_date = coalesce(operate_end_date, pairing_end_date),
  report_time_local = coalesce(report_time_local, pairing_report_time),
  base_code = coalesce(base_code, pairing_base),
  needs_review = coalesce(needs_review, pairing_requires_review, false);

create index if not exists idx_schedule_pairings_schedule_import
  on public.schedule_pairings (schedule_import_id);

-- ---------------------------------------------------------------------------
-- Extend schedule_pairing_legs — duty row semantics
-- ---------------------------------------------------------------------------
alter table public.schedule_pairing_legs
  add column if not exists duty_type_raw text;

alter table public.schedule_pairing_legs
  add column if not exists is_deadhead boolean;

alter table public.schedule_pairing_legs
  add column if not exists release_time_local text;

update public.schedule_pairing_legs
set release_time_local = coalesce(release_time_local, release_time)
where release_time is not null;

-- ---------------------------------------------------------------------------
-- View: schedule_pairing_duties — app-facing alias (pairing_row_id = parent schedule_pairings.id)
-- ---------------------------------------------------------------------------
create or replace view public.schedule_pairing_duties as
select
  l.id,
  l.pairing_id as pairing_row_id,
  l.duty_date,
  l.calendar_day,
  l.report_time,
  l.release_time_local,
  l.duty_type_raw,
  l.is_deadhead,
  l.duty_period_minutes,
  l.flight_number,
  l.segment_type,
  l.departure_station as from_airport,
  l.arrival_station as to_airport,
  l.scheduled_departure_local as departure_time_local,
  l.scheduled_arrival_local as arrival_time_local,
  l.block_time,
  l.credit_time,
  l.layover_start,
  l.layover_end,
  l.layover_minutes,
  l.layover_city,
  l.hotel_name,
  l.hotel_phone,
  l.aircraft_position_code,
  l.red_eye_flag,
  l.transatlantic_flag,
  l.customs_connect_flag,
  l.requires_review,
  l.raw_text,
  l.created_at,
  l.updated_at
from public.schedule_pairing_legs l;

-- ---------------------------------------------------------------------------
-- RLS: schedule_imports, schedule_import_images, schedule_import_issues
-- ---------------------------------------------------------------------------
alter table public.schedule_imports enable row level security;
alter table public.schedule_import_images enable row level security;
alter table public.schedule_import_issues enable row level security;

drop policy if exists "schedule_imports_select_own" on public.schedule_imports;
create policy "schedule_imports_select_own"
  on public.schedule_imports for select to authenticated using (user_id = auth.uid());

drop policy if exists "schedule_imports_insert_own" on public.schedule_imports;
create policy "schedule_imports_insert_own"
  on public.schedule_imports for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "schedule_imports_update_own" on public.schedule_imports;
create policy "schedule_imports_update_own"
  on public.schedule_imports for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "schedule_imports_delete_own" on public.schedule_imports;
create policy "schedule_imports_delete_own"
  on public.schedule_imports for delete to authenticated using (user_id = auth.uid());

drop policy if exists "schedule_import_images_select_own" on public.schedule_import_images;
create policy "schedule_import_images_select_own"
  on public.schedule_import_images for select to authenticated
  using (exists (select 1 from public.schedule_imports s where s.id = import_id and s.user_id = auth.uid()));

drop policy if exists "schedule_import_images_insert_own" on public.schedule_import_images;
create policy "schedule_import_images_insert_own"
  on public.schedule_import_images for insert to authenticated
  with check (exists (select 1 from public.schedule_imports s where s.id = import_id and s.user_id = auth.uid()));

drop policy if exists "schedule_import_images_update_own" on public.schedule_import_images;
create policy "schedule_import_images_update_own"
  on public.schedule_import_images for update to authenticated
  using (exists (select 1 from public.schedule_imports s where s.id = import_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.schedule_imports s where s.id = import_id and s.user_id = auth.uid()));

drop policy if exists "schedule_import_images_delete_own" on public.schedule_import_images;
create policy "schedule_import_images_delete_own"
  on public.schedule_import_images for delete to authenticated
  using (exists (select 1 from public.schedule_imports s where s.id = import_id and s.user_id = auth.uid()));

drop policy if exists "schedule_import_issues_select_own" on public.schedule_import_issues;
create policy "schedule_import_issues_select_own"
  on public.schedule_import_issues for select to authenticated
  using (exists (select 1 from public.schedule_imports s where s.id = import_id and s.user_id = auth.uid()));

drop policy if exists "schedule_import_issues_insert_own" on public.schedule_import_issues;
create policy "schedule_import_issues_insert_own"
  on public.schedule_import_issues for insert to authenticated
  with check (exists (select 1 from public.schedule_imports s where s.id = import_id and s.user_id = auth.uid()));

drop policy if exists "schedule_import_issues_update_own" on public.schedule_import_issues;
create policy "schedule_import_issues_update_own"
  on public.schedule_import_issues for update to authenticated
  using (exists (select 1 from public.schedule_imports s where s.id = import_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.schedule_imports s where s.id = import_id and s.user_id = auth.uid()));

drop policy if exists "schedule_import_issues_delete_own" on public.schedule_import_issues;
create policy "schedule_import_issues_delete_own"
  on public.schedule_import_issues for delete to authenticated
  using (exists (select 1 from public.schedule_imports s where s.id = import_id and s.user_id = auth.uid()));
