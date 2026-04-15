-- Auto-accept pending dm_message_requests when the same rules as client `canDM` are satisfied
-- (e.g. mutual follow happened after the request was created). Bypasses recipient-only RLS.
--
-- Requires profiles.is_private (added below if missing on older DBs).

alter table public.profiles
  add column if not exists is_private boolean not null default false;

create or replace function public.dm_resolve_pending_requests_if_allowed(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  target_private boolean;
  ok boolean;
begin
  for r in
    select id, from_user_id, to_user_id
    from public.dm_message_requests
    where conversation_id = p_conversation_id
      and status = 'pending'
  loop
    ok := false;
    select coalesce(p.is_private, false) into target_private
    from public.profiles p
    where p.id = r.to_user_id;

    if not found then
      target_private := false;
    end if;

    if not target_private then
      ok := true;
    elsif exists (
      select 1
      from public.follows f
      where f.follower_id = r.from_user_id
        and f.following_id = r.to_user_id
    ) then
      ok := true;
    end if;

    if ok then
      update public.dm_message_requests
      set status = 'accepted'
      where id = r.id;
    end if;
  end loop;
end;
$$;

grant execute on function public.dm_resolve_pending_requests_if_allowed(uuid) to authenticated;

notify pgrst, 'reload schema';
