-- INSERT policy referenced dm_messages inside WITH CHECK, which re-evaluated RLS on dm_messages
-- and caused: infinite recursion detected in policy for relation "dm_messages".
-- Count rows via SECURITY DEFINER so the check does not recurse.

create or replace function public.dm_messages_count_for_conversation(p_conversation_id uuid)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::bigint from public.dm_messages where conversation_id = p_conversation_id;
$$;

grant execute on function public.dm_messages_count_for_conversation(uuid) to authenticated;

drop policy if exists "DM Messages: participants insert" on public.dm_messages;

create policy "DM Messages: participants insert"
  on public.dm_messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.dm_conversation_participants cp
      where cp.conversation_id = conversation_id
        and cp.user_id = auth.uid()
    )
    and (
      exists (
        select 1
        from public.dm_message_requests r
        where r.conversation_id = conversation_id
          and r.status = 'accepted'
          and (r.from_user_id = auth.uid() or r.to_user_id = auth.uid())
      )
      or
      not exists (
        select 1
        from public.dm_message_requests r
        where r.conversation_id = conversation_id
      )
      or
      (
        exists (
          select 1
          from public.dm_message_requests r
          where r.conversation_id = conversation_id
            and r.status = 'pending'
            and r.from_user_id = auth.uid()
        )
        and
        public.dm_messages_count_for_conversation(conversation_id) = 0
      )
    )
  );

notify pgrst, 'reload schema';
