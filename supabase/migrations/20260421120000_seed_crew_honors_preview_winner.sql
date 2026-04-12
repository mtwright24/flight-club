-- Preview seed: one published winner so Home + /crew-honors show real UI.
-- Picks one profile as winner (stable order by id).
-- Idempotent: skips if April 2026 cycle or Crew MVP row already exists.

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
