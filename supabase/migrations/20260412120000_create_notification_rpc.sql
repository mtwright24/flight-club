-- RPC used by the app (`lib/notifications.ts` → `create_notification`) to insert recipient notifications
-- with actor = auth.uid(), bypassing direct INSERT RLS while keeping actor integrity.

create or replace function public.create_notification(
  p_recipient_id uuid,
  p_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_secondary_id uuid default null,
  p_title text default null,
  p_body text default null,
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_recipient_id = v_actor then
    raise exception 'Cannot create self-notification';
  end if;

  insert into public.notifications (
    user_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    secondary_id,
    title,
    body,
    data,
    is_read
  ) values (
    p_recipient_id,
    v_actor,
    p_type,
    p_entity_type,
    p_entity_id,
    p_secondary_id,
    p_title,
    p_body,
    coalesce(p_data, '{}'::jsonb),
    false
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_notification(
  uuid,
  text,
  text,
  uuid,
  uuid,
  text,
  text,
  jsonb
) to authenticated;

comment on function public.create_notification is
  'Inserts a notification row for the recipient; actor is always the caller (auth.uid()).';
