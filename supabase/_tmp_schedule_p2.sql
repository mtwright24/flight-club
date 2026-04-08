-- ---------------------------------------------------------------------------
-- Grouping helper for consecutive trip rows
-- ---------------------------------------------------------------------------

create or replace function public.schedule_import_same_trip_block(a text, b text)
returns boolean
language sql
immutable
as $$
  select case
    when a is null or b is null then false
    when upper(trim(coalesce(a, ''))) in ('OFF', 'PTO') or upper(trim(coalesce(b, ''))) in ('OFF', 'PTO') then false
    when upper(trim(coalesce(a, ''))) in ('RSV', 'DH') or upper(trim(coalesce(b, ''))) in ('RSV', 'DH') then false
    when upper(trim(coalesce(b, ''))) = 'CONT' then true
    when upper(trim(coalesce(a, ''))) = 'CONT' then true
    when upper(trim(coalesce(a, ''))) = upper(trim(coalesce(b, ''))) then true
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Apply import: replace month (delete all rows in month, insert approved rows)
-- ---------------------------------------------------------------------------

create or replace function public.schedule_import_replace_month(
  p_month_key text,
  p_batch_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r record;
  inserted int := 0;
  d date;
  tg uuid;
  prev_tg uuid;
  prev_d date;
  prev_pair text;
  prev_status text;
  cur_pair text;
  cur_status text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.schedule_import_batches b
    where b.id = p_batch_id and b.user_id = uid
  ) then
    raise exception 'batch not found';
  end if;

  delete from public.schedule_entries
  where user_id = uid and month_key = p_month_key;

  prev_tg := null;
  prev_d := null;
  prev_pair := null;
  prev_status := null;

  for r in
    select value as elem from jsonb_array_elements(p_rows) order by (value->>'date')::date nulls last
  loop
    d := (r.elem->>'date')::date;
    cur_pair := nullif(trim(coalesce(r.elem->>'pairing_code', '')), '');
    cur_status := upper(nullif(trim(coalesce(r.elem->>'status_code', '')), ''));

    if prev_d is not null and d = prev_d + 1
       and public.schedule_import_same_trip_block(prev_status, cur_status)
       and (
         (cur_pair is not null and prev_pair is not null and cur_pair = prev_pair)
         or upper(coalesce(cur_status, '')) = 'CONT'
       )
    then
      tg := prev_tg;
    else
      tg := gen_random_uuid();
    end if;

    insert into public.schedule_entries (
      user_id, trip_group_id, month_key, date, day_of_week, pairing_code,
      report_time, city, d_end_time, layover, wx, status_code, notes,
      source_type, source_batch_id, is_user_confirmed
    ) values (
      uid,
      tg,
      p_month_key,
      d,
      nullif(trim(coalesce(r.elem->>'day_of_week', '')), ''),
      cur_pair,
      nullif(trim(coalesce(r.elem->>'report_time', '')), ''),
      nullif(trim(coalesce(r.elem->>'city', '')), ''),
      nullif(trim(coalesce(r.elem->>'d_end_time', '')), ''),
      nullif(trim(coalesce(r.elem->>'layover', '')), ''),
      nullif(trim(coalesce(r.elem->>'wx', '')), ''),
      nullif(trim(coalesce(r.elem->>'status_code', '')), ''),
      nullif(trim(coalesce(r.elem->>'notes', '')), ''),
      coalesce(nullif(trim(coalesce(r.elem->>'source_type', '')), ''), 'import'),
      p_batch_id,
      true
    );

    inserted := inserted + 1;
    prev_tg := tg;
    prev_d := d;
    prev_pair := cur_pair;
    prev_status := cur_status;
  end loop;

  update public.schedule_import_batches
  set parse_status = 'saved', updated_at = now(), row_count = inserted
  where id = p_batch_id and user_id = uid;

  return inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Merge: upsert by date within month
-- ---------------------------------------------------------------------------

create or replace function public.schedule_import_merge_month(
  p_month_key text,
  p_batch_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r record;
  affected int := 0;
  d date;
  tg uuid;
  prev_tg uuid;
  prev_d date;
  prev_pair text;
  prev_status text;
  cur_pair text;
  cur_status text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.schedule_import_batches b
    where b.id = p_batch_id and b.user_id = uid
  ) then
    raise exception 'batch not found';
  end if;

  prev_tg := null;
  prev_d := null;
  prev_pair := null;
  prev_status := null;

  for r in
    select value as elem from jsonb_array_elements(p_rows) order by (value->>'date')::date nulls last
  loop
    d := (r.elem->>'date')::date;
    cur_pair := nullif(trim(coalesce(r.elem->>'pairing_code', '')), '');
    cur_status := upper(nullif(trim(coalesce(r.elem->>'status_code', '')), ''));

    if prev_d is not null and d = prev_d + 1
       and public.schedule_import_same_trip_block(prev_status, cur_status)
       and (
         (cur_pair is not null and prev_pair is not null and cur_pair = prev_pair)
         or upper(coalesce(cur_status, '')) = 'CONT'
       )
    then
      tg := prev_tg;
    else
      tg := gen_random_uuid();
    end if;

    delete from public.schedule_entries where user_id = uid and date = d;

    insert into public.schedule_entries (
      user_id, trip_group_id, month_key, date, day_of_week, pairing_code,
      report_time, city, d_end_time, layover, wx, status_code, notes,
      source_type, source_batch_id, is_user_confirmed
    ) values (
      uid,
      tg,
      p_month_key,
      d,
      nullif(trim(coalesce(r.elem->>'day_of_week', '')), ''),
      cur_pair,
      nullif(trim(coalesce(r.elem->>'report_time', '')), ''),
      nullif(trim(coalesce(r.elem->>'city', '')), ''),
      nullif(trim(coalesce(r.elem->>'d_end_time', '')), ''),
      nullif(trim(coalesce(r.elem->>'layover', '')), ''),
      nullif(trim(coalesce(r.elem->>'wx', '')), ''),
      nullif(trim(coalesce(r.elem->>'status_code', '')), ''),
      nullif(trim(coalesce(r.elem->>'notes', '')), ''),
      coalesce(nullif(trim(coalesce(r.elem->>'source_type', '')), ''), 'import'),
      p_batch_id,
      true
    );

    affected := affected + 1;
    prev_tg := tg;
    prev_d := d;
    prev_pair := cur_pair;
    prev_status := cur_status;
  end loop;

  update public.schedule_import_batches
  set parse_status = 'saved', updated_at = now()
  where id = p_batch_id and user_id = uid;

  return affected;
end;
$$;

grant execute on function public.schedule_import_replace_month(text, uuid, jsonb) to authenticated;
grant execute on function public.schedule_import_merge_month(text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: schedule-imports/{userId}/{year-month}/{filename}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('schedule-imports', 'schedule-imports', false)
on conflict (id) do nothing;

-- Authenticated users can manage objects only under their user id folder
drop policy if exists "schedule_imports_insert_own" on storage.objects;
create policy "schedule_imports_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'schedule-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "schedule_imports_select_own" on storage.objects;
create policy "schedule_imports_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'schedule-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "schedule_imports_update_own" on storage.objects;
create policy "schedule_imports_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'schedule-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'schedule-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "schedule_imports_delete_own" on storage.objects;
create policy "schedule_imports_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'schedule-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
