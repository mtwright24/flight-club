-- Staff Loads: canonical load_request_locks table, multi-answer while open/answered,
-- reopen stale → open, mark answered → stale, sweep sync + optional pg_cron, is_latest on answers.

-- ---------------------------------------------------------------------------
-- Lock history table (one active row per request via partial unique index)
-- ---------------------------------------------------------------------------
create table if not exists public.load_request_locks (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.load_requests(id) on delete cascade,
  locked_by_user_id uuid not null references auth.users(id) on delete cascade,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  release_reason text
);

create index if not exists idx_load_request_locks_request on public.load_request_locks(request_id);
create index if not exists idx_load_request_locks_expires_active
  on public.load_request_locks(expires_at)
  where released_at is null;

drop index if exists public.load_request_locks_one_active;
create unique index load_request_locks_one_active
  on public.load_request_locks(request_id)
  where released_at is null;

comment on table public.load_request_locks is 'Staff Loads answer locks; load_requests.locked_* mirrors the active row for clients.';

revoke all on public.load_request_locks from public;
revoke all on public.load_request_locks from anon;
revoke all on public.load_request_locks from authenticated;

alter table public.load_request_locks enable row level security;

-- ---------------------------------------------------------------------------
-- load_answers: latest flag for UI (one true per request after each submit)
-- ---------------------------------------------------------------------------
alter table public.load_answers
  add column if not exists is_latest boolean not null default false;

update public.load_answers a
set is_latest = (a.id = x.latest_id)
from (
  select distinct on (request_id) id as latest_id, request_id
  from public.load_answers
  order by request_id, created_at desc, id desc
) x
where a.request_id = x.request_id;

-- ---------------------------------------------------------------------------
-- Migrate active denormalized locks into load_request_locks (one-time)
-- ---------------------------------------------------------------------------
insert into public.load_request_locks (request_id, locked_by_user_id, locked_at, expires_at, released_at, release_reason)
select lr.id, lr.locked_by, lr.locked_at, lr.lock_expires_at, null, null
from public.load_requests lr
where lr.locked_by is not null
  and lr.lock_expires_at is not null
  and lr.lock_expires_at >= now()
  and not exists (
    select 1 from public.load_request_locks lk
    where lk.request_id = lr.id and lk.released_at is null
  );

