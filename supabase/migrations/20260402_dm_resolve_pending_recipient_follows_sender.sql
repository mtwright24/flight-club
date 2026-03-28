-- Align auto-resolve with app `canDM`: only accept a pending dm_message_request when the
-- recipient (to_user_id) follows the sender (from_user_id). For private recipients, the
-- sender must also follow the recipient (same as client-side rules).
--
-- Replaces the previous behavior that auto-accepted all pending requests to public profiles.

create or replace function public.dm_resolve_pending_requests_if_allowed(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  target_private boolean;
  recipient_follows_sender boolean;
  sender_follows_target boolean;
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

    select exists (
      select 1
      from public.follows f
      where f.follower_id = r.to_user_id
        and f.following_id = r.from_user_id
    ) into recipient_follows_sender;

    if not recipient_follows_sender then
      ok := false;
    elsif not target_private then
      ok := true;
    else
      select exists (
        select 1
        from public.follows f
        where f.follower_id = r.from_user_id
          and f.following_id = r.to_user_id
      ) into sender_follows_target;
      ok := coalesce(sender_follows_target, false);
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
