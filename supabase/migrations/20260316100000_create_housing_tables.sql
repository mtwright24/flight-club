-- Housing tables for Crashpads & Housing feature

-- 1) housing_listings
create table if not exists public.housing_listings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete cascade,

  title text not null,
  housing_type text not null,
  base_airport text not null,
  neighborhood text,
  city text,
  state text,
  address_line1 text,

  price_monthly numeric,
  price_nightly numeric,

  bed_type text not null,

  available_tonight boolean not null default false,
  available_now boolean not null default false,
  available_date date,

  total_beds integer,
  bathrooms numeric,
  distance_to_airport_minutes integer,

  crew_rules jsonb,
  amenities jsonb,
  lifestyle_tags jsonb,

  description text,
  house_rules text,
  host_name text,
  host_contact_method text,

  is_active boolean not null default true,
  cover_photo_url text
);

-- Enums via check constraints
alter table public.housing_listings
  add constraint housing_listings_housing_type_check
  check (housing_type in ('crashpad','room','apartment','short_term'));

alter table public.housing_listings
  add constraint housing_listings_bed_type_check
  check (bed_type in ('hot_bed','cold_bed','private_room'));

-- 2) housing_listing_photos
create table if not exists public.housing_listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.housing_listings(id) on delete cascade,
  photo_url text not null,
  sort_order integer not null default 0
);

create index if not exists idx_housing_listing_photos_listing_id
  on public.housing_listing_photos(listing_id, sort_order);

-- 3) housing_saved_searches
create table if not exists public.housing_saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  base_airport text not null,
  area text,
  housing_type text,
  min_price numeric,
  max_price numeric,
  bed_type text,
  available_tonight boolean not null default false,
  filters jsonb,
  alerts_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_housing_saved_searches_user
  on public.housing_saved_searches(user_id, base_airport);

-- 4) housing_need_posts
create table if not exists public.housing_need_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  base_airport text not null,
  area text,
  need_type text not null,
  budget numeric,
  start_date date,
  need_tonight boolean not null default false,
  duration text,
  crew_type text,
  preference_rules jsonb,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_housing_need_posts_user
  on public.housing_need_posts(user_id, base_airport, is_active);

-- 5) Optional favorites table
create table if not exists public.user_saved_housing_listings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.housing_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index if not exists idx_user_saved_housing_listings_user
  on public.user_saved_housing_listings(user_id);

-- Indexes to support search
create index if not exists idx_housing_listings_search
  on public.housing_listings(
    base_airport,
    housing_type,
    bed_type,
    available_tonight,
    is_active,
    price_monthly,
    price_nightly
  );

-- Basic RLS
alter table public.housing_listings enable row level security;
alter table public.housing_listing_photos enable row level security;
alter table public.housing_saved_searches enable row level security;
alter table public.housing_need_posts enable row level security;
alter table public.user_saved_housing_listings enable row level security;

-- Listings: any authenticated user can read active listings
create policy if not exists housing_listings_select_active
  on public.housing_listings
  for select
  using ( is_active = true );

-- Listings: owners can insert/update/delete their own
create policy if not exists housing_listings_insert_own
  on public.housing_listings
  for insert
  with check ( auth.uid() = created_by );

create policy if not exists housing_listings_update_own
  on public.housing_listings
  for update
  using ( auth.uid() = created_by )
  with check ( auth.uid() = created_by );

create policy if not exists housing_listings_delete_own
  on public.housing_listings
  for delete
  using ( auth.uid() = created_by );

-- Photos: follow listing ownership
create policy if not exists housing_listing_photos_select
  on public.housing_listing_photos
  for select
  using ( true );

create policy if not exists housing_listing_photos_mutate
  on public.housing_listing_photos
  for all
  using (
    exists (
      select 1 from public.housing_listings l
      where l.id = listing_id and l.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.housing_listings l
      where l.id = listing_id and l.created_by = auth.uid()
    )
  );

-- Saved searches: owner-only read/write
create policy if not exists housing_saved_searches_select_own
  on public.housing_saved_searches
  for select
  using ( auth.uid() = user_id );

create policy if not exists housing_saved_searches_mutate_own
  on public.housing_saved_searches
  for all
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

-- Need posts: public read (active only), owner write
create policy if not exists housing_need_posts_select_active
  on public.housing_need_posts
  for select
  using ( is_active = true );

