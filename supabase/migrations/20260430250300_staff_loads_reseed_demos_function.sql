-- Callable Staff Loads demo re-seed (Marsha + Robert + five fixed UUID scenarios).
-- Use when earlier migrations skipped because Robert did not exist yet.
-- Idempotent: if five or more staff_loads_demo requests exist, returns skipped without deleting.

create or replace function public.staff_loads_reseed_demos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_marsha uuid := '85f152bb-4b50-44c6-9f31-74f5906abb38'::uuid;
  v_robert uuid;
  v_demo jsonb := '{"staff_loads_demo": true}'::jsonb;
  v_cnt int;
  v_flight uuid := 'a0edf0f0-0001-4001-8001-0000000000f1'::uuid;
  v_req_open uuid := 'a0edf001-0001-4001-8001-000000000001'::uuid;
  v_req_locked uuid := 'a0edf001-0001-4001-8001-000000000002'::uuid;
  v_req_answered uuid := 'a0edf001-0001-4001-8001-000000000003'::uuid;
  v_dep timestamptz := '2026-07-04 14:30:00+00'::timestamptz;
  v_arr timestamptz := '2026-07-04 18:05:00+00'::timestamptz;
  v_date date := '2026-07-04'::date;
  v_answer_id uuid;
  v_flight_pri uuid := 'a0edf0f0-0001-4001-8001-000000000021'::uuid;
  v_flight_bad uuid := 'a0edf0f0-0001-4001-8001-000000000022'::uuid;
  v_req_pri uuid := 'a0edf001-0001-4001-8001-000000000011'::uuid;
  v_req_bad uuid := 'a0edf001-0001-4001-8001-000000000012'::uuid;
  v_dep_pri timestamptz := '2026-09-10 14:00:00+00'::timestamptz;
  v_arr_pri timestamptz := '2026-09-10 17:35:00+00'::timestamptz;
  v_date_pri date := '2026-09-10'::date;
  v_dep_bad timestamptz := '2026-09-12 13:00:00+00'::timestamptz;
  v_arr_bad timestamptz := '2026-09-12 16:15:00+00'::timestamptz;
  v_date_bad date := '2026-09-12'::date;
  v_answer_bad uuid;
  v_report_id uuid;
