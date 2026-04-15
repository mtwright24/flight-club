-- Staff Loads marketplace: extend requests/answers, timeline, locks, airline access, pins, wallet priority pool.

-- ---------------------------------------------------------------------------
-- Extend load_requests
-- ---------------------------------------------------------------------------
alter table public.load_requests
  add column if not exists flight_id uuid references public.nonrev_load_flights(id) on delete set null;
alter table public.load_requests
  add column if not exists flight_number text;
alter table public.load_requests
  add column if not exists depart_at timestamptz;
alter table public.load_requests
  add column if not exists arrive_at timestamptz;
alter table public.load_requests
  add column if not exists aircraft_type text;
alter table public.load_requests
  add column if not exists request_kind text not null default 'standard';
alter table public.load_requests
  add column if not exists latest_answer_at timestamptz;
alter table public.load_requests
  add column if not exists locked_by uuid references auth.users(id) on delete set null;
alter table public.load_requests
  add column if not exists locked_at timestamptz;
alter table public.load_requests
  add column if not exists lock_expires_at timestamptz;
alter table public.load_requests
  add column if not exists pinned boolean not null default false;
alter table public.load_requests
  add column if not exists enable_status_updates boolean not null default false;
alter table public.load_requests
  add column if not exists enable_auto_updates boolean not null default false;
alter table public.load_requests
  add column if not exists search_snapshot jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.load_requests drop constraint if exists load_requests_request_kind_check;
  alter table public.load_requests add constraint load_requests_request_kind_check
    check (request_kind in ('standard', 'priority'));
exception when others then null; end $$;

do $$ begin
  alter table public.load_requests drop constraint if exists load_requests_status_check;
  alter table public.load_requests add constraint load_requests_status_check
    check (status in ('open', 'answered', 'closed'));
exception when others then null; end $$;

create index if not exists idx_load_requests_flight_id on public.load_requests(flight_id);
create index if not exists idx_load_requests_locked on public.load_requests(locked_by) where locked_by is not null;
create index if not exists idx_load_requests_kind_status on public.load_requests(request_kind, status);

-- ---------------------------------------------------------------------------
-- Extend load_answers (detailed loads)
-- ---------------------------------------------------------------------------
alter table public.load_answers
  add column if not exists open_seats_total integer;
alter table public.load_answers
  add column if not exists open_seats_by_cabin jsonb;
alter table public.load_answers
  add column if not exists nonrev_listed_total integer;
alter table public.load_answers
  add column if not exists nonrev_by_cabin jsonb;

-- ---------------------------------------------------------------------------
-- Timeline (comments, loads updates, status, gate, system)
-- ---------------------------------------------------------------------------
create table if not exists public.load_request_timeline (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.load_requests(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'comment', 'loads_update', 'status_update', 'gate_change', 'answer', 'request_created',
    'priority_upgrade', 'report_inaccurate', 'pin', 'settings', 'system'
  )),
  title text,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_load_request_timeline_request on public.load_request_timeline(request_id, created_at desc);

-- ---------------------------------------------------------------------------
-- User airline access (which carriers a responder can answer for)
-- ---------------------------------------------------------------------------
create table if not exists public.user_airline_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  airline_code text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, airline_code)
);

-- ---------------------------------------------------------------------------
-- Airline notes (standby / policy snippets)
-- ---------------------------------------------------------------------------
create table if not exists public.airline_notes (
  airline_code text primary key,
  title text not null default 'Standby & loads',
  body text not null,
  updated_at timestamptz not null default now()
);

insert into public.airline_notes (airline_code, title, body)
values
  ('B6', 'JetBlue standby', 'Non-rev travel is subject to space-available seating. Verify loads in official crew tools before listing.'),
  ('AA', 'American Airlines', 'Check AA internal loads systems. Community numbers are estimates only.'),
  ('DL', 'Delta Air Lines', 'Verify in Fly Delta Crew / internal tools. Gate and standby counts change quickly.'),
  ('UA', 'United Airlines', 'Use United internal resources to confirm standby counts.'),
  ('WN', 'Southwest', 'Open seating — loads may differ from listed standby counts.')
on conflict (airline_code) do nothing;

