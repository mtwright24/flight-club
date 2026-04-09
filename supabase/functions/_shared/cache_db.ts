import type { FlightProviderId, Json, NormalizedFlightTrackerResult } from './normalize.ts';

/** Provider-scoped keys so FlightAware and Aviationstack caches never collide. */
export function flightStatusCacheKey(
  providerId: FlightProviderId,
  carrierCode: string,
  flightNumber: string,
  flightDate: string,
): string {
  return `${providerId}:flight-status:${carrierCode.toUpperCase()}:${flightNumber.toUpperCase()}:${flightDate}`;
}

export function flightStatusCacheKeyByProviderFlightId(
  providerId: FlightProviderId,
  providerFlightId: string,
): string {
  return `${providerId}:flight-status:id:${providerFlightId}`;
}

export function airportBoardCacheKey(
  providerId: FlightProviderId,
  airportCode: string,
  boardType: string,
  dateKey: string,
): string {
  return `${providerId}:airport-board:${airportCode.toUpperCase()}:${boardType}:${dateKey}`;
}

export function flightSearchCacheKey(
  providerId: FlightProviderId,
  kind: string,
  q: string,
  date: string,
): string {
  return `${providerId}:flight-search:${kind}:${q.trim().toUpperCase()}:${date}`;
}

export function statusTtlMs(f: NormalizedFlightTrackerResult): number {
  const st = f.status;
  if (st === 'cancelled' || st === 'landed') return 120 * 60 * 1000;
  if (st === 'scheduled') return 90 * 1000;
  return 90 * 1000;
}

export async function readFlightStatusCache(
  supabase: any,
  cacheKey: string,
): Promise<{ payload_json: Json; expires_at: string } | null> {
  const { data, error } = await supabase
    .from('flight_status_cache')
    .select('payload_json, expires_at')
    .eq('cache_key', cacheKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(String(data.expires_at)).getTime() <= Date.now()) return null;
  return { payload_json: data.payload_json as Json, expires_at: String(data.expires_at) };
}

export async function writeFlightStatusCache(
  supabase: any,
  args: {
    cacheKey: string;
    carrierCode: string | null;
    flightNumber: string | null;
    flightDate: string | null;
    payload: Json;
    expiresAt: string;
    provider: FlightProviderId;
  },
): Promise<void> {
  const { error } = await supabase.from('flight_status_cache').upsert(
    {
      cache_key: args.cacheKey,
      carrier_code: args.carrierCode,
      flight_number: args.flightNumber,
      flight_date: args.flightDate,
      payload_json: args.payload,
      provider: args.provider,
      fetched_at: new Date().toISOString(),
      expires_at: args.expiresAt,
    },
    { onConflict: 'cache_key' },
  );
  if (error) throw error;
}

export async function readAirportBoardCache(
  supabase: any,
  cacheKey: string,
): Promise<Json | null> {
  const { data, error } = await supabase
    .from('airport_boards_cache')
    .select('payload_json, expires_at')
    .eq('cache_key', cacheKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(String(data.expires_at)).getTime() <= Date.now()) return null;
  return data.payload_json as Json;
}

export async function writeAirportBoardCache(
  supabase: any,
  args: {
    cacheKey: string;
    airportCode: string;
    boardType: string;
    dateKey: string;
    payload: Json;
    expiresAt: string;
    provider: FlightProviderId;
  },
): Promise<void> {
  const { error } = await supabase.from('airport_boards_cache').upsert(
    {
      cache_key: args.cacheKey,
      airport_code: args.airportCode,
      board_type: args.boardType,
      date_key: args.dateKey,
      payload_json: args.payload,
      provider: args.provider,
      fetched_at: new Date().toISOString(),
      expires_at: args.expiresAt,
    },
    { onConflict: 'cache_key' },
  );
  if (error) throw error;
}

export async function logApiFailure(
  supabase: any,
  row: {
    provider: string;
    endpoint: string;
    request_key?: string | null;
    status_code?: number | null;
    error_message?: string | null;
    response_excerpt?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from('flight_api_request_logs').insert({
    provider: row.provider,
    endpoint: row.endpoint,
    request_key: row.request_key ?? null,
    status_code: row.status_code ?? null,
    error_message: row.error_message ?? null,
    response_excerpt: row.response_excerpt?.slice(0, 2000) ?? null,
  });
  if (error) console.warn('[flight_api_request_logs]', error.message);
}
