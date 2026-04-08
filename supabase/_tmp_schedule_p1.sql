-- Crew Schedule: live entries, import batches/candidates, storage, RLS, apply RPCs

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_group_id uuid not null,
  month_key text not null,
  date date not null,
  day_of_week text,
  pairing_code text,
  report_time text,
  city text,
  d_end_time text,
  layover text,
  wx text,
  status_code text,
  notes text,
  source_type text,
  source_batch_id uuid,
  is_user_confirmed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_schedule_entries_user_month on public.schedule_entries (user_id, month_key);
create index if not exists idx_schedule_entries_user_date on public.schedule_entries (user_id, date);
create index if not exists idx_schedule_entries_source_batch on public.schedule_entries (source_batch_id);
create index if not exists idx_schedule_entries_trip_group on public.schedule_entries (trip_group_id);

create table if not exists public.schedule_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month_key text,
  source_type text,
  source_file_path text,
  source_file_url text,
  raw_extracted_text text,
  parse_status text not null default 'uploaded',
  row_count integer not null default 0,
  warning_count integer not null default 0,
  parse_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_schedule_import_batches_user on public.schedule_import_batches (user_id);
create index if not exists idx_schedule_import_batches_status on public.schedule_import_batches (parse_status);
create index if not exists idx_schedule_import_batches_created on public.schedule_import_batches (created_at desc);

create table if not exists public.schedule_import_candidates (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.schedule_import_batches (id) on delete cascade,
  date date,
  day_of_week text,
  pairing_code text,
  report_time text,
  city text,
  d_end_time text,
  layover text,
  wx text,
  status_code text,
  notes text,
  confidence_score numeric,
  warning_flag boolean not null default false,
  raw_row_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_schedule_import_candidates_batch on public.schedule_import_candidates (batch_id);
create index if not exists idx_schedule_import_candidates_date on public.schedule_import_candidates (date);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at_schedule_tables()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_schedule_entries_updated_at on public.schedule_entries;
create trigger trg_schedule_entries_updated_at
  before update on public.schedule_entries
  for each row execute function public.set_updated_at_schedule_tables();

drop trigger if exists trg_schedule_import_batches_updated_at on public.schedule_import_batches;
create trigger trg_schedule_import_batches_updated_at
  before update on public.schedule_import_batches
  for each row execute function public.set_updated_at_schedule_tables();

drop trigger if exists trg_schedule_import_candidates_updated_at on public.schedule_import_candidates;
create trigger trg_schedule_import_candidates_updated_at
  before update on public.schedule_import_candidates
  for each row execute function public.set_updated_at_schedule_tables();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.schedule_entries enable row level security;
alter table public.schedule_import_batches enable row level security;
alter table public.schedule_import_candidates enable row level security;

drop policy if exists "schedule_entries_select_own" on public.schedule_entries;
create policy "schedule_entries_select_own" on public.schedule_entries
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "schedule_entries_insert_own" on public.schedule_entries;
create policy "schedule_entries_insert_own" on public.schedule_entries
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "schedule_entries_update_own" on public.schedule_entries;
create policy "schedule_entries_update_own" on public.schedule_entries
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "schedule_entries_delete_own" on public.schedule_entries;
create policy "schedule_entries_delete_own" on public.schedule_entries
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "schedule_import_batches_select_own" on public.schedule_import_batches;
create policy "schedule_import_batches_select_own" on public.schedule_import_batches
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "schedule_import_batches_insert_own" on public.schedule_import_batches;
create policy "schedule_import_batches_insert_own" on public.schedule_import_batches
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "schedule_import_batches_update_own" on public.schedule_import_batches;
create policy "schedule_import_batches_update_own" on public.schedule_import_batches
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "schedule_import_batches_delete_own" on public.schedule_import_batches;
create policy "schedule_import_batches_delete_own" on public.schedule_import_batches
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "schedule_import_candidates_select_own" on public.schedule_import_candidates;
create policy "schedule_import_candidates_select_own" on public.schedule_import_candidates
  for select to authenticated using (
    exists (
      select 1 from public.schedule_import_batches b
      where b.id = schedule_import_candidates.batch_id and b.user_id = auth.uid()
    )
  );

drop policy if exists "schedule_import_candidates_insert_own" on public.schedule_import_candidates;
create policy "schedule_import_candidates_insert_own" on public.schedule_import_candidates
  for insert to authenticated with check (
    exists (
      select 1 from public.schedule_import_batches b
      where b.id = schedule_import_candidates.batch_id and b.user_id = auth.uid()
    )
  );

drop policy if exists "schedule_import_candidates_update_own" on public.schedule_import_candidates;
create policy "schedule_import_candidates_update_own" on public.schedule_import_candidates
  for update to authenticated using (
    exists (
      select 1 from public.schedule_import_batches b
      where b.id = schedule_import_candidates.batch_id and b.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.schedule_import_batches b
      where b.id = schedule_import_candidates.batch_id and b.user_id = auth.uid()
    )
  );

drop policy if exists "schedule_import_candidates_delete_own" on public.schedule_import_candidates;
create policy "schedule_import_candidates_delete_own" on public.schedule_import_candidates
  for delete to authenticated using (
    exists (
      select 1 from public.schedule_import_batches b
      where b.id = schedule_import_candidates.batch_id and b.user_id = auth.uid()
    )
  );
