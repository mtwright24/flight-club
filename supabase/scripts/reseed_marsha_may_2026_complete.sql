-- Run in Supabase SQL Editor (or psql) to restore Marsha May 2026 demo in one shot.
-- Requires: columns depart_local, arrive_local (migration 20260411180000).
-- User must exist in auth.users.

do $$
declare
  v_user uuid := '85f152bb-4b50-44c6-9f31-74f5906abb38'::uuid;
  v_month text := '2026-05';
  tg_j4195 uuid := 'a1111111-1111-4111-8111-111111111101'::uuid;
  tg_j1012 uuid := 'a1111111-1111-4111-8111-111111111102'::uuid;
  tg_j1015 uuid := 'a1111111-1111-4111-8111-111111111103'::uuid;
  tg_j1010 uuid := 'a1111111-1111-4111-8111-111111111104'::uuid;
  tg_j1002 uuid := 'a1111111-1111-4111-8111-111111111105'::uuid;
  tg_ptv uuid := 'a1111111-1111-4111-8111-111111111106'::uuid;
begin
  if not exists (select 1 from auth.users where id = v_user) then
    raise exception 'User % not in auth.users — change v_user to your id or create demo user.', v_user;
  end if;

  delete from public.schedule_entries
  where user_id = v_user
    and month_key = v_month
    and source_type = 'seed_marsha_may_2026';

  insert into public.schedule_entries (
    user_id,
    trip_group_id,
    month_key,
    date,
    day_of_week,
    pairing_code,
    report_time,
    city,
    d_end_time,
    layover,
    depart_local,
    arrive_local,
    wx,
    status_code,
    notes,
    source_type,
    source_batch_id,
    is_user_confirmed
  )
  select
    v_user,
    s.trip_group_id,
    v_month,
    s.duty_date::date,
    null,
    s.pairing_code,
    s.report_time,
    s.city,
    s.d_end_time,
    s.layover,
    s.depart_local,
    s.arrive_local,
    null,
    s.status_code,
    s.notes,
    'seed_marsha_may_2026',
    null,
    true
  from (
    values
      ('2026-04-29', tg_j4195, 'J4195', 'JFK-SFO', '0600', '0923', 'SFO 1227', '0623', '0923', null::text, 'flt:B6 13'::text),
      ('2026-04-30', tg_j4195, 'J4195', 'SFO-FLL', '0730', '1525', 'FLL 2305', '0730', '1525', null, 'flt:B6 234'),
      ('2026-05-01', tg_j4195, 'J4195', 'FLL-SFO', '0758', '1109', 'SFO 1936', '0758', '1109', null, 'flt:B6 577'),
      ('2026-05-02', tg_j4195, 'J4195', 'SFO-JFK', '0700', '1533', null, '0700', '1533', null, 'flt:B6 816'),
      ('2026-05-04', tg_j1012, 'J1012', 'JFK-DUB', '1950', '0930', 'DUB 2430', '2100', '0900', null, 'flt:B6 841'),
      ('2026-05-05', tg_j1012, 'J1012', null, '1030', null, null, null, null, 'CONT', 'Layover DUB (CONT).'),
      ('2026-05-06', tg_j1012, 'J1012', 'DUB-JFK', '1130', '0741', null, '1130', '1411', null, 'flt:B6 842'),
      ('2026-05-07', tg_j1015, 'J1015', 'JFK-EDI', '1942', '0950', 'EDI 2450', '2112', '0920', null, 'flt:B6 73'),
      ('2026-05-08', tg_j1015, 'J1015', 'EDI', '1040', null, null, null, null, 'CONT', 'Layover EDI (CONT).'),
      ('2026-05-09', tg_j1015, 'J1015', 'EDI-JFK', '1210', '1459', null, '1210', '1459', null, 'flt:B6 72'),
      ('2026-05-13', tg_j1010, 'J1010', 'JFK-LHR', '1922', '1000', 'LHR 2045', '2052', '0930', null, 'flt:B6 7'),
      ('2026-05-14', tg_j1010, 'J1010', 'LHR', '0645', null, null, null, null, 'CONT', 'Layover LHR (CONT).'),
      ('2026-05-15', tg_j1010, 'J1010', 'LHR-JFK', '0815', '1121', null, '0815', '1121', null, 'flt:B6 2220'),
      ('2026-05-16', tg_j1002, 'J1002', 'JFK-LHR', '0715', '2115', 'LHR 1110', '2045', '0900', null, 'flt:B6 1107'),
      ('2026-05-17', tg_j1002, 'J1002', 'LHR-JFK', '1155', '1519', null, '1155', '1519', null, 'flt:B6 20'),
      ('2026-05-23', tg_ptv, 'PTV', null, null, null, null, null, null, 'PTO', 'PTV block (May 23–29).'),
      ('2026-05-24', tg_ptv, 'PTV', null, null, null, null, null, null, 'PTO', null),
      ('2026-05-25', tg_ptv, 'PTV', null, null, null, null, null, null, 'PTO', null),
      ('2026-05-26', tg_ptv, 'PTV', null, null, null, null, null, null, 'PTO', null),
      ('2026-05-27', tg_ptv, 'PTV', null, null, null, null, null, null, 'PTO', null),
      ('2026-05-28', tg_ptv, 'PTV', null, null, null, null, null, null, 'PTO', null),
      ('2026-05-29', tg_ptv, 'PTV', null, null, null, null, null, null, 'PTO', null)
  ) as s(duty_date, trip_group_id, pairing_code, city, report_time, d_end_time, layover, depart_local, arrive_local, status_code, notes);

  insert into public.schedule_month_metrics (
    user_id, month_key, monthly_tafb_hours, block_hours, credit_hours, ytd_credit_hours, days_off, layover_total_minutes, source
  ) values (
    v_user, v_month, 107.38, 72.38, 107.38, 498.29, 18, 8820, 'seed_marsha_may_2026'
  )
  on conflict (user_id, month_key) do update set
    monthly_tafb_hours = excluded.monthly_tafb_hours,
    block_hours = excluded.block_hours,
    credit_hours = excluded.credit_hours,
    ytd_credit_hours = excluded.ytd_credit_hours,
    days_off = excluded.days_off,
    layover_total_minutes = excluded.layover_total_minutes,
    source = excluded.source,
    updated_at = now();
end $$;
