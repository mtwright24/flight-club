-- Staff Loads: priority upgrade timestamp, permission-aware request list RPC.

-- ---------------------------------------------------------------------------
-- load_requests: when request was upgraded to priority
-- ---------------------------------------------------------------------------
alter table public.load_requests
  add column if not exists priority_upgraded_at timestamptz;

create index if not exists idx_load_requests_priority_upgraded_at
  on public.load_requests(priority_upgraded_at desc)
  where priority_upgraded_at is not null;

-- ---------------------------------------------------------------------------
-- RPC: upgrade to priority — record priority_upgraded_at
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

  insert into public.user_credits (user_id, balance, updated_at)
  values (uid, 0, now())
  on conflict (user_id) do nothing;

  update public.user_credits set balance = balance - 1, updated_at = now() where user_id = uid and balance >= 1;
  if not FOUND then return jsonb_build_object('ok', false, 'error', 'insufficient_credits'); end if;

  update public.load_requests
  set request_kind = 'priority', priority_upgraded_at = now()
  where id = p_request_id;

  insert into public.credits_ledger (user_id, amount, reason, source, request_id)
  values (uid, -1, 'staff_loads_priority_upgrade', 'staff_loads', p_request_id);
  update public.profiles set credits_balance = greatest(0, coalesce(credits_balance, 0) - 1) where id = uid;

  insert into public.load_request_timeline (request_id, actor_user_id, event_type, title, body)
  values (p_request_id, uid, 'priority_upgrade', 'Upgraded to priority', 'This request is now priority.');

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: list requests for Requests tab (own rows always; others gated by airline access)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_staff_loads_list_requests(p_tab text)
returns setof public.load_requests
language sql
stable
security definer
set search_path = public
as $$
  select r.*
  from public.load_requests r
  where
    (
      r.user_id = auth.uid()
      or (
        not exists (select 1 from public.user_airline_access u where u.user_id = auth.uid())
        or exists (
          select 1
          from public.user_airline_access u
          where u.user_id = auth.uid()
            and upper(u.airline_code) = upper(trim(r.airline_code))
        )
      )
    )
    and (
      (p_tab = 'open' and r.status in ('open', 'stale'))
      or (p_tab = 'answered' and r.status = 'answered')
    )
  order by case when r.request_kind = 'priority' then 0 else 1 end, r.created_at desc
  limit 300;
$$;

grant execute on function public.rpc_staff_loads_list_requests(text) to authenticated;
