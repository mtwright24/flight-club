-- Extend housing tables with availability, pricing type, posting role, and standby fields

alter table public.housing_listings
  add column if not exists price_type text,
  add column if not exists price_per_trip numeric,
  add column if not exists posting_as text,
  add column if not exists standby_bed_allowed boolean not null default false,
  add column if not exists standby_price numeric,
  add column if not exists beds_available_tonight integer,
  add column if not exists is_verified boolean not null default false;

alter table public.housing_saved_searches
  add column if not exists standby_only boolean not null default false;

create index if not exists idx_housing_listings_standby
  on public.housing_listings(standby_bed_allowed, available_tonight);
