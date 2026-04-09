import { supabase } from '../../../lib/supabaseClient';
import type {
  NormalizedBoardRow,
  NormalizedFlightTrackerResult,
  NormalizedSearchResultItem,
  TrackedFlightRow,
} from '../types';

type InvokeRes<T> = { ok: boolean; data?: T; error?: string };

function postgrestMissingTable(error: unknown, table: string): boolean {
  const code = String((error as { code?: string })?.code || '');
  const message = String((error as { message?: string })?.message || '');
  return code === 'PGRST205' && message.includes(`'public.${table}'`);
}

async function invokeFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message || `Flight Tracker: ${name} failed`);
  const res = data as InvokeRes<T>;
  if (!res?.ok) {
    throw new Error(res?.error || `Flight Tracker: ${name} failed`);
  }
  return res.data as T;
}

export async function flightSearch(q: string, date?: string, searchType?: string): Promise<{
  results: NormalizedSearchResultItem[];
  source: string;
}> {
  return invokeFn('flight-search', {
    q,
    date: date ?? new Date().toISOString().slice(0, 10),
    searchType: searchType ?? '',
  });
}

export async function flightStatus(params: {
  carrierCode: string;
  flightNumber: string;
  flightDate: string;
  providerFlightId?: string | null;
}): Promise<{ flight: NormalizedFlightTrackerResult; source: string }> {
  return invokeFn('flight-status', {
    carrierCode: params.carrierCode,
    flightNumber: params.flightNumber,
    flightDate: params.flightDate,
    providerFlightId: params.providerFlightId ?? '',
  });
}

export async function airportBoardFetch(params: {
  airportCode: string;
  boardType: 'arrivals' | 'departures';
  date?: string;
}): Promise<{ airportCode: string; boardType: string; rows: NormalizedBoardRow[]; source: string }> {
  return invokeFn('airport-board', {
    airportCode: params.airportCode,
    boardType: params.boardType,
    date: params.date ?? new Date().toISOString().slice(0, 10),
  });
}

export async function inboundAircraftFetch(params: {
  trackedFlightId?: string;
  carrierCode?: string;
  flightNumber?: string;
  flightDate?: string;
  providerFlightId?: string;
}): Promise<{
  flight: NormalizedFlightTrackerResult;
  inboundFlight: NormalizedFlightTrackerResult | null;
  riskLevel: string;
  minutesLate: number | null;
}> {
  return invokeFn('inbound-aircraft', params);
}

export async function saveTrackedFlight(flight: NormalizedFlightTrackerResult, options?: { isPinned?: boolean }): Promise<{
  trackedFlightId: string;
}> {
  return invokeFn('save-tracked-flight', {
    flight,
    isPinned: options?.isPinned ?? false,
  });
}

export async function syncScheduleFlight(params: {
  scheduleItemId: string;
  carrierCode: string;
  flightNumber: string;
  flightDate: string;
}): Promise<{
  syncStatus: string;
  trackedFlightId?: string;
  flight?: NormalizedFlightTrackerResult;
  flightKey?: string;
  message?: string;
}> {
  return invokeFn('sync-schedule-flight', params);
}

/** Returns null when `tracked_flights` is not in the schema (migrations not applied). */
export async function listTrackedFlightsFromDb(userId: string): Promise<TrackedFlightRow[] | null> {
  const { data, error } = await supabase
    .from('tracked_flights')
    .select('*')
    .eq('user_id', userId)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) {
    if (postgrestMissingTable(error, 'tracked_flights')) return null;
    throw new Error(error.message || 'Unable to load tracked flights');
  }
  return (data || []) as TrackedFlightRow[];
}

export async function deleteTrackedFlight(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('tracked_flights').delete().eq('user_id', userId).eq('id', id);
  if (error) throw new Error('Unable to remove tracked flight');
}

export async function listSearchHistory(userId: string, limit = 12): Promise<
  {
    query: string;
    query_type: string;
    search_type: string | null;
    created_at: string;
  }[]
> {
  const { data, error } = await supabase
    .from('flight_search_history')
    .select('query, query_type, search_type, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []).map((r: any) => ({
    query: String(r.query || ''),
    query_type: String(r.query_type || ''),
    search_type: r.search_type ? String(r.search_type) : null,
    created_at: String(r.created_at || ''),
  }));
}

export async function updateFlightWatchAlert(
  userId: string,
  trackedFlightId: string,
  alertType: string,
  isEnabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('flight_watch_alerts')
    .update({ is_enabled: isEnabled })
    .eq('user_id', userId)
    .eq('tracked_flight_id', trackedFlightId)
    .eq('alert_type', alertType);
  if (error) throw new Error('Unable to update alert preference');
}

export async function listFlightWatchAlerts(
  userId: string,
  trackedFlightId: string,
): Promise<{ alert_type: string; is_enabled: boolean }[]> {
  const { data, error } = await supabase
    .from('flight_watch_alerts')
    .select('alert_type, is_enabled')
    .eq('user_id', userId)
    .eq('tracked_flight_id', trackedFlightId);
  if (error) return [];
  return (data || []) as { alert_type: string; is_enabled: boolean }[];
}

export type ScheduleFlightLinkRow = {
  id: string;
  schedule_item_id: string;
  carrier_code: string;
  flight_number: string;
  flight_date: string;
  sync_status: string;
  tracked_flight_id: string | null;
  last_synced_at: string | null;
  updated_at: string;
};

export async function listScheduleFlightLinks(userId: string, limit = 40): Promise<ScheduleFlightLinkRow[]> {
  const { data, error } = await supabase
    .from('schedule_flight_links')
    .select('id, schedule_item_id, carrier_code, flight_number, flight_date, sync_status, tracked_flight_id, last_synced_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []) as ScheduleFlightLinkRow[];
}
