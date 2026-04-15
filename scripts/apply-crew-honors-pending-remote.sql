-- =============================================================================
-- Crew Honors: ONE paste for Supabase SQL Editor (Dashboard → SQL → Run).
-- Verified against repo migrations:
--   20260407120000_create_crew_honors.sql  (schema + categories incl. crew-mvp)
--   20260421120000_seed_crew_honors_preview_winner.sql
--   20260430210000_crew_honors_scrub_preview_why.sql
--   20260430120000_crew_honors_robert_mvp.sql
--
-- Requires: base Crew Honors migration already applied (tables + categories).
-- If this errors on missing relation, run 20260407120000_create_crew_honors.sql first.
-- Safe to re-run (idempotent inserts + updates).
-- Runs as postgres in SQL Editor → bypasses RLS (fine for admin seed).
-- =============================================================================

do $$
begin
  if to_regclass('public.crew_honor_winners') is null
     or to_regclass('public.crew_honor_cycles') is null
     or to_regclass('public.crew_honor_categories') is null then
    raise exception
      'Crew Honors base schema not found. Apply migration 20260407120000_create_crew_honors.sql first (e.g. supabase db push), then re-run this script.';
  end if;
  if not exists (select 1 from public.crew_honor_categories where slug = 'crew-mvp' limit 1) then
    raise exception
      'Category crew-mvp missing. Apply 20260407120000_create_crew_honors.sql first, then re-run this script.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- A) April 2026 cycle + published Crew MVP row (same as seed migration)
-- -----------------------------------------------------------------------------

insert into public.crew_honor_cycles (
  title,
  month,
  year,
  start_date,
  nomination_open_at,
  nomination_close_at,
  voting_open_at,
  voting_close_at,
  winners_publish_at,
  status
)
select
  'April 2026 Crew Honors',
  4,
  2026,
  '2026-04-01',
  '2026-03-01T00:00:00+00'::timestamptz,
  '2026-03-15T23:59:59+00'::timestamptz,
  '2026-03-16T00:00:00+00'::timestamptz,
  '2026-03-28T23:59:59+00'::timestamptz,
  '2026-04-01T12:00:00+00'::timestamptz,
  'published'::public.crew_honor_cycle_status
where not exists (
  select 1 from public.crew_honor_cycles where month = 4 and year = 2026
);

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
)
select
  c.id,
  cat.id,
  p.id,
  null,
  'editorial_only'::public.crew_honor_selection_mode,
  'Preview seed for Crew Honors: recognized for consistent excellence and leadership — so you can see Home, detail, reactions, and comments in the app.',
  'Crew MVP — stand-out leadership on the line.',
  1,
  true,
  true,
  true,
  now()
from public.crew_honor_cycles c
cross join public.crew_honor_categories cat
cross join lateral (
  select id from public.profiles order by id asc limit 1
) p
where c.month = 4
  and c.year = 2026
  and cat.slug = 'crew-mvp'
  and not exists (
    select 1
    from public.crew_honor_winners w
    where w.cycle_id = c.id
      and w.category_id = cat.id
  );

-- -----------------------------------------------------------------------------
-- B) Scrub legacy preview phrasing (same as 20260430210000)
-- -----------------------------------------------------------------------------

update public.crew_honor_winners w
set why_they_won = 'Recognized for stand-out leadership on the line and consistent excellence supporting the crew.'
where w.why_they_won is not null
  and (
    w.why_they_won ilike '%preview seed%'
    or w.why_they_won ilike '%so you can see home%'
  );

update public.crew_honor_winners w
set short_blurb = 'Stand-out leadership on the line.'
where w.short_blurb is not null
  and w.short_blurb ilike '%preview%'
  and w.short_blurb ilike '%crew honors%';

-- -----------------------------------------------------------------------------
-- C) Bind April 2026 Crew MVP to Robert + final copy (same as 20260430120000)
-- -----------------------------------------------------------------------------

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
    raise notice 'crew_honors: skip — April 2026 cycle or crew-mvp category missing';
    return;
  end if;

  if v_robert is null then
    raise notice 'crew_honors: Robert user not found — updating copy only';
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

  raise notice 'crew_honors: Crew MVP April 2026 bound to %', v_robert;
end $$;
