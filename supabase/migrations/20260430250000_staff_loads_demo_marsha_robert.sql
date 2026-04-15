-- =============================================================================
-- Staff Loads — dev/demo fixtures (Marsha requester, Robert responder)
-- =============================================================================
--
-- What it seeds (after `supabase db push` / `supabase migration up` on your dev DB):
--   • One JetBlue demo flight: B6 DEMO604 BOS→FLL 2026-07-04 14:30Z–18:05Z
--   • Three requests (Marsha), all tagged options.staff_loads_demo = true:
--       …000001  STATE A — open / waiting (no lock)
--       …000002  STATE B — open + locked by Robert (~2h lock_expires_at)
--       …000003  STATE C — answered + Robert’s load_answers + timeline (answer + loads_update)
--   • Credits ≥100 for Marsha/Robert; Robert gets user_airline_access B6 if missing
--
-- Preconditions (otherwise migration skips with RAISE NOTICE):
--   • auth.users contains Marsha at id 85f152bb-4b50-44c6-9f31-74f5906abb38 (same as other demo seeds)
--   • A “Robert” profile: handle robert / bob / rwalker OR email robert%@ / %+robert%@
--
-- Where to see it in the app (log in as Marsha or Robert as appropriate):
--   • Loads tab: app/loads/index.tsx — Marsha sees her open requests preview
--   • Requests: app/loads/requests.tsx — open / locked / answered rows from list RPCs
--   • Detail: /loads/request/<uuid> — e.g. answered …000003 for full loads + history
--   • Answer flow: /loads/answer/<uuid> — Robert on …000001 to exercise lock → submit manually
--
-- Manual E2E (single request lifecycle): log in as Marsha → open …000001 detail → note open state;
--   log in as Robert → /loads/answer/…000001 → submit loads → Marsha sees answered on same id.
--   Use …000002 only to preview “being answered” without submitting; …000003 for static answered UI.
--
-- Reset / re-seed: re-run this migration (idempotent teardown by options @> staff_loads_demo).
--
-- Dev-only: no app code paths; safe to omit on production DBs without Marsha/Robert (skips).
--
-- Edge-case demos (priority + inaccuracy/refresh): see migration
-- 20260430250100_staff_loads_demo_edge_cases.sql (separate demo_slot teardown).

do $demo$
declare
  v_marsha uuid := '85f152bb-4b50-44c6-9f31-74f5906abb38'::uuid;
  v_robert uuid;
  v_answer_id uuid;
  v_flight uuid := 'a0edf0f0-0001-4001-8001-0000000000f1'::uuid;
  v_req_open uuid := 'a0edf001-0001-4001-8001-000000000001'::uuid;
  v_req_locked uuid := 'a0edf001-0001-4001-8001-000000000002'::uuid;
  v_req_answered uuid := 'a0edf001-0001-4001-8001-000000000003'::uuid;
  v_demo jsonb := '{"staff_loads_demo": true}'::jsonb;
  v_dep timestamptz := '2026-07-04 14:30:00+00'::timestamptz;
  v_arr timestamptz := '2026-07-04 18:05:00+00'::timestamptz;
  v_date date := '2026-07-04'::date;
begin
  if not exists (select 1 from auth.users where id = v_marsha) then
    raise notice 'staff_loads_demo: skip — Marsha demo user % not in auth.users', v_marsha;
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
    raise notice 'staff_loads_demo: skip — no Robert user (handle robert/bob/rwalker or email robert%%@)';
    return;
  end if;

  if v_robert = v_marsha then
    raise notice 'staff_loads_demo: skip — Robert resolved to same id as Marsha';
    return;
  end if;

  -- Tear down prior demo rows (children first)
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

  -- Demo flight (B6 BOS→FLL) — unique key safe for re-run
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
        travel_date = excluded.travel_date
  returning id into v_flight;

  select nf.id
    into v_flight
  from public.nonrev_load_flights nf
  where nf.airline_code = 'B6'
    and nf.flight_number = 'DEMO604'
    and nf.depart_at = v_dep
    and nf.travel_date = v_date
  limit 1;

  -- Credits: ensure both can post / play without hitting zero
  insert into public.user_credits (user_id, balance, updated_at)
  values (v_marsha, 100, now())
  on conflict (user_id) do update set balance = greatest(public.user_credits.balance, 100), updated_at = now();
  insert into public.user_credits (user_id, balance, updated_at)
  values (v_robert, 100, now())
  on conflict (user_id) do update set balance = greatest(public.user_credits.balance, 100), updated_at = now();

  -- Robert can answer B6 (narrow access is ok; add B6 if missing)
  insert into public.user_airline_access (user_id, airline_code)
  values (v_robert, 'B6')
  on conflict (user_id, airline_code) do nothing;

  -- STATE A — open / waiting
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

  -- STATE B — locked (Robert answering now)
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

  -- STATE C — answered with Robert’s loads
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

  raise notice 'staff_loads_demo: seeded open=%, locked=%, answered=% for Marsha % / Robert %',
    v_req_open, v_req_locked, v_req_answered, v_marsha, v_robert;
end
$demo$;