create policy if not exists housing_need_posts_mutate_own
  on public.housing_need_posts
  for all
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

-- Favorites: owner-only access
create policy if not exists user_saved_housing_listings_select_own
  on public.user_saved_housing_listings
  for select
  using ( auth.uid() = user_id );

create policy if not exists user_saved_housing_listings_mutate_own
  on public.user_saved_housing_listings
  for all
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

-- Seed data: example listings across multiple bases
insert into public.housing_listings (
  created_by,
  title,
  housing_type,
  base_airport,
  neighborhood,
  city,
  state,
  price_monthly,
  price_nightly,
  bed_type,
  available_tonight,
  available_now,
  total_beds,
  bathrooms,
  distance_to_airport_minutes,
  crew_rules,
  amenities,
  lifestyle_tags,
  description,
  house_rules,
  host_name,
  host_contact_method,
  cover_photo_url
)
select
  id as created_by,
  'JFK Crashpad – Jamaica' as title,
  'crashpad' as housing_type,
  'JFK' as base_airport,
  'Jamaica / Sutphin' as neighborhood,
  'New York' as city,
  'NY' as state,
  425 as price_monthly,
  45 as price_nightly,
  'cold_bed' as bed_type,
  true as available_tonight,
  true as available_now,
  8 as total_beds,
  2 as bathrooms,
  12 as distance_to_airport_minutes,
  '{"women_only": true, "crew_only": true}'::jsonb as crew_rules,
  '{"washer_dryer": true, "kitchen_access": true, "wifi": true, "shuttle": true}'::jsonb as amenities,
  '{"reserve_friendly": true, "quiet_hours": true}'::jsonb as lifestyle_tags,
  'Women-only JFK crashpad with cold beds, 12 minutes to JFK. Shuttle and kitchen access included.' as description,
  'Quiet hours after 10pm. Crew only.' as house_rules,
  'Maria' as host_name,
  'in_app' as host_contact_method,
  'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=80' as cover_photo_url
from public.profiles
limit 1;

-- Additional seeded listings for other bases
insert into public.housing_listings (
  created_by,
  title,
  housing_type,
  base_airport,
  neighborhood,
  city,
  state,
  price_monthly,
  price_nightly,
  bed_type,
  available_tonight,
  available_now,
  total_beds,
  bathrooms,
  distance_to_airport_minutes,
  crew_rules,
  amenities,
  lifestyle_tags,
  description,
  house_rules,
  host_name,
  host_contact_method,
  cover_photo_url
)
select
  id as created_by,
  'IAH Crew Crashpad – Greenspoint' as title,
  'crashpad' as housing_type,
  'IAH' as base_airport,
  'Greenspoint' as neighborhood,
  'Houston' as city,
  'TX' as state,
  425 as price_monthly,
  null as price_nightly,
  'cold_bed' as bed_type,
  false as available_tonight,
  true as available_now,
  8 as total_beds,
  2 as bathrooms,
  12 as distance_to_airport_minutes,
  '{"crew_only": true}'::jsonb as crew_rules,
  '{"washer_dryer": true, "wifi": true, "kitchen_access": true}'::jsonb as amenities,
  '{"quiet_hours": true, "reserve_friendly": true}'::jsonb as lifestyle_tags,
  'IAH cold-bed crashpad with full kitchen and fast Wi‑Fi. Reserve-friendly and quiet.' as description,
  'Quiet hours after 9pm. No parties.' as house_rules,
  'Chris' as host_name,
  'in_app' as host_contact_method,
  'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=1200&q=80' as cover_photo_url
from public.profiles
limit 1;

