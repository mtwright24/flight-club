-- Re-run Marsha → Robert May 2026 schedule copy with a wider "Robert" user match.
-- (20260428120000 may have no-op'd if handle/email did not match your test account.)

do $$
declare
  v_marsha uuid := '85f152bb-4b50-44c6-9f31-74f5906abb38'::uuid;
  v_robert uuid;
  v_month text := '2026-05';
begin
  select au.id
    into v_robert
  from auth.users au
  left join public.profiles p on p.id = au.id
  where au.id <> v_marsha
    and (
      lower(coalesce(p.handle, '')) in ('robert', 'bob', 'rwalker')
      or lower(au.email) like 'robert%@%'
      or lower(au.email) like '%+robert%@%'
      or lower(split_part(au.email, '@', 1)) in ('robert', 'bob', 'rwalker')
      or lower(split_part(au.email, '@', 1)) like '%+robert'
      or lower(coalesce(p.display_name, '')) like 'robert %'
      or lower(coalesce(p.display_name, '')) like 'robert,%'
      or lower(coalesce(p.display_name, '')) like '%, robert%'
      or lower(coalesce(p.display_name, '')) = 'robert'
      or lower(coalesce(au.raw_user_meta_data->>'name', '')) like '%robert%'
      or lower(coalesce(au.raw_user_meta_data->>'full_name', '')) like '%robert%'
    )
  order by au.created_at
  limit 1;

  if v_robert is null then
    raise notice 'copy_marsha_may_to_robert_v2: skip — no Robert user; set profiles.handle or display_name, or email local-part robert';
    return;
  end if;

  if v_robert = v_marsha then
    raise notice 'copy_marsha_may_to_robert_v2: skip — resolved user is same as Marsha';
    return;
  end if;

  if not exists (select 1 from auth.users where id = v_marsha) then
    raise notice 'copy_marsha_may_to_robert_v2: skip — Marsha demo user not found';
    return;
  end if;

  if not exists (select 1 from public.schedule_entries where user_id = v_marsha and month_key = v_month limit 1) then
    raise notice 'copy_marsha_may_to_robert_v2: skip — Marsha has no rows for month %', v_month;
    return;
  end if;

  create temp table _robert_tg_map (old_id uuid primary key, new_id uuid not null) on commit drop;

  insert into _robert_tg_map (old_id, new_id)
  select x.trip_group_id, gen_random_uuid()
  from (
    select distinct e.trip_group_id
    from public.schedule_entries e
    where e.user_id = v_marsha
      and e.month_key = v_month
  ) x;

  insert into _robert_tg_map (old_id, new_id)
  select x.trip_group_id, gen_random_uuid()
  from (
    select distinct t.trip_group_id
    from public.schedule_trip_metadata t
    where t.user_id = v_marsha
      and not exists (select 1 from _robert_tg_map m where m.old_id = t.trip_group_id)
  ) x;

  delete from public.schedule_trip_metadata stm
  where stm.user_id = v_robert
    and stm.trip_group_id in (
      select distinct e.trip_group_id
      from public.schedule_entries e
      where e.user_id = v_robert and e.month_key = v_month
    );

  delete from public.schedule_entries
  where user_id = v_robert and month_key = v_month;

  delete from public.schedule_month_metrics
  where user_id = v_robert and month_key = v_month;

  insert into public.schedule_entries (
    user_id,
    trip_group_id,
    month_key,
    date,
    day_of_week,
    pairing_code,
    report_time,
    city,
    d_end_time,
    layover,
    depart_local,
    arrive_local,
    wx,
    status_code,
    notes,
    source_type,
    source_batch_id,
    is_user_confirmed
  )
  select
    v_robert,
    m.new_id,
    e.month_key,
    e.date,
    e.day_of_week,
    e.pairing_code,
    e.report_time,
    e.city,
    e.d_end_time,
    e.layover,
    e.depart_local,
    e.arrive_local,
    e.wx,
    e.status_code,
    e.notes,
    'seed_robert_may_2026_marsha_copy',
    e.source_batch_id,
    e.is_user_confirmed
  from public.schedule_entries e
  join _robert_tg_map m on m.old_id = e.trip_group_id
  where e.user_id = v_marsha
    and e.month_key = v_month;

  insert into public.schedule_month_metrics (
    user_id,
    month_key,
    monthly_tafb_hours,
    block_hours,
    credit_hours,
    ytd_credit_hours,
    days_off,
    layover_total_minutes,
    source
  )
  select
    v_robert,
    mm.month_key,
    mm.monthly_tafb_hours,
    mm.block_hours,
    mm.credit_hours,
    mm.ytd_credit_hours,
    mm.days_off,
    mm.layover_total_minutes,
    'seed_robert_may_2026_marsha_copy'
  from public.schedule_month_metrics mm
  where mm.user_id = v_marsha
    and mm.month_key = v_month
  on conflict (user_id, month_key) do update set
    monthly_tafb_hours = excluded.monthly_tafb_hours,
    block_hours = excluded.block_hours,
    credit_hours = excluded.credit_hours,
    ytd_credit_hours = excluded.ytd_credit_hours,
    days_off = excluded.days_off,
    layover_total_minutes = excluded.layover_total_minutes,
    source = excluded.source,
    updated_at = now();

  insert into public.schedule_trip_metadata (
    trip_group_id,
    user_id,
    pairing_block_hours,
    pairing_credit_hours,
    pairing_tafb_hours,
    layover_total_minutes,
    crew
  )
  select
    m.new_id,
    v_robert,
    t.pairing_block_hours,
    t.pairing_credit_hours,
    t.pairing_tafb_hours,
    t.layover_total_minutes,
    t.crew
  from public.schedule_trip_metadata t
  join _robert_tg_map m on m.old_id = t.trip_group_id
  where t.user_id = v_marsha
  on conflict (trip_group_id) do update set
    user_id = excluded.user_id,
    pairing_block_hours = excluded.pairing_block_hours,
    pairing_credit_hours = excluded.pairing_credit_hours,
    pairing_tafb_hours = excluded.pairing_tafb_hours,
    layover_total_minutes = excluded.layover_total_minutes,
    crew = excluded.crew,
    updated_at = now();

  raise notice 'copy_marsha_may_to_robert_v2: copied May % from Marsha to Robert %', v_month, v_robert;
end $$;
