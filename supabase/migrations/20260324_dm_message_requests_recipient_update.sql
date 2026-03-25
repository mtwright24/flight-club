-- Allow DM request recipients to accept or decline (client updates `status`).
-- Without this policy, `.update()` returns an RLS error and Accept/Decline silently fail.

create policy "DM Message requests: recipient update own rows"
  on public.dm_message_requests
  for update
  to authenticated
  using (to_user_id = auth.uid())
  with check (to_user_id = auth.uid());
