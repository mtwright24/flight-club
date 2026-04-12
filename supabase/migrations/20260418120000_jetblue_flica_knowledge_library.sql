-- JetBlue Flight Attendant FLICA — knowledge templates, field/enum dictionaries, pairings/legs, month metrics extension.
-- Contract references: JetBlue Inflight Crewmember (IFC) collective bargaining agreement (exact article/section to align with uploaded CBA PDF).

-- ---------------------------------------------------------------------------
-- 1) schedule_import_knowledge_templates
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_import_knowledge_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  airline_code text not null,
  crew_role text not null,
  schedule_system text not null,
  view_type text not null,
  version text not null default '1',
  active boolean not null default true,
  notes_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_import_knowledge_templates_key unique (template_key)
);

create index if not exists idx_schedule_import_knowledge_templates_airline
  on public.schedule_import_knowledge_templates (airline_code, active);

-- ---------------------------------------------------------------------------
-- 2) schedule_field_dictionary
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_field_dictionary (
  id uuid primary key default gen_random_uuid(),
  template_key text not null references public.schedule_import_knowledge_templates (template_key) on delete cascade,
  field_name text not null,
  display_name text not null,
  entity_level text not null,
  definition text not null,
  source_article text,
  source_section text,
  source_page_hint text,
  parse_strategy text,
  value_type text not null default 'string',
  raw_storage_required boolean not null default false,
  normalized_storage_required boolean not null default false,
  calculation_rule text,
  confidence_rule text,
  validation_rule text,
  example_value text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_field_dictionary_unique unique (template_key, field_name)
);

create index if not exists idx_schedule_field_dictionary_template
  on public.schedule_field_dictionary (template_key, entity_level);

-- ---------------------------------------------------------------------------
-- 3) schedule_import_enum_dictionary
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_import_enum_dictionary (
  id uuid primary key default gen_random_uuid(),
  template_key text not null references public.schedule_import_knowledge_templates (template_key) on delete cascade,
  enum_group text not null,
  enum_key text not null,
  enum_label text not null,
  definition text,
  source_article text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_import_enum_dictionary_unique unique (template_key, enum_group, enum_key)
);

create index if not exists idx_schedule_import_enum_dictionary_lookup
  on public.schedule_import_enum_dictionary (template_key, enum_group);

-- ---------------------------------------------------------------------------
-- 4) schedule_pairings (pairing-aware import; screenshot + OCR)
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_pairings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  import_id uuid references public.schedule_import_batches (id) on delete cascade,
  pairing_id text not null,
  pairing_start_date date,
  pairing_end_date date,
  pairing_report_time text,
  pairing_release_time text,
  pairing_base text,
  pairing_cobase text,
  pairing_footprint_start timestamptz,
  pairing_footprint_end timestamptz,
  osp_flag boolean,
  osp_footprint_start timestamptz,
  osp_footprint_end timestamptz,
  pairing_total_block numeric,
  pairing_total_credit numeric,
  pairing_total_tafb numeric,
  pairing_total_deadhead numeric,
  pairing_total_duty numeric,
  pairing_total_segments integer,
  pairing_total_duty_periods integer,
  pairing_rig_credit_tafb numeric,
  pairing_rig_credit_mdpc numeric,
  pairing_rig_credit_duty numeric,
  pairing_final_credit numeric,
  pairing_requires_review boolean not null default false,
  raw_text text,
  normalized_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_pairings_import_pairing unique (user_id, import_id, pairing_id)
);

create index if not exists idx_schedule_pairings_user_import
  on public.schedule_pairings (user_id, import_id);

-- ---------------------------------------------------------------------------
-- 5) schedule_pairing_legs
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_pairing_legs (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null references public.schedule_pairings (id) on delete cascade,
  duty_date date,
  calendar_day smallint,
  report_time text,
  release_time text,
  duty_period_minutes integer,
  flight_number text,
  segment_type text,
  departure_station text,
  arrival_station text,
  scheduled_departure_local text,
  scheduled_arrival_local text,
  actual_departure_local text,
  actual_arrival_local text,
  block_time numeric,
  credit_time numeric,
  deadhead_time numeric,
  layover_start timestamptz,
  layover_end timestamptz,
  layover_minutes integer,
  layover_city text,
  hotel_name text,
  hotel_phone text,
  aircraft_position_code text,
  red_eye_flag boolean,
  transatlantic_flag boolean,
  customs_connect_flag boolean,
  requires_review boolean not null default false,
  raw_text text,
  normalized_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_schedule_pairing_legs_pairing_date
  on public.schedule_pairing_legs (pairing_id, duty_date);

-- ---------------------------------------------------------------------------
-- 6) Extend schedule_month_metrics (screenshot header + import linkage)
-- ---------------------------------------------------------------------------
alter table public.schedule_month_metrics
  add column if not exists id uuid default gen_random_uuid();

update public.schedule_month_metrics set id = gen_random_uuid() where id is null;

