// @ts-expect-error Deno std
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error Deno esm
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getAeroApiKey, getAeroBaseUrl } from '../_shared/env.ts';
import { boardCacheKey, readAirportBoardCache, writeAirportBoardCache } from '../_shared/cache_db.ts';
import { airportBoard, toBoardRow, type Json } from '../_shared/normalize.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    // @ts-expect-error Deno
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    // @ts-expect-error Deno
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const base = getAeroBaseUrl();
    const apiKey = getAeroApiKey();
    if (!supabaseUrl || !serviceRole) throw new Error('Missing Supabase env');
    if (!apiKey) throw new Error('Missing FlightAware API key (FLIGHTAWARE_AEROAPI_KEY)');

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

    const ckey = boardCacheKey(airportCode, boardType, dateKey);
    const cached = await readAirportBoardCache(supabase, ckey);
    if (cached && Array.isArray((cached as Json).rows)) {
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

    const flights = await airportBoard(base, apiKey, airportCode, boardType, serviceDate);
    const rows = flights.map((f) => toBoardRow(f, boardType));
    const exp = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    await writeAirportBoardCache(supabase, {
      cacheKey: ckey,
      airportCode,
      boardType,
      dateKey,
      payload: { rows, airportCode, boardType } as unknown as Json,
      expiresAt: exp,
    });

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
