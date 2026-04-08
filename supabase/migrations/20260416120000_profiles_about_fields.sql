-- About / bio-adjacent fields used by app/edit-profile.tsx and lib/profile.ts
-- Fixes PGRST204 "column does not exist" when upserting these keys.

alter table public.profiles
  add column if not exists aviation_since_year text,
  add column if not exists commuter_status text,
  add column if not exists favorite_layover_city text,
  add column if not exists hometown text,
  add column if not exists interests text,
  add column if not exists languages text,
  add column if not exists lives_in text;

comment on column public.profiles.aviation_since_year is 'Year or label for when user started in aviation';
comment on column public.profiles.commuter_status is 'Commuter / local / etc.';
comment on column public.profiles.favorite_layover_city is 'Favorite layover city (free text)';
comment on column public.profiles.hometown is 'Hometown';
comment on column public.profiles.interests is 'Interests (comma-separated or free text)';
comment on column public.profiles.languages is 'Languages spoken (comma-separated or free text)';
comment on column public.profiles.lives_in is 'Current city / region';
