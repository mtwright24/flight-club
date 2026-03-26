-- Allow conversation participants to toggle is_read on messages they received (not sent by them).
-- Required for inbox "mark read" / "mark unread" without service role.

create policy "DM Messages: recipient update incoming read flag"
  on public.dm_messages
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.dm_conversation_participants cp
      where cp.conversation_id = dm_messages.conversation_id
        and cp.user_id = auth.uid()
    )
    and sender_id <> auth.uid()
  )
  with check (
    exists (
      select 1
      from public.dm_conversation_participants cp
      where cp.conversation_id = dm_messages.conversation_id
        and cp.user_id = auth.uid()
    )
    and sender_id <> auth.uid()
  );
