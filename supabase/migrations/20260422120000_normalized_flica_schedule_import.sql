-- JetBlue FLICA normalized schedule import pipeline (jobs → assets → extractions → normalized hierarchy).
-- Obsolete FLICA fields (TACLAG, GRNT, DHC) are not used for operational constraints; may appear in raw JSON only.
-- Contract/CBA rig and legality rules attach in app layer — not in this schema.

-- ---------------------------------------------------------------------------
-- 1) schedule_import_jobs
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  airline_code text not null default 'B6',
  source_type text not null default 'jetblue_flica_monthly_screenshot',
  source_month_label text,
  source_year smallint,
  import_status text not null default 'draft',
  parser_version text not null default '1.0.0',
  raw_metadata_json jsonb not null default '{}'::jsonb,
  notes text,
  -- Optional link to guided JetBlue session when schedule_imports exists (no FK: remote DBs may not have that table yet).
  legacy_schedule_import_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_import_jobs_status_check check (
    import_status in ('draft', 'queued', 'processing', 'parsed', 'normalized', 'failed', 'cancelled')
  )
);

create index if not exists idx_schedule_import_jobs_user on public.schedule_import_jobs (user_id, created_at desc);
create index if not exists idx_schedule_import_jobs_status on public.schedule_import_jobs (import_status);

-- ---------------------------------------------------------------------------
-- 2) schedule_import_assets
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_import_assets (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.schedule_import_jobs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  original_file_path text not null,
  processed_file_path text,
  sort_order smallint not null default 0,
  width integer,
  height integer,
  source_device_type text,
  content_hash text,
  created_at timestamptz not null default now()
);

create index if not exists idx_schedule_import_assets_job on public.schedule_import_assets (import_job_id, sort_order);
create index if not exists idx_schedule_import_assets_user on public.schedule_import_assets (user_id);

-- ---------------------------------------------------------------------------
-- 3) raw_schedule_extractions
-- ---------------------------------------------------------------------------
create table if not exists public.raw_schedule_extractions (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.schedule_import_jobs (id) on delete cascade,
  asset_id uuid references public.schedule_import_assets (id) on delete cascade,
  extraction_engine text not null default 'ocr',
  raw_text text,
  structured_blocks_json jsonb not null default '[]'::jsonb,
  confidence_overall numeric,
  created_at timestamptz not null default now()
);

create index if not exists idx_raw_schedule_extractions_job on public.raw_schedule_extractions (import_job_id);
create index if not exists idx_raw_schedule_extractions_asset on public.raw_schedule_extractions (asset_id);

-- ---------------------------------------------------------------------------
-- 4) normalized_schedule_months
-- ---------------------------------------------------------------------------
create table if not exists public.normalized_schedule_months (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.schedule_import_jobs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  airline_code text not null default 'JBU',
  crew_member_name text,
  employee_id text,
  schedule_month_label text,
  schedule_month_number smallint,
  schedule_year smallint,
  last_updated_at_source timestamptz,
  source_type text not null default 'jetblue_flica_monthly_screenshot',
  source_confidence numeric,
  raw_snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_normalized_schedule_months_job on public.normalized_schedule_months (import_job_id);
create index if not exists idx_normalized_schedule_months_user on public.normalized_schedule_months (user_id, schedule_year, schedule_month_number);

-- ---------------------------------------------------------------------------
-- 5) normalized_monthly_totals
-- ---------------------------------------------------------------------------
create table if not exists public.normalized_monthly_totals (
  id uuid primary key default gen_random_uuid(),
  schedule_month_id uuid not null references public.normalized_schedule_months (id) on delete cascade,
  monthly_block_minutes integer,
  monthly_credit_minutes integer,
  monthly_ytd_minutes integer,
  monthly_days_off integer,
  raw_totals_json jsonb not null default '{}'::jsonb,
  confidence_score numeric,
  created_at timestamptz not null default now()
);

create index if not exists idx_normalized_monthly_totals_month on public.normalized_monthly_totals (schedule_month_id);

