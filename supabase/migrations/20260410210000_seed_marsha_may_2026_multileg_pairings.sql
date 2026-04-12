-- Replace Marsha May 2026 demo seed: one trip_group_id per pairing (FLICA-style),
-- route segments as DEP→ARR, marketing flights in notes (flt:B6 …), CONT rows for layovers without legs.

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
    raise notice 'seed_marsha_may_2026_multileg: skip — user % not found', v_user;
    return;
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
    wx,
    status_code,
    notes,
    source_type,
    source_batch_id,
    is_user_confirmed
  )
  values
    -- J4195: JFK → SFO → FLL → SFO → JFK (layover Apr 30: no flight leg in mapper)
    (v_user, g_j4195, v_month, '2026-04-29', null, 'J4195', '07:00 AM', 'JFK→SFO', '10:30 AM', null, null, null, 'flt:B6 13', 'seed_marsha_may_2026', null, true),
    (v_user, g_j4195, v_month, '2026-04-30', null, 'J4195', null, 'FLL', null, null, null, 'CONT', 'Layover (no route segment).', 'seed_marsha_may_2026', null, true),
    (v_user, g_j4195, v_month, '2026-05-01', null, 'J4195', '09:00 AM', 'FLL→SFO', '12:30 PM', null, null, null, 'flt:B6 577', 'seed_marsha_may_2026', null, true),
    (v_user, g_j4195, v_month, '2026-05-02', null, 'J4195', '12:00 PM', 'SFO→JFK', '06:15 PM', null, null, null, 'flt:B6 816', 'seed_marsha_may_2026', null, true),

    -- J1012: JFK ↔ DUB (May 5 layover)
    (v_user, g_j1012, v_month, '2026-05-04', null, 'J1012', '06:00 PM', 'JFK→DUB', '06:15 AM', null, null, null, 'flt:B6 841', 'seed_marsha_may_2026', null, true),
    (v_user, g_j1012, v_month, '2026-05-05', null, 'J1012', null, 'DUB', null, null, null, 'CONT', 'Layover DUB.', 'seed_marsha_may_2026', null, true),
    (v_user, g_j1012, v_month, '2026-05-06', null, 'J1012', '09:00 AM', 'DUB→JFK', '12:00 PM', null, null, null, 'flt:B6 842', 'seed_marsha_may_2026', null, true),

    -- J1015: JFK ↔ EDI
    (v_user, g_j1015, v_month, '2026-05-07', null, 'J1015', '08:00 PM', 'JFK→EDI', '09:20 AM', null, null, null, 'flt:B6 73', 'seed_marsha_may_2026', null, true),
    (v_user, g_j1015, v_month, '2026-05-08', null, 'J1015', null, 'EDI', null, null, null, 'CONT', 'Layover EDI.', 'seed_marsha_may_2026', null, true),
    (v_user, g_j1015, v_month, '2026-05-09', null, 'J1015', '12:00 PM', 'EDI→JFK', '03:00 PM', null, null, null, 'flt:B6 72', 'seed_marsha_may_2026', null, true),

    -- J1010: JFK ↔ LHR
    (v_user, g_j1010, v_month, '2026-05-13', null, 'J1010', '07:30 PM', 'JFK→LHR', '07:45 AM', null, null, null, 'flt:B6 7', 'seed_marsha_may_2026', null, true),
    (v_user, g_j1010, v_month, '2026-05-14', null, 'J1010', null, 'LHR', null, null, null, 'CONT', 'Layover LHR.', 'seed_marsha_may_2026', null, true),
    (v_user, g_j1010, v_month, '2026-05-15', null, 'J1010', '09:00 AM', 'LHR→JFK', '12:00 PM', null, null, null, 'flt:B6 2220', 'seed_marsha_may_2026', null, true),

    -- J1002: JFK ↔ LHR (shorter layover)
    (v_user, g_j1002, v_month, '2026-05-16', null, 'J1002', '07:45 PM', 'JFK→LHR', '06:15 AM', null, null, null, 'flt:B6 1107', 'seed_marsha_may_2026', null, true),
    (v_user, g_j1002, v_month, '2026-05-17', null, 'J1002', '09:30 AM', 'LHR→JFK', '12:45 PM', null, null, null, 'flt:B6 20', 'seed_marsha_may_2026', null, true),

    -- PTV block (one trip group, PTO; no flight legs)
    (v_user, g_ptv, v_month, '2026-05-23', null, 'PTV', null, null, null, null, null, 'PTO', 'PTV block.', 'seed_marsha_may_2026', null, true),
    (v_user, g_ptv, v_month, '2026-05-24', null, 'PTV', null, null, null, null, null, 'PTO', null, 'seed_marsha_may_2026', null, true),
    (v_user, g_ptv, v_month, '2026-05-25', null, 'PTV', null, null, null, null, null, 'PTO', null, 'seed_marsha_may_2026', null, true),
    (v_user, g_ptv, v_month, '2026-05-26', null, 'PTV', null, null, null, null, null, 'PTO', null, 'seed_marsha_may_2026', null, true),
    (v_user, g_ptv, v_month, '2026-05-27', null, 'PTV', null, null, null, null, null, 'PTO', null, 'seed_marsha_may_2026', null, true),
    (v_user, g_ptv, v_month, '2026-05-28', null, 'PTV', null, null, null, null, null, 'PTO', null, 'seed_marsha_may_2026', null, true),
    (v_user, g_ptv, v_month, '2026-05-29', null, 'PTV', null, null, null, null, null, 'PTO', null, 'seed_marsha_may_2026', null, true);
end $$;
