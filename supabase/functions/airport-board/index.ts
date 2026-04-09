// @ts-expect-error Deno std
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error Deno esm
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getFlightTrackerProvider } from '../_shared/flight_providers/adapter.ts';
import { airportBoardCacheKey, readAirportBoardCache, writeAirportBoardCache } from '../_shared/cache_db.ts';
import { toBoardRow, type Json } from '../_shared/normalize.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    // @ts-expect-error Deno
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    // @ts-expect-error Deno
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRole) throw new Error('Missing Supabase env');

    const supabase = createClient(supabaseUrl, serviceRole);
    const body = (await req.json()) as Json;
    const airportCode = String(body.airportCode || '').trim().toUpperCase();
    const boardType = (String(body.boardType || 'departures').toLowerCase() === 'arrivals'
      ? 'arrivals'
      : 'departures') as 'arrivals' | 'departures';
    const dateKey = String(body.date || body.dateKey || new Date().toISOString().slice(0, 10));
    const serviceDate = dateKey;

    if (!airportCode || airportCode.length !== 3) {
      return jsonResponse({ ok: false, error: 'Invalid airport code' }, 400);
    }

    const provider = getFlightTrackerProvider();
    const ckey = airportBoardCacheKey(provider.id, airportCode, boardType, dateKey);
    console.log('[airport-board]', 'request', { provider: provider.id, airportCode, boardType, dateKey });
    const cached = await readAirportBoardCache(supabase, ckey);
    if (cached && Array.isArray((cached as Json).rows)) {
      const n = ((cached as Json).rows as unknown[]).length;
      console.log('[airport-board]', 'cache_hit', { provider: provider.id, rows: n });
      return jsonResponse({
        ok: true,
        data: {
          airportCode,
          boardType,
          rows: (cached as Json).rows,
          source: 'cache',
        },
      });
    }
    console.log('[airport-board]', 'cache_miss', { provider: provider.id });

    const flights = await provider.getAirportBoard(airportCode, boardType, serviceDate);
    const rows = flights.map((f) => toBoardRow(f, boardType));

    if (rows.length === 0) {
      console.log('[airport-board]', 'empty_rows', { provider: provider.id, airportCode, boardType });
    } else {
      console.log('[airport-board]', 'provider_ok', { provider: provider.id, rows: rows.length });
    }

    if (rows.length > 0) {
      const exp = new Date(Date.now() + 3 * 60 * 1000).toISOString();
      await writeAirportBoardCache(supabase, {
        cacheKey: ckey,
        airportCode,
        boardType,
        dateKey,
        payload: { rows, airportCode, boardType } as unknown as Json,
        expiresAt: exp,
        provider: provider.id,
      });
    }

    return jsonResponse({
      ok: true,
      data: { airportCode, boardType, rows, source: 'provider' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[airport-board]', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
