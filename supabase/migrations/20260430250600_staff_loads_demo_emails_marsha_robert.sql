-- Staff Loads demo identities by email:
--   Marsha = marcus.wrightllc@gmail.com
--   Robert = mtwright24@gmail.com (then legacy handle heuristics, then any other user)
-- Replaces staff_loads_reseed_demos + rpc_staff_loads_dev_reseed_demos; bumps Marsha credits on resolved id.

create or replace function public.staff_loads_reseed_demos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_marsha uuid;
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
  v_minimal boolean;
  v_flight_x uuid := 'a0edf0f0-0001-4001-8001-000000000023'::uuid;
  v_flight_y uuid := 'a0edf0f0-0001-4001-8001-000000000024'::uuid;
  v_req_d1 uuid := 'a0edf001-0001-4001-8001-0000000000d1'::uuid;
  v_req_d2 uuid := 'a0edf001-0001-4001-8001-0000000000d2'::uuid;
  v_dep_x timestamptz := '2026-10-05 18:00:00+00'::timestamptz;
  v_arr_x timestamptz := '2026-10-05 21:30:00+00'::timestamptz;
  v_date_x date := '2026-10-05'::date;
  v_dep_y timestamptz := '2026-10-06 12:00:00+00'::timestamptz;
  v_arr_y timestamptz := '2026-10-06 14:45:00+00'::timestamptz;
  v_date_y date := '2026-10-06'::date;
begin
  -- Marsha: marcus.wrightllc@gmail.com (fallback: legacy demo UUID)
  select au.id
    into v_marsha
  from auth.users au
  where lower(trim(au.email)) = lower(trim('marcus.wrightllc@gmail.com'))
  limit 1;
  if v_marsha is null then
    v_marsha := '85f152bb-4b50-44c6-9f31-74f5906abb38'::uuid;
  end if;

  if not exists (select 1 from auth.users where id = v_marsha) then
    return jsonb_build_object('ok', false, 'reason', 'no_marsha');
  end if;

  -- Robert: mtwright24@gmail.com first, then legacy handle/email heuristics, then any other user
  select au.id
    into v_robert
  from auth.users au
  where lower(trim(au.email)) = lower(trim('mtwright24@gmail.com'))
    and au.id is distinct from v_marsha
  limit 1;

  if v_robert is null then
    select p.id
      into v_robert
    from public.profiles p
    join auth.users au on au.id = p.id
    where au.id is distinct from v_marsha
      and (
        lower(coalesce(p.handle, '')) in ('robert', 'bob', 'rwalker')
        or lower(au.email) like 'robert%@%'
        or lower(au.email) like '%+robert%@%'
      )
    limit 1;
  end if;

  if v_robert is null then
    select au.id
      into v_robert
    from auth.users au
    where au.id is distinct from v_marsha
    order by au.created_at asc nulls last
    limit 1;
  end if;

  v_minimal := (v_robert is null);

  if v_robert is not null and v_robert = v_marsha then
    return jsonb_build_object('ok', false, 'reason', 'responder_same_as_marsha');
  end if;

  select count(*)::int
    into v_cnt
  from public.load_requests lr
  where coalesce(lr.options, '{}'::jsonb) @> v_demo;

  if not v_minimal and v_cnt >= 5 then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'already_seeded', 'demo_requests', v_cnt);
  end if;

  if v_minimal and v_cnt >= 4 then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'marsha_minimal_already', 'demo_requests', v_cnt);
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
  where id in (v_flight, v_flight_pri, v_flight_bad, v_flight_x, v_flight_y);

  if v_minimal then
    insert into public.user_credits (user_id, balance, priority_balance, updated_at)
    values (v_marsha, 25, 10, now())
    on conflict (user_id) do update set
      balance = greatest(public.user_credits.balance, 25),
      priority_balance = greatest(coalesce(public.user_credits.priority_balance, 0), 10),
      updated_at = now();

    update public.profiles
    set credits_balance = greatest(coalesce(credits_balance, 0), 5)
    where id = v_marsha;

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
      v_flight_x, 'B6', 'DEMO607', 'LAX', 'SEA', v_dep_x, v_arr_x, v_date_x
    )
    on conflict (airline_code, flight_number, depart_at, travel_date) do update
      set from_airport = excluded.from_airport,
          to_airport = excluded.to_airport,
          depart_at = excluded.depart_at,
          arrive_at = excluded.arrive_at,
          travel_date = excluded.travel_date;
    select nf.id into v_flight_x
    from public.nonrev_load_flights nf
    where nf.airline_code = 'B6' and nf.flight_number = 'DEMO607' and nf.depart_at = v_dep_x and nf.travel_date = v_date_x
    limit 1;

    insert into public.nonrev_load_flights (
      id, airline_code, flight_number, from_airport, to_airport, depart_at, arrive_at, travel_date
    ) values (
      v_flight_y, 'B6', 'DEMO608', 'BWI', 'TPA', v_dep_y, v_arr_y, v_date_y
    )
    on conflict (airline_code, flight_number, depart_at, travel_date) do update
      set from_airport = excluded.from_airport,
          to_airport = excluded.to_airport,
          depart_at = excluded.depart_at,
          arrive_at = excluded.arrive_at,
          travel_date = excluded.travel_date;
    select nf.id into v_flight_y
    from public.nonrev_load_flights nf
    where nf.airline_code = 'B6' and nf.flight_number = 'DEMO608' and nf.depart_at = v_dep_y and nf.travel_date = v_date_y
    limit 1;

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
    values (v_req_open, v_marsha, 'request_created', 'Demo (solo): open', 'Marsha — B6 BOS→FLL. Minimal seed (no second user in DB).');

    insert into public.load_requests (
      id, user_id, airline_code, flight_number, from_airport, to_airport, travel_date,
      depart_at, arrive_at, flight_id, status, request_kind, options, search_snapshot
    ) values (
      v_req_d1, v_marsha, 'B6', 'DEMO607', 'LAX', 'SEA', v_date_x,
      v_dep_x, v_arr_x, v_flight_x, 'open', 'standard',
      v_demo || '{"demo_slot": "open_b"}'::jsonb,
      '{}'::jsonb
    );
    insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body)
    values (v_req_d1, v_marsha, 'request_created', 'Demo (solo): open', 'Marsha — B6 LAX→SEA.');

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
    values (v_req_pri, v_marsha, 'request_created', 'Demo (solo): priority', 'Marsha — priority row for Requests section.', '{}'::jsonb);
    insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body, metadata)
    values (v_req_pri, v_marsha, 'priority_upgrade', 'Upgraded to priority', 'Seeded.', '{}'::jsonb);

    insert into public.load_requests (
      id, user_id, airline_code, flight_number, from_airport, to_airport, travel_date,
      depart_at, arrive_at, flight_id, status, request_kind, options, search_snapshot
    ) values (
      v_req_d2, v_marsha, 'B6', 'DEMO608', 'BWI', 'TPA', v_date_y,
      v_dep_y, v_arr_y, v_flight_y, 'open', 'standard',
      v_demo || '{"demo_slot": "open_c"}'::jsonb,
      '{}'::jsonb
    );
    insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body)
    values (v_req_d2, v_marsha, 'request_created', 'Demo (solo): open', 'Marsha — B6 BWI→TPA.');

    raise notice 'staff_loads_reseed_demos: marsha_only_minimal (4 requests) for %', v_marsha;
    return jsonb_build_object(
      'ok', true,
      'seeded', true,
      'mode', 'marsha_only_minimal',
      'demo_requests', 4,
      'marsha', v_marsha,
      'note', 'Add a second auth user (or set handle robert) and call again for full 5-scenario seed.'
    );
  end if;

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

  insert into public.user_credits (user_id, balance, priority_balance, updated_at)
  values (v_marsha, 25, 10, now())
  on conflict (user_id) do update set
    balance = greatest(public.user_credits.balance, 25),
    priority_balance = greatest(coalesce(public.user_credits.priority_balance, 0), 10),
    updated_at = now();

  update public.profiles
  set credits_balance = greatest(coalesce(credits_balance, 0), 5)
  where id = v_marsha;
  insert into public.user_credits (user_id, balance, priority_balance, updated_at)
  values (v_robert, 25, 10, now())
  on conflict (user_id) do update set
    balance = greatest(public.user_credits.balance, 25),
    priority_balance = greatest(coalesce(public.user_credits.priority_balance, 0), 10),
    updated_at = now();

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
  return jsonb_build_object('ok', true, 'seeded', true, 'mode', 'full', 'demo_requests', 5, 'marsha', v_marsha, 'robert', v_robert);
