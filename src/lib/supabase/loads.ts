/**
 * Supabase helpers for Non-Rev / Staff Loads feature
 */

import { supabase } from '../supabaseClient';

// Get credits ledger/history for the current user (RLS limits to own rows)
export async function getCreditsLedger() {
  return supabase.from('credits_ledger').select('*').order('created_at', { ascending: false });
}

// Types
export interface NonRevSearch {
  id: string;
  user_id: string;
  airline_code: string;
  from_airport: string;
  to_airport: string;
  travel_date: string;
  created_at: string;
}

export interface NonRevLoadFlight {
  id: string;
  airline_code: string;
  flight_number: string;
  from_airport: string;
  to_airport: string;
  depart_at: string;
  arrive_at: string;
  travel_date: string;
  created_at: string;
}

export interface NonRevLoadReport {
  id: string;
  flight_id: string;
  user_id: string;
  status: 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'FULL';
  notes?: string;
  media_url?: string;
  created_at: string;
  user?: { display_name: string };
}

export interface NonRevAlert {
  id: string;
  user_id: string;
  airline_code: string;
  from_airport: string;
  to_airport: string;
  travel_date: string;
  notify_new_reports: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserEntitlements {
  id: string;
  user_id: string;
  loads_plan: 'NONE' | 'LOADS_BASIC' | 'LOADS_PRO';
  loads_requests_remaining: number;
  loads_access_expires_at?: string;
  alerts_plan: 'NONE' | 'ALERTS_BASIC' | 'ALERTS_PRO';
  alerts_access_expires_at?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// FLIGHTS
// ============================================================================

/**
 * Generate mock flights for a given route/date
 * These are deterministic so same search yields same results
 */
function generateMockFlights(
  airline: string,
  from: string,
  to: string,
  date: string
): Omit<NonRevLoadFlight, 'id' | 'created_at'>[] {
  // Seed based on route + date for determinism
  const seed = `${airline}-${from}-${to}-${date}`.charCodeAt(0) +
    `${airline}-${from}-${to}-${date}`.charCodeAt(5);

  const flights: Omit<NonRevLoadFlight, 'id' | 'created_at'>[] = [];
  const baseHour = 6 + (seed % 12);
  const flightCount = 8 + (seed % 5);

  for (let i = 0; i < flightCount; i++) {
    const departHour = (baseHour + i * 2) % 24;
    const arriveHour = (departHour + 4 + (seed % 3)) % 24;

    const [dYear, dMonth, dDay] = date.split('-');
    const departAt = new Date(`${dYear}-${dMonth}-${dDay}T${String(departHour).padStart(2, '0')}:${String(i * 5 % 60).padStart(2, '0')}:00Z`).toISOString();
    const arriveAt = new Date(`${dYear}-${dMonth}-${dDay}T${String(arriveHour).padStart(2, '0')}:${String((i * 5 + 45) % 60).padStart(2, '0')}:00Z`).toISOString();

    flights.push({
      airline_code: airline,
      flight_number: `${airline.toUpperCase()}${1000 + seed + i}`,
      from_airport: from,
      to_airport: to,
      depart_at: departAt,
      arrive_at: arriveAt,
      travel_date: date,
    });
  }

  return flights.sort((a, b) => new Date(a.depart_at).getTime() - new Date(b.depart_at).getTime());
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(s: string): boolean {
  return typeof s === 'string' && UUID_RE.test(s.trim());
}

/**
 * Search for flights (generate mock data and store in DB)
 */
export async function searchFlights(
  userId: string,
  airline: string,
  from: string,
  to: string,
  date: string
): Promise<{ flights: NonRevLoadFlight[]; error?: string }> {
  try {
    // Best-effort search history (requires auth user id)
    if (isValidUuid(userId)) {
      const { error: logError } = await supabase.from('nonrev_searches').insert({
        user_id: userId,
        airline_code: airline,
        from_airport: from,
        to_airport: to,
        travel_date: date,
      });
      if (logError) {
        console.warn('[Loads] Search history not saved:', logError.message);
      }
    }

    // Generate mock flights
    const mockFlights = generateMockFlights(airline, from, to, date);

    // Upsert into DB (so reports can attach)
    const { data, error } = await supabase
      .from('nonrev_load_flights')
      .upsert(mockFlights, {
        onConflict: 'airline_code,flight_number,depart_at,travel_date',
      })
      .select();

    if (error) {
      console.warn('[Loads] nonrev_load_flights upsert failed, returning in-memory results:', error.message);
      return {
        flights: mockFlights.map((f, i) => ({
          ...f,
          id: `local-${i}-${f.flight_number}`,
          created_at: new Date().toISOString(),
        })) as NonRevLoadFlight[],
      };
    }

    return { flights: data || [] };
  } catch (error: any) {
    const msg = error?.message || 'Search failed';
    console.error('[Loads] Search error:', msg);
    return { flights: [], error: msg };
  }
}

/**
 * Get single flight with its reports
 */
export async function getFlight(flightId: string): Promise<{
  flight: NonRevLoadFlight | null;
  reports: NonRevLoadReport[];
  error?: string;
}> {
  try {
    const { data: flight, error: flightError } = await supabase
      .from('nonrev_load_flights')
      .select('*')
      .eq('id', flightId)
      .single();

    if (flightError) throw flightError;

    const { data: reports, error: reportsError } = await supabase
      .from('nonrev_load_reports')
      .select('*')
      .eq('flight_id', flightId)
      .order('created_at', { ascending: false });

    if (reportsError) throw reportsError;

    const reportRows = reports || [];
    const authorIds = [...new Set(reportRows.map((r) => r.user_id).filter(Boolean))];
    const { data: authorProfiles } =
      authorIds.length > 0
        ? await supabase.from('profiles').select('id, display_name').in('id', authorIds)
        : { data: [] as { id: string; display_name: string | null }[] };
    const nameByUserId = Object.fromEntries((authorProfiles || []).map((p) => [p.id, p.display_name]));

    const normalizedReports = reportRows.map((r: any) => {
      const displayName = nameByUserId[r.user_id] ?? undefined;
      return {
        ...r,
        user: displayName != null ? { display_name: displayName } : undefined,
      } as NonRevLoadReport;
    });

    return {
      flight: flight || null,
      reports: normalizedReports,
    };
  } catch (error: any) {
    const msg = error?.message || 'Get flight failed';
    console.error('[Loads] Get flight error:', msg);
    return { flight: null, reports: [], error: msg };
  }
}

/**
 * Create a load report on a flight
 */
export async function createLoadReport(
  userId: string,
  flightId: string,
  status: 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'FULL',
  notes?: string,
  mediaUrl?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('nonrev_load_reports')
      .insert({
        flight_id: flightId,
        user_id: userId,
        status,
        notes: notes || null,
        media_url: mediaUrl || null,
      })
      .throwOnError();

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    const msg = error?.message || 'Report failed';
    console.error('[Loads] Create report error:', msg);
    return { success: false, error: msg };
  }
}

// ============================================================================
// ALERTS
// ============================================================================

/**
 * Create a saved alert for a route/date
 */
export async function createAlert(
  userId: string,
  airline: string,
  from: string,
  to: string,
  date: string,
  notifyNewReports: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('nonrev_alerts')
      .insert({
        user_id: userId,
        airline_code: airline,
        from_airport: from,
        to_airport: to,
        travel_date: date,
        notify_new_reports: notifyNewReports,
        enabled: true,
      })
      .throwOnError();

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    const msg = error?.message || 'Alert creation failed';
    console.error('[Loads] Create alert error:', msg);
    return { success: false, error: msg };
  }
}

/**
 * List user's saved alerts
 */
export async function listAlerts(userId: string): Promise<{
  alerts: NonRevAlert[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('nonrev_alerts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { alerts: data || [] };
  } catch (error: any) {
    const msg = error?.message || 'List alerts failed';
    console.error('[Loads] List alerts error:', msg);
    return { alerts: [], error: msg };
  }
}

/**
 * Toggle alert enabled/disabled
 */
export async function toggleAlert(alertId: string, enabled: boolean): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { error } = await supabase
      .from('nonrev_alerts')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('id', alertId)
      .throwOnError();

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    const msg = error?.message || 'Toggle alert failed';
    console.error('[Loads] Toggle alert error:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Delete a saved alert
 */
export async function deleteAlert(alertId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { error } = await supabase
      .from('nonrev_alerts')
      .delete()
      .eq('id', alertId)
      .throwOnError();

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    const msg = error?.message || 'Delete alert failed';
    console.error('[Loads] Delete alert error:', msg);
    return { success: false, error: msg };
  }
}

// ============================================================================
// ENTITLEMENTS
// ============================================================================

/**
 * Get user entitlements
 */
export async function getUserEntitlements(userId: string): Promise<{
  entitlements: UserEntitlements | null;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('user_entitlements')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;

    // If no entitlements row exists, create one
    if (!data) {
      const { data: created, error: createError } = await supabase
        .from('user_entitlements')
        .insert({
          user_id: userId,
          loads_plan: 'NONE',
          loads_requests_remaining: 0,
          alerts_plan: 'NONE',
        })
        .select()
        .single();

      if (createError) throw createError;
      return { entitlements: created || null };
    }

    return { entitlements: data };
  } catch (error: any) {
    const msg = error?.message || 'Get entitlements failed';
    console.error('[Loads] Get entitlements error:', msg);
    return { entitlements: null, error: msg };
  }
}

/**
 * Check if user can post a loads request
 * Returns true if:
 * - Has active plan (not expired)
 * - Has remaining requests in current bundle
 * - Has >= 1 credit
 */
export async function canPostLoadsRequest(userId: string): Promise<{
  allowed: boolean;
  mode?: 'PLAN' | 'REQUESTS' | 'CREDITS' | 'NONE';
  reason?: string;
}> {
  try {
    const { entitlements, error: entError } = await getUserEntitlements(userId);
    if (entError || !entitlements) {
      return { allowed: false, mode: 'NONE', reason: 'Unable to check access' };
    }

    const { data: ucRow } = await supabase.from('user_credits').select('balance').eq('user_id', userId).maybeSingle();
    const { data: profile } = await supabase.from('profiles').select('credits_balance').eq('id', userId).maybeSingle();

    const creditsBalance = Math.max(ucRow?.balance ?? 0, profile?.credits_balance ?? 0);
    const now = new Date().toISOString();

    // Check active plan
    if (entitlements.loads_plan !== 'NONE' && entitlements.loads_access_expires_at) {
      if (entitlements.loads_access_expires_at > now) {
        return { allowed: true, mode: 'PLAN' };
      }
    }

    // Check remaining requests (day pass)
    if (entitlements.loads_requests_remaining > 0) {
      return { allowed: true, mode: 'REQUESTS' };
    }

    // Check credits
    if (creditsBalance >= 1) {
      return { allowed: true, mode: 'CREDITS' };
    }

    return {
      allowed: false,
      mode: 'NONE',
      reason: 'You do not have sufficient credits to post 1 request.',
    };
  } catch (error: any) {
    console.error('[Loads] Check access error:', error?.message);
    return {
      allowed: false,
      mode: 'NONE',
      reason: 'Unable to check access',
    };
  }
}

// ===================== NEW LOADS REQUESTS/ANSWERS/CREDITS =====================

// Types for new schema
export interface LoadRequest {
  id: string;
  user_id: string;
  airline_code: string;
  from_airport: string;
  to_airport: string;
  travel_date: string;
  options: any;
  status: string;
  created_at: string;
}

export interface LoadAnswer {
  id: string;
  request_id: string;
  user_id: string;
  load_level: string;
  notes?: string;
  as_of: string;
  created_at: string;
}

export interface UserCredits {
  user_id: string;
  balance: number;
  updated_at: string;
}

export interface CreditsLedger {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  source: string;
  created_at: string;
}


// Create a new load request
export async function createLoadRequest({
  airline_code,
  from_airport,
  to_airport,
  travel_date,
  options,
}: Pick<LoadRequest, 'airline_code' | 'from_airport' | 'to_airport' | 'travel_date'> & { options?: any }) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) {
    return { data: null, error: { message: 'Not signed in' } as any };
  }
  return supabase
    .from('load_requests')
    .insert([{ user_id: uid, airline_code, from_airport, to_airport, travel_date, options }]);
}