insert into public.housing_listings (
  created_by,
  title,
  housing_type,
  base_airport,
  neighborhood,
  city,
  state,
  price_monthly,
  price_nightly,
  bed_type,
  available_tonight,
  available_now,
  total_beds,
  bathrooms,
  distance_to_airport_minutes,
  crew_rules,
  amenities,
  lifestyle_tags,
  description,
  house_rules,
  host_name,
  host_contact_method,
  cover_photo_url
)
select
  id as created_by,
  'IAH Apartment Share – North Houston' as title,
  'apartment' as housing_type,
  'IAH' as base_airport,
  'North Houston' as neighborhood,
  'Houston' as city,
  'TX' as state,
  1200 as price_monthly,
  null as price_nightly,
  'private_room' as bed_type,
  false as available_tonight,
  true as available_now,
  3 as total_beds,
  2 as bathrooms,
  18 as distance_to_airport_minutes,
  '{"crew_only": true}'::jsonb as crew_rules,
  '{"washer_dryer": true, "wifi": true, "kitchen_access": true}'::jsonb as amenities,
  '{"reserve_friendly": true}'::jsonb as lifestyle_tags,
  'Shared apartment with one room for crew near IAH, month-to-month.' as description,
  'No parties. Respect roommates.' as house_rules,
  'Megan' as host_name,
  'in_app' as host_contact_method,
  'https://images.unsplash.com/photo-1505691723518-36a5ac3be353?auto=format&fit=crop&w=1200&q=80' as cover_photo_url
from public.profiles
limit 1;

insert into public.housing_listings (
  created_by,
  title,
  housing_type,
  base_airport,
  neighborhood,
  city,
  state,
  price_monthly,
  price_nightly,
  bed_type,
  available_tonight,
  available_now,
  total_beds,
  bathrooms,
  distance_to_airport_minutes,
  crew_rules,
  amenities,
  lifestyle_tags,
  description,
  house_rules,
  host_name,
  host_contact_method,
  cover_photo_url
)
select
  id as created_by,
  'EWR Short-Term Room – Downtown' as title,
  'short_term' as housing_type,
  'EWR' as base_airport,
  'Downtown Newark' as neighborhood,
  'Newark' as city,
  'NJ' as state,
  null as price_monthly,
  65 as price_nightly,
  'private_room' as bed_type,
  true as available_tonight,
  true as available_now,
  1 as total_beds,
  1 as bathrooms,
  14 as distance_to_airport_minutes,
  '{"crew_only": true}'::jsonb as crew_rules,
  '{"wifi": true, "kitchen_access": true}'::jsonb as amenities,
  '{"reserve_friendly": true}'::jsonb as lifestyle_tags,
  'Nightly private room for quick EWR turns, walkable to PATH.' as description,
  'No local guests. Crew only.' as house_rules,
  'Dana' as host_name,
  'in_app' as host_contact_method,
  'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=80' as cover_photo_url
from public.profiles
limit 1;

insert into public.housing_listings (
  created_by,
  title,
  housing_type,
  base_airport,
  neighborhood,
  city,
  state,
  price_monthly,
  price_nightly,
  bed_type,
  available_tonight,
  available_now,
  total_beds,
  bathrooms,
  distance_to_airport_minutes,
  crew_rules,
  amenities,
  lifestyle_tags,
  description,
  house_rules,
  host_name,
  host_contact_method,
  cover_photo_url
)
select
  id as created_by,
  'LGA Coed Crashpad – Queens' as title,
  'crashpad' as housing_type,
  'LGA' as base_airport,
  'East Elmhurst' as neighborhood,
  'New York' as city,
  'NY' as state,
  375 as price_monthly,
  null as price_nightly,
  'hot_bed' as bed_type,
  false as available_tonight,
  true as available_now,
  12 as total_beds,
  2 as bathrooms,
  8 as distance_to_airport_minutes,
  '{"crew_only": true}'::jsonb as crew_rules,
  '{"wifi": true, "kitchen_access": true}'::jsonb as amenities,
  '{"party_friendly": true}'::jsonb as lifestyle_tags,
  'Busy coed LGA crashpad with quick shuttle to the airport.' as description,
  'Shared rooms. Respect quiet hours in bunk rooms.' as house_rules,
  'Riley' as host_name,
  'in_app' as host_contact_method,
  'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=1200&q=80' as cover_photo_url
from public.profiles
limit 1;