-- ---------------------------------------------------------------------------
-- 6) normalized_pairings
-- ---------------------------------------------------------------------------
create table if not exists public.normalized_pairings (
  id uuid primary key default gen_random_uuid(),
  schedule_month_id uuid not null references public.normalized_schedule_months (id) on delete cascade,
  pairing_code text,
  pairing_start_date date,
  pairing_end_date date,
  base_code text,
  base_report_time_local text,
  operate_window_text text,
  operate_start_date date,
  operate_end_date date,
  operate_pattern_text text,
  equipment_summary text,
  pairing_total_block_minutes integer,
  pairing_total_deadhead_minutes integer,
  pairing_total_credit_minutes integer,
  pairing_total_duty_minutes integer,
  tafb_minutes integer,
  trip_rig_minutes integer,
  deadhead_summary_minutes integer,
  crew_list_raw_json jsonb,
  confidence_score numeric,
  raw_pairing_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_normalized_pairings_month on public.normalized_pairings (schedule_month_id);
create index if not exists idx_normalized_pairings_code on public.normalized_pairings (pairing_code);
create index if not exists idx_normalized_pairings_start on public.normalized_pairings (pairing_start_date);

-- ---------------------------------------------------------------------------
-- 7) normalized_duty_days
-- ---------------------------------------------------------------------------
create table if not exists public.normalized_duty_days (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null references public.normalized_pairings (id) on delete cascade,
  duty_date date,
  duty_day_of_week text,
  sequence_index smallint not null default 0,
  duty_end_time_local text,
  next_report_time_local text,
  overnight_station text,
  layover_hotel_name text,
  release_context_text text,
  notes text,
  confidence_score numeric,
  raw_duty_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_normalized_duty_days_pairing on public.normalized_duty_days (pairing_id, sequence_index);
create index if not exists idx_normalized_duty_days_date on public.normalized_duty_days (duty_date);

-- ---------------------------------------------------------------------------
-- 8) normalized_segments
-- ---------------------------------------------------------------------------
create table if not exists public.normalized_segments (
  id uuid primary key default gen_random_uuid(),
  duty_day_id uuid not null references public.normalized_duty_days (id) on delete cascade,
  sequence_index smallint not null default 0,
  segment_type text not null,
  flight_number text,
  departure_station text,
  arrival_station text,
  departure_time_local text,
  arrival_time_local text,
  block_minutes integer,
  equipment_code text,
  layover_station_after_segment text,
  is_deadhead boolean not null default false,
  confidence_score numeric,
  raw_segment_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint normalized_segments_type_check check (
    segment_type in ('operating_flight', 'deadhead', 'transport', 'marker')
  )
);

create index if not exists idx_normalized_segments_duty on public.normalized_segments (duty_day_id, sequence_index);
create index if not exists idx_normalized_segments_dep on public.normalized_segments (departure_station);
create index if not exists idx_normalized_segments_arr on public.normalized_segments (arrival_station);

-- ---------------------------------------------------------------------------
-- 9) normalized_layovers
-- ---------------------------------------------------------------------------
create table if not exists public.normalized_layovers (
  id uuid primary key default gen_random_uuid(),
  duty_day_id uuid not null references public.normalized_duty_days (id) on delete cascade,
  station_code text,
  hotel_name text,
  arrival_context_time_local text,
  release_time_local text,
  next_report_time_local text,
  notes text,
  confidence_score numeric,
  raw_layover_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_normalized_layovers_duty on public.normalized_layovers (duty_day_id);

-- ---------------------------------------------------------------------------
-- 10) schedule_parser_issues
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_parser_issues (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.schedule_import_jobs (id) on delete cascade,
  asset_id uuid references public.schedule_import_assets (id) on delete set null,
  entity_type text,
  entity_id uuid,
  severity text not null default 'warning',
  issue_code text not null,
  issue_message text,
  raw_context jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_schedule_parser_issues_job on public.schedule_parser_issues (import_job_id);
create index if not exists idx_schedule_parser_issues_code on public.schedule_parser_issues (issue_code);

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuse global schedule trigger function)
-- ---------------------------------------------------------------------------
drop trigger if exists trg_schedule_import_jobs_updated_at on public.schedule_import_jobs;
create trigger trg_schedule_import_jobs_updated_at
  before update on public.schedule_import_jobs
  for each row execute function public.set_updated_at_schedule_tables();