-- ---------------------------------------------------------------------------
-- RPC: sweep expired locks (table + mirror columns + orphans)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_staff_loads_sweep_locks()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with expired as (
    update public.load_request_locks lk
    set released_at = now(), release_reason = 'expired'
    where lk.released_at is null and lk.expires_at < now()
    returning lk.request_id
  )
  update public.load_requests lr
  set locked_by = null, locked_at = null, lock_expires_at = null
  from expired e
  where lr.id = e.request_id;

  update public.load_requests lr
  set locked_by = null, locked_at = null, lock_expires_at = null
  where lr.locked_by is not null
    and not exists (
      select 1 from public.load_request_locks lk
      where lk.request_id = lr.id and lk.released_at is null
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: try acquire lock (uses load_request_locks + mirrors load_requests)
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
  lk public.load_request_locks%rowtype;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  perform public.rpc_staff_loads_sweep_locks();
  select * into r from public.load_requests where id = p_request_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.status not in ('open', 'answered') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if r.user_id = uid then return jsonb_build_object('ok', false, 'error', 'own_request'); end if;

  if exists (select 1 from public.user_airline_access where user_id = uid) then
    if not exists (
      select 1 from public.user_airline_access
      where user_id = uid and upper(airline_code) = upper(trim(r.airline_code)))
    then
      return jsonb_build_object('ok', false, 'error', 'airline_not_allowed');
    end if;
  end if;

  select * into lk from public.load_request_locks
  where request_id = p_request_id and released_at is null
  for update;

  if found then
    if lk.expires_at >= now() and lk.locked_by_user_id <> uid then
      return jsonb_build_object('ok', false, 'error', 'locked', 'locked_by', lk.locked_by_user_id);
    end if;
    if lk.expires_at >= now() and lk.locked_by_user_id = uid then
      update public.load_request_locks
      set expires_at = now() + interval '5 minutes'
      where id = lk.id;
      update public.load_requests
      set lock_expires_at = now() + interval '5 minutes'
      where id = p_request_id;
      return jsonb_build_object('ok', true);
    end if;
  end if;

  begin
    insert into public.load_request_locks (request_id, locked_by_user_id, locked_at, expires_at)
    values (p_request_id, uid, now(), now() + interval '5 minutes');
  exception when unique_violation then
    select * into lk from public.load_request_locks
    where request_id = p_request_id and released_at is null;
    if found and lk.expires_at >= now() and lk.locked_by_user_id <> uid then
      return jsonb_build_object('ok', false, 'error', 'locked', 'locked_by', lk.locked_by_user_id);
    end if;
    return jsonb_build_object('ok', false, 'error', 'lock_race');
  end;

  update public.load_requests
  set locked_by = uid, locked_at = now(), lock_expires_at = now() + interval '5 minutes'
  where id = p_request_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: release lock (abandon)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_staff_loads_release_lock(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.load_request_locks
  set released_at = now(), release_reason = 'manual'
  where request_id = p_request_id
    and released_at is null
    and locked_by_user_id = auth.uid();

  update public.load_requests
  set locked_by = null, locked_at = null, lock_expires_at = null
  where id = p_request_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: submit answer — multiple answers while open/answered; is_latest; release lock row
-- ---------------------------------------------------------------------------
drop function if exists public.rpc_staff_loads_submit_answer(uuid, text, text, int, jsonb, int, jsonb);
drop function if exists public.rpc_staff_loads_submit_answer(uuid, text, text, int, jsonb, int, jsonb, text);

create or replace function public.rpc_staff_loads_submit_answer(
  p_request_id uuid,
  p_load_level text,
  p_notes text,
  p_open_seats_total int,
  p_open_seats_by_cabin jsonb,
  p_nonrev_listed_total int,
  p_nonrev_by_cabin jsonb,
  p_answer_source text default 'community'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.load_requests%rowtype;
  lk public.load_request_locks%rowtype;
  aid uuid;
  src text := coalesce(nullif(trim(p_answer_source), ''), 'community');
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if src not in ('community', 'system') then src := 'community'; end if;

  perform public.rpc_staff_loads_sweep_locks();
  select * into r from public.load_requests where id = p_request_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.status not in ('open', 'answered') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if r.user_id = uid then return jsonb_build_object('ok', false, 'error', 'own_request'); end if;

  if exists (select 1 from public.user_airline_access where user_id = uid) then
    if not exists (
      select 1 from public.user_airline_access
      where user_id = uid and upper(airline_code) = upper(trim(r.airline_code)))
    then
      return jsonb_build_object('ok', false, 'error', 'airline_not_allowed');
    end if;
  end if;

  select * into lk from public.load_request_locks
  where request_id = p_request_id and released_at is null
  for update;

  if not found or lk.locked_by_user_id is distinct from uid then
    return jsonb_build_object('ok', false, 'error', 'not_locked_by_you');
  end if;

  update public.load_request_locks
  set released_at = now(), release_reason = 'submitted'
  where id = lk.id;

  update public.load_answers set is_latest = false where request_id = p_request_id;

  insert into public.load_answers (
    request_id, user_id, load_level, notes, as_of,
    open_seats_total, open_seats_by_cabin, nonrev_listed_total, nonrev_by_cabin,
    answer_source, is_latest
  ) values (
    p_request_id, uid, p_load_level, nullif(trim(p_notes), ''), now(),
    p_open_seats_total, coalesce(p_open_seats_by_cabin, '{}'::jsonb),
    p_nonrev_listed_total, coalesce(p_nonrev_by_cabin, '{}'::jsonb),
    src, true
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
    jsonb_build_object('answer_id', aid, 'answer_source', src)
  );

  return jsonb_build_object('ok', true, 'answer_id', aid);
end;
$$;

grant execute on function public.rpc_staff_loads_submit_answer(uuid, text, text, int, jsonb, int, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: requester marks answered request as stale (needs fresh loads)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_staff_loads_mark_stale(p_request_id uuid)
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
  select * into r from public.load_requests where id = p_request_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.user_id <> uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if r.status <> 'answered' then return jsonb_build_object('ok', false, 'error', 'bad_status'); end if;

  update public.load_request_locks
  set released_at = now(), release_reason = 'manual'
  where request_id = p_request_id and released_at is null;

  update public.load_requests
  set locked_by = null, locked_at = null, lock_expires_at = null
  where id = p_request_id;

  update public.load_requests set status = 'stale' where id = p_request_id;
  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body)
  values (p_request_id, uid, 'status_update', 'Marked stale', 'Requester indicated loads may need a refresh.');
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.rpc_staff_loads_mark_stale(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: requester reopens stale → open (responders can answer again)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_staff_loads_reopen_stale(p_request_id uuid)
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
  select * into r from public.load_requests where id = p_request_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.user_id <> uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if r.status <> 'stale' then return jsonb_build_object('ok', false, 'error', 'not_stale'); end if;

  update public.load_request_locks
  set released_at = now(), release_reason = 'manual'
  where request_id = p_request_id and released_at is null;

  update public.load_requests
  set locked_by = null, locked_at = null, lock_expires_at = null
  where id = p_request_id;

  update public.load_requests set status = 'open' where id = p_request_id;
  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body)
  values (p_request_id, uid, 'status_update', 'Reopened', 'Request is open for new load reports.');
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.rpc_staff_loads_reopen_stale(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Optional: pg_cron every minute to sweep locks (re-run safe: ignores failures)
-- ---------------------------------------------------------------------------
comment on function public.rpc_staff_loads_sweep_locks() is
  'Expires rows in load_request_locks and clears load_requests mirror. Also invoked by pg_cron job staff_loads_sweep_locks when extension is present.';

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule(
        'staff_loads_sweep_locks',
        '* * * * *',
        'select public.rpc_staff_loads_sweep_locks()'
      );
    exception
      when duplicate_object then null;
      when undefined_table then null;
      when others then null;
    end;
  end if;
end
$cron$;
