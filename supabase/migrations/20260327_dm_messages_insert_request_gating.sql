-- DM request gating for `dm_messages` inserts.
-- While a dm_message_requests row is pending/declined, block normal DM back-and-forth.
-- Allow ONLY the initial message from the requester when the pending request is created
-- and the conversation has no messages yet.

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
      -- Accepted request: allow inserts from either side.
      exists (
        select 1
        from public.dm_message_requests r
        where r.conversation_id = conversation_id
          and r.status = 'accepted'
          and (r.from_user_id = auth.uid() or r.to_user_id = auth.uid())
      )
      or
      -- No request rows: allow (legacy/accepted conversations).
      not exists (
        select 1
        from public.dm_message_requests r
        where r.conversation_id = conversation_id
      )
      or
      -- Pending request: allow only the requester to send the *first* message.
      (
        exists (
          select 1
          from public.dm_message_requests r
          where r.conversation_id = conversation_id
            and r.status = 'pending'
            and r.from_user_id = auth.uid()
        )
        and
        not exists (
          select 1
          from public.dm_messages m2
          where m2.conversation_id = conversation_id
        )
      )
    )
  );

