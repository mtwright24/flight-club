// @ts-expect-error Deno std
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error Deno esm
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Json = Record<string, unknown>;

type FlightStatus =
  | 'scheduled'
  | 'boarding'
  | 'taxiing'
  | 'departed'
  | 'en_route'
  | 'delayed'
  | 'holding'
  | 'landed'
  | 'cancelled'
  | 'unknown';

type NormalizedFlight = {
  flight_key: string;
  provider_flight_id: string | null;
  airline_code: string;
  airline_name: string | null;
  flight_number: string;
  origin_airport: string;
  destination_airport: string;
  service_date: string;
  normalized_status: FlightStatus;
  flight_status_raw: string | null;
  scheduled_departure: string | null;
  scheduled_arrival: string | null;
  estimated_departure: string | null;
  estimated_arrival: string | null;
  actual_departure: string | null;
  actual_arrival: string | null;
  delay_minutes: number | null;
  aircraft_type: string | null;
  registration: string | null;
  terminal: string | null;
  gate: string | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  latitude: number | null;
  longitude: number | null;
  route_data: Json | null;
  last_provider_update_at: string | null;
  cache_expires_at: string;
  cached_at: string;
};

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const statusRefreshMs: Record<FlightStatus, number> = {
  scheduled: 30 * 60 * 1000,
  boarding: 2 * 60 * 1000,
  taxiing: 60 * 1000,
  departed: 2 * 60 * 1000,
  en_route: 2 * 60 * 1000,
  delayed: 2 * 60 * 1000,
  holding: 90 * 1000,
  landed: 8 * 60 * 60 * 1000,
  cancelled: 12 * 60 * 60 * 1000,
  unknown: 30 * 60 * 1000,
};

function toStatus(raw: string | null | undefined): FlightStatus {
  const s = String(raw || '').toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('land')) return 'landed';
  if (s.includes('hold')) return 'holding';
  if (s.includes('delay')) return 'delayed';
  if (s.includes('enroute') || s.includes('en route') || s.includes('airborne')) return 'en_route';
  if (s.includes('depart')) return 'departed';
  if (s.includes('taxi')) return 'taxiing';
  if (s.includes('board')) return 'boarding';
  if (s.includes('sched')) return 'scheduled';
  return 'unknown';
}

