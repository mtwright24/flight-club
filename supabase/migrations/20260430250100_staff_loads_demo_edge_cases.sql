-- =============================================================================
-- Staff Loads — dev/demo edge cases (priority + inaccuracy / refresh-needed)
-- =============================================================================
--
-- Companion to 20260430250000_staff_loads_demo_marsha_robert.sql (base Marsha/Robert
-- open / locked / answered). This migration only touches rows tagged
-- options.staff_loads_demo = true AND demo_slot in (priority_open, inaccuracy_refresh).
--
-- Preconditions: same Marsha UUID + Robert resolution as the base demo migration.
--
-- Seeded scenarios (fixed UUIDs for easy deep links):
--   …000011  PRIORITY — Marsha, B6 DEMO605 BOS→SFO, open, request_kind priority,
--            priority_upgraded_at set, timeline request_created + priority_upgrade
--   …000012  INACCURACY — Marsha, B6 DEMO606 JFK→MCO, answered, Robert’s latest answer,
--            Marsha inaccuracy report, refresh_requested_at set, timeline answer +
--            report_inaccurate (metadata matches RPC shape)
--
-- Where in app:
--   • Loads tab preview (Marsha): …000011 appears among recent open requests
--   • Requests → Open: …000011 under “Priority requests”; …000012 is answered → Answered tab
--   • Detail: /loads/request/a0edf001-0001-4001-8001-000000000011 (priority) and …000012 (banner + flag)
--
-- Reset: re-run this migration only (idempotent teardown by demo_slot). Re-running the
-- base demo migration (250000) removes ALL staff_loads_demo rows including these; then
-- run 250000 then 250100 again if you need the full five scenarios.

do $edge$
declare
  v_marsha uuid := '85f152bb-4b50-44c6-9f31-74f5906abb38'::uuid;
  v_robert uuid;
  v_demo jsonb := '{"staff_loads_demo": true}'::jsonb;
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
  v_answer_id uuid;
  v_report_id uuid;
begin
  if not exists (select 1 from auth.users where id = v_marsha) then
    raise notice 'staff_loads_demo_edge: skip — Marsha demo user % not in auth.users', v_marsha;
    return;
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
    raise notice 'staff_loads_demo_edge: skip — no Robert user';
    return;
  end if;

  if v_robert = v_marsha then
    raise notice 'staff_loads_demo_edge: skip — Robert resolved to same id as Marsha';
    return;
  end if;

  -- Tear down prior edge-case demo rows only (children first)
  delete from public.load_answer_inaccuracy_reports where request_id in (
    select id from public.load_requests lr
    where coalesce(lr.options, '{}'::jsonb) @> v_demo
      and coalesce(lr.options->>'demo_slot', '') in ('priority_open', 'inaccuracy_refresh')
  );
  delete from public.load_request_comments where request_id in (
    select id from public.load_requests lr
    where coalesce(lr.options, '{}'::jsonb) @> v_demo
      and coalesce(lr.options->>'demo_slot', '') in ('priority_open', 'inaccuracy_refresh')
  );
  delete from public.load_request_status_updates where request_id in (
    select id from public.load_requests lr
    where coalesce(lr.options, '{}'::jsonb) @> v_demo
      and coalesce(lr.options->>'demo_slot', '') in ('priority_open', 'inaccuracy_refresh')
  );
  delete from public.load_request_timeline where request_id in (
    select id from public.load_requests lr
    where coalesce(lr.options, '{}'::jsonb) @> v_demo
      and coalesce(lr.options->>'demo_slot', '') in ('priority_open', 'inaccuracy_refresh')
  );
  delete from public.load_answers where request_id in (
    select id from public.load_requests lr
    where coalesce(lr.options, '{}'::jsonb) @> v_demo
      and coalesce(lr.options->>'demo_slot', '') in ('priority_open', 'inaccuracy_refresh')
  );
  delete from public.load_request_locks where request_id in (
    select id from public.load_requests lr
    where coalesce(lr.options, '{}'::jsonb) @> v_demo
      and coalesce(lr.options->>'demo_slot', '') in ('priority_open', 'inaccuracy_refresh')
  );
  delete from public.load_requests lr
  where coalesce(lr.options, '{}'::jsonb) @> v_demo
    and coalesce(lr.options->>'demo_slot', '') in ('priority_open', 'inaccuracy_refresh');

  delete from public.nonrev_load_flights where id in (v_flight_pri, v_flight_bad);

  -- Flights (deterministic ids; natural key upsert)
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
  where nf.airline_code = 'B6'
    and nf.flight_number = 'DEMO605'
    and nf.depart_at = v_dep_pri
    and nf.travel_date = v_date_pri
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
  where nf.airline_code = 'B6'
    and nf.flight_number = 'DEMO606'
    and nf.depart_at = v_dep_bad
    and nf.travel_date = v_date_bad
  limit 1;

  insert into public.user_airline_access (user_id, airline_code)
  values (v_robert, 'B6')
  on conflict (user_id, airline_code) do nothing;

  insert into public.user_credits (user_id, balance, updated_at)
  values (v_marsha, 100, now())
  on conflict (user_id) do update set balance = greatest(public.user_credits.balance, 100), updated_at = now();

  update public.user_credits
  set priority_balance = greatest(coalesce(priority_balance, 0), 4), updated_at = now()
  where user_id = v_marsha;

  -- PRIORITY: open, visibly priority (Requests section + detail “Priority since …”)
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

  -- INACCURACY / REFRESH: answered + Marsha flagged latest answer (mirrors rpc_staff_loads_report_inaccurate)
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
  returning id into v_answer_id;

  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body, metadata)
  values (
    v_req_bad,
    v_robert,
    'answer',
    'Loads submitted',
    'Robert demo counts (later reported inaccurate).',
    jsonb_build_object('answer_id', v_answer_id, 'answer_source', 'community')
  );

  insert into public.load_answer_inaccuracy_reports (request_id, answer_id, reporter_user_id, reason)
  values (
    v_req_bad,
    v_answer_id,
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
    jsonb_build_object('answer_id', v_answer_id, 'report_id', v_report_id)
  );

  raise notice 'staff_loads_demo_edge: seeded priority=%, inaccuracy_refresh=% (Marsha % / Robert %)',
    v_req_pri, v_req_bad, v_marsha, v_robert;
end
$edge$;
