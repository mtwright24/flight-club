import type { BedType, HousingListing, HousingListingPhoto, HousingNeedPost, HousingSavedSearch, HousingType } from '../types/housing';
import { supabase } from './supabaseClient';

export type HousingSort = 'recommended' | 'price_low' | 'price_high' | 'newest';

export type HousingFilters = {
  base_airport?: string;
  housing_type?: HousingType;
  bed_type?: BedType;
  min_price?: number;
  max_price?: number;
  available_tonight?: boolean;
  standby_only?: boolean;
  sort?: HousingSort;
  crew_rules?: string[];
  lifestyle_tags?: string[];
  amenities?: string[];
};

const missingHousingTablesLogged = new Set<string>();

function isMissingTableError(error: unknown, tableName: string): boolean {
  const code = String((error as any)?.code || '');
  const message = String((error as any)?.message || '');
  return code === 'PGRST205' && message.includes(`'public.${tableName}'`);
}

function logMissingTableOnce(tableName: string): void {
  if (missingHousingTablesLogged.has(tableName)) return;
  missingHousingTablesLogged.add(tableName);
  console.log(`[Housing] ${tableName} table missing; returning empty state until migrations are applied.`);
}

export async function fetchHousingListings(filters: HousingFilters = {}): Promise<HousingListing[]> {
  let query = supabase
    .from('housing_listings')
    .select('*')
    .eq('is_active', true);

  if (filters.base_airport) query = query.eq('base_airport', filters.base_airport);
  if (filters.housing_type) query = query.eq('housing_type', filters.housing_type);
  if (filters.bed_type) query = query.eq('bed_type', filters.bed_type);
  if (filters.available_tonight) query = query.eq('available_tonight', true);
  if (typeof filters.min_price === 'number') query = query.gte('price_monthly', filters.min_price);
  if (typeof filters.max_price === 'number') query = query.lte('price_monthly', filters.max_price);

  if (filters.standby_only) {
    query = query.eq('standby_bed_allowed', true).eq('available_tonight', true);
  }

   // JSONB tag filters (crew rules, lifestyle, amenities)
  if (filters.crew_rules && filters.crew_rules.length > 0) {
    const obj: Record<string, boolean> = {};
    filters.crew_rules.forEach((key) => {
      obj[key] = true;
    });
    query = query.contains('crew_rules', obj as any);
  }

  if (filters.lifestyle_tags && filters.lifestyle_tags.length > 0) {
    const obj: Record<string, boolean> = {};
    filters.lifestyle_tags.forEach((key) => {
      obj[key] = true;
    });
    query = query.contains('lifestyle_tags', obj as any);
  }

  if (filters.amenities && filters.amenities.length > 0) {
    const obj: Record<string, boolean> = {};
    filters.amenities.forEach((key) => {
      obj[key] = true;
    });
    query = query.contains('amenities', obj as any);
  }

  // Sort handling
  const sort = filters.sort || 'recommended';
  if (sort === 'price_low') {
    query = query.order('price_monthly', { ascending: true });
  } else if (sort === 'price_high') {
    query = query.order('price_monthly', { ascending: false });
  } else if (sort === 'newest') {
    query = query.order('created_at', { ascending: false });
  } else {
    // recommended: prioritize available tonight, then newest
    query = query.order('available_tonight', { ascending: false }).order('created_at', { ascending: false });
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error, 'housing_listings')) {
      logMissingTableOnce('housing_listings');
      return [];
    }
    console.log('fetchHousingListings error', error);
    return [];
  }
  return (data || []) as HousingListing[];
}

export async function fetchHousingListingById(id: string): Promise<HousingListing | null> {
  const { data, error } = await supabase
    .from('housing_listings')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.log('fetchHousingListingById error', error);
    return null;
  }
  return data as HousingListing | null;
}

export async function fetchHousingListingPhotos(listingId: string): Promise<HousingListingPhoto[]> {
  const { data, error } = await supabase
    .from('housing_listing_photos')
    .select('*')
    .eq('listing_id', listingId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.log('fetchHousingListingPhotos error', error);
    return [];
  }
  return (data || []) as HousingListingPhoto[];
}

export async function fetchSavedSearches(userId: string): Promise<HousingSavedSearch[]> {
  const { data, error } = await supabase
    .from('housing_saved_searches')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    if (isMissingTableError(error, 'housing_saved_searches')) {
      logMissingTableOnce('housing_saved_searches');
      return [];
    }
    console.log('fetchSavedSearches error', error);
    return [];
  }
  return (data || []) as HousingSavedSearch[];
}

