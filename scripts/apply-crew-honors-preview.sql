-- Bundled for SQL Editor: base Crew Honors schema + preview winner seed.
-- Safe to run if crew_honor_* tables do not exist yet.

-- Crew Honors v1 schema: cycles, categories, nominations, finalists, winners,
-- votes, reactions, comments, reports, shares, and winner display preferences.

create type public.crew_honor_cycle_status as enum (
  'draft',
  'nominations_open',
  'shortlist_review',
  'voting_open',
  'voting_closed',
  'published',
  'archived'
);

create type public.crew_honor_selection_mode as enum (
  'editorial_only',
  'community_vote',
  'hybrid'
);

create type public.crew_honor_reaction_type as enum (
  'clap',
  'trophy',
  'heart',
  'fire',
  'salute',
  'airplane_star'
);

create type public.crew_honor_share_target as enum (
  'dm',
  'crew_room',
  'feed',
  'copy_link'
);

create type public.crew_honor_name_display as enum (
  'full_name',
  'first_name_last_initial'
);

create table if not exists public.crew_honor_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null unique,
  short_description text not null,
  category_group text not null check (category_group in ('professional', 'community', 'fun')),
  selection_mode public.crew_honor_selection_mode not null default 'community_vote',
  accent_primary text not null,
  accent_secondary text not null,
  trim_color text not null default '#D9B56D',
  display_order int not null default 1000,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crew_honor_cycles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  month int not null check (month between 1 and 12),
  year int not null check (year between 2000 and 2100),
  start_date date not null,
  nomination_open_at timestamptz not null,
  nomination_close_at timestamptz not null,
  voting_open_at timestamptz not null,
  voting_close_at timestamptz not null,
  winners_publish_at timestamptz not null,
  status public.crew_honor_cycle_status not null default 'draft',
  max_wins_per_user int not null default 2,
  enforce_no_consecutive_same_category boolean not null default true,
  enforce_one_flagship_per_cycle boolean not null default true,
  nominations_open_copy text,
  voting_open_copy text,
  winners_live_copy text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month, year)
);

create table if not exists public.crew_honor_nominations (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.crew_honor_cycles(id) on delete cascade,
  category_id uuid not null references public.crew_honor_categories(id) on delete restrict,
  nominator_id uuid not null references public.profiles(id) on delete cascade,
  nominee_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  story_context text,
  is_anonymous_to_public boolean not null default false,
  suggested_photo_url text,
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, category_id, nominator_id, nominee_user_id)
);

create table if not exists public.crew_honor_finalists (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.crew_honor_cycles(id) on delete cascade,
  category_id uuid not null references public.crew_honor_categories(id) on delete restrict,
  nominee_user_id uuid not null references public.profiles(id) on delete cascade,
  source_nomination_id uuid references public.crew_honor_nominations(id) on delete set null,
  is_editorial_pick boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, category_id, nominee_user_id)
);

create table if not exists public.crew_honor_winners (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.crew_honor_cycles(id) on delete cascade,
  category_id uuid not null references public.crew_honor_categories(id) on delete restrict,
  winner_user_id uuid not null references public.profiles(id) on delete cascade,
  finalist_id uuid references public.crew_honor_finalists(id) on delete set null,
  selected_by_mode public.crew_honor_selection_mode not null,
  why_they_won text not null,
  short_blurb text not null,
  rank int not null default 1,
  allow_comments boolean not null default true,
  allow_reactions boolean not null default true,
  is_published boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, category_id),
  unique (cycle_id, winner_user_id, category_id)
);

create table if not exists public.crew_honor_votes (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.crew_honor_cycles(id) on delete cascade,
  category_id uuid not null references public.crew_honor_categories(id) on delete restrict,
  finalist_id uuid not null references public.crew_honor_finalists(id) on delete cascade,
  voter_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (cycle_id, category_id, voter_user_id)
);

