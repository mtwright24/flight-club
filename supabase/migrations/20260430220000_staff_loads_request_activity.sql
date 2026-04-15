-- Staff Loads: request comments table, status updates, inaccuracy reports,
-- refresh_requested timeline + column, RPCs, timeline constraint refresh.

-- ---------------------------------------------------------------------------
-- load_requests: refresh signal (inaccurate report / explicit refresh)
-- ---------------------------------------------------------------------------
alter table public.load_requests
  add column if not exists refresh_requested_at timestamptz;

create index if not exists idx_load_requests_refresh_requested_at
  on public.load_requests(refresh_requested_at desc)
  where refresh_requested_at is not null;

-- ---------------------------------------------------------------------------
-- Comments (canonical; legacy timeline comment rows migrated away)
-- ---------------------------------------------------------------------------
create table if not exists public.load_request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.load_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_load_request_comments_request_active
  on public.load_request_comments(request_id, created_at desc)
  where deleted_at is null;

create or replace function public.touch_load_request_comments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_load_request_comments_updated_at on public.load_request_comments;
create trigger trg_load_request_comments_updated_at
  before update on public.load_request_comments
  for each row execute procedure public.touch_load_request_comments_updated_at();

-- ---------------------------------------------------------------------------
-- Structured status / ops updates (manual; timeline for stale/reopen stays)
-- ---------------------------------------------------------------------------
create table if not exists public.load_request_status_updates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.load_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.load_request_status_updates drop constraint if exists load_request_status_updates_kind_check;
  alter table public.load_request_status_updates add constraint load_request_status_updates_kind_check
    check (kind in ('gate_change', 'terminal', 'flight_status', 'dep_arr', 'ops_note'));
exception when others then null; end $$;