-- ---------------------------------------------------------------------------
-- Pins (per-user)
-- ---------------------------------------------------------------------------
create table if not exists public.pinned_load_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null references public.load_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

-- ---------------------------------------------------------------------------
-- Wallet: priority pool
-- ---------------------------------------------------------------------------
alter table public.user_credits
  add column if not exists priority_balance integer not null default 0;

alter table public.credits_ledger
  add column if not exists request_id uuid references public.load_requests(id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS new tables
-- ---------------------------------------------------------------------------
alter table public.load_request_timeline enable row level security;
alter table public.user_airline_access enable row level security;
alter table public.airline_notes enable row level security;
alter table public.pinned_load_requests enable row level security;

drop policy if exists "timeline_select_auth" on public.load_request_timeline;
create policy "timeline_select_auth" on public.load_request_timeline for select to authenticated using (true);

drop policy if exists "timeline_insert_own_comment" on public.load_request_timeline;
create policy "timeline_insert_own_comment" on public.load_request_timeline for insert to authenticated
  with check (auth.uid() = actor_user_id and event_type = 'comment');

-- Optional client-side inserts for debugging (RPC is preferred for answers/system events)
drop policy if exists "timeline_insert_owner_events" on public.load_request_timeline;
create policy "timeline_insert_owner_events" on public.load_request_timeline for insert to authenticated
  with check (
    auth.uid() = actor_user_id
    and exists (select 1 from public.load_requests r where r.id = request_id and r.user_id = auth.uid())
    and event_type in ('loads_update', 'status_update', 'gate_change', 'report_inaccurate')
  );

drop policy if exists "airline_notes_read" on public.airline_notes;
create policy "airline_notes_read" on public.airline_notes for select to authenticated using (true);

drop policy if exists "user_airline_access_own" on public.user_airline_access;
create policy "user_airline_access_own" on public.user_airline_access for select using (auth.uid() = user_id);
create policy "user_airline_access_insert_own" on public.user_airline_access for insert with check (auth.uid() = user_id);
create policy "user_airline_access_delete_own" on public.user_airline_access for delete using (auth.uid() = user_id);

drop policy if exists "pins_own" on public.pinned_load_requests;
create policy "pins_select_own" on public.pinned_load_requests for select using (auth.uid() = user_id);
create policy "pins_insert_own" on public.pinned_load_requests for insert with check (auth.uid() = user_id);
create policy "pins_delete_own" on public.pinned_load_requests for delete using (auth.uid() = user_id);

-- Allow responders to update lock columns on open requests (superseded by RPC — keep restrictive)
drop policy if exists "load_requests_update_own" on public.load_requests;
create policy "load_requests_update_own" on public.load_requests for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "load_requests_update_lock_fields" on public.load_requests;
create policy "load_requests_update_lock_fields" on public.load_requests for update to authenticated
  using (
    status = 'open'
    and (
      locked_by is null
      or lock_expires_at < now()
      or locked_by = auth.uid()
    )
  )
  with check (
    status = 'open'
    and user_id <> auth.uid()
  );

-- Postgres: two UPDATE policies OR — actually both apply as OR in PG RLS for UPDATE.
-- Simpler: rely on RPC for lock/answer; remove second policy to avoid overlap confusion.
drop policy if exists "load_requests_update_lock_fields" on public.load_requests;

-- ---------------------------------------------------------------------------
-- RPC: sweep expired locks
-- ---------------------------------------------------------------------------
create or replace function public.rpc_staff_loads_sweep_locks()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.load_requests
  set locked_by = null, locked_at = null, lock_expires_at = null
  where lock_expires_at is not null and lock_expires_at < now();
end;
$$;
grant execute on function public.rpc_staff_loads_sweep_locks() to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: try acquire lock (5 min)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_staff_loads_try_lock(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.load_requests%rowtype;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  perform public.rpc_staff_loads_sweep_locks();
  select * into r from public.load_requests where id = p_request_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.status <> 'open' then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if r.user_id = uid then return jsonb_build_object('ok', false, 'error', 'own_request'); end if;
  if r.locked_by is not null and r.lock_expires_at is not null and r.lock_expires_at >= now() and r.locked_by <> uid then
    return jsonb_build_object('ok', false, 'error', 'locked', 'locked_by', r.locked_by);
  end if;
  update public.load_requests
  set locked_by = uid, locked_at = now(), lock_expires_at = now() + interval '5 minutes'
  where id = p_request_id;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.rpc_staff_loads_try_lock(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: release lock (abandon or after answer)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_staff_loads_release_lock(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.load_requests
  set locked_by = null, locked_at = null, lock_expires_at = null
  where id = p_request_id and locked_by = auth.uid();
end;
$$;
grant execute on function public.rpc_staff_loads_release_lock(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: submit answer + unlock + mark answered + timeline
-- ---------------------------------------------------------------------------
create or replace function public.rpc_staff_loads_submit_answer(
  p_request_id uuid,
  p_load_level text,
  p_notes text,
  p_open_seats_total int,
  p_open_seats_by_cabin jsonb,
  p_nonrev_listed_total int,
  p_nonrev_by_cabin jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.load_requests%rowtype;
  aid uuid;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  perform public.rpc_staff_loads_sweep_locks();
  select * into r from public.load_requests where id = p_request_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.status <> 'open' then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if r.user_id = uid then return jsonb_build_object('ok', false, 'error', 'own_request'); end if;
  if r.locked_by is distinct from uid then
    return jsonb_build_object('ok', false, 'error', 'not_locked_by_you');
  end if;

  insert into public.load_answers (
    request_id, user_id, load_level, notes, as_of,
    open_seats_total, open_seats_by_cabin, nonrev_listed_total, nonrev_by_cabin
  ) values (
    p_request_id, uid, p_load_level, nullif(trim(p_notes), ''), now(),
    p_open_seats_total, p_open_seats_by_cabin, p_nonrev_listed_total, p_nonrev_by_cabin
  ) returning id into aid;

  update public.load_requests
  set
    status = 'answered',
    latest_answer_at = now(),
    locked_by = null,
    locked_at = null,
    lock_expires_at = null
  where id = p_request_id;

  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body, metadata)
  values (
    p_request_id, uid, 'answer', 'Loads submitted', coalesce(nullif(trim(p_notes), ''), 'New loads information.'),
    jsonb_build_object('answer_id', aid)
  );

  return jsonb_build_object('ok', true, 'answer_id', aid);
end;
$$;
grant execute on function public.rpc_staff_loads_submit_answer(uuid, text, text, int, jsonb, int, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: post one or more requests + spend credits (standard=1, priority=2)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_staff_loads_post_requests(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  arr jsonb := coalesce(payload->'requests', '[]'::jsonb);
  elem jsonb;
  total int := 0;
  kind text;
  bal int;
  fid uuid;
  ins_id uuid;
  ids uuid[] := '{}';
  v_airline text;
  v_from text;
  v_to text;
  v_date date;
  v_fn text;
  v_dep timestamptz;
  v_arr timestamptz;
  v_ac text;
  rows_upd int;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  for elem in select * from jsonb_array_elements(arr)
  loop
    kind := coalesce(elem->>'request_kind', 'standard');
    total := total + case when kind = 'priority' then 2 else 1 end;
  end loop;
  if total <= 0 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;

  insert into public.user_credits (user_id, balance, updated_at)
  values (uid, 0, now())
  on conflict (user_id) do nothing;

  select coalesce(balance, 0) into bal from public.user_credits where user_id = uid;
  if bal < total then
    return jsonb_build_object('ok', false, 'error', 'insufficient_credits', 'need', total, 'have', bal);
  end if;

  update public.user_credits set balance = balance - total, updated_at = now() where user_id = uid and balance >= total;
  get diagnostics rows_upd = row_count;
  if rows_upd = 0 then return jsonb_build_object('ok', false, 'error', 'insufficient_credits'); end if;

  insert into public.credits_ledger (user_id, amount, reason, source)
  values (uid, -total, 'staff_loads_post', 'staff_loads');

  update public.profiles
  set credits_balance = greatest(0, coalesce(credits_balance, 0) - total)
  where id = uid;

  for elem in select * from jsonb_array_elements(arr)
  loop
    kind := coalesce(elem->>'request_kind', 'standard');
    v_airline := elem->>'airline_code';
    v_from := elem->>'from_airport';
    v_to := elem->>'to_airport';
    v_date := (elem->>'travel_date')::date;
    v_fn := elem->>'flight_number';
    v_dep := (elem->>'depart_at')::timestamptz;
    v_arr := (elem->>'arrive_at')::timestamptz;
    v_ac := elem->>'aircraft_type';
    begin
      fid := (elem->>'flight_id')::uuid;
    exception when others then
      fid := null;
    end;

    insert into public.load_requests (
      user_id, airline_code, from_airport, to_airport, travel_date, options, status,
      flight_id, flight_number, depart_at, arrive_at, aircraft_type, request_kind, search_snapshot
    ) values (
      uid, v_airline, v_from, v_to, v_date, coalesce(elem->'search_snapshot', '{}'::jsonb), 'open',
      fid, v_fn, v_dep, v_arr, v_ac, kind, coalesce(payload->'search_snapshot', '{}'::jsonb)
    ) returning id into ins_id;

    ids := array_append(ids, ins_id);
    insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body)
    values (ins_id, uid, 'request_created', 'Request posted', format('%s %s → %s on %s', v_airline, v_from, v_to, v_date));
  end loop;

  return jsonb_build_object('ok', true, 'request_ids', to_jsonb(ids), 'spent', total);
end;
$$;
grant execute on function public.rpc_staff_loads_post_requests(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: upgrade to priority (+1 credit if was standard)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_staff_loads_upgrade_priority(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.load_requests%rowtype;
  bal int;
begin
  select * into r from public.load_requests where id = p_request_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.user_id <> uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if r.request_kind = 'priority' then return jsonb_build_object('ok', true, 'already', true); end if;

  select coalesce(balance, 0) into bal from public.user_credits where user_id = uid;
  if bal < 1 then return jsonb_build_object('ok', false, 'error', 'insufficient_credits'); end if;

  update public.user_credits set balance = balance - 1, updated_at = now() where user_id = uid and balance >= 1;
  update public.load_requests set request_kind = 'priority' where id = p_request_id;
  insert into public.credits_ledger (user_id, amount, reason, source, request_id)
  values (uid, -1, 'staff_loads_priority_upgrade', 'staff_loads', p_request_id);
  update public.profiles set credits_balance = greatest(0, coalesce(credits_balance, 0) - 1) where id = uid;

  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body)
  values (p_request_id, uid, 'priority_upgrade', 'Upgraded to priority', 'This request is now priority.');

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.rpc_staff_loads_upgrade_priority(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: add timeline comment (request owner or anyone for open community thread)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_staff_loads_add_comment(p_request_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  b text := trim(coalesce(p_body, ''));
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if length(b) < 1 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  insert into public.load_request_timeline (request_id, actor_user_id, event_type, body)
  values (p_request_id, uid, 'comment', b);
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.rpc_staff_loads_add_comment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: delete own open request + refund if no answers
-- ---------------------------------------------------------------------------
create or replace function public.rpc_staff_loads_delete_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.load_requests%rowtype;
  acnt int;
  refund int;
begin
  select * into r from public.load_requests where id = p_request_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.user_id <> uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select count(*) into acnt from public.load_answers where request_id = p_request_id;
  if acnt > 0 then return jsonb_build_object('ok', false, 'error', 'has_answers'); end if;
  if r.status <> 'open' then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;

  refund := case when r.request_kind = 'priority' then 2 else 1 end;
  delete from public.load_requests where id = p_request_id;

  insert into public.user_credits (user_id, balance, updated_at)
  values (uid, refund, now())
  on conflict (user_id) do update set balance = public.user_credits.balance + excluded.balance, updated_at = now();

  insert into public.credits_ledger (user_id, amount, reason, source, request_id)
  values (uid, refund, 'staff_loads_delete_refund', 'staff_loads', p_request_id);

  update public.profiles set credits_balance = coalesce(credits_balance, 0) + refund where id = uid;

  return jsonb_build_object('ok', true, 'refunded', refund);
end;
$$;
grant execute on function public.rpc_staff_loads_delete_request(uuid) to authenticated;
