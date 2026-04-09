// @ts-expect-error Deno std
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error Deno esm
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import type { Json } from '../_shared/normalize.ts';

const DEFAULT_ALERTS = ['delay', 'gate_change', 'cancelled', 'inbound_delay'] as const;

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
    if (!supabaseUrl || !serviceRole || !anonKey) throw new Error('Missing Supabase env');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user?.id) {
      return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
    }
    const userId = userData.user.id;

    const supabase = createClient(supabaseUrl, serviceRole);
    const body = (await req.json()) as Json;
    const f = (body.flight || body) as Json;

    const carrierCode = String(f.carrierCode || f.carrier_code || '').trim().toUpperCase();
    const flightNumber = String(f.flightNumber || f.flight_number || '').trim().toUpperCase();
    const flightDate = String(f.flightDate || f.flight_date || new Date().toISOString().slice(0, 10)).trim();
    const departureAirport = String(f.departureAirport || f.departure_airport || '').trim().toUpperCase();
    const arrivalAirport = String(f.arrivalAirport || f.arrival_airport || '').trim().toUpperCase();
    const flightKey = f.flightKey || f.flight_key ? String(f.flightKey || f.flight_key) : null;
    const isPinned = Boolean(body.isPinned ?? f.is_pinned ?? false);

    if (!carrierCode || !flightNumber || !flightDate || !departureAirport || !arrivalAirport) {
      return jsonResponse({ ok: false, error: 'Missing required flight fields' }, 400);
    }

    const row = {
      user_id: userId,
      carrier_code: carrierCode,
      flight_number: flightNumber,
      display_flight_number: String(f.displayFlightNumber || f.display_flight_number || `${carrierCode} ${flightNumber}`),
      flight_date: flightDate,
      departure_airport: departureAirport,
      arrival_airport: arrivalAirport,
      flight_key: flightKey,
      scheduled_departure_utc: f.scheduledDepartureUtc ?? f.scheduled_departure_utc ?? null,
      scheduled_arrival_utc: f.scheduledArrivalUtc ?? f.scheduled_arrival_utc ?? null,
      estimated_departure_utc: f.estimatedDepartureUtc ?? f.estimated_departure_utc ?? null,
      estimated_arrival_utc: f.estimatedArrivalUtc ?? f.estimated_arrival_utc ?? null,
      actual_departure_utc: f.actualDepartureUtc ?? f.actual_departure_utc ?? null,
      actual_arrival_utc: f.actualArrivalUtc ?? f.actual_arrival_utc ?? null,
      departure_terminal: f.departureTerminal ?? f.departure_terminal ?? null,
      arrival_terminal: f.arrivalTerminal ?? f.arrival_terminal ?? null,
      departure_gate: f.departureGate ?? f.departure_gate ?? null,
      arrival_gate: f.arrivalGate ?? f.arrival_gate ?? null,
      status: f.status ? String(f.status) : null,
      tail_number: f.tailNumber ?? f.tail_number ?? null,
      aircraft_type: f.aircraftType ?? f.aircraft_type ?? null,
      api_provider: 'flightaware',
      api_flight_id: f.providerFlightId ?? f.api_flight_id ?? null,
      alerts_enabled: f.alertsEnabled ?? true,
      is_pinned: isPinned,
      last_synced_at: new Date().toISOString(),
    };

    const { data: upserted, error: upErr } = await supabase
      .from('tracked_flights')
      .upsert(row, { onConflict: 'user_id,carrier_code,flight_number,flight_date' })
      .select('id')
      .single();

    if (upErr) throw upErr;
    const trackedId = upserted?.id as string;

    for (const alert_type of DEFAULT_ALERTS) {
      await supabase.from('flight_watch_alerts').upsert(
        {
          user_id: userId,
          tracked_flight_id: trackedId,
          alert_type,
          is_enabled: true,
        },
        { onConflict: 'tracked_flight_id,alert_type' },
      );
    }

    return jsonResponse({ ok: true, data: { trackedFlightId: trackedId } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[save-tracked-flight]', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