drop trigger if exists trg_normalized_schedule_months_updated_at on public.normalized_schedule_months;
create trigger trg_normalized_schedule_months_updated_at
  before update on public.normalized_schedule_months
  for each row execute function public.set_updated_at_schedule_tables();

drop trigger if exists trg_normalized_pairings_updated_at on public.normalized_pairings;
create trigger trg_normalized_pairings_updated_at
  before update on public.normalized_pairings
  for each row execute function public.set_updated_at_schedule_tables();

drop trigger if exists trg_normalized_duty_days_updated_at on public.normalized_duty_days;
create trigger trg_normalized_duty_days_updated_at
  before update on public.normalized_duty_days
  for each row execute function public.set_updated_at_schedule_tables();

drop trigger if exists trg_normalized_segments_updated_at on public.normalized_segments;
create trigger trg_normalized_segments_updated_at
  before update on public.normalized_segments
  for each row execute function public.set_updated_at_schedule_tables();

drop trigger if exists trg_normalized_layovers_updated_at on public.normalized_layovers;
create trigger trg_normalized_layovers_updated_at
  before update on public.normalized_layovers
  for each row execute function public.set_updated_at_schedule_tables();

-- ---------------------------------------------------------------------------
-- Views (read-friendly; RLS applies to base tables)
-- ---------------------------------------------------------------------------
create or replace view public.view_schedule_month_summary
with (security_invoker = true) as
select
  m.id as schedule_month_id,
  m.user_id,
  m.import_job_id,
  m.crew_member_name,
  m.employee_id,
  m.schedule_month_label,
  m.schedule_year,
  m.schedule_month_number,
  m.source_confidence,
  t.monthly_block_minutes,
  t.monthly_credit_minutes,
  t.monthly_ytd_minutes,
  t.monthly_days_off,
  m.created_at
from public.normalized_schedule_months m
left join public.normalized_monthly_totals t on t.schedule_month_id = m.id;

create or replace view public.view_pairing_detail
with (security_invoker = true) as
select
  p.id as pairing_id,
  p.schedule_month_id,
  sm.user_id,
  p.pairing_code,
  p.pairing_start_date,
  p.pairing_end_date,
  p.base_code,
  p.base_report_time_local,
  p.operate_pattern_text,
  p.equipment_summary,
  p.tafb_minutes,
  p.pairing_total_block_minutes,
  p.pairing_total_credit_minutes,
  p.confidence_score
from public.normalized_pairings p
join public.normalized_schedule_months sm on sm.id = p.schedule_month_id;

create or replace view public.view_duty_day_segments
with (security_invoker = true) as
select
  d.id as duty_day_id,
  d.pairing_id,
  d.duty_date,
  d.duty_day_of_week,
  d.sequence_index as duty_sequence,
  s.id as segment_id,
  s.sequence_index as segment_sequence,
  s.segment_type,
  s.flight_number,
  s.departure_station,
  s.arrival_station,
  s.departure_time_local,
  s.arrival_time_local,
  s.block_minutes,
  s.is_deadhead,
  s.equipment_code
from public.normalized_duty_days d
left join public.normalized_segments s on s.duty_day_id = d.id;

create or replace view public.view_upcoming_segments
with (security_invoker = true) as
select
  s.id as segment_id,
  d.duty_date,
  d.pairing_id,
  p.pairing_code,
  sm.user_id,
  s.departure_station,
  s.arrival_station,
  s.departure_time_local,
  s.arrival_time_local,
  s.segment_type,
  s.is_deadhead
from public.normalized_segments s
join public.normalized_duty_days d on d.id = s.duty_day_id
join public.normalized_pairings p on p.id = d.pairing_id
join public.normalized_schedule_months sm on sm.id = p.schedule_month_id
where d.duty_date is not null and d.duty_date >= (current_date at time zone 'utc')::date;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.schedule_import_jobs enable row level security;
alter table public.schedule_import_assets enable row level security;
alter table public.raw_schedule_extractions enable row level security;
alter table public.normalized_schedule_months enable row level security;
alter table public.normalized_monthly_totals enable row level security;
alter table public.normalized_pairings enable row level security;
alter table public.normalized_duty_days enable row level security;
alter table public.normalized_segments enable row level security;
alter table public.normalized_layovers enable row level security;
alter table public.schedule_parser_issues enable row level security;

