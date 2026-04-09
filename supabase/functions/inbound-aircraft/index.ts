// @ts-expect-error Deno std
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error Deno esm
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getAeroApiKey, getAeroBaseUrl } from '../_shared/env.ts';
import {
  airportBoard,
  lookupFlightFromProvider,
  mapProviderFlightToNormalized,
  riskFromInboundDelay,
  type Json,
  type NormalizedFlightTrackerResult,
} from '../_shared/normalize.ts';

function pickInboundFromArrivals(
  main: NormalizedFlightTrackerResult,
  arrivals: NormalizedFlightTrackerResult[],
): NormalizedFlightTrackerResult | null {
  const tail = (main.tailNumber || '').trim().toUpperCase();
  if (!tail) return null;
  const dep = main.scheduledDepartureUtc ? new Date(main.scheduledDepartureUtc).getTime() : NaN;
  if (!Number.isFinite(dep)) return null;

  let best: NormalizedFlightTrackerResult | null = null;
  let bestArr = -1;
  for (const a of arrivals) {
    const t = (a.tailNumber || '').trim().toUpperCase();
    if (t !== tail) continue;
    if (a.arrivalAirport !== main.departureAirport) continue;
    const arrT = a.actualArrivalUtc
      ? new Date(a.actualArrivalUtc).getTime()
      : a.estimatedArrivalUtc
        ? new Date(a.estimatedArrivalUtc).getTime()
        : a.scheduledArrivalUtc
          ? new Date(a.scheduledArrivalUtc).getTime()
          : NaN;
    if (!Number.isFinite(arrT) || arrT >= dep) continue;
    if (arrT > bestArr) {
      bestArr = arrT;
      best = a;
    }
  }
  return best;
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
    const base = getAeroBaseUrl();
    const apiKey = getAeroApiKey();
    if (!supabaseUrl || !serviceRole) throw new Error('Missing Supabase env');
    if (!apiKey) throw new Error('Missing FlightAware API key (FLIGHTAWARE_AEROAPI_KEY)');

    const supabase = createClient(supabaseUrl, serviceRole);
    const body = (await req.json()) as Json;
    const trackedFlightId = body.trackedFlightId ? String(body.trackedFlightId) : '';
    const carrierCode = String(body.carrierCode || '').trim().toUpperCase();
    const flightNumber = String(body.flightNumber || '').trim().toUpperCase();
    const flightDate = String(body.flightDate || new Date().toISOString().slice(0, 10)).trim();
    const providerFlightId = body.providerFlightId ? String(body.providerFlightId).trim() : '';

    let main: NormalizedFlightTrackerResult | null = null;

    if (trackedFlightId) {
      const { data: row, error } = await supabase
        .from('tracked_flights')
        .select('*')
        .eq('id', trackedFlightId)
        .maybeSingle();
      if (error) throw error;
      if (row) {
        const ident = `${row.carrier_code}${row.flight_number}`;
        main = await lookupFlightFromProvider(base, apiKey, {
          ident,
          serviceDate: String(row.flight_date),
          airlineCode: row.carrier_code,
          flightNumber: row.flight_number,
          origin: row.departure_airport,
          destination: row.arrival_airport,
        });
      }
    }

    if (!main && providerFlightId) {
      const { fetchProviderJson, firstProviderFlight } = await import('../_shared/flightaware_aeroapi.ts');
      const { ok, json } = await fetchProviderJson(base, apiKey, `flights/${encodeURIComponent(providerFlightId)}`);
      if (ok) {
        const pf = firstProviderFlight(json);
        if (pf) {
          main = mapProviderFlightToNormalized(pf, {
            airlineCode: carrierCode,
            flightNumber,
            serviceDate: flightDate,
          });
        }
      }
    }

    if (!main && carrierCode && flightNumber) {
      main = await lookupFlightFromProvider(base, apiKey, {
        ident: `${carrierCode}${flightNumber}`,
        serviceDate: flightDate,
        airlineCode: carrierCode,
        flightNumber,
      });
    }

    if (!main) {
      return jsonResponse({ ok: false, error: 'Unable to resolve flight for inbound analysis' });
    }

    const arrivals = await airportBoard(base, apiKey, main.departureAirport, 'arrivals', flightDate);
    const inbound = pickInboundFromArrivals(main, arrivals);

    let minutesLate: number | null = null;
    if (inbound) {
      const sched = inbound.scheduledArrivalUtc ? new Date(inbound.scheduledArrivalUtc).getTime() : NaN;
      const est = inbound.estimatedArrivalUtc ? new Date(inbound.estimatedArrivalUtc).getTime() : NaN;
      if (Number.isFinite(sched) && Number.isFinite(est)) {
        minutesLate = Math.max(0, Math.round((est - sched) / 60000));
      }
    }

    const riskLevel = riskFromInboundDelay(minutesLate);
    const inboundSummary = inbound
      ? {
          displayFlightNumber: inbound.displayFlightNumber,
          from: inbound.departureAirport,
          to: inbound.arrivalAirport,
          etaUtc: inbound.estimatedArrivalUtc ?? inbound.scheduledArrivalUtc ?? null,
          delayMinutes: minutesLate,
          riskLevel,
        }
      : null;

    const merged: NormalizedFlightTrackerResult = { ...main, inboundSummary };

    if (trackedFlightId) {
      await supabase.from('inbound_aircraft_links').upsert(
        {
          tracked_flight_id: trackedFlightId,
          inbound_api_flight_id: inbound?.providerFlightId ?? null,
          inbound_carrier_code: inbound?.carrierCode ?? null,
          inbound_flight_number: inbound?.flightNumber ?? null,
          inbound_departure_airport: inbound?.departureAirport ?? null,
          inbound_arrival_airport: inbound?.arrivalAirport ?? null,
          inbound_scheduled_arrival_utc: inbound?.scheduledArrivalUtc ?? null,
          inbound_estimated_arrival_utc: inbound?.estimatedArrivalUtc ?? null,
          inbound_actual_arrival_utc: inbound?.actualArrivalUtc ?? null,
          risk_level: riskLevel,
          minutes_late: minutesLate,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tracked_flight_id' },
      );
    }

    return jsonResponse({
      ok: true,
      data: {
        flight: merged,
        inboundFlight: inbound,
        riskLevel,
        minutesLate,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[inbound-aircraft]', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
