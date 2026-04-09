// @ts-expect-error Deno std
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error Deno esm
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getAeroApiKey, getAeroBaseUrl } from '../_shared/env.ts';
import { readFlightStatusCache } from '../_shared/cache_db.ts';
import { parseTrackerQuery } from '../_shared/parse_query.ts';
import {
  airportBoard,
  lookupFlightFromProvider,
  searchByRoute,
  searchFlightPayloadToItem,
  type NormalizedSearchResultItem,
} from '../_shared/normalize.ts';
import type { Json } from '../_shared/normalize.ts';

function searchCacheKey(q: string, date: string, kind: string): string {
  return `srch:${kind}:${q.trim().toUpperCase()}:${date}`;
}

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
    const base = getAeroBaseUrl();
    const apiKey = getAeroApiKey();
    if (!supabaseUrl || !serviceRole) throw new Error('Missing Supabase env');
    if (!apiKey) throw new Error('Missing FlightAware API key (FLIGHTAWARE_AEROAPI_KEY)');

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

    const cacheKey = searchCacheKey(q, date, kind);
    const cached = await readFlightStatusCache(supabase, cacheKey);
    if (cached?.payload_json && Array.isArray((cached.payload_json as Json).results)) {
      return jsonResponse({
        ok: true,
        data: {
          results: (cached.payload_json as Json).results,
          source: 'cache',
        },
      });
    }

    let results: NormalizedSearchResultItem[] = [];

    if (kind === 'route' || parsed.kind === 'route') {
      const origin = kind === 'route' && body.origin ? String(body.origin) : (parsed as { origin: string }).origin;
      const dest =
        kind === 'route' && body.destination ? String(body.destination) : (parsed as { destination: string }).destination;
      const flights = await searchByRoute(base, apiKey, origin, dest, date);
      results = flights.map(searchFlightPayloadToItem);
    } else if (kind === 'airport' || parsed.kind === 'airport') {
      const code =
        kind === 'airport' && body.airportCode
          ? String(body.airportCode).toUpperCase()
          : (parsed as { airportCode: string }).airportCode;
      const flights = await airportBoard(base, apiKey, code, 'departures', date);
      results = flights.map(searchFlightPayloadToItem);
    } else {
      const ident = (parsed as { ident: string }).ident;
      const flight = await lookupFlightFromProvider(base, apiKey, {
        ident,
        serviceDate: date,
      });
      if (flight) results = [searchFlightPayloadToItem(flight)];
    }

    const payload = { results, kind: parsed.kind };
    const exp = new Date(Date.now() + 45 * 1000).toISOString();
    await supabase.from('flight_status_cache').upsert(
      {
        cache_key: cacheKey,
        carrier_code: null,
        flight_number: null,
        flight_date: null,
        payload_json: { results: results, meta: { q, date } },
        provider: 'flightaware',
        fetched_at: new Date().toISOString(),
        expires_at: exp,
      },
      { onConflict: 'cache_key' },
    );

    const authHeader = req.headers.get('Authorization');
    if (authHeader && anonKey) {
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