begin
  if not exists (select 1 from auth.users where id = v_marsha) then
    return jsonb_build_object('ok', false, 'reason', 'no_marsha');
  end if;

  select p.id
    into v_robert
  from public.profiles p
  join auth.users au on au.id = p.id
  where lower(coalesce(p.handle, '')) in ('robert', 'bob', 'rwalker')
     or lower(au.email) like 'robert%@%'
     or lower(au.email) like '%+robert%@%'
  limit 1;

  if v_robert is null then
    return jsonb_build_object('ok', false, 'reason', 'no_robert', 'hint', 'profile handle robert/bob/rwalker or email robert%@');
  end if;

  if v_robert = v_marsha then
    return jsonb_build_object('ok', false, 'reason', 'robert_same_as_marsha');
  end if;

  select count(*)::int
    into v_cnt
  from public.load_requests lr
  where coalesce(lr.options, '{}'::jsonb) @> v_demo;

  if v_cnt >= 5 then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'already_seeded', 'demo_requests', v_cnt);
  end if;

  -- Full teardown (all staff_loads_demo), children first
  delete from public.load_answer_inaccuracy_reports where request_id in (
    select id from public.load_requests where coalesce(options, '{}'::jsonb) @> v_demo
  );
  delete from public.load_request_comments where request_id in (
    select id from public.load_requests where coalesce(options, '{}'::jsonb) @> v_demo
  );
  delete from public.load_request_status_updates where request_id in (
    select id from public.load_requests where coalesce(options, '{}'::jsonb) @> v_demo
  );
  delete from public.load_request_timeline where request_id in (
    select id from public.load_requests where coalesce(options, '{}'::jsonb) @> v_demo
  );
  delete from public.load_answers where request_id in (
    select id from public.load_requests where coalesce(options, '{}'::jsonb) @> v_demo
  );
  delete from public.load_request_locks where request_id in (
    select id from public.load_requests where coalesce(options, '{}'::jsonb) @> v_demo
  );
  delete from public.load_requests where coalesce(options, '{}'::jsonb) @> v_demo;

  delete from public.nonrev_load_flights
  where id in (v_flight, v_flight_pri, v_flight_bad);

  -- --- Base flight + three requests (same as 20260430250000) ---
  insert into public.nonrev_load_flights (
    id, airline_code, flight_number, from_airport, to_airport, depart_at, arrive_at, travel_date
  ) values (
    v_flight, 'B6', 'DEMO604', 'BOS', 'FLL', v_dep, v_arr, v_date
  )
  on conflict (airline_code, flight_number, depart_at, travel_date) do update
    set from_airport = excluded.from_airport,
        to_airport = excluded.to_airport,
        depart_at = excluded.depart_at,
        arrive_at = excluded.arrive_at,
        travel_date = excluded.travel_date;

  select nf.id into v_flight
  from public.nonrev_load_flights nf
  where nf.airline_code = 'B6' and nf.flight_number = 'DEMO604' and nf.depart_at = v_dep and nf.travel_date = v_date
  limit 1;

  insert into public.user_credits (user_id, balance, updated_at)
  values (v_marsha, 100, now())
  on conflict (user_id) do update set balance = greatest(public.user_credits.balance, 100), updated_at = now();
  insert into public.user_credits (user_id, balance, updated_at)
  values (v_robert, 100, now())
  on conflict (user_id) do update set balance = greatest(public.user_credits.balance, 100), updated_at = now();

  insert into public.user_airline_access (user_id, airline_code)
  values (v_robert, 'B6')
  on conflict (user_id, airline_code) do nothing;

  insert into public.load_requests (
    id, user_id, airline_code, flight_number, from_airport, to_airport, travel_date,
    depart_at, arrive_at, flight_id, status, request_kind, options, search_snapshot
  ) values (
    v_req_open, v_marsha, 'B6', 'DEMO604', 'BOS', 'FLL', v_date,
    v_dep, v_arr, v_flight, 'open', 'standard',
    v_demo || '{"demo_slot": "open"}'::jsonb,
    '{}'::jsonb
  );

  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body)
  values (
    v_req_open, v_marsha, 'request_created',
    'Demo: waiting for loads',
    'Marsha demo — B6 BOS→FLL Jul 4. Open / unanswered.'
  );

  insert into public.load_requests (
    id, user_id, airline_code, flight_number, from_airport, to_airport, travel_date,
    depart_at, arrive_at, flight_id, status, request_kind,
    locked_by, locked_at, lock_expires_at,
    options, search_snapshot
  ) values (
    v_req_locked, v_marsha, 'B6', 'DEMO604', 'BOS', 'FLL', v_date,
    v_dep, v_arr, v_flight, 'open', 'standard',
    v_robert, now(), now() + interval '2 hours',
    v_demo || '{"demo_slot": "locked"}'::jsonb,
    '{}'::jsonb
  );

  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body)
  values (
    v_req_locked, v_marsha, 'request_created',
    'Demo: locked in progress',
    'Marsha demo — Robert holds the answer lock (expires in ~2h unless swept).'
  );

  insert into public.load_request_locks (request_id, locked_by_user_id, locked_at, expires_at, released_at, release_reason)
  values (v_req_locked, v_robert, now(), now() + interval '2 hours', null, null);

  insert into public.load_requests (
    id, user_id, airline_code, flight_number, from_airport, to_airport, travel_date,
    depart_at, arrive_at, flight_id, status, request_kind, latest_answer_at,
    options, search_snapshot
  ) values (
    v_req_answered, v_marsha, 'B6', 'DEMO604', 'BOS', 'FLL', v_date,
    v_dep, v_arr, v_flight, 'answered', 'standard', now(),
    v_demo || '{"demo_slot": "answered"}'::jsonb,
    '{}'::jsonb
  );

  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body)
  values (
    v_req_answered, v_marsha, 'request_created',
    'Demo: answered',
    'Marsha demo — Robert already submitted loads.'
  );

  insert into public.load_answers (
    request_id, user_id, load_level, notes, as_of,
    open_seats_total, open_seats_by_cabin, nonrev_listed_total, nonrev_by_cabin,
    answer_source, is_latest
  ) values (
    v_req_answered,
    v_robert,
    'MEDIUM',
    'Demo answer — light standby list, 2 open in Mint.',
    now(),
    9,
    '{"first": 2, "main": 7}'::jsonb,
    14,
    '{"first": 3, "main": 11}'::jsonb,
    'community',
    true
  )
  returning id into v_answer_id;

  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body, metadata)
  values (
    v_req_answered,
    v_robert,
    'answer',
    'Loads submitted',
    'Demo loads update from Robert.',
    jsonb_build_object('answer_id', v_answer_id, 'answer_source', 'community')
  );

  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body, metadata)
  values (
    v_req_answered,
    v_robert,
    'loads_update',
    'Loads refresh (demo)',
    'Robert posted a quick refresh — gate area busy, counts unchanged for demo.',
    jsonb_build_object('answer_id', v_answer_id)
  );

  -- --- Edge: priority + inaccuracy (same as 20260430250100) ---
  insert into public.nonrev_load_flights (
    id, airline_code, flight_number, from_airport, to_airport, depart_at, arrive_at, travel_date
  ) values (
    v_flight_pri, 'B6', 'DEMO605', 'BOS', 'SFO', v_dep_pri, v_arr_pri, v_date_pri
  )
  on conflict (airline_code, flight_number, depart_at, travel_date) do update
    set from_airport = excluded.from_airport,
        to_airport = excluded.to_airport,
        depart_at = excluded.depart_at,
        arrive_at = excluded.arrive_at,
        travel_date = excluded.travel_date;

  select nf.id into v_flight_pri
  from public.nonrev_load_flights nf
  where nf.airline_code = 'B6' and nf.flight_number = 'DEMO605' and nf.depart_at = v_dep_pri and nf.travel_date = v_date_pri
  limit 1;

  insert into public.nonrev_load_flights (
    id, airline_code, flight_number, from_airport, to_airport, depart_at, arrive_at, travel_date
  ) values (
    v_flight_bad, 'B6', 'DEMO606', 'JFK', 'MCO', v_dep_bad, v_arr_bad, v_date_bad
  )
  on conflict (airline_code, flight_number, depart_at, travel_date) do update
    set from_airport = excluded.from_airport,
        to_airport = excluded.to_airport,
        depart_at = excluded.depart_at,
        arrive_at = excluded.arrive_at,
        travel_date = excluded.travel_date;

  select nf.id into v_flight_bad
  from public.nonrev_load_flights nf
  where nf.airline_code = 'B6' and nf.flight_number = 'DEMO606' and nf.depart_at = v_dep_bad and nf.travel_date = v_date_bad
  limit 1;

  update public.user_credits
  set priority_balance = greatest(coalesce(priority_balance, 0), 4), updated_at = now()
  where user_id = v_marsha;

  insert into public.load_requests (
    id, user_id, airline_code, flight_number, from_airport, to_airport, travel_date,
    depart_at, arrive_at, flight_id, status, request_kind, priority_upgraded_at,
    options, search_snapshot
  ) values (
    v_req_pri, v_marsha, 'B6', 'DEMO605', 'BOS', 'SFO', v_date_pri,
    v_dep_pri, v_arr_pri, v_flight_pri, 'open', 'priority', now() - interval '90 minutes',
    v_demo || '{"demo_slot": "priority_open"}'::jsonb,
    '{}'::jsonb
  );

  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body, metadata)
  values (
    v_req_pri, v_marsha, 'request_created',
    'Demo: priority listing',
    'Marsha — B6 BOS→SFO Sep 10. Posted as priority for edge-case UI.',
    '{}'::jsonb
  );

  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body, metadata)
  values (
    v_req_pri, v_marsha, 'priority_upgrade',
    'Upgraded to priority',
    'Seeded like post-upgrade: this request is now priority.',
    '{}'::jsonb
  );

  insert into public.load_requests (
    id, user_id, airline_code, flight_number, from_airport, to_airport, travel_date,
    depart_at, arrive_at, flight_id, status, request_kind, latest_answer_at, refresh_requested_at,
    options, search_snapshot
  ) values (
    v_req_bad, v_marsha, 'B6', 'DEMO606', 'JFK', 'MCO', v_date_bad,
    v_dep_bad, v_arr_bad, v_flight_bad, 'answered', 'standard', now() - interval '45 minutes',
    now() - interval '25 minutes',
    v_demo || '{"demo_slot": "inaccuracy_refresh"}'::jsonb,
    '{}'::jsonb
  );

  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body, metadata)
  values (
    v_req_bad, v_marsha, 'request_created',
    'Demo: answered then disputed',
    'Marsha — B6 JFK→MCO Sep 12. Answered; then flagged inaccurate for refresh flow.',
    '{}'::jsonb
  );

  insert into public.load_answers (
    request_id, user_id, load_level, notes, as_of,
    open_seats_total, open_seats_by_cabin, nonrev_listed_total, nonrev_by_cabin,
    answer_source, is_latest
  ) values (
    v_req_bad,
    v_robert,
    'HEAVY',
    'Demo answer (disputed) — standby looked manageable from the lounge.',
    now() - interval '50 minutes',
    3,
    '{"first": 0, "main": 3}'::jsonb,
    22,
    '{"first": 2, "main": 20}'::jsonb,
    'community',
    true
  )
  returning id into v_answer_bad;

  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body, metadata)
  values (
    v_req_bad,
    v_robert,
    'answer',
    'Loads submitted',
    'Robert demo counts (later reported inaccurate).',
    jsonb_build_object('answer_id', v_answer_bad, 'answer_source', 'community')
  );

  insert into public.load_answer_inaccuracy_reports (request_id, answer_id, reporter_user_id, reason)
  values (
    v_req_bad,
    v_answer_bad,
    v_marsha,
    'Demo: gate agent said standby much heavier than these numbers.'
  )
  returning id into v_report_id;

  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body, metadata)
  values (
    v_req_bad,
    v_marsha,
    'report_inaccurate',
    'Loads reported inaccurate',
    'Demo: gate agent said standby much heavier than these numbers.',
    jsonb_build_object('answer_id', v_answer_bad, 'report_id', v_report_id)
  );

  raise notice 'staff_loads_reseed_demos: applied full seed (5 requests) for Marsha % / Robert %', v_marsha, v_robert;
  return jsonb_build_object('ok', true, 'seeded', true, 'demo_requests', 5, 'marsha', v_marsha, 'robert', v_robert);
end
$f$;

revoke all on function public.staff_loads_reseed_demos() from public;
grant execute on function public.staff_loads_reseed_demos() to service_role;

comment on function public.staff_loads_reseed_demos() is
  'Re-apply dev Staff Loads demo data (options.staff_loads_demo). Safe to call repeatedly; skips if already complete.';

select public.staff_loads_reseed_demos() as staff_loads_reseed_demos_result;
