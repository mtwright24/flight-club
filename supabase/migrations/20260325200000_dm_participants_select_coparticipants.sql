-- Allow each participant to read all rows in conversations they belong to.
-- Without this, getOrCreateDirectConversation only sees auth.uid()'s own participant rows
-- under "select own", so it never observes the peer row and creates a new conversation
-- on every open (duplicate threads for the same pair).

create policy "DM Conversation participants: select same conversation"
  on public.dm_conversation_participants
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.dm_conversation_participants cp
      where cp.conversation_id = dm_conversation_participants.conversation_id
        and cp.user_id = auth.uid()
    )
  );