-- schedule_import_jobs
drop policy if exists "schedule_import_jobs_own" on public.schedule_import_jobs;
create policy "schedule_import_jobs_own"
  on public.schedule_import_jobs for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- schedule_import_assets
drop policy if exists "schedule_import_assets_own" on public.schedule_import_assets;
create policy "schedule_import_assets_own"
  on public.schedule_import_assets for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- raw_schedule_extractions
drop policy if exists "raw_schedule_extractions_own" on public.raw_schedule_extractions;
create policy "raw_schedule_extractions_own"
  on public.raw_schedule_extractions for all to authenticated
  using (
    exists (select 1 from public.schedule_import_jobs j where j.id = import_job_id and j.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.schedule_import_jobs j where j.id = import_job_id and j.user_id = auth.uid())
  );

-- normalized_schedule_months
drop policy if exists "normalized_schedule_months_own" on public.normalized_schedule_months;
create policy "normalized_schedule_months_own"
  on public.normalized_schedule_months for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- normalized_monthly_totals
drop policy if exists "normalized_monthly_totals_own" on public.normalized_monthly_totals;
create policy "normalized_monthly_totals_own"
  on public.normalized_monthly_totals for all to authenticated
  using (
    exists (select 1 from public.normalized_schedule_months m where m.id = schedule_month_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.normalized_schedule_months m where m.id = schedule_month_id and m.user_id = auth.uid())
  );

-- normalized_pairings
drop policy if exists "normalized_pairings_own" on public.normalized_pairings;
create policy "normalized_pairings_own"
  on public.normalized_pairings for all to authenticated
  using (
    exists (select 1 from public.normalized_schedule_months m where m.id = schedule_month_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.normalized_schedule_months m where m.id = schedule_month_id and m.user_id = auth.uid())
  );

-- normalized_duty_days
drop policy if exists "normalized_duty_days_own" on public.normalized_duty_days;
create policy "normalized_duty_days_own"
  on public.normalized_duty_days for all to authenticated
  using (
    exists (
      select 1 from public.normalized_pairings p
      join public.normalized_schedule_months m on m.id = p.schedule_month_id
      where p.id = pairing_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.normalized_pairings p
      join public.normalized_schedule_months m on m.id = p.schedule_month_id
      where p.id = pairing_id and m.user_id = auth.uid()
    )
  );

-- normalized_segments
drop policy if exists "normalized_segments_own" on public.normalized_segments;
create policy "normalized_segments_own"
  on public.normalized_segments for all to authenticated
  using (
    exists (
      select 1 from public.normalized_duty_days d
      join public.normalized_pairings p on p.id = d.pairing_id
      join public.normalized_schedule_months m on m.id = p.schedule_month_id
      where d.id = duty_day_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.normalized_duty_days d
      join public.normalized_pairings p on p.id = d.pairing_id
      join public.normalized_schedule_months m on m.id = p.schedule_month_id
      where d.id = duty_day_id and m.user_id = auth.uid()
    )
  );

-- normalized_layovers
drop policy if exists "normalized_layovers_own" on public.normalized_layovers;
create policy "normalized_layovers_own"
  on public.normalized_layovers for all to authenticated
  using (
    exists (
      select 1 from public.normalized_duty_days d
      join public.normalized_pairings p on p.id = d.pairing_id
      join public.normalized_schedule_months m on m.id = p.schedule_month_id
      where d.id = duty_day_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.normalized_duty_days d
      join public.normalized_pairings p on p.id = d.pairing_id
      join public.normalized_schedule_months m on m.id = p.schedule_month_id
      where d.id = duty_day_id and m.user_id = auth.uid()
    )
  );

-- schedule_parser_issues
drop policy if exists "schedule_parser_issues_own" on public.schedule_parser_issues;
create policy "schedule_parser_issues_own"
  on public.schedule_parser_issues for all to authenticated
  using (
    exists (select 1 from public.schedule_import_jobs j where j.id = import_job_id and j.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.schedule_import_jobs j where j.id = import_job_id and j.user_id = auth.uid())
  );

grant select on public.view_schedule_month_summary to authenticated;
grant select on public.view_pairing_detail to authenticated;
grant select on public.view_duty_day_segments to authenticated;
grant select on public.view_upcoming_segments to authenticated;
