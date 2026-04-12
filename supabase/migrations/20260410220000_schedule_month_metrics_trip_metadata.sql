-- Month-level totals (T/B/C/YTD/OFF/layover) + per-pairing totals, crew JSON for detail/tradeboard.

create table if not exists public.schedule_month_metrics (
  user_id uuid not null references auth.users (id) on delete cascade,
  month_key text not null,
  monthly_tafb_hours numeric,
  block_hours numeric,
  credit_hours numeric,
  ytd_credit_hours numeric,
  days_off integer,
  layover_total_minutes integer,
  source text,
  updated_at timestamptz not null default now(),
  primary key (user_id, month_key)
);

create index if not exists idx_schedule_month_metrics_user on public.schedule_month_metrics (user_id);

create table if not exists public.schedule_trip_metadata (
  trip_group_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  pairing_block_hours numeric,
  pairing_credit_hours numeric,
  pairing_tafb_hours numeric,
  layover_total_minutes integer,
  crew jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (trip_group_id)
);

create index if not exists idx_schedule_trip_metadata_user on public.schedule_trip_metadata (user_id);

alter table public.schedule_month_metrics enable row level security;
alter table public.schedule_trip_metadata enable row level security;

drop policy if exists "schedule_month_metrics_select_own" on public.schedule_month_metrics;
create policy "schedule_month_metrics_select_own" on public.schedule_month_metrics
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "schedule_month_metrics_insert_own" on public.schedule_month_metrics;
create policy "schedule_month_metrics_insert_own" on public.schedule_month_metrics
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "schedule_month_metrics_update_own" on public.schedule_month_metrics;
create policy "schedule_month_metrics_update_own" on public.schedule_month_metrics
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "schedule_month_metrics_delete_own" on public.schedule_month_metrics;
create policy "schedule_month_metrics_delete_own" on public.schedule_month_metrics
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "schedule_trip_metadata_select_own" on public.schedule_trip_metadata;
create policy "schedule_trip_metadata_select_own" on public.schedule_trip_metadata
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "schedule_trip_metadata_insert_own" on public.schedule_trip_metadata;
create policy "schedule_trip_metadata_insert_own" on public.schedule_trip_metadata
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "schedule_trip_metadata_update_own" on public.schedule_trip_metadata;
create policy "schedule_trip_metadata_update_own" on public.schedule_trip_metadata
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "schedule_trip_metadata_delete_own" on public.schedule_trip_metadata;
create policy "schedule_trip_metadata_delete_own" on public.schedule_trip_metadata
  for delete to authenticated using (user_id = auth.uid());

-- Demo seed (Marsha May 2026): FLICA-style pairing totals + crew; month strip matches Flight Crew View header.
do $$
declare
  v_user uuid := '85f152bb-4b50-44c6-9f31-74f5906abb38'::uuid;
  v_month text := '2026-05';
  g_j4195 uuid := 'a1111111-1111-4111-8111-111111111101';
  g_j1012 uuid := 'a1111111-1111-4111-8111-111111111102';
  g_j1015 uuid := 'a1111111-1111-4111-8111-111111111103';
  g_j1010 uuid := 'a1111111-1111-4111-8111-111111111104';
  g_j1002 uuid := 'a1111111-1111-4111-8111-111111111105';
  g_ptv uuid := 'a1111111-1111-4111-8111-111111111106';
begin
  if not exists (select 1 from auth.users where id = v_user) then
    raise notice 'schedule_metrics_seed: skip — user % not found', v_user;
    return;
  end if;

  delete from public.schedule_trip_metadata where user_id = v_user and trip_group_id in (
    g_j4195, g_j1012, g_j1015, g_j1010, g_j1002, g_ptv
  );
  delete from public.schedule_month_metrics where user_id = v_user and month_key = v_month;

  insert into public.schedule_month_metrics (
    user_id, month_key, monthly_tafb_hours, block_hours, credit_hours, ytd_credit_hours, days_off, layover_total_minutes, source
  ) values (
    v_user,
    v_month,
    199.49,
    72.38,
    107.38,
    498.29,
    18,
    8820,
    'seed_marsha_may_2026'
  );

  insert into public.schedule_trip_metadata (trip_group_id, user_id, pairing_block_hours, pairing_credit_hours, pairing_tafb_hours, layover_total_minutes, crew)
  values
    (
      g_j4195,
      v_user,
      28.5,
      22.0,
      68.0,
      2940,
      '[
        {"position":"F1","name":"Nguyen, Alex"},
        {"position":"F2","name":"Patel, Sam"},
        {"position":"F3","name":"Marsha"},
        {"position":"F4","name":"Lee, Jordan"}
      ]'::jsonb
    ),
    (
      g_j1012,
      v_user,
      14.68,
      18.68,
      43.18,
      1470,
      '[
        {"position":"F1","name":"Jacobs, Jem"},
        {"position":"F2","name":"Pierre-Louis, Valentine"},
        {"position":"F3","name":"Bayens, Ashley"},
        {"position":"F4","name":"Marsha"}
      ]'::jsonb
    ),
    (
      g_j1015,
      v_user,
      14.95,
      18.95,
      43.78,
      1490,
      '[
        {"position":"F1","name":"Best, Tyesha"},
        {"position":"F2","name":"Falcone Jr, Anthony"},
        {"position":"F3","name":"Marsha"},
        {"position":"F4","name":"Cadette, Patricia"}
      ]'::jsonb
    ),
    (
      g_j1010,
      v_user,
      15.73,
      19.73,
      40.48,
      1245,
      '[
        {"position":"F1","name":"Mull Jr, Robert"},
        {"position":"F2","name":"General, Jessica"},
        {"position":"F3","name":"Rajkumar, Sharda"},
        {"position":"F4","name":"Marsha"}
      ]'::jsonb
    ),
    (
      g_j1002,
      v_user,
      15.4,
      19.4,
      32.57,
      670,
      '[
        {"position":"F1","name":"Garcia, Odalis"},
        {"position":"F2","name":"Marsha"},
        {"position":"F3","name":"Cordoba, Erika"},
        {"position":"F4","name":"Valles, Jorge"}
      ]'::jsonb
    ),
    (
      g_ptv,
      v_user,
      null,
      35.0,
      null,
      null,
      '[]'::jsonb
    );
end $$;