export async function upsertSavedSearch(payload: Partial<HousingSavedSearch> & { user_id: string }): Promise<void> {
  const { error } = await supabase.from('housing_saved_searches').upsert(payload);
  if (error) console.log('upsertSavedSearch error', error);
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const { error } = await supabase.from('housing_saved_searches').delete().eq('id', id);
  if (error) console.log('deleteSavedSearch error', error);
}

export async function createHousingNeedPost(payload: Omit<HousingNeedPost, 'id' | 'created_at' | 'is_active'>): Promise<void> {
  const { error } = await supabase.from('housing_need_posts').insert(payload as any);
  if (error) console.log('createHousingNeedPost error', error);
}

export async function toggleSavedListing(
  userId: string,
  listingId: string,
  save: boolean
): Promise<{ error: string | null }> {
  if (save) {
    const { error } = await supabase.from('user_saved_housing_listings').insert({ user_id: userId, listing_id: listingId });
    if (error) {
      console.log('toggleSavedListing insert error', error);
      return { error: error.message };
    }
  } else {
    const { error } = await supabase
      .from('user_saved_housing_listings')
      .delete()
      .match({ user_id: userId, listing_id: listingId });
    if (error) {
      console.log('toggleSavedListing delete error', error);
      return { error: error.message };
    }
  }
  return { error: null };
}

export async function fetchHousingNeedPosts(filters: { base_airport?: string } = {}): Promise<HousingNeedPost[]> {
  let query = supabase
    .from('housing_need_posts')
    .select('*')
    .eq('is_active', true);

  if (filters.base_airport) {
    query = query.eq('base_airport', filters.base_airport);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) {
    console.log('fetchHousingNeedPosts error', error);
    return [];
  }
  return (data || []) as HousingNeedPost[];
}

export async function fetchSavedListingIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_saved_housing_listings')
    .select('listing_id')
    .eq('user_id', userId);

  if (error) {
    if (isMissingTableError(error, 'user_saved_housing_listings')) {
      logMissingTableOnce('user_saved_housing_listings');
      return [];
    }
    console.log('fetchSavedListingIds error', error);
    return [];
  }

  return (data || []).map((row: any) => row.listing_id as string);
}

export type CreateHousingListingPayload = {
  created_by: string;
  title: string;
  housing_type: HousingType;
  base_airport: string;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  address_line1?: string | null;
  price_type?: 'monthly' | 'nightly' | 'per_trip' | null;
  price_monthly?: number | null;
  price_nightly?: number | null;
  price_per_trip?: number | null;
  bed_type: BedType;
  posting_as?: string | null;
  available_tonight?: boolean;
  standby_bed_allowed?: boolean;
  standby_price?: number | null;
  available_now?: boolean;
  available_date?: string | null;
  beds_available_tonight?: number | null;
  total_beds?: number | null;
  bathrooms?: number | null;
  distance_to_airport_minutes?: number | null;
  crew_rules?: any | null;
  amenities?: any | null;
  lifestyle_tags?: any | null;
  description?: string | null;
  house_rules?: string | null;
  host_name?: string | null;
  host_contact_method?: string | null;
};

export async function createHousingListing(payload: CreateHousingListingPayload): Promise<HousingListing | null> {
  const insertPayload = {
    ...payload,
  } as any;

  const { data, error } = await supabase
    .from('housing_listings')
    .insert(insertPayload)
    .select('*')
    .maybeSingle();

  if (error) {
    console.log('createHousingListing error', error);
    return null;
  }

  return data as HousingListing | null;
}

export async function insertHousingListingPhoto(args: { listing_id: string; photo_url: string; sort_order?: number | null }): Promise<void> {
  const { listing_id, photo_url, sort_order } = args;
  const { error } = await supabase.from('housing_listing_photos').insert({
    listing_id,
    photo_url,
    sort_order: typeof sort_order === 'number' ? sort_order : null,
  } as any);

  if (error) {
    console.log('insertHousingListingPhoto error', error);
  }
}

export async function updateHousingListingCoverPhoto(listingId: string, coverPhotoUrl: string): Promise<void> {
  const { error } = await supabase
    .from('housing_listings')
    .update({ cover_photo_url: coverPhotoUrl } as any)
    .eq('id', listingId);

  if (error) {
    console.log('updateHousingListingCoverPhoto error', error);
  }
}
