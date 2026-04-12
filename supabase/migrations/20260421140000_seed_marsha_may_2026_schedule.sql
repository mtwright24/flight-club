-- Demo seed for Marsha May 2026 moved to 20260411190000_reseed_marsha_may_2026_flica.sql
-- (shared trip_group_id per pairing, FLICA layover text, depart_local / arrive_local).
-- This migration is retained for history; applying it does nothing.

do $$
begin
  raise notice 'seed_marsha_may_2026: superseded by 20260411190000_reseed_marsha_may_2026_flica.sql';
end $$;
