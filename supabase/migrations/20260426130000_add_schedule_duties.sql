-- Normalized FLICA duty days (one row per user/import/pairing/duty_date). Pairing legs stay in schedule_pairing_legs.

create table if not exists public.schedule_duties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  import_id uuid not null,
  pairing_id text not null,
  duty_date date not null,
  report_time text,
  duty_off_time text,
  next_report_time text,
  layover_city text,
  layover_time text,
  hotel_name text,
  is_continuation boolean not null default false,
  is_overnight_duty boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_schedule_duties_user_duty_date
  on public.schedule_duties (user_id, duty_date);

create unique index if not exists uq_schedule_duties_user_import_pairing_duty
  on public.schedule_duties (user_id, import_id, pairing_id, duty_date);

alter table public.schedule_duties enable row level security;

drop policy if exists "schedule_duties_select_own" on public.schedule_duties;
create policy "schedule_duties_select_own" on public.schedule_duties
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "schedule_duties_insert_own" on public.schedule_duties;
create policy "schedule_duties_insert_own" on public.schedule_duties
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "schedule_duties_update_own" on public.schedule_duties;
create policy "schedule_duties_update_own" on public.schedule_duties
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "schedule_duties_delete_own" on public.schedule_duties;
create policy "schedule_duties_delete_own" on public.schedule_duties
  for delete to authenticated
  using (user_id = auth.uid());