create index if not exists idx_load_request_status_updates_request
  on public.load_request_status_updates(request_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Inaccurate loads reports (latest answer flagged by community)
-- ---------------------------------------------------------------------------
create table if not exists public.load_answer_inaccuracy_reports (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.load_requests(id) on delete cascade,
  answer_id uuid not null references public.load_answers(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (answer_id, reporter_user_id)
);

create index if not exists idx_load_answer_inaccuracy_request
  on public.load_answer_inaccuracy_reports(request_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Timeline: allow refresh_requested; migrate comments out of timeline
-- ---------------------------------------------------------------------------
alter table public.load_request_timeline drop constraint if exists load_request_timeline_event_type_check;
alter table public.load_request_timeline add constraint load_request_timeline_event_type_check
  check (event_type in (
    'comment', 'loads_update', 'status_update', 'gate_change', 'answer', 'request_created',
    'priority_upgrade', 'report_inaccurate', 'pin', 'settings', 'system', 'refresh_requested'
  ));

insert into public.load_request_comments (request_id, user_id, body, created_at, updated_at)
select t.request_id, t.actor_user_id, trim(t.body), t.created_at, t.created_at
from public.load_request_timeline t
where t.event_type = 'comment'
  and t.actor_user_id is not null
  and t.body is not null
  and length(trim(t.body)) > 0
  and not exists (
    select 1 from public.load_request_comments c
    where c.request_id = t.request_id
      and c.user_id = t.actor_user_id
      and c.body = trim(t.body)
      and c.created_at = t.created_at
  );

delete from public.load_request_timeline where event_type = 'comment';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.load_request_comments enable row level security;
alter table public.load_request_status_updates enable row level security;
alter table public.load_answer_inaccuracy_reports enable row level security;

drop policy if exists "load_request_comments_select" on public.load_request_comments;
create policy "load_request_comments_select" on public.load_request_comments
  for select to authenticated using (true);

drop policy if exists "load_request_comments_insert_own" on public.load_request_comments;
create policy "load_request_comments_insert_own" on public.load_request_comments
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "load_request_comments_update_own" on public.load_request_comments;
create policy "load_request_comments_update_own" on public.load_request_comments
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "load_request_status_updates_select" on public.load_request_status_updates;
create policy "load_request_status_updates_select" on public.load_request_status_updates
  for select to authenticated using (true);

drop policy if exists "load_answer_inaccuracy_select" on public.load_answer_inaccuracy_reports;
create policy "load_answer_inaccuracy_select" on public.load_answer_inaccuracy_reports
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- RPC: add comment → load_request_comments
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
  cid uuid;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if length(b) < 1 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if not exists (select 1 from public.load_requests where id = p_request_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  insert into public.load_request_comments (request_id, user_id, body)
  values (p_request_id, uid, b)
  returning id into cid;

  return jsonb_build_object('ok', true, 'comment_id', cid);
end;
$$;
grant execute on function public.rpc_staff_loads_add_comment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: status / ops update (gated for non-owners by enable_status_updates)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_staff_loads_add_status_update(
  p_request_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.load_requests%rowtype;
  k text := lower(trim(coalesce(p_kind, '')));
  b text := trim(coalesce(p_body, ''));
  sid uuid;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if length(b) < 1 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if k not in ('gate_change', 'terminal', 'flight_status', 'dep_arr', 'ops_note') then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;

  select * into r from public.load_requests where id = p_request_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if r.user_id is distinct from uid and coalesce(r.enable_status_updates, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'status_updates_disabled');
  end if;

  insert into public.load_request_status_updates (request_id, user_id, kind, title, body, metadata)
  values (
    p_request_id,
    uid,
    k,
    nullif(trim(coalesce(p_title, '')), ''),
    b,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into sid;

  return jsonb_build_object('ok', true, 'status_update_id', sid);
end;
$$;
grant execute on function public.rpc_staff_loads_add_status_update(uuid, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: requester asks community for refresh (+ optional note as comment)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_staff_loads_request_refresh(p_request_id uuid, p_message text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.load_requests%rowtype;
  m text := trim(coalesce(p_message, ''));
  cid uuid := null;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  select * into r from public.load_requests where id = p_request_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.user_id <> uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  update public.load_requests set refresh_requested_at = now() where id = p_request_id;

  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body, metadata)
  values (
    p_request_id,
    uid,
    'refresh_requested',
    'Refresh requested',
    case when length(m) > 0 then m else 'Requester asked for updated loads.' end,
    '{}'::jsonb
  );

  if length(m) > 0 then
    insert into public.load_request_comments (request_id, user_id, body)
    values (p_request_id, uid, m)
    returning id into cid;
    return jsonb_build_object('ok', true, 'comment_id', cid);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.rpc_staff_loads_request_refresh(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: report latest loads as inaccurate
-- ---------------------------------------------------------------------------
create or replace function public.rpc_staff_loads_report_inaccurate(
  p_request_id uuid,
  p_answer_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.load_requests%rowtype;
  a public.load_answers%rowtype;
  rid uuid;
  rs text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;

  select * into r from public.load_requests where id = p_request_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  select * into a from public.load_answers
  where id = p_answer_id and request_id = p_request_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'answer_not_found'); end if;
  if coalesce(a.is_latest, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'not_latest_answer');
  end if;

  insert into public.load_answer_inaccuracy_reports (request_id, answer_id, reporter_user_id, reason)
  values (p_request_id, p_answer_id, uid, rs)
  on conflict (answer_id, reporter_user_id) do nothing
  returning id into rid;

  if rid is null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  update public.load_requests set refresh_requested_at = now() where id = p_request_id;

  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body, metadata)
  values (
    p_request_id,
    uid,
    'report_inaccurate',
    'Loads reported inaccurate',
    coalesce(rs, 'A crew member flagged the latest loads.'),
    jsonb_build_object('answer_id', p_answer_id, 'report_id', rid)
  );

  return jsonb_build_object('ok', true, 'report_id', rid);
end;
$$;
grant execute on function public.rpc_staff_loads_report_inaccurate(uuid, uuid, text) to authenticated;
