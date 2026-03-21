export type HousingType = 'crashpad' | 'room' | 'apartment' | 'short_term';
export type BedType = 'hot_bed' | 'cold_bed' | 'private_room';

export interface HousingListing {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  title: string;
  housing_type: HousingType;
  base_airport: string;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  address_line1: string | null;
  price_type: 'monthly' | 'nightly' | 'per_trip' | null;
  price_monthly: number | null;
  price_nightly: number | null;
  price_per_trip: number | null;
  bed_type: BedType;
  posting_as: string | null;
  available_tonight: boolean;
  standby_bed_allowed: boolean;
  standby_price: number | null;
  available_now: boolean;
  available_date: string | null;
  beds_available_tonight: number | null;
  total_beds: number | null;
  bathrooms: number | null;
  distance_to_airport_minutes: number | null;
  crew_rules: any | null;
  amenities: any | null;
  lifestyle_tags: any | null;
  description: string | null;
  house_rules: string | null;
  host_name: string | null;
  host_contact_method: string | null;
  is_verified: boolean;
  is_active: boolean;
  cover_photo_url: string | null;
}

export interface HousingListingPhoto {
  id: string;
  listing_id: string;
  photo_url: string;
  sort_order: number;
}

export interface HousingSavedSearch {
  id: string;
  user_id: string;
  base_airport: string | null;
  area: string | null;
  housing_type: HousingType | null;
  min_price: number | null;
  max_price: number | null;
  bed_type: BedType | null;
  available_tonight: boolean;
  filters: any | null;
  standby_only?: boolean;
  alerts_enabled: boolean;
  created_at: string;
}

export interface HousingNeedPost {
  id: string;
  user_id: string;
  base_airport: string;
  area: string | null;
  need_type: HousingType | BedType;
  budget: number | null;
  start_date: string | null;
  need_tonight: boolean;
  duration: string | null;
  crew_type: string | null;
  preference_rules: any | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}