create table if not exists public.crew_honor_reactions (
  id uuid primary key default gen_random_uuid(),
  winner_id uuid not null references public.crew_honor_winners(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction public.crew_honor_reaction_type not null,
  created_at timestamptz not null default now(),
  unique (winner_id, user_id, reaction)
);

create table if not exists public.crew_honor_comments (
  id uuid primary key default gen_random_uuid(),
  winner_id uuid not null references public.crew_honor_winners(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crew_honor_comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.crew_honor_comments(id) on delete cascade,
  reported_by uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  unique (comment_id, reported_by)
);

create table if not exists public.crew_honor_shares (
  id uuid primary key default gen_random_uuid(),
  winner_id uuid not null references public.crew_honor_winners(id) on delete cascade,
  shared_by uuid not null references public.profiles(id) on delete cascade,
  target public.crew_honor_share_target not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.crew_honor_winner_preferences (
  id uuid primary key default gen_random_uuid(),
  winner_id uuid not null unique references public.crew_honor_winners(id) on delete cascade,
  winner_user_id uuid not null references public.profiles(id) on delete cascade,
  use_profile_photo boolean not null default true,
  alt_photo_url text,
  use_initials_avatar boolean not null default false,
  name_display public.crew_honor_name_display not null default 'full_name',
  declined_public_display boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crew_honor_categories_active_order
  on public.crew_honor_categories(is_active, display_order);
create index if not exists idx_crew_honor_cycles_status_publish
  on public.crew_honor_cycles(status, winners_publish_at desc);
create index if not exists idx_crew_honor_nominations_cycle_category
  on public.crew_honor_nominations(cycle_id, category_id);
create index if not exists idx_crew_honor_nominations_nominee
  on public.crew_honor_nominations(nominee_user_id, created_at desc);
create index if not exists idx_crew_honor_finalists_cycle_category
  on public.crew_honor_finalists(cycle_id, category_id);
create index if not exists idx_crew_honor_winners_cycle_published
  on public.crew_honor_winners(cycle_id, is_published, published_at desc);
create index if not exists idx_crew_honor_votes_cycle_category
  on public.crew_honor_votes(cycle_id, category_id);
create index if not exists idx_crew_honor_reactions_winner
  on public.crew_honor_reactions(winner_id);
create index if not exists idx_crew_honor_comments_winner_created
  on public.crew_honor_comments(winner_id, created_at desc);
create index if not exists idx_crew_honor_shares_winner_created
  on public.crew_honor_shares(winner_id, created_at desc);

create or replace function public.set_updated_at_crew_honors()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_crew_honor_categories_updated_at on public.crew_honor_categories;
create trigger trg_crew_honor_categories_updated_at
before update on public.crew_honor_categories
for each row execute procedure public.set_updated_at_crew_honors();

drop trigger if exists trg_crew_honor_cycles_updated_at on public.crew_honor_cycles;
create trigger trg_crew_honor_cycles_updated_at
before update on public.crew_honor_cycles
for each row execute procedure public.set_updated_at_crew_honors();

drop trigger if exists trg_crew_honor_nominations_updated_at on public.crew_honor_nominations;
create trigger trg_crew_honor_nominations_updated_at
before update on public.crew_honor_nominations
for each row execute procedure public.set_updated_at_crew_honors();

drop trigger if exists trg_crew_honor_finalists_updated_at on public.crew_honor_finalists;
create trigger trg_crew_honor_finalists_updated_at
before update on public.crew_honor_finalists
for each row execute procedure public.set_updated_at_crew_honors();

drop trigger if exists trg_crew_honor_winners_updated_at on public.crew_honor_winners;
create trigger trg_crew_honor_winners_updated_at
before update on public.crew_honor_winners
for each row execute procedure public.set_updated_at_crew_honors();

drop trigger if exists trg_crew_honor_comments_updated_at on public.crew_honor_comments;
create trigger trg_crew_honor_comments_updated_at
before update on public.crew_honor_comments
for each row execute procedure public.set_updated_at_crew_honors();

drop trigger if exists trg_crew_honor_winner_prefs_updated_at on public.crew_honor_winner_preferences;
create trigger trg_crew_honor_winner_prefs_updated_at
before update on public.crew_honor_winner_preferences
for each row execute procedure public.set_updated_at_crew_honors();

create or replace function public.crew_honor_validate_nomination()
returns trigger
language plpgsql
as $$
declare
  v_cycle public.crew_honor_cycles%rowtype;
  v_daily_count int;
  v_text text;
begin
  select * into v_cycle from public.crew_honor_cycles where id = new.cycle_id;
  if not found then
    raise exception 'Invalid Crew Honors cycle.';
  end if;

  if v_cycle.status <> 'nominations_open' then
    raise exception 'Nominations are not open for this cycle.';
  end if;

  if now() < v_cycle.nomination_open_at or now() > v_cycle.nomination_close_at then
    raise exception 'Nomination window is closed.';
  end if;

  if new.nominator_id = new.nominee_user_id then
    raise exception 'You cannot nominate yourself.';
  end if;

  select count(*)::int into v_daily_count
  from public.crew_honor_nominations
  where nominator_id = new.nominator_id
    and created_at >= date_trunc('day', now())
    and created_at < date_trunc('day', now()) + interval '1 day';
  if v_daily_count >= 20 then
    raise exception 'Daily nomination limit reached.';
  end if;

  v_text := lower(coalesce(new.reason, '') || ' ' || coalesce(new.story_context, ''));
  if v_text ~* '(fuck|shit|bitch|asshole|dickhead|slur)' then
    raise exception 'Please keep nominations respectful.';
  end if;

  if char_length(trim(coalesce(new.reason, ''))) < 12 then
    raise exception 'Please include a short reason (at least 12 characters).';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crew_honor_validate_nomination on public.crew_honor_nominations;
create trigger trg_crew_honor_validate_nomination
before insert on public.crew_honor_nominations
for each row execute procedure public.crew_honor_validate_nomination();

create or replace function public.crew_honor_validate_vote()
returns trigger
language plpgsql
as $$
declare
  v_cycle public.crew_honor_cycles%rowtype;
  v_mode public.crew_honor_selection_mode;
begin
  select * into v_cycle from public.crew_honor_cycles where id = new.cycle_id;
  if not found then
    raise exception 'Invalid Crew Honors cycle.';
  end if;

  if v_cycle.status <> 'voting_open' then
    raise exception 'Voting is not open for this cycle.';
  end if;

  if now() < v_cycle.voting_open_at or now() > v_cycle.voting_close_at then
    raise exception 'Voting window is closed.';
  end if;

  select selection_mode into v_mode
  from public.crew_honor_categories
  where id = new.category_id;

  if v_mode = 'editorial_only' then
    raise exception 'This category is editorial-only.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crew_honor_validate_vote on public.crew_honor_votes;
create trigger trg_crew_honor_validate_vote
before insert on public.crew_honor_votes
for each row execute procedure public.crew_honor_validate_vote();

create or replace function public.crew_honor_prevent_consecutive_same_category()
returns trigger
language plpgsql
as $$
declare
  v_enabled boolean;
  v_exists boolean;
begin
  select enforce_no_consecutive_same_category into v_enabled
  from public.crew_honor_cycles where id = new.cycle_id;

  if coalesce(v_enabled, true) then
    select exists (
      select 1
      from public.crew_honor_winners w
      join public.crew_honor_cycles c on c.id = w.cycle_id
      where w.winner_user_id = new.winner_user_id
        and w.category_id = new.category_id
        and c.status in ('published', 'archived')
        and (c.year * 12 + c.month) = (
          select max(c2.year * 12 + c2.month)
          from public.crew_honor_cycles c2
          where (c2.year * 12 + c2.month) < (
            select c3.year * 12 + c3.month from public.crew_honor_cycles c3 where c3.id = new.cycle_id
          )
        )
    ) into v_exists;

    if v_exists then
      raise exception 'This user cannot win the same category in consecutive cycles.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crew_honor_prevent_consecutive_same_category on public.crew_honor_winners;
create trigger trg_crew_honor_prevent_consecutive_same_category
before insert on public.crew_honor_winners
for each row execute procedure public.crew_honor_prevent_consecutive_same_category();

alter table public.crew_honor_categories enable row level security;
alter table public.crew_honor_cycles enable row level security;
alter table public.crew_honor_nominations enable row level security;
alter table public.crew_honor_finalists enable row level security;
alter table public.crew_honor_winners enable row level security;
alter table public.crew_honor_votes enable row level security;
alter table public.crew_honor_reactions enable row level security;
alter table public.crew_honor_comments enable row level security;
alter table public.crew_honor_comment_reports enable row level security;
alter table public.crew_honor_shares enable row level security;
alter table public.crew_honor_winner_preferences enable row level security;

drop policy if exists "crew_honor_categories_select" on public.crew_honor_categories;
create policy "crew_honor_categories_select"
  on public.crew_honor_categories for select
  using (auth.uid() is not null and is_active = true);

drop policy if exists "crew_honor_cycles_select" on public.crew_honor_cycles;
create policy "crew_honor_cycles_select"
  on public.crew_honor_cycles for select
  using (
    auth.uid() is not null
    and status in ('nominations_open', 'shortlist_review', 'voting_open', 'voting_closed', 'published', 'archived')
  );

drop policy if exists "crew_honor_nominations_select" on public.crew_honor_nominations;
create policy "crew_honor_nominations_select"
  on public.crew_honor_nominations for select
  using (auth.uid() = nominator_id or auth.uid() = nominee_user_id);

drop policy if exists "crew_honor_nominations_insert" on public.crew_honor_nominations;
create policy "crew_honor_nominations_insert"
  on public.crew_honor_nominations for insert
  with check (auth.uid() = nominator_id);

drop policy if exists "crew_honor_nominations_update_own" on public.crew_honor_nominations;
create policy "crew_honor_nominations_update_own"
  on public.crew_honor_nominations for update
  using (auth.uid() = nominator_id)
  with check (auth.uid() = nominator_id);

drop policy if exists "crew_honor_finalists_select" on public.crew_honor_finalists;
create policy "crew_honor_finalists_select"
  on public.crew_honor_finalists for select
  using (auth.uid() is not null);

drop policy if exists "crew_honor_winners_select" on public.crew_honor_winners;
create policy "crew_honor_winners_select"
  on public.crew_honor_winners for select
  using (
    auth.uid() is not null
    and is_published = true
    and exists (
      select 1
      from public.crew_honor_cycles c
      where c.id = cycle_id
        and c.status in ('published', 'archived')
    )
  );

drop policy if exists "crew_honor_votes_select" on public.crew_honor_votes;
create policy "crew_honor_votes_select"
  on public.crew_honor_votes for select
  using (auth.uid() is not null);

drop policy if exists "crew_honor_votes_insert" on public.crew_honor_votes;
create policy "crew_honor_votes_insert"
  on public.crew_honor_votes for insert
  with check (auth.uid() = voter_user_id);

drop policy if exists "crew_honor_reactions_select" on public.crew_honor_reactions;
create policy "crew_honor_reactions_select"
  on public.crew_honor_reactions for select
  using (auth.uid() is not null);

drop policy if exists "crew_honor_reactions_insert" on public.crew_honor_reactions;
create policy "crew_honor_reactions_insert"
  on public.crew_honor_reactions for insert
  with check (auth.uid() = user_id);

drop policy if exists "crew_honor_reactions_delete_own" on public.crew_honor_reactions;
create policy "crew_honor_reactions_delete_own"
  on public.crew_honor_reactions for delete
  using (auth.uid() = user_id);

drop policy if exists "crew_honor_comments_select" on public.crew_honor_comments;
create policy "crew_honor_comments_select"
  on public.crew_honor_comments for select
  using (auth.uid() is not null);

drop policy if exists "crew_honor_comments_insert" on public.crew_honor_comments;
create policy "crew_honor_comments_insert"
  on public.crew_honor_comments for insert
  with check (auth.uid() = user_id);

drop policy if exists "crew_honor_comments_delete_own" on public.crew_honor_comments;
create policy "crew_honor_comments_delete_own"
  on public.crew_honor_comments for delete
  using (auth.uid() = user_id);

drop policy if exists "crew_honor_comment_reports_insert" on public.crew_honor_comment_reports;
create policy "crew_honor_comment_reports_insert"
  on public.crew_honor_comment_reports for insert
  with check (auth.uid() = reported_by);

drop policy if exists "crew_honor_shares_select_own" on public.crew_honor_shares;
create policy "crew_honor_shares_select_own"
  on public.crew_honor_shares for select
  using (auth.uid() = shared_by);

drop policy if exists "crew_honor_shares_insert_own" on public.crew_honor_shares;
create policy "crew_honor_shares_insert_own"
  on public.crew_honor_shares for insert
  with check (auth.uid() = shared_by);

drop policy if exists "crew_honor_winner_preferences_select" on public.crew_honor_winner_preferences;
create policy "crew_honor_winner_preferences_select"
  on public.crew_honor_winner_preferences for select
  using (auth.uid() is not null);

drop policy if exists "crew_honor_winner_preferences_insert_own" on public.crew_honor_winner_preferences;
create policy "crew_honor_winner_preferences_insert_own"
  on public.crew_honor_winner_preferences for insert
  with check (auth.uid() = winner_user_id);

drop policy if exists "crew_honor_winner_preferences_update_own" on public.crew_honor_winner_preferences;
create policy "crew_honor_winner_preferences_update_own"
  on public.crew_honor_winner_preferences for update
  using (auth.uid() = winner_user_id)
  with check (auth.uid() = winner_user_id);

insert into public.crew_honor_categories (
  slug, title, short_description, category_group, selection_mode,
  accent_primary, accent_secondary, trim_color, display_order
) values
  ('crew-mvp', 'Crew MVP', 'Overall standout crew member', 'professional', 'editorial_only', '#E9C46A', '#F4E7C2', '#D9B56D', 10),
  ('most-professional', 'Most Professional', 'Consistently polished and dependable', 'professional', 'editorial_only', '#1F3B73', '#D9B56D', '#D9B56D', 20),
  ('calm-under-pressure', 'Calm Under Pressure', 'Kept cool during a rough trip', 'professional', 'editorial_only', '#3E5C76', '#D9B56D', '#D9B56D', 30),
  ('best-lead-energy', 'Best Lead Energy', 'Set the tone and led with confidence', 'professional', 'editorial_only', '#8B1E3F', '#D9B56D', '#D9B56D', 40),
  ('crew-mom-crew-dad', 'Crew Mom / Crew Dad', 'Always caring for the crew', 'community', 'community_vote', '#2A9D8F', '#D9B56D', '#D9B56D', 50),
  ('most-helpful', 'Most Helpful', 'Always there to help', 'community', 'community_vote', '#2F5AA6', '#D9B56D', '#D9B56D', 60),
  ('best-newbie-ally', 'Best Newbie Ally', 'Made new crew feel welcome fast', 'community', 'community_vote', '#2D8F6F', '#D9B56D', '#D9B56D', 70),
  ('above-and-beyond', 'Above and Beyond', 'Went the extra mile for everyone', 'community', 'editorial_only', '#7BA7D8', '#D9B56D', '#D9B56D', 80),
  ('terminal-tea-award', 'Terminal Tea Award', 'Always knows what is happening', 'fun', 'hybrid', '#6A4C93', '#D9B56D', '#D9B56D', 90),
  ('delay-survivor', 'Delay Survivor', 'Survived the wildest delay week', 'fun', 'community_vote', '#C44536', '#D9B56D', '#D9B56D', 100),
  ('gate-receipts-award', 'Gate Receipts Award', 'Had the receipts', 'fun', 'hybrid', '#7B2CBF', '#D9B56D', '#D9B56D', 110),
  ('main-cabin-main-character', 'Main Cabin Main Character', 'Unforgettable personality onboard', 'fun', 'hybrid', '#B5179E', '#D9B56D', '#D9B56D', 120)
on conflict (slug) do update
set
  title = excluded.title,
  short_description = excluded.short_description,
  category_group = excluded.category_group,
  selection_mode = excluded.selection_mode,
  accent_primary = excluded.accent_primary,
  accent_secondary = excluded.accent_secondary,
  trim_color = excluded.trim_color,
  display_order = excluded.display_order,
  is_active = true,
  updated_at = now();

-- --- Seed preview winner ---
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
