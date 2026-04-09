// @ts-expect-error Deno std
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error Deno esm
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getFlightTrackerProvider } from '../_shared/flight_providers/adapter.ts';
import {
  flightStatusCacheKey,
  flightStatusCacheKeyByProviderFlightId,
  readFlightStatusCache,
  statusTtlMs,
  writeFlightStatusCache,
} from '../_shared/cache_db.ts';
import type { Json } from '../_shared/normalize.ts';

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
    const carrierCode = String(body.carrierCode || '').trim().toUpperCase();
    const flightNumber = String(body.flightNumber || '').trim().toUpperCase();
    const flightDate = String(body.flightDate || new Date().toISOString().slice(0, 10)).trim();
    const providerFlightId = body.providerFlightId ? String(body.providerFlightId).trim() : '';

    const provider = getFlightTrackerProvider();
    const cacheKey = providerFlightId
      ? flightStatusCacheKeyByProviderFlightId(provider.id, providerFlightId)
      : flightStatusCacheKey(provider.id, carrierCode, flightNumber, flightDate);

    console.log('[flight-status]', 'request', {
      provider: provider.id,
      mode: providerFlightId ? 'by_provider_flight_id' : 'by_ident',
      flightDate,
      hasCarrier: Boolean(carrierCode && flightNumber),
    });

    const cached = await readFlightStatusCache(supabase, cacheKey);
    if (cached?.payload_json && (cached.payload_json as Json).carrierCode) {
      console.log('[flight-status]', 'cache_hit', { provider: provider.id });
      return jsonResponse({ ok: true, data: { flight: cached.payload_json, source: 'cache' } });
    }
    console.log('[flight-status]', 'cache_miss', { provider: provider.id });

    let flight = null;

    if (providerFlightId) {
      flight = await provider.getFlightStatus({
        carrierCode,
        flightNumber,
        flightDate,
        providerFlightId,
      });
    } else if (carrierCode && flightNumber) {
      flight = await provider.lookupFlight({
        ident: `${carrierCode}${flightNumber}`,
        serviceDate: flightDate,
        airlineCode: carrierCode,
        flightNumber,
      });
    }

    if (!flight) {
      console.log('[flight-status]', 'not_found', { provider: provider.id });
      return jsonResponse({ ok: false, error: 'Flight status not found' });
    }

    console.log('[flight-status]', 'provider_ok', { provider: provider.id, status: flight.status });

    const exp = new Date(Date.now() + statusTtlMs(flight)).toISOString();
    const writeKey = flight.providerFlightId
      ? flightStatusCacheKeyByProviderFlightId(provider.id, flight.providerFlightId)
      : cacheKey;
    await writeFlightStatusCache(supabase, {
      cacheKey: writeKey,
      carrierCode: flight.carrierCode,
      flightNumber: flight.flightNumber,
      flightDate: flight.flightDate ?? flightDate,
      payload: flight as unknown as Json,
      expiresAt: exp,
      provider: provider.id,
    });
    if (writeKey !== cacheKey) {
      await writeFlightStatusCache(supabase, {
        cacheKey,
        carrierCode: flight.carrierCode,
        flightNumber: flight.flightNumber,
        flightDate: flight.flightDate ?? flightDate,
        payload: flight as unknown as Json,
        expiresAt: exp,
        provider: provider.id,
      });
    }

    return jsonResponse({ ok: true, data: { flight, source: 'provider' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[flight-status]', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