insert into public.housing_listings (
  created_by,
  title,
  housing_type,
  base_airport,
  neighborhood,
  city,
  state,
  price_monthly,
  price_nightly,
  bed_type,
  available_tonight,
  available_now,
  total_beds,
  bathrooms,
  distance_to_airport_minutes,
  crew_rules,
  amenities,
  lifestyle_tags,
  description,
  house_rules,
  host_name,
  host_contact_method,
  cover_photo_url
)
select
  id as created_by,
  'FLL Crashpad – Coed Bunks' as title,
  'crashpad' as housing_type,
  'FLL' as base_airport,
  'Hollywood' as neighborhood,
  'Fort Lauderdale' as city,
  'FL' as state,
  350 as price_monthly,
  null as price_nightly,
  'hot_bed' as bed_type,
  false as available_tonight,
  true as available_now,
  10 as total_beds,
  2 as bathrooms,
  12 as distance_to_airport_minutes,
  '{"crew_only": true}'::jsonb as crew_rules,
  '{"wifi": true, "kitchen_access": true}'::jsonb as amenities,
  '{"party_friendly": true}'::jsonb as lifestyle_tags,
  'Coed crashpad near FLL, close to beach and nightlife.' as description,
  'Coed bunks. Respect roommates working early shows.' as house_rules,
  'Jordan' as host_name,
  'in_app' as host_contact_method,
  'https://images.unsplash.com/photo-1505691723518-36a5ac3be353?auto=format&fit=crop&w=1200&q=80' as cover_photo_url
from public.profiles
limit 1;

insert into public.housing_listings (
  created_by,
  title,
  housing_type,
  base_airport,
  neighborhood,
  city,
  state,
  price_monthly,
  price_nightly,
  bed_type,
  available_tonight,
  available_now,
  total_beds,
  bathrooms,
  distance_to_airport_minutes,
  crew_rules,
  amenities,
  lifestyle_tags,
  description,
  house_rules,
  host_name,
  host_contact_method,
  cover_photo_url
)
select
  id as created_by,
  'JFK Women-Only Crashpad – Queens' as title,
  'crashpad' as housing_type,
  'JFK' as base_airport,
  'Kew Gardens' as neighborhood,
  'New York' as city,
  'NY' as state,
  450 as price_monthly,
  null as price_nightly,
  'cold_bed' as bed_type,
  false as available_tonight,
  true as available_now,
  6 as total_beds,
  2 as bathrooms,
  14 as distance_to_airport_minutes,
  '{"women_only": true, "crew_only": true}'::jsonb as crew_rules,
  '{"washer_dryer": true, "wifi": true, "kitchen_access": true}'::jsonb as amenities,
  '{"quiet_hours": true, "reserve_friendly": true}'::jsonb as lifestyle_tags,
  'Women-only JFK crashpad with quiet hours and in-unit laundry.' as description,
  'Women crew only. Quiet hours after 10pm.' as house_rules,
  'Nina' as host_name,
  'in_app' as host_contact_method,
  'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=1200&q=80' as cover_photo_url
from public.profiles
limit 1;

insert into public.housing_listings (
  created_by,
  title,
  housing_type,
  base_airport,
  neighborhood,
  city,
  state,
  price_monthly,
  price_nightly,
  bed_type,
  available_tonight,
  available_now,
  total_beds,
  bathrooms,
  distance_to_airport_minutes,
  crew_rules,
  amenities,
  lifestyle_tags,
  description,
  house_rules,
  host_name,
  host_contact_method,
  cover_photo_url
)
select
  id as created_by,
  'EWR Coed Crashpad – Newark' as title,
  'crashpad' as housing_type,
  'EWR' as base_airport,
  'Ironbound' as neighborhood,
  'Newark' as city,
  'NJ' as state,
  395 as price_monthly,
  null as price_nightly,
  'hot_bed' as bed_type,
  false as available_tonight,
  true as available_now,
  10 as total_beds,
  2 as bathrooms,
  15 as distance_to_airport_minutes,
  '{"crew_only": true}'::jsonb as crew_rules,
  '{"wifi": true, "kitchen_access": true}'::jsonb as amenities,
  '{"party_friendly": true}'::jsonb as lifestyle_tags,
  'Busy coed crashpad near EWR, walkable to food and coffee.' as description,
  'Respect roommates and common spaces.' as house_rules,
  'Jay' as host_name,
  'in_app' as host_contact_method,
  'https://images.unsplash.com/photo-1505691723518-36a5ac3be353?auto=format&fit=crop&w=1200&q=80' as cover_photo_url
from public.profiles
limit 1;

