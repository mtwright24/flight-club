-- Marsha's JFK demo crashpad: stable listing id + real created_by so favorites (user_saved_housing_listings)
-- and DMs (created_by → profile) work like any other listing. Matches app copy used in Pad Housing demo.

do $$
declare
  v_listing uuid := 'a0000000-0000-4000-8000-00000000fc01'::uuid;
  v_marsha uuid := '85f152bb-4b50-44c6-9f31-74f5906abb38'::uuid;
  v_photo1 uuid := 'b0000000-0000-4000-8000-00000000fc01'::uuid;
  v_photo2 uuid := 'b0000000-0000-4000-8000-00000000fc02'::uuid;
begin
  if not exists (select 1 from public.profiles where id = v_marsha) then
    raise notice 'seed_marsha_housing_demo_listing: skip — demo profile % not in public.profiles', v_marsha;
    return;
  end if;

  delete from public.housing_listing_photos where listing_id = v_listing;

  insert into public.housing_listings (
    id,
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
    cover_photo_url,
    price_type,
    posting_as,
    standby_bed_allowed,
    standby_price,
    beds_available_tonight,
    is_verified,
    is_active
  ) values (
    v_listing,
    v_marsha,
    E'Marsha''s JFK crew crashpad — cold bed available',
    'crashpad',
    'JFK',
    'Jamaica Estates',
    'Queens',
    'NY',
    850,
    null,
    'cold_bed',
    false,
    true,
    5,
    2,
    14,
    '{"crew_only": true, "coed": true, "reserve_friendly": true, "quiet_hours": true, "women_only": false, "men_only": false}'::jsonb,
    '{"washer_dryer": true, "kitchen_access": true, "fast_wifi": true, "parking": true, "airport_shuttle": false}'::jsonb,
    '{"quiet_hours": true, "social_lively": false}'::jsonb,
    'Marsha runs a relaxed JFK crew crashpad with assigned cold bunks, full kitchen, laundry in-unit, and fast Wi-Fi. Great for reserves: flexible checkout when trips drop. Express bus + AirTrain combo is about 25 minutes door-to-door depending on traffic.',
    'Quiet hours after 10pm. No smoking anywhere on the property. Label food in the fridge. Guests clean common areas on the chore chart. Marsha handles keys and rent.',
    'Marsha',
    'in_app',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1400&q=80',
    'monthly',
    'pad_manager',
    true,
    45,
    1,
    false,
    true
  )
  on conflict (id) do update set
    created_by = excluded.created_by,
    title = excluded.title,
    housing_type = excluded.housing_type,
    base_airport = excluded.base_airport,
    neighborhood = excluded.neighborhood,
    city = excluded.city,
    state = excluded.state,
    price_monthly = excluded.price_monthly,
    price_nightly = excluded.price_nightly,
    bed_type = excluded.bed_type,
    available_tonight = excluded.available_tonight,
    available_now = excluded.available_now,
    total_beds = excluded.total_beds,
    bathrooms = excluded.bathrooms,
    distance_to_airport_minutes = excluded.distance_to_airport_minutes,
    crew_rules = excluded.crew_rules,
    amenities = excluded.amenities,
    lifestyle_tags = excluded.lifestyle_tags,
    description = excluded.description,
    house_rules = excluded.house_rules,
    host_name = excluded.host_name,
    host_contact_method = excluded.host_contact_method,
    cover_photo_url = excluded.cover_photo_url,
    price_type = excluded.price_type,
    posting_as = excluded.posting_as,
    standby_bed_allowed = excluded.standby_bed_allowed,
    standby_price = excluded.standby_price,
    beds_available_tonight = excluded.beds_available_tonight,
    is_verified = excluded.is_verified,
    is_active = excluded.is_active,
    updated_at = now();

  insert into public.housing_listing_photos (id, listing_id, photo_url, sort_order) values
    (
      v_photo1,
      v_listing,
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1400&q=80',
      0
    ),
    (
      v_photo2,
      v_listing,
      'https://images.unsplash.com/photo-1556912172-45b7abe8b7e1?auto=format&fit=crop&w=1400&q=80',
      1
    )
  on conflict (id) do update set
    listing_id = excluded.listing_id,
    photo_url = excluded.photo_url,
    sort_order = excluded.sort_order;
end $$;
