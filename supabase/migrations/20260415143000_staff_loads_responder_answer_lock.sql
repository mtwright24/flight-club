-- Staff Loads: responder airline gate, answer_source, extended request status, hardened lock/answer RPCs.

-- ---------------------------------------------------------------------------
-- load_answers: community vs system attribution
-- ---------------------------------------------------------------------------
alter table public.load_answers
  add column if not exists answer_source text not null default 'community';

do $$ begin
  alter table public.load_answers drop constraint if exists load_answers_answer_source_check;
  alter table public.load_answers add constraint load_answers_answer_source_check
    check (answer_source in ('community', 'system'));
exception when others then null; end $$;

-- ---------------------------------------------------------------------------
-- load_requests: allow stale (future reopen / refresh flows)
-- ---------------------------------------------------------------------------
do $$ begin
  alter table public.load_requests drop constraint if exists load_requests_status_check;
  alter table public.load_requests add constraint load_requests_status_check
    check (status in ('open', 'answered', 'closed', 'stale'));
exception when others then null; end $$;

-- ---------------------------------------------------------------------------
-- RPC: try lock — airline access gate (no rows = may answer any; rows = must match)
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

  if exists (select 1 from public.user_airline_access where user_id = uid) then
    if not exists (
      select 1 from public.user_airline_access
      where user_id = uid and upper(airline_code) = upper(trim(r.airline_code)))
    then
      return jsonb_build_object('ok', false, 'error', 'airline_not_allowed');
    end if;
  end if;

  if r.locked_by is not null and r.lock_expires_at is not null and r.lock_expires_at >= now() and r.locked_by <> uid then
    return jsonb_build_object('ok', false, 'error', 'locked', 'locked_by', r.locked_by);
  end if;

  update public.load_requests
  set locked_by = uid, locked_at = now(), lock_expires_at = now() + interval '5 minutes'
  where id = p_request_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: submit answer — airline gate + answer_source column
-- ---------------------------------------------------------------------------
drop function if exists public.rpc_staff_loads_submit_answer(uuid, text, text, int, jsonb, int, jsonb);

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
  aid uuid;
  src text := coalesce(nullif(trim(p_answer_source), ''), 'community');
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if src not in ('community', 'system') then src := 'community'; end if;

  perform public.rpc_staff_loads_sweep_locks();
  select * into r from public.load_requests where id = p_request_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.status <> 'open' then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if r.user_id = uid then return jsonb_build_object('ok', false, 'error', 'own_request'); end if;

  if exists (select 1 from public.user_airline_access where user_id = uid) then
    if not exists (
      select 1 from public.user_airline_access
      where user_id = uid and upper(airline_code) = upper(trim(r.airline_code)))
    then
      return jsonb_build_object('ok', false, 'error', 'airline_not_allowed');
    end if;
  end if;

  if r.locked_by is distinct from uid then
    return jsonb_build_object('ok', false, 'error', 'not_locked_by_you');
  end if;

  insert into public.load_answers (
    request_id, user_id, load_level, notes, as_of,
    open_seats_total, open_seats_by_cabin, nonrev_listed_total, nonrev_by_cabin,
    answer_source
  ) values (
    p_request_id, uid, p_load_level, nullif(trim(p_notes), ''), now(),
    p_open_seats_total, coalesce(p_open_seats_by_cabin, '{}'::jsonb),
    p_nonrev_listed_total, coalesce(p_nonrev_by_cabin, '{}'::jsonb),
    src
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
