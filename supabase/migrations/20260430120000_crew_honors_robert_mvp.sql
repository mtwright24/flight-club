-- Crew Honors MVP: bind April 2026 Crew MVP to Robert + polished public copy (replaces preview seed text).

do $$
declare
  v_robert uuid;
  v_cycle uuid;
  v_cat uuid;
begin
  select au.id
    into v_robert
  from auth.users au
  left join public.profiles p on p.id = au.id
  where lower(coalesce(p.handle, '')) in ('robert', 'bob', 'rwalker')
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
  order by au.created_at
  limit 1;

  select c.id into v_cycle from public.crew_honor_cycles c where c.month = 4 and c.year = 2026 limit 1;
  select cat.id into v_cat from public.crew_honor_categories cat where cat.slug = 'crew-mvp' limit 1;

  if v_cycle is null or v_cat is null then
    raise notice 'crew_honors_robert_mvp: skip — April 2026 cycle or crew-mvp category missing';
    return;
  end if;

  if v_robert is null then
    raise notice 'crew_honors_robert_mvp: Robert user not found — updating copy only';
    update public.crew_honor_winners w
    set
      why_they_won = 'Recognized for stand-out leadership on the line and consistent support for the crew.',
      short_blurb = 'Stand-out leadership on the line.'
    where w.cycle_id = v_cycle
      and w.category_id = v_cat
      and w.is_published = true;
    return;
  end if;

  update public.crew_honor_winners w
  set
    winner_user_id = v_robert,
    why_they_won = 'Recognized for stand-out leadership on the line and consistent support for the crew.',
    short_blurb = 'Stand-out leadership on the line.'
  where w.cycle_id = v_cycle
    and w.category_id = v_cat
    and w.is_published = true;

  if not exists (
    select 1 from public.crew_honor_winners w2 where w2.cycle_id = v_cycle and w2.category_id = v_cat
  ) then
    insert into public.crew_honor_winners (
      cycle_id,
      category_id,
      winner_user_id,
      finalist_id,
      selected_by_mode,
      why_they_won,
      short_blurb,
      rank,
      allow_comments,
      allow_reactions,
      is_published,
      published_at
    ) values (
      v_cycle,
      v_cat,
      v_robert,
      null,
      'editorial_only'::public.crew_honor_selection_mode,
      'Recognized for stand-out leadership on the line and consistent support for the crew.',
      'Stand-out leadership on the line.',
      1,
      true,
      true,
      true,
      now()
    );
  end if;

  raise notice 'crew_honors_robert_mvp: Crew MVP April 2026 bound to %', v_robert;
end $$;