do $$
begin
  alter table public.schedule_month_metrics alter column id set not null;
exception
  when others then null;
end $$;

alter table public.schedule_month_metrics
  add column if not exists import_id uuid references public.schedule_import_batches (id) on delete set null;

alter table public.schedule_month_metrics
  add column if not exists source_image_id text;

alter table public.schedule_month_metrics
  add column if not exists confidence numeric;

alter table public.schedule_month_metrics
  add column if not exists year smallint;

alter table public.schedule_month_metrics
  add column if not exists month smallint;

alter table public.schedule_month_metrics
  add column if not exists block_hours_month numeric;

alter table public.schedule_month_metrics
  add column if not exists credit_hours_month numeric;

alter table public.schedule_month_metrics
  add column if not exists tafb_hours_month numeric;

alter table public.schedule_month_metrics
  add column if not exists days_off_count integer;

alter table public.schedule_month_metrics
  add column if not exists created_at timestamptz not null default now();

-- Backfill new columns from legacy names
update public.schedule_month_metrics
set
  block_hours_month = coalesce(block_hours_month, block_hours),
  credit_hours_month = coalesce(credit_hours_month, credit_hours),
  tafb_hours_month = coalesce(tafb_hours_month, monthly_tafb_hours),
  days_off_count = coalesce(days_off_count, days_off),
  year = coalesce(year, nullif(split_part(month_key, '-', 1), '')::smallint),
  month = coalesce(month, nullif(split_part(month_key, '-', 2), '')::smallint)
where month_key is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'schedule_month_metrics' and c.conname = 'schedule_month_metrics_id_unique'
  ) then
    alter table public.schedule_month_metrics add constraint schedule_month_metrics_id_unique unique (id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.schedule_import_knowledge_templates enable row level security;
alter table public.schedule_field_dictionary enable row level security;
alter table public.schedule_import_enum_dictionary enable row level security;
alter table public.schedule_pairings enable row level security;
alter table public.schedule_pairing_legs enable row level security;

drop policy if exists "schedule_import_knowledge_templates_select_authenticated" on public.schedule_import_knowledge_templates;
create policy "schedule_import_knowledge_templates_select_authenticated"
  on public.schedule_import_knowledge_templates for select to authenticated using (true);

drop policy if exists "schedule_field_dictionary_select_authenticated" on public.schedule_field_dictionary;
create policy "schedule_field_dictionary_select_authenticated"
  on public.schedule_field_dictionary for select to authenticated using (true);

drop policy if exists "schedule_import_enum_dictionary_select_authenticated" on public.schedule_import_enum_dictionary;
create policy "schedule_import_enum_dictionary_select_authenticated"
  on public.schedule_import_enum_dictionary for select to authenticated using (true);

drop policy if exists "schedule_pairings_select_own" on public.schedule_pairings;
create policy "schedule_pairings_select_own"
  on public.schedule_pairings for select to authenticated using (user_id = auth.uid());

drop policy if exists "schedule_pairings_insert_own" on public.schedule_pairings;
create policy "schedule_pairings_insert_own"
  on public.schedule_pairings for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "schedule_pairings_update_own" on public.schedule_pairings;
create policy "schedule_pairings_update_own"
  on public.schedule_pairings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "schedule_pairings_delete_own" on public.schedule_pairings;
create policy "schedule_pairings_delete_own"
  on public.schedule_pairings for delete to authenticated using (user_id = auth.uid());

drop policy if exists "schedule_pairing_legs_select_own" on public.schedule_pairing_legs;
create policy "schedule_pairing_legs_select_own"
  on public.schedule_pairing_legs for select to authenticated
  using (
    exists (
      select 1 from public.schedule_pairings p
      where p.id = schedule_pairing_legs.pairing_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "schedule_pairing_legs_insert_own" on public.schedule_pairing_legs;
create policy "schedule_pairing_legs_insert_own"
  on public.schedule_pairing_legs for insert to authenticated
  with check (
    exists (
      select 1 from public.schedule_pairings p
      where p.id = schedule_pairing_legs.pairing_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "schedule_pairing_legs_update_own" on public.schedule_pairing_legs;
create policy "schedule_pairing_legs_update_own"
  on public.schedule_pairing_legs for update to authenticated
  using (
    exists (
      select 1 from public.schedule_pairings p
      where p.id = schedule_pairing_legs.pairing_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.schedule_pairings p
      where p.id = schedule_pairing_legs.pairing_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "schedule_pairing_legs_delete_own" on public.schedule_pairing_legs;
create policy "schedule_pairing_legs_delete_own"
  on public.schedule_pairing_legs for delete to authenticated
  using (
    exists (
      select 1 from public.schedule_pairings p
      where p.id = schedule_pairing_legs.pairing_id and p.user_id = auth.uid()
    )
  );

-- Service role / migration inserts for dictionaries (no insert policy for authenticated — seed via migration)
