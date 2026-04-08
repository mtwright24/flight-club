-- Schedule Intelligence Platform: master data, templates, profiles, extensions, seeds
-- Extends 20260404150000_crew_schedule_import.sql — does not duplicate core tables.

-- ---------------------------------------------------------------------------
-- 1–4: Reference dimensions
-- ---------------------------------------------------------------------------

create table if not exists public.airlines (
  id uuid primary key default gen_random_uuid(),
  airline_name text not null,
  airline_code text,
  country text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  role_name text not null,
  role_code text,
  category text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule_softwares (
  id uuid primary key default gen_random_uuid(),
  software_name text not null,
  software_code text,
  vendor_name text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule_view_types (
  id uuid primary key default gen_random_uuid(),
  view_name text not null,
  view_code text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_schedule_view_types_code on public.schedule_view_types (view_code);

-- ---------------------------------------------------------------------------
-- 5: Templates (parser routing)
-- ---------------------------------------------------------------------------

create table if not exists public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  airline_id uuid references public.airlines (id) on delete set null,
  role_id uuid references public.roles (id) on delete set null,
  software_id uuid references public.schedule_softwares (id) on delete set null,
  view_type_id uuid not null references public.schedule_view_types (id) on delete restrict,
  template_name text not null,
  parser_key text not null,
  version integer not null default 1,
  active boolean not null default true,
  confidence_threshold numeric not null default 0.7,
  expected_columns_json jsonb,
  known_header_patterns_json jsonb,
  known_footer_patterns_json jsonb,
  known_noise_patterns_json jsonb,
  known_row_patterns_json jsonb,
  known_color_hints_json jsonb,
  examples_json jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_schedule_templates_parser_key on public.schedule_templates (parser_key);
create index if not exists idx_schedule_templates_airline_soft on public.schedule_templates (airline_id, software_id, view_type_id);

-- ---------------------------------------------------------------------------
-- 6: Code dictionary
-- ---------------------------------------------------------------------------

create table if not exists public.schedule_code_dictionary (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  meaning text not null,
  category text,
  airline_id uuid references public.airlines (id) on delete set null,
  role_id uuid references public.roles (id) on delete set null,
  software_id uuid references public.schedule_softwares (id) on delete set null,
  priority integer not null default 100,
  active boolean not null default true,
  examples_json jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_schedule_code_lookup on public.schedule_code_dictionary (code, lower(code) text_pattern_ops);

-- ---------------------------------------------------------------------------
-- 7: User memory
-- ---------------------------------------------------------------------------

create table if not exists public.user_schedule_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  airline_id uuid references public.airlines (id) on delete set null,
  role_id uuid references public.roles (id) on delete set null,
  base_airport text,
  software_id uuid references public.schedule_softwares (id) on delete set null,
  default_view_type_id uuid references public.schedule_view_types (id) on delete set null,
  preferred_template_id uuid references public.schedule_templates (id) on delete set null,
  preferred_import_source text,
  last_successful_template_id uuid references public.schedule_templates (id) on delete set null,
  last_successful_month_key text,
  parser_preference_json jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_user_schedule_profiles_user on public.user_schedule_profiles (user_id);

-- ---------------------------------------------------------------------------
-- 8–10: Extend existing import tables
-- ---------------------------------------------------------------------------

alter table public.schedule_import_batches
  add column if not exists airline_guess_id uuid references public.airlines (id) on delete set null,
  add column if not exists role_guess_id uuid references public.roles (id) on delete set null,
  add column if not exists software_guess_id uuid references public.schedule_softwares (id) on delete set null,
  add column if not exists view_guess_id uuid references public.schedule_view_types (id) on delete set null,
  add column if not exists selected_month_key text,
  add column if not exists detected_month_key text,
  add column if not exists classification_json jsonb,
  add column if not exists classification_confidence numeric,
  add column if not exists applied_template_id uuid references public.schedule_templates (id) on delete set null,
  add column if not exists raw_layout_json jsonb,
  add column if not exists classification_notes text,
  add column if not exists merge_conflict_json jsonb;

-- Backfill selected_month_key from legacy month_key
update public.schedule_import_batches
set selected_month_key = coalesce(selected_month_key, month_key)
where selected_month_key is null;

alter table public.schedule_import_candidates
  add column if not exists month_key text,
  add column if not exists sequence_index integer,
  add column if not exists trip_group_id text,
  add column if not exists continuation_flag boolean not null default false,
  add column if not exists warning_reason text,
  add column if not exists ignored_flag boolean not null default false,
  add column if not exists ignored_reason text,
  add column if not exists edited_by_user boolean not null default false;

alter table public.schedule_entries
  add column if not exists sequence_index integer,
  add column if not exists continuation_flag boolean not null default false,
  add column if not exists manually_added_flag boolean not null default false,
  add column if not exists edited_after_import boolean not null default false,
  add column if not exists trade_adjusted_flag boolean not null default false;

-- ---------------------------------------------------------------------------
-- 11: Corrections (learning)
-- ---------------------------------------------------------------------------

create table if not exists public.schedule_import_corrections (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.schedule_import_batches (id) on delete cascade,
  candidate_id uuid references public.schedule_import_candidates (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid references public.schedule_templates (id) on delete set null,
  field_name text not null,
  old_value text,
  new_value text,
  correction_type text,
  created_at timestamptz not null default now()
);

create index if not exists idx_schedule_import_corrections_batch on public.schedule_import_corrections (batch_id);

-- ---------------------------------------------------------------------------
-- 12: Parser QA (service-role only)
-- ---------------------------------------------------------------------------

create table if not exists public.schedule_parser_test_cases (
  id uuid primary key default gen_random_uuid(),
  airline_id uuid references public.airlines (id) on delete set null,
  role_id uuid references public.roles (id) on delete set null,
  software_id uuid references public.schedule_softwares (id) on delete set null,
  view_type_id uuid references public.schedule_view_types (id) on delete set null,
  file_path text,
  expected_output_json jsonb,
  actual_output_json jsonb,
  parser_version integer,
  pass_fail boolean,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Triggers on new tables
-- ---------------------------------------------------------------------------

drop trigger if exists trg_airlines_updated_at on public.airlines;
create trigger trg_airlines_updated_at
  before update on public.airlines
  for each row execute function public.set_updated_at_schedule_tables();

drop trigger if exists trg_roles_updated_at on public.roles;
create trigger trg_roles_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at_schedule_tables();

drop trigger if exists trg_schedule_softwares_updated_at on public.schedule_softwares;
create trigger trg_schedule_softwares_updated_at
  before update on public.schedule_softwares
  for each row execute function public.set_updated_at_schedule_tables();

drop trigger if exists trg_schedule_view_types_updated_at on public.schedule_view_types;
create trigger trg_schedule_view_types_updated_at
  before update on public.schedule_view_types
  for each row execute function public.set_updated_at_schedule_tables();

drop trigger if exists trg_schedule_templates_updated_at on public.schedule_templates;
create trigger trg_schedule_templates_updated_at
  before update on public.schedule_templates
  for each row execute function public.set_updated_at_schedule_tables();

drop trigger if exists trg_schedule_code_dictionary_updated_at on public.schedule_code_dictionary;
create trigger trg_schedule_code_dictionary_updated_at
  before update on public.schedule_code_dictionary
  for each row execute function public.set_updated_at_schedule_tables();

drop trigger if exists trg_user_schedule_profiles_updated_at on public.user_schedule_profiles;
create trigger trg_user_schedule_profiles_updated_at
  before update on public.user_schedule_profiles
  for each row execute function public.set_updated_at_schedule_tables();

drop trigger if exists trg_schedule_parser_test_cases_updated_at on public.schedule_parser_test_cases;
create trigger trg_schedule_parser_test_cases_updated_at
  before update on public.schedule_parser_test_cases
  for each row execute function public.set_updated_at_schedule_tables();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.airlines enable row level security;
alter table public.roles enable row level security;
alter table public.schedule_softwares enable row level security;
alter table public.schedule_view_types enable row level security;
alter table public.schedule_templates enable row level security;
alter table public.schedule_code_dictionary enable row level security;
alter table public.user_schedule_profiles enable row level security;
alter table public.schedule_import_corrections enable row level security;
alter table public.schedule_parser_test_cases enable row level security;

drop policy if exists "airlines_select_auth" on public.airlines;
create policy "airlines_select_auth" on public.airlines
  for select to authenticated using (active = true or true);

drop policy if exists "roles_select_auth" on public.roles;
create policy "roles_select_auth" on public.roles
  for select to authenticated using (true);

drop policy if exists "schedule_softwares_select_auth" on public.schedule_softwares;
create policy "schedule_softwares_select_auth" on public.schedule_softwares
  for select to authenticated using (true);

drop policy if exists "schedule_view_types_select_auth" on public.schedule_view_types;
create policy "schedule_view_types_select_auth" on public.schedule_view_types
  for select to authenticated using (true);

drop policy if exists "schedule_templates_select_auth" on public.schedule_templates;
create policy "schedule_templates_select_auth" on public.schedule_templates
  for select to authenticated using (active = true or true);

drop policy if exists "schedule_code_dictionary_select_auth" on public.schedule_code_dictionary;
create policy "schedule_code_dictionary_select_auth" on public.schedule_code_dictionary
  for select to authenticated using (active = true or true);

drop policy if exists "user_schedule_profiles_select_own" on public.user_schedule_profiles;
create policy "user_schedule_profiles_select_own" on public.user_schedule_profiles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "user_schedule_profiles_insert_own" on public.user_schedule_profiles;
create policy "user_schedule_profiles_insert_own" on public.user_schedule_profiles
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "user_schedule_profiles_update_own" on public.user_schedule_profiles;
create policy "user_schedule_profiles_update_own" on public.user_schedule_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "user_schedule_profiles_delete_own" on public.user_schedule_profiles;
create policy "user_schedule_profiles_delete_own" on public.user_schedule_profiles
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "schedule_import_corrections_select_own" on public.schedule_import_corrections;
create policy "schedule_import_corrections_select_own" on public.schedule_import_corrections
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "schedule_import_corrections_insert_own" on public.schedule_import_corrections;
create policy "schedule_import_corrections_insert_own" on public.schedule_import_corrections
  for insert to authenticated with check (user_id = auth.uid());

-- no policies on schedule_parser_test_cases (deny all via anon/authenticated)

-- ---------------------------------------------------------------------------
-- Seed data (launch scaffolding)
-- ---------------------------------------------------------------------------

insert into public.airlines (id, airline_name, airline_code, country, active)
values
  ('00000000-0000-4000-8000-000000000001', 'JetBlue Airways', 'B6', 'US', true),
  ('00000000-0000-4000-8000-000000000002', 'Generic / Unknown', null, null, true)
on conflict (id) do nothing;

insert into public.roles (id, role_name, role_code, category, active)
values
  ('00000000-0000-4000-8000-000000000101', 'Flight Attendant', 'FA', 'inflight', true),
  ('00000000-0000-4000-8000-000000000102', 'Pilot', 'PLT', 'flight_deck', true)
on conflict (id) do nothing;

insert into public.schedule_softwares (id, software_name, software_code, vendor_name, active)
values
  ('00000000-0000-4000-8000-000000000201', 'FLICA', 'FLICA', 'FLICA', true),
  ('00000000-0000-4000-8000-000000000202', 'Crewline', 'CREWLINE', 'Crewline', true),
  ('00000000-0000-4000-8000-000000000203', 'Flight Crew View', 'FCV', 'FCV', true),
  ('00000000-0000-4000-8000-000000000204', 'Airline portal', 'PORTAL', 'Various', true),

  ('00000000-0000-4000-8000-000000000299', 'Unknown / Generic', 'GENERIC', null, true)
on conflict (id) do nothing;

insert into public.schedule_view_types (id, view_name, view_code, description, active)
values
  ('00000000-0000-4000-8000-000000000301', 'Monthly table', 'monthly_table', 'Grid of days / trips by month', true),
  ('00000000-0000-4000-8000-000000000302', 'Classic list', 'classic_list', 'Vertical list of duties', true),
  ('00000000-0000-4000-8000-000000000303', 'Calendar grid', 'calendar_grid', 'Calendar cells', true),
  ('00000000-0000-4000-8000-000000000304', 'Smart list', 'smart_list', 'Grouped smart list', true),
  ('00000000-0000-4000-8000-000000000305', 'PDF report', 'pdf_report', 'Exported PDF or print report', true),
  ('00000000-0000-4000-8000-000000000306', 'Trip detail', 'trip_detail', 'Single trip detail', true),
  ('00000000-0000-4000-8000-000000000399', 'Generic fallback', 'generic_fallback', 'Unknown layout', true)
on conflict (id) do nothing;

-- Templates: fixed parser_key values consumed by Edge router
insert into public.schedule_templates (
  id, airline_id, role_id, software_id, view_type_id, template_name, parser_key, version, active, confidence_threshold, notes
)
values
  (
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000301',
    'JetBlue FLICA monthly (FA)',
    'flica_jetblue_fa_monthly_v1',
    1,
    true,
    0.75,
    'Heuristic FLICA monthly screenshot — preprocess + generic row classifier'
  ),
  (
    '00000000-0000-4000-8000-000000000499',
    null,
    null,
    '00000000-0000-4000-8000-000000000299',
    '00000000-0000-4000-8000-000000000399',
    'Generic fallback',
    'generic_fallback_v1',
    1,
    true,
    0.5,
    'Line-by-line generic parser'
  )
on conflict (id) do nothing;

-- Code dictionary (idempotent — no unique on code; skip if global row exists)
insert into public.schedule_code_dictionary (code, meaning, category, airline_id, priority, active)
select v.code, v.meaning, v.category, null::uuid, v.priority, true
from (
  values
    ('OFF', 'Day off', 'duty', 10),
    ('PTO', 'Paid time off', 'duty', 10),
    ('RSV', 'Reserve', 'duty', 10),
    ('DH', 'Deadhead', 'duty', 10),
    ('CONT', 'Continuation', 'trip', 10),
    ('UNA', 'Unavailable / unassigned', 'duty', 50),
    ('LSB', 'Line sequence (down)', 'trip', 50),
    ('TAL', 'Trip assignment line', 'trip', 50),
    ('BRV', 'Briefing / reserve variant', 'duty', 50)
) as v(code, meaning, category, priority)
where not exists (
  select 1 from public.schedule_code_dictionary d
  where d.code = v.code and d.airline_id is null
);