function compact(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

function parseDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function buildFlightKey(args: {
  airlineCode: string;
  flightNumber: string;
  serviceDate: string;
  origin?: string | null;
  destination?: string | null;
}): string {
  const airline = args.airlineCode.trim().toUpperCase();
  const flight = args.flightNumber.trim().toUpperCase();
  const date = args.serviceDate.trim();
  const origin = (args.origin || 'UNK').trim().toUpperCase();
  const destination = (args.destination || 'UNK').trim().toUpperCase();
  return `${airline}-${flight}-${date}-${origin}-${destination}`;
}

function computeDelayMinutes(
  scheduledDeparture: string | null,
  estimatedDeparture: string | null,
  scheduledArrival: string | null,
  estimatedArrival: string | null,
): number | null {
  const sDep = scheduledDeparture ? new Date(scheduledDeparture).getTime() : NaN;
  const eDep = estimatedDeparture ? new Date(estimatedDeparture).getTime() : NaN;
  if (Number.isFinite(sDep) && Number.isFinite(eDep)) {
    return Math.round((eDep - sDep) / 60000);
  }
  const sArr = scheduledArrival ? new Date(scheduledArrival).getTime() : NaN;
  const eArr = estimatedArrival ? new Date(estimatedArrival).getTime() : NaN;
  if (Number.isFinite(sArr) && Number.isFinite(eArr)) {
    return Math.round((eArr - sArr) / 60000);
  }
  return null;
}

function expiresAtFor(f: NormalizedFlight): string {
  const now = Date.now();
  const ttl = statusRefreshMs[f.normalized_status] ?? (30 * 60 * 1000);
  const serviceMs = new Date(`${f.service_date}T00:00:00Z`).getTime();
  const dayDiff = Math.abs(now - serviceMs) / (1000 * 60 * 60 * 24);
  if (dayDiff > 1 && f.normalized_status === 'scheduled') {
    return new Date(now + 8 * 60 * 60 * 1000).toISOString();
  }
  return new Date(now + ttl).toISOString();
}

async function fetchProviderJson(baseUrl: string, apiKey: string, path: string): Promise<unknown> {
  const url = `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'x-apikey': apiKey,
    },
  });
  if (!res.ok) {
    throw new Error(`AeroAPI ${res.status} for ${path}`);
  }
  return await res.json();
}

function firstProviderFlight(payload: unknown): Json | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Json;
  const arr = (Array.isArray(p.flights) ? p.flights : Array.isArray(p.data) ? p.data : []) as Json[];
  if (!arr.length) return null;
  return arr[0];
}

function mapProviderFlight(providerFlight: Json, fallback: {
  airlineCode?: string;
  flightNumber?: string;
  serviceDate: string;
  origin?: string;
  destination?: string;
}): NormalizedFlight | null {
  const ident = compact(providerFlight.ident) || compact(providerFlight.flight_number) || '';
  const airlineCode = compact(providerFlight.operator_iata) || compact(providerFlight.airline_iata) || fallback.airlineCode || '';
  const digits = ident.replace(/^[A-Z]+/i, '') || fallback.flightNumber || '';
  const origin = compact(providerFlight.origin?.toString()) || compact((providerFlight.origin as Json)?.code_iata) || fallback.origin || '';
  const destination =
    compact(providerFlight.destination?.toString()) || compact((providerFlight.destination as Json)?.code_iata) || fallback.destination || '';
  if (!airlineCode || !digits || !origin || !destination) return null;

  const scheduledDeparture = parseDate(
    providerFlight.scheduled_out || providerFlight.scheduled_departure_time || providerFlight.scheduled_departure,
  );
  const scheduledArrival = parseDate(
    providerFlight.scheduled_in || providerFlight.scheduled_arrival_time || providerFlight.scheduled_arrival,
  );
  const estimatedDeparture = parseDate(
    providerFlight.estimated_out || providerFlight.estimated_departure_time || providerFlight.estimated_departure,
  );
  const estimatedArrival = parseDate(
    providerFlight.estimated_in || providerFlight.estimated_arrival_time || providerFlight.estimated_arrival,
  );
  const actualDeparture = parseDate(providerFlight.actual_out || providerFlight.actual_departure_time || providerFlight.actual_departure);
  const actualArrival = parseDate(providerFlight.actual_in || providerFlight.actual_arrival_time || providerFlight.actual_arrival);
  const rawStatus =
    compact(providerFlight.status) ||
    compact(providerFlight.flight_status) ||
    compact(providerFlight.status_text) ||
    compact(providerFlight.progress) ||
    'unknown';

  const mapped: NormalizedFlight = {
    flight_key: buildFlightKey({
      airlineCode,
      flightNumber: digits,
      serviceDate: fallback.serviceDate,
      origin,
      destination,
    }),
    provider_flight_id: compact(providerFlight.fa_flight_id) || compact(providerFlight.provider_flight_id),
    airline_code: airlineCode.toUpperCase(),
    airline_name: compact(providerFlight.operator_name) || compact(providerFlight.airline_name),
    flight_number: digits.toUpperCase(),
    origin_airport: origin.toUpperCase(),
    destination_airport: destination.toUpperCase(),
    service_date: fallback.serviceDate,
    normalized_status: toStatus(rawStatus),
    flight_status_raw: rawStatus,
    scheduled_departure: scheduledDeparture,
    scheduled_arrival: scheduledArrival,
    estimated_departure: estimatedDeparture,
    estimated_arrival: estimatedArrival,
    actual_departure: actualDeparture,
    actual_arrival: actualArrival,
    delay_minutes: computeDelayMinutes(scheduledDeparture, estimatedDeparture, scheduledArrival, estimatedArrival),
    aircraft_type: compact(providerFlight.aircraft_type) || compact((providerFlight.aircraft as Json)?.type),
    registration: compact(providerFlight.registration) || compact((providerFlight.aircraft as Json)?.registration),
    terminal: compact(providerFlight.terminal_origin) || compact(providerFlight.terminal),
    gate: compact(providerFlight.gate_origin) || compact(providerFlight.gate),
    altitude: num(providerFlight.altitude),
    speed: num(providerFlight.groundspeed) ?? num(providerFlight.speed),
    heading: num(providerFlight.heading),
    latitude: num(providerFlight.latitude),
    longitude: num(providerFlight.longitude),
    route_data: {
      route: providerFlight.route,
      track: providerFlight.track,
    },
    last_provider_update_at: parseDate(providerFlight.last_position_time || providerFlight.last_updated),
    cache_expires_at: new Date().toISOString(),
    cached_at: new Date().toISOString(),
  };
  mapped.cache_expires_at = expiresAtFor(mapped);
  return mapped;
}

async function getCachedFlightByKey(supabase: any, flightKey: string): Promise<Json | null> {
  const { data, error } = await supabase
    .from('tracked_flights_cache')
    .select('*')
    .eq('flight_key', flightKey)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function upsertCachedFlight(supabase: any, flight: NormalizedFlight): Promise<void> {
  const prev = await getCachedFlightByKey(supabase, flight.flight_key);

  const { error } = await supabase.from('tracked_flights_cache').upsert({
    flight_key: flight.flight_key,
    provider_flight_id: flight.provider_flight_id,
    airline_code: flight.airline_code,
    airline_name: flight.airline_name,
    flight_number: flight.flight_number,
    origin_airport: flight.origin_airport,
    destination_airport: flight.destination_airport,
    service_date: flight.service_date,
    normalized_status: flight.normalized_status,
    flight_status_raw: flight.flight_status_raw,
    scheduled_departure: flight.scheduled_departure,
    scheduled_arrival: flight.scheduled_arrival,
    estimated_departure: flight.estimated_departure,
    estimated_arrival: flight.estimated_arrival,
    actual_departure: flight.actual_departure,
    actual_arrival: flight.actual_arrival,
    delay_minutes: flight.delay_minutes,
    aircraft_type: flight.aircraft_type,
    registration: flight.registration,
    terminal: flight.terminal,
    gate: flight.gate,
    altitude: flight.altitude,
    speed: flight.speed,
    heading: flight.heading,
    latitude: flight.latitude,
    longitude: flight.longitude,
    route_data: flight.route_data,
    last_provider_update_at: flight.last_provider_update_at,
    cache_state: 'warm',
    cache_expires_at: flight.cache_expires_at,
    cached_at: flight.cached_at,
  }, { onConflict: 'flight_key' });
  if (error) throw error;

  if (!prev) return;
  const events: { event_type: string; old_status?: string | null; new_status?: string | null }[] = [];
  const prevStatus = compact(prev.normalized_status) || 'unknown';
  if (prevStatus !== flight.normalized_status) {
    events.push({ event_type: 'status_changed', old_status: prevStatus, new_status: flight.normalized_status });
  }
  const prevGate = compact(prev.gate);
  if (prevGate !== flight.gate && flight.gate) {
    events.push({ event_type: 'gate_changed', old_status: prevStatus, new_status: flight.normalized_status });
  }
  const prevDelay = num(prev.delay_minutes) ?? 0;
  const nextDelay = flight.delay_minutes ?? 0;
  if (nextDelay - prevDelay >= 15) {
    events.push({ event_type: 'major_delay_increase', old_status: prevStatus, new_status: flight.normalized_status });
  }
  for (const event of events) {
    await supabase.from('flight_status_change_events').insert({
      flight_key: flight.flight_key,
      old_status: event.old_status ?? null,
      new_status: event.new_status ?? null,
      old_snapshot: prev,
      new_snapshot: flight,
      event_type: event.event_type,
    });
  }
}

async function notifyWatchersOnSignificantChanges(supabase: any, flightKey: string): Promise<void> {
  const { data: lastEvents } = await supabase
    .from('flight_status_change_events')
    .select('*')
    .eq('flight_key', flightKey)
    .order('changed_at', { ascending: false })
    .limit(3);
  if (!lastEvents || !lastEvents.length) return;

  const newest = lastEvents[0];
  if (!['status_changed', 'major_delay_increase', 'gate_changed'].includes(String(newest.event_type))) return;

  const { data: watchers } = await supabase
    .from('user_tracked_flights')
    .select('user_id, alert_on_delay, alert_on_cancel, alert_on_departure, alert_on_arrival, alert_on_gate_change')
    .eq('flight_key', flightKey);
  if (!watchers?.length) return;

  const { data: cachedFlight } = await supabase
    .from('tracked_flights_cache')
    .select('airline_code, flight_number, origin_airport, destination_airport, normalized_status, delay_minutes, gate')
    .eq('flight_key', flightKey)
    .maybeSingle();
  if (!cachedFlight) return;

  for (const watcher of watchers) {
    const status = String(cachedFlight.normalized_status || 'unknown');
    const title = `${cachedFlight.airline_code} ${cachedFlight.flight_number} update`;
    const route = `/flight-tracker/flight/${encodeURIComponent(flightKey)}`;
    const shouldNotify =
      (newest.event_type === 'major_delay_increase' && watcher.alert_on_delay) ||
      (newest.event_type === 'gate_changed' && watcher.alert_on_gate_change) ||
      (newest.event_type === 'status_changed' &&
        ((status === 'cancelled' && watcher.alert_on_cancel) ||
          (status === 'departed' && watcher.alert_on_departure) ||
          (status === 'landed' && watcher.alert_on_arrival) ||
          !['cancelled', 'departed', 'landed'].includes(status)));
    if (!shouldNotify) continue;

    let type = 'flight_tracker_status_change';
    let body = `Status is now ${status.replace(/_/g, ' ')}.`;
    if (newest.event_type === 'major_delay_increase') {
      type = 'flight_tracker_delay';
      body = `Delay increased to ${cachedFlight.delay_minutes ?? 0} minutes.`;
    } else if (status === 'cancelled') {
      type = 'flight_tracker_cancelled';
      body = `${cachedFlight.airline_code} ${cachedFlight.flight_number} was cancelled.`;
    } else if (status === 'departed') {
      type = 'flight_tracker_departed';
      body = `${cachedFlight.airline_code} ${cachedFlight.flight_number} departed ${cachedFlight.origin_airport}.`;
    } else if (status === 'landed') {
      type = 'flight_tracker_arrived';
      body = `${cachedFlight.airline_code} ${cachedFlight.flight_number} arrived ${cachedFlight.destination_airport}.`;
    } else if (newest.event_type === 'gate_changed') {
      body = `Gate updated to ${cachedFlight.gate ?? 'TBD'}.`;
    }

    await supabase.rpc('create_notification', {
      p_recipient_id: watcher.user_id,
      p_type: type,
      p_entity_type: 'tracked_flight',
      p_entity_id: flightKey,
      p_title: title,
      p_body: body,
      p_data: { route },
    });
  }
}

async function lookupFlightFromProvider(
  baseUrl: string,
  apiKey: string,
  args: { ident: string; serviceDate: string; origin?: string; destination?: string; airlineCode?: string; flightNumber?: string },
): Promise<NormalizedFlight | null> {
  const payload = await fetchProviderJson(baseUrl, apiKey, `flights/${encodeURIComponent(args.ident)}`);
  const providerFlight = firstProviderFlight(payload);
  if (!providerFlight) return null;
  return mapProviderFlight(providerFlight, {
    airlineCode: args.airlineCode,
    flightNumber: args.flightNumber,
    serviceDate: args.serviceDate,
    origin: args.origin,
    destination: args.destination,
  });
}

async function searchByRoute(baseUrl: string, apiKey: string, origin: string, destination: string, serviceDate: string): Promise<NormalizedFlight[]> {
  const departuresPayload = await fetchProviderJson(
    baseUrl,
    apiKey,
    `airports/${encodeURIComponent(origin)}/flights/departures`,
  );
  const depObj = departuresPayload as Json;
  const rows = (Array.isArray(depObj.departures) ? depObj.departures : Array.isArray(depObj.flights) ? depObj.flights : []) as Json[];
  const flights: NormalizedFlight[] = [];
  for (const row of rows.slice(0, 40)) {
    const mapped = mapProviderFlight(row, { serviceDate, origin, destination });
    if (!mapped) continue;
    if (mapped.destination_airport !== destination) continue;
    flights.push(mapped);
  }
  return flights.sort((a, b) => {
    const at = a.scheduled_departure ? new Date(a.scheduled_departure).getTime() : Number.MAX_SAFE_INTEGER;
    const bt = b.scheduled_departure ? new Date(b.scheduled_departure).getTime() : Number.MAX_SAFE_INTEGER;
    return at - bt;
  });
}

async function airportBoard(baseUrl: string, apiKey: string, airportCode: string, boardType: 'arrivals' | 'departures', serviceDate: string): Promise<NormalizedFlight[]> {
  const payload = await fetchProviderJson(
    baseUrl,
    apiKey,
    `airports/${encodeURIComponent(airportCode)}/flights/${boardType}`,
  );
  const obj = payload as Json;
  const rows = (Array.isArray(obj[boardType]) ? obj[boardType] : Array.isArray(obj.flights) ? obj.flights : []) as Json[];
  const flights: NormalizedFlight[] = [];
  for (const row of rows.slice(0, 60)) {
    const mapped = mapProviderFlight(row, {
      serviceDate,
      origin: boardType === 'departures' ? airportCode : undefined,
      destination: boardType === 'arrivals' ? airportCode : undefined,
    });
    if (mapped) flights.push(mapped);
  }
  return flights;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    // @ts-expect-error Deno env
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    // @ts-expect-error Deno env
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    // @ts-expect-error Deno env
    const aeroApiKey = Deno.env.get('FLIGHTAWARE_AEROAPI_KEY') ?? '';
    // @ts-expect-error Deno env
    const aeroApiBase = Deno.env.get('FLIGHTAWARE_AEROAPI_BASE_URL') ?? 'https://aeroapi.flightaware.com/aeroapi';

    if (!supabaseUrl || !serviceRole) {
      throw new Error('Missing Supabase env');
    }
    if (!aeroApiKey) {
      throw new Error('Missing FLIGHTAWARE_AEROAPI_KEY env');
    }

    const supabase = createClient(supabaseUrl, serviceRole);
    const body = (await req.json()) as Json;
    const action = String(body.action || '');

    if (action === 'search') {
      const query = (body.query || {}) as Json;
      const serviceDate = String(body.serviceDate || new Date().toISOString().slice(0, 10));
      const type = String(query.type || 'flight');
      let flights: NormalizedFlight[] = [];
      let source: 'cache' | 'provider' | 'mixed' = 'provider';

      if (type === 'flight') {
        const ident = String(query.ident || '').trim().toUpperCase();
        const fromProvider = await lookupFlightFromProvider(aeroApiBase, aeroApiKey, { ident, serviceDate });
        if (fromProvider) {
          flights = [fromProvider];
          await upsertCachedFlight(supabase, fromProvider);
          await notifyWatchersOnSignificantChanges(supabase, fromProvider.flight_key);
        }
      } else if (type === 'route') {
        const origin = String(query.origin || '').trim().toUpperCase();
        const destination = String(query.destination || '').trim().toUpperCase();
        const fromProvider = await searchByRoute(aeroApiBase, aeroApiKey, origin, destination, serviceDate);
        flights = fromProvider;
        for (const f of flights) {
          await upsertCachedFlight(supabase, f);
        }
      } else if (type === 'airport') {
        const airportCode = String(query.airportCode || '').trim().toUpperCase();
        const fromProvider = await airportBoard(aeroApiBase, aeroApiKey, airportCode, 'departures', serviceDate);
        flights = fromProvider;
        for (const f of flights) {
          await upsertCachedFlight(supabase, f);
        }
      }

      return new Response(JSON.stringify({ ok: true, data: { flights, source } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'detail') {
      const flightKey = String(body.flightKey || '').trim();
      const forceRefresh = Boolean(body.forceRefresh);
      const cached = flightKey ? await getCachedFlightByKey(supabase, flightKey) : null;
      const expired = !cached || !cached.cache_expires_at || new Date(String(cached.cache_expires_at)).getTime() <= Date.now();
      let flight: NormalizedFlight | null = cached as unknown as NormalizedFlight | null;
      if ((forceRefresh || expired) && cached) {
        const ident = `${cached.airline_code}${cached.flight_number}`;
        const fromProvider = await lookupFlightFromProvider(aeroApiBase, aeroApiKey, {
          ident,
          serviceDate: String(cached.service_date),
          origin: String(cached.origin_airport || ''),
          destination: String(cached.destination_airport || ''),
          airlineCode: String(cached.airline_code),
          flightNumber: String(cached.flight_number),
        });
        if (fromProvider) {
          flight = fromProvider;
          await upsertCachedFlight(supabase, fromProvider);
          await notifyWatchersOnSignificantChanges(supabase, fromProvider.flight_key);
        }
      }
      return new Response(JSON.stringify({ ok: true, data: { flight: flight || null } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'airport_board') {
      const airportCode = String(body.airportCode || '').trim().toUpperCase();
      const boardType = String(body.boardType || 'departures') as 'arrivals' | 'departures';
      const serviceDate = new Date().toISOString().slice(0, 10);
      const boardKey = `${airportCode}-${boardType}-${serviceDate}`;
      const { data: cachedBoard } = await supabase
        .from('airport_board_cache')
        .select('*')
        .eq('board_key', boardKey)
        .maybeSingle();
      if (cachedBoard && new Date(String(cachedBoard.cache_expires_at)).getTime() > Date.now()) {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            airport_code: airportCode,
            board_type: boardType,
            flights: Array.isArray(cachedBoard.data) ? cachedBoard.data : [],
            source: 'cache',
          },
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const flights = await airportBoard(aeroApiBase, aeroApiKey, airportCode, boardType, serviceDate);
      await supabase.from('airport_board_cache').upsert({
        board_key: boardKey,
        airport_code: airportCode,
        board_type: boardType,
        data: flights,
        cache_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }, { onConflict: 'board_key' });
      for (const f of flights) {
        await upsertCachedFlight(supabase, f);
      }
      return new Response(JSON.stringify({
        ok: true,
        data: { airport_code: airportCode, board_type: boardType, flights, source: 'provider' },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'upsert_cached_flight') {
      const flight = body.flight as Json;
      if (!flight || !flight.flight_key) {
        throw new Error('flight payload required');
      }
      await supabase.from('tracked_flights_cache').upsert({
        flight_key: String(flight.flight_key),
        airline_code: String(flight.airline_code || ''),
        flight_number: String(flight.flight_number || ''),
        origin_airport: String(flight.origin_airport || ''),
        destination_airport: String(flight.destination_airport || ''),
        service_date: String(flight.service_date || new Date().toISOString().slice(0, 10)),
        normalized_status: 'unknown',
        cache_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }, { onConflict: 'flight_key' });
      return new Response(JSON.stringify({ ok: true, data: { flight_key: String(flight.flight_key) } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'refresh_watched') {
      const { data: watched } = await supabase
        .from('user_tracked_flights')
        .select('flight_key')
        .order('updated_at', { ascending: false })
        .limit(80);
      let refreshed = 0;
      const seen = new Set<string>();
      for (const w of watched || []) {
        const key = String(w.flight_key || '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const cached = await getCachedFlightByKey(supabase, key);
        if (!cached) continue;
        if (cached.cache_expires_at && new Date(String(cached.cache_expires_at)).getTime() > Date.now()) continue;
        const ident = `${cached.airline_code}${cached.flight_number}`;
        const fromProvider = await lookupFlightFromProvider(aeroApiBase, aeroApiKey, {
          ident,
          serviceDate: String(cached.service_date),
          origin: String(cached.origin_airport || ''),
          destination: String(cached.destination_airport || ''),
          airlineCode: String(cached.airline_code),
          flightNumber: String(cached.flight_number),
        });
        if (!fromProvider) continue;
        await upsertCachedFlight(supabase, fromProvider);
        await notifyWatchersOnSignificantChanges(supabase, fromProvider.flight_key);
        refreshed += 1;
      }
      return new Response(JSON.stringify({ ok: true, data: { refreshed } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'enrich_staff_load') {
      const input = (body.input || {}) as Json;
      const airline = String(input.airline_code || '').trim().toUpperCase();
      const flightNumber = String(input.flight_number || '').trim().toUpperCase();
      const origin = String(input.origin_airport || '').trim().toUpperCase();
      const destination = String(input.destination_airport || '').trim().toUpperCase();
      const departureDate = String(input.departure_date || '').trim();
      const ident = `${airline}${flightNumber}`;
      const fromProvider = await lookupFlightFromProvider(aeroApiBase, aeroApiKey, {
        ident,
        serviceDate: departureDate,
        origin,
        destination,
        airlineCode: airline,
        flightNumber,
      });
      if (!fromProvider) {
        return new Response(JSON.stringify({ ok: true, data: { exists: false } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      await upsertCachedFlight(supabase, fromProvider);
      return new Response(JSON.stringify({
        ok: true,
        data: {
          exists: true,
          flight_key: fromProvider.flight_key,
          aircraft_type: fromProvider.aircraft_type,
          scheduled_departure_at: fromProvider.scheduled_departure,
          scheduled_arrival_at: fromProvider.scheduled_arrival,
          normalized_status: fromProvider.normalized_status,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'enrich_schedule_segment') {
      const input = (body.input || {}) as Json;
      const airline = String(input.airline_code || '').trim().toUpperCase();
      const flightNumber = String(input.flight_number || '').trim().toUpperCase();
      const departureDate = String(input.departure_date || '').trim();
      const origin = String(input.origin_airport || '').trim().toUpperCase();
      const destination = String(input.destination_airport || '').trim().toUpperCase();
      if (!flightNumber || !departureDate) {
        return new Response(JSON.stringify({ ok: true, data: { matched: false } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const ident = `${airline}${flightNumber}`;
      const fromProvider = await lookupFlightFromProvider(aeroApiBase, aeroApiKey, {
        ident,
        serviceDate: departureDate,
        origin,
        destination,
        airlineCode: airline || undefined,
        flightNumber,
      });
      if (!fromProvider) {
        return new Response(JSON.stringify({ ok: true, data: { matched: false } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      await upsertCachedFlight(supabase, fromProvider);
      return new Response(JSON.stringify({
        ok: true,
        data: {
          matched: true,
          flight_key: fromProvider.flight_key,
          normalized_status: fromProvider.normalized_status,
          delay_minutes: fromProvider.delay_minutes,
          estimated_departure: fromProvider.estimated_departure,
          estimated_arrival: fromProvider.estimated_arrival,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unsupported action: ${action}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[flight-tracker]', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
