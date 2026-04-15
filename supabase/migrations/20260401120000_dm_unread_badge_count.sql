-- Header DM badge: match inbox row semantics (last message in thread from peer + unread),
-- not total count of all unread message rows in history.

create or replace function public.dm_unread_badge_count(p_exclude_conversation_ids uuid[] default '{}')
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(count(*), 0)::integer
  from (
    select distinct on (m.conversation_id)
      m.conversation_id,
      m.sender_id,
      m.is_read
    from public.dm_messages m
    inner join public.dm_conversation_participants p
      on p.conversation_id = m.conversation_id and p.user_id = auth.uid()
    where
      cardinality(p_exclude_conversation_ids) = 0
      or not (m.conversation_id = any (p_exclude_conversation_ids))
    order by m.conversation_id, m.created_at desc
  ) latest
  where latest.sender_id <> auth.uid()
    and latest.is_read = false;
$$;

grant execute on function public.dm_unread_badge_count(uuid[]) to authenticated;

notify pgrst, 'reload schema';