end
$f$;

revoke all on function public.staff_loads_reseed_demos() from public;
grant execute on function public.staff_loads_reseed_demos() to service_role;

comment on function public.staff_loads_reseed_demos() is
  'Re-apply dev Staff Loads demo data. Marsha/Robert resolved by marcus.wrightllc@gmail.com / mtwright24@gmail.com with fallbacks.';

create or replace function public.rpc_staff_loads_dev_reseed_demos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $rpc$
declare
  v_allowed uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select au.id into v_allowed from auth.users au
  where lower(trim(au.email)) = lower(trim('marcus.wrightllc@gmail.com'))
  limit 1;
  if v_allowed is null then
    v_allowed := '85f152bb-4b50-44c6-9f31-74f5906abb38'::uuid;
  end if;
  if auth.uid() is distinct from v_allowed then
    return jsonb_build_object(
      'ok', false,
      'reason', 'forbidden',
      'hint', 'Only marcus.wrightllc@gmail.com (Staff Loads demo) can call this RPC.'
    );
  end if;
  return public.staff_loads_reseed_demos();
end;
$rpc$;

revoke all on function public.rpc_staff_loads_dev_reseed_demos() from public;
grant execute on function public.rpc_staff_loads_dev_reseed_demos() to authenticated;

comment on function public.rpc_staff_loads_dev_reseed_demos() is
  'Dev: re-seed Staff Loads demos — caller must be marcus.wrightllc@gmail.com (or legacy Marsha UUID).';

do $cred$
declare
  v_m uuid;
begin
  select au.id into v_m from auth.users au
  where lower(trim(au.email)) = lower(trim('marcus.wrightllc@gmail.com'))
  limit 1;
  if v_m is null then
    v_m := '85f152bb-4b50-44c6-9f31-74f5906abb38'::uuid;
  end if;
  insert into public.user_credits (user_id, balance, priority_balance, updated_at)
  values (v_m, 25, 10, now())
  on conflict (user_id) do update set
    balance = greatest(public.user_credits.balance, 25),
    priority_balance = greatest(coalesce(public.user_credits.priority_balance, 0), 10),
    updated_at = now();
  update public.profiles
  set credits_balance = greatest(coalesce(credits_balance, 0), 5)
  where id = v_m;
end;
$cred$;

select public.staff_loads_reseed_demos() as staff_loads_reseed_demos_result;
