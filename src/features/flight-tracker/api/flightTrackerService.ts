import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from '../../../lib/supabaseClient';
import { localCalendarDate } from '../flightDateLocal';
import type {
  NormalizedBoardRow,
  NormalizedFlightTrackerResult,
  NormalizedSearchResultItem,
  TrackedFlightRow,
} from '../types';

type InvokeRes<T> = { ok: boolean; data?: T; error?: string };

/** Set EXPO_PUBLIC_FLIGHT_TRACKER_DEBUG=1 to log invoke/search diagnostics in non-__DEV__ builds. */
function flightTrackerDiagEnabled(): boolean {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return true;
  try {
    return process.env.EXPO_PUBLIC_FLIGHT_TRACKER_DEBUG === '1';
  } catch {
    return false;
  }
}

/** Verbose diagnostics — uses console.warn so Metro shows it clearly. Never log tokens or API keys. */
export function flightTrackerDiag(scope: string, message: string, extra?: Record<string, unknown>): void {
  if (!flightTrackerDiagEnabled()) return;
  const tag = `[FlightTracker:${scope}]`;
  if (extra && Object.keys(extra).length > 0) console.warn(tag, message, extra);
  else console.warn(tag, message);
}

function summarizeInvokeData(name: string, data: unknown): Record<string, unknown> {
  if (data == null) return { data: 'null' };
  if (typeof data !== 'object') return { type: typeof data };
  const o = data as Record<string, unknown>;
  if (name === 'flight-search' && Array.isArray(o.results)) {
    return { resultsCount: o.results.length, source: o.source };
  }
  if (name === 'airport-board' && Array.isArray(o.rows)) {
    return { rowsCount: o.rows.length, source: o.source, airportCode: o.airportCode };
  }
  if (name === 'flight-status' && o.flight) return { hasFlight: true, source: o.source };
  return { keys: Object.keys(o).slice(0, 12) };
}

function postgrestMissingTable(error: unknown, table: string): boolean {
  const code = String((error as { code?: string })?.code || '');
  const message = String((error as { message?: string })?.message || '');
  return code === 'PGRST205' && message.includes(`'public.${table}'`);
}

async function invokeAuthHeaders(): Promise<Record<string, string>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function invokeFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const safeBody = { ...body };
  if (typeof safeBody.q === 'string') {
    const s = String(safeBody.q);
    safeBody.q = `${s.slice(0, 40)}${s.length > 40 ? '…' : ''}`;
  }
  flightTrackerDiag('invoke', `${name} → request`, { body: safeBody });

  const headers = await invokeAuthHeaders();
  const { data, error } = await supabase.functions.invoke(name, { body, headers });
  if (!error && data != null) {
    const res = data as InvokeRes<T>;
    if (res?.ok) {
      flightTrackerDiag('invoke', `${name} ← ok`, summarizeInvokeData(name, res.data));
      return res.data as T;
    }
    flightTrackerDiag('invoke', `${name} ← envelope ok:false`, { error: res?.error });
    throw new Error(res?.error || `Flight Tracker: ${name} failed`);
  }

  flightTrackerDiag('invoke', `${name} sdk invoke error`, {
    message: error?.message,
    name: (error as { name?: string })?.name,
  });

  /** SDK returns a generic "non-2xx" when the gateway rejects the call (often JWT verify). Retry with a direct fetch + anon key. */
  if (error?.message?.includes('non-2xx') || error?.message?.includes('Failed to send')) {
    flightTrackerDiag('invoke', `${name} retry via fetch`, {
      urlHost: SUPABASE_URL ? new URL(SUPABASE_URL).host : '?',
    });
    const { data: sessionData } = await supabase.auth.getSession();
    const userToken = sessionData?.session?.access_token;
    const token = userToken ?? SUPABASE_ANON_KEY;
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify(body),
    });
    let json: InvokeRes<T> = { ok: false };
    try {
      json = (await r.json()) as InvokeRes<T>;
    } catch (parseErr: unknown) {
      flightTrackerDiag('invoke', `${name} fetch JSON parse failed`, {
        status: r.status,
        message: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      throw new Error(`Flight Tracker: ${name} HTTP ${r.status} (invalid JSON)`);
    }
    if (r.ok && json?.ok) {
      flightTrackerDiag('invoke', `${name} ← fetch ok`, summarizeInvokeData(name, json.data));
      return json.data as T;
    }
    flightTrackerDiag('invoke', `${name} ← fetch failed`, {
      httpStatus: r.status,
      ok: json?.ok,
      error: json?.error,
    });
    throw new Error(json?.error || `Flight Tracker: ${name} HTTP ${r.status}`);
  }

  throw new Error(error?.message || `Flight Tracker: ${name} failed`);
}

/** Manual QA checklist: `src/features/flight-tracker/FLIGHT_TRACKER_TEST_CHECKLIST.md`. */

/**
 * Dev / debug diagnostics (same gate as `flightTrackerDiag`: __DEV__ or EXPO_PUBLIC_FLIGHT_TRACKER_DEBUG=1).
 * Never pass tokens, API keys, or raw auth headers.
 */
export function flightTrackerDevLog(scope: string, message: string, extra?: Record<string, unknown>): void {
  if (!flightTrackerDiagEnabled()) return;
  if (extra && Object.keys(extra).length > 0) console.log(`[FlightTracker:${scope}]`, message, extra);
  else console.log(`[FlightTracker:${scope}]`, message);
}

export async function flightSearch(q: string, date?: string, searchType?: string): Promise<{
  results: NormalizedSearchResultItem[];
  source: string;
}> {
  const d = date ?? localCalendarDate();
  flightTrackerDiag('flightSearch', 'call', { qLen: q.trim().length, date: d, searchType: searchType ?? '' });
  const out = await invokeFn<{ results: NormalizedSearchResultItem[]; source: string }>('flight-search', {
    q,
    date: d,
    searchType: searchType ?? '',
  });
  flightTrackerDiag('flightSearch', 'done', { resultsCount: out.results?.length ?? 0, source: out.source });
  return out;
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
  const date = params.date ?? localCalendarDate();
  flightTrackerDiag('airportBoardFetch', 'call', { airportCode: params.airportCode, boardType: params.boardType, date });
  const out = await invokeFn<{ airportCode: string; boardType: string; rows: NormalizedBoardRow[]; source: string }>(
    'airport-board',
    {
      airportCode: params.airportCode,
      boardType: params.boardType,
      date,
    },
  );
  flightTrackerDiag('airportBoardFetch', 'done', { rowsCount: out.rows?.length ?? 0, source: out.source });
  return out;
}

export type InboundAircraftData =
  | {
      supported: true;
      flight: NormalizedFlightTrackerResult;
      inboundFlight: NormalizedFlightTrackerResult | null;
      riskLevel: string;
      minutesLate: number | null;
    }
  | {
      supported: false;
      provider: string;
      reason: string;
    };

export async function inboundAircraftFetch(params: {
  trackedFlightId?: string;
  carrierCode?: string;
  flightNumber?: string;
  flightDate?: string;
  providerFlightId?: string;
}): Promise<InboundAircraftData> {
  const data = await invokeFn<InboundAircraftData>('inbound-aircraft', params);
  if (__DEV__ && data && 'supported' in data && data.supported === false) {
    flightTrackerDevLog('inbound', 'unsupported_response', { provider: data.provider, reason: data.reason });
  }
  return data;
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