// List load requests by status (open/answered)
export async function listLoadRequests({ status }: { status: 'open' | 'answered' }) {
  return supabase.from('load_requests').select('*').eq('status', status).order('created_at', { ascending: false });
}

// Get a single load request (with answers)
export async function getLoadRequest(id: string) {
  return supabase.from('load_requests').select('*, load_answers(*)').eq('id', id).single();
}

// List answers for a load request
export async function listLoadAnswers(requestId: string) {
  return supabase.from('load_answers').select('*').eq('request_id', requestId).order('created_at', { ascending: false });
}

// Post an answer to a load request
export async function postLoadAnswer(requestId: string, payload: { load_level: string; notes?: string }) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) {
    return { data: null, error: { message: 'Not signed in' } as any };
  }
  return supabase.from('load_answers').insert([{ request_id: requestId, user_id: uid, ...payload }]);
}

// Get current user's credits balance
export async function getCreditsBalance() {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) {
    return { data: null, error: { message: 'Not signed in' } as any };
  }
  return supabase.from('user_credits').select('balance').eq('user_id', uid).maybeSingle();
}

// Purchase credits (stub, updates UI and simulates purchase)
export async function purchaseCredits(packageId: string) {
  // Simulate a purchase, in real implementation this would call IAP and backend
  // For now, just grant credits for the selected package
  // Map packageId to amount
  const packageMap: Record<string, number> = {
    '1': 1,
    '5': 5,
    '10': 10,
    '30': 30,
    '50': 50,
    '100': 100,
  };
  const amount = packageMap[packageId] || 0;
  if (amount > 0) {
    return grantCredits(amount, 'Purchase', 'iap');
  }
  return { error: 'Invalid package' };
}

// Spend credits via RPC
export async function spendCredit(amount: number, reason: string, source: string) {
  return supabase.rpc('rpc_spend_credit', { amount, reason, source });
}

// Grant credits via RPC
export async function grantCredits(amount: number, reason: string, source: string) {
  return supabase.rpc('rpc_grant_credits', { amount, reason, source });
}
