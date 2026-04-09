// @ts-expect-error Deno std
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error Deno esm
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { fetchProviderJson, firstProviderFlight } from '../_shared/flightaware_aeroapi.ts';
import { getAeroApiKey, getAeroBaseUrl } from '../_shared/env.ts';
import {
  logApiFailure,
  readFlightStatusCache,
  statusCacheKey,
  statusCacheKeyByFaId,
  statusTtlMs,
  writeFlightStatusCache,
} from '../_shared/cache_db.ts';
import { lookupFlightFromProvider, mapProviderFlightToNormalized, type Json } from '../_shared/normalize.ts';

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
    const carrierCode = String(body.carrierCode || '').trim().toUpperCase();
    const flightNumber = String(body.flightNumber || '').trim().toUpperCase();
    const flightDate = String(body.flightDate || new Date().toISOString().slice(0, 10)).trim();
    const providerFlightId = body.providerFlightId ? String(body.providerFlightId).trim() : '';

    const cacheKey = providerFlightId
      ? statusCacheKeyByFaId(providerFlightId)
      : statusCacheKey(carrierCode, flightNumber, flightDate);

    const cached = await readFlightStatusCache(supabase, cacheKey);
    if (cached?.payload_json && (cached.payload_json as Json).carrierCode) {
      return jsonResponse({ ok: true, data: { flight: cached.payload_json, source: 'cache' } });
    }

    let flight = null;
    if (providerFlightId) {
      const { ok, status, json } = await fetchProviderJson(base, apiKey, `flights/${encodeURIComponent(providerFlightId)}`);
      if (!ok) {
        await logApiFailure(supabase, {
          provider: 'flightaware',
          endpoint: 'flights/{id}',
          request_key: providerFlightId,
          status_code: status,
          error_message: 'FlightAware request failed',
        });
      } else {
        const row = firstProviderFlight(json);
        if (row) {
          flight = mapProviderFlightToNormalized(row, {
            airlineCode: carrierCode,
            flightNumber,
            serviceDate: flightDate,
          });
        }
      }
    }

    if (!flight && carrierCode && flightNumber) {
      const ident = `${carrierCode}${flightNumber}`;
      flight = await lookupFlightFromProvider(base, apiKey, {
        ident,
        serviceDate: flightDate,
        airlineCode: carrierCode,
        flightNumber,
      });
    }

    if (!flight) {
      return jsonResponse({ ok: false, error: 'Flight status not found' });
    }

    const exp = new Date(Date.now() + statusTtlMs(flight)).toISOString();
    const writeKey = flight.providerFlightId ? statusCacheKeyByFaId(flight.providerFlightId) : cacheKey;
    await writeFlightStatusCache(supabase, {
      cacheKey: writeKey,
      carrierCode: flight.carrierCode,
      flightNumber: flight.flightNumber,
      flightDate: flight.flightDate ?? flightDate,
      payload: flight as unknown as Json,
      expiresAt: exp,
    });
    if (writeKey !== cacheKey) {
      await writeFlightStatusCache(supabase, {
        cacheKey,
        carrierCode: flight.carrierCode,
        flightNumber: flight.flightNumber,
        flightDate: flight.flightDate ?? flightDate,
        payload: flight as unknown as Json,
        expiresAt: exp,
      });
    }

    return jsonResponse({ ok: true, data: { flight, source: 'provider' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[flight-status]', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