insert into public.housing_listings (
  created_by,
  title,
  housing_type,
  base_airport,
  neighborhood,
  city,
  state,
  price_monthly,
  price_nightly,
  bed_type,
  available_tonight,
  available_now,
  total_beds,
  bathrooms,
  distance_to_airport_minutes,
  crew_rules,
  amenities,
  lifestyle_tags,
  description,
  house_rules,
  host_name,
  host_contact_method,
  cover_photo_url
)
select
  id as created_by,
  'LGA Private Room – Astoria' as title,
  'room' as housing_type,
  'LGA' as base_airport,
  'Astoria' as neighborhood,
  'New York' as city,
  'NY' as state,
  900 as price_monthly,
  null as price_nightly,
  'private_room' as bed_type,
  false as available_tonight,
  true as available_now,
  1 as total_beds,
  1 as bathrooms,
  18 as distance_to_airport_minutes,
  '{"crew_only": true}'::jsonb as crew_rules,
  '{"washer_dryer": true, "wifi": true, "kitchen_access": true}'::jsonb as amenities,
  '{"quiet_hours": true, "reserve_friendly": true}'::jsonb as lifestyle_tags,
  'Bright private room in Astoria with in-unit laundry and quick ride to LGA.' as description,
  'Single crew only. No smoking.' as house_rules,
  'Alex' as host_name,
  'in_app' as host_contact_method,
  'https://images.unsplash.com/photo-1505691723518-36a5ac3be353?auto=format&fit=crop&w=1200&q=80' as cover_photo_url
from public.profiles
limit 1;

insert into public.housing_listings (
  created_by,
  title,
  housing_type,
  base_airport,
  neighborhood,
  city,
  state,
  price_monthly,
  price_nightly,
  bed_type,
  available_tonight,
  available_now,
  total_beds,
  bathrooms,
  distance_to_airport_minutes,
  crew_rules,
  amenities,
  lifestyle_tags,
  description,
  house_rules,
  host_name,
  host_contact_method,
  cover_photo_url
)
select
  id as created_by,
  'FLL Private Room – Dania Beach' as title,
  'room' as housing_type,
  'FLL' as base_airport,
  'Dania Beach' as neighborhood,
  'Fort Lauderdale' as city,
  'FL' as state,
  850 as price_monthly,
  null as price_nightly,
  'private_room' as bed_type,
  false as available_tonight,
  true as available_now,
  1 as total_beds,
  1 as bathrooms,
  10 as distance_to_airport_minutes,
  '{"crew_only": true}'::jsonb as crew_rules,
  '{"washer_dryer": true, "wifi": true}'::jsonb as amenities,
  '{"quiet_hours": true}'::jsonb as lifestyle_tags,
  'Private room near FLL with washer/dryer and easy beach access.' as description,
  'No smoking. Respect quiet hours.' as house_rules,
  'Taylor' as host_name,
  'in_app' as host_contact_method,
  'https://images.unsplash.com/photo-1617099404995-0a3f1f3a4f88?auto=format&fit=crop&w=1200&q=80' as cover_photo_url
from public.profiles
limit 1;

insert into public.housing_listings (
  created_by,
  title,
  housing_type,
  base_airport,
  neighborhood,
  city,
  state,
  price_monthly,
  price_nightly,
  bed_type,
  available_tonight,
  available_now,
  total_beds,
  bathrooms,
  distance_to_airport_minutes,
  crew_rules,
  amenities,
  lifestyle_tags,
  description,
  house_rules,
  host_name,
  host_contact_method,
  cover_photo_url
)
select
  id as created_by,
  'JFK Hot Bed Tonight – Jamaica' as title,
  'crashpad' as housing_type,
  'JFK' as base_airport,
  'Jamaica / Van Wyck' as neighborhood,
  'New York' as city,
  'NY' as state,
  400 as price_monthly,
  45 as price_nightly,
  'hot_bed' as bed_type,
  true as available_tonight,
  true as available_now,
  6 as total_beds,
  2 as bathrooms,
  10 as distance_to_airport_minutes,
  '{"crew_only": true}'::jsonb as crew_rules,
  '{"wifi": true, "kitchen_access": true, "shuttle": true}'::jsonb as amenities,
  '{"reserve_friendly": true}'::jsonb as lifestyle_tags,
  'Hot bed available tonight near JFK with shuttle and kitchen access.' as description,
  'Crew only. Lights out at 11pm.' as house_rules,
  'Sam' as host_name,
  'in_app' as host_contact_method,
  'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=1200&q=80' as cover_photo_url
from public.profiles
limit 1;
