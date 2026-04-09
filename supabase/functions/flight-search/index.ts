// @ts-expect-error Deno std
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error Deno esm
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getFlightTrackerProvider } from '../_shared/flight_providers/adapter.ts';
import {
  flightSearchCacheKey,
  readFlightStatusCache,
  writeFlightStatusCache,
} from '../_shared/cache_db.ts';
import { parseTrackerQuery } from '../_shared/parse_query.ts';
import { searchFlightPayloadToItem, type Json, type NormalizedSearchResultItem } from '../_shared/normalize.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    // @ts-expect-error Deno
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    // @ts-expect-error Deno
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    // @ts-expect-error Deno
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !serviceRole) throw new Error('Missing Supabase env');

    const supabase = createClient(supabaseUrl, serviceRole);
    const body = (await req.json()) as Json;
    const q = String(body.q || body.query || '').trim();
    const date = String(body.date || body.flightDate || new Date().toISOString().slice(0, 10));
    const searchTypeOverride = body.searchType ? String(body.searchType) : '';

    if (!q) {
      return jsonResponse({ ok: true, data: { results: [] as NormalizedSearchResultItem[], source: 'empty' } });
    }

    const parsed = parseTrackerQuery(q);
    const kind = searchTypeOverride || parsed.kind;

    const provider = getFlightTrackerProvider();
    const cacheKey = flightSearchCacheKey(provider.id, kind, q, date);
    console.log('[flight-search]', 'request', { provider: provider.id, kind, date, qLen: q.length });
    const cached = await readFlightStatusCache(supabase, cacheKey);
    if (cached?.payload_json && Array.isArray((cached.payload_json as Json).results)) {
      const n = ((cached.payload_json as Json).results as unknown[]).length;
      console.log('[flight-search]', 'cache_hit', { provider: provider.id, results: n });
      return jsonResponse({
        ok: true,
        data: {
          results: (cached.payload_json as Json).results,
          source: 'cache',
        },
      });
    }
    console.log('[flight-search]', 'cache_miss', { provider: provider.id });

    let results: NormalizedSearchResultItem[] = [];

    if (kind === 'route' || parsed.kind === 'route') {
      const origin = kind === 'route' && body.origin ? String(body.origin) : (parsed as { origin: string }).origin;
      const dest =
        kind === 'route' && body.destination ? String(body.destination) : (parsed as { destination: string }).destination;
      const flights = await provider.searchByRoute(origin, dest, date);
      results = flights.map(searchFlightPayloadToItem);
    } else if (kind === 'airport' || parsed.kind === 'airport') {
      const code =
        kind === 'airport' && body.airportCode
          ? String(body.airportCode).toUpperCase()
          : (parsed as { airportCode: string }).airportCode;
      const flights = await provider.getAirportBoard(code, 'departures', date);
      results = flights.map(searchFlightPayloadToItem);
    } else {
      const ident = (parsed as { ident: string }).ident;
      const flight = await provider.lookupFlight({
        ident,
        serviceDate: date,
      });
      if (flight) results = [searchFlightPayloadToItem(flight)];
    }

    if (results.length > 0) {
      const exp = new Date(Date.now() + 90 * 1000).toISOString();
      await writeFlightStatusCache(supabase, {
        cacheKey,
        carrierCode: null,
        flightNumber: null,
        flightDate: null,
        payload: { results, meta: { q, date } } as unknown as Json,
        expiresAt: exp,
        provider: provider.id,
      });
    }

    if (results.length === 0) {
      console.log('[flight-search]', 'empty_results', { provider: provider.id, kind });
    } else {
      console.log('[flight-search]', 'provider_ok', { provider: provider.id, results: results.length });
    }

    const authHeader = req.headers.get('Authorization');
    if (authHeader && anonKey && results.length > 0) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      const uid = userData.user?.id;
      if (uid) {
        await supabase.from('flight_search_history').insert({
          user_id: uid,
          query: q,
          query_type: parsed.kind,
          search_type: parsed.kind,
          query_text: q,
          normalized_query: q.toUpperCase().replace(/\s+/g, ' '),
          metadata_json: { date },
        });
      }
    }

    return jsonResponse({ ok: true, data: { results, source: 'provider' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[flight-search]', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
