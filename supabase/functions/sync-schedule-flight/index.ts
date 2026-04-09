// @ts-expect-error Deno std
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error Deno esm
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getFlightTrackerProvider } from '../_shared/flight_providers/adapter.ts';
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
    const scheduleItemId = String(body.scheduleItemId || body.schedule_item_id || '').trim();
    const carrierCode = String(body.carrierCode || body.carrier_code || '').trim().toUpperCase();
    const flightNumber = String(body.flightNumber || body.flight_number || '').trim().toUpperCase();
    const flightDate = String(body.flightDate || body.flight_date || '').trim();

    if (!scheduleItemId || !carrierCode || !flightNumber || !flightDate) {
      return jsonResponse({ ok: false, error: 'scheduleItemId, carrierCode, flightNumber, and flightDate are required' }, 400);
    }

    const { data: entry, error: entErr } = await supabase
      .from('schedule_entries')
      .select('id, user_id')
      .eq('id', scheduleItemId)
      .maybeSingle();

    if (entErr) throw entErr;
    if (!entry || String(entry.user_id) !== userId) {
      return jsonResponse({ ok: false, error: 'Schedule entry not found' }, 404);
    }

    const provider = getFlightTrackerProvider();
    console.log('[sync-schedule-flight]', 'request', { provider: provider.id, flightDate, scheduleItemIdLen: scheduleItemId.length });
    const ident = `${carrierCode}${flightNumber}`;
    const live = await provider.lookupFlight({
      ident,
      serviceDate: flightDate,
      airlineCode: carrierCode,
      flightNumber,
    });

    if (!live) {
      await supabase.from('schedule_flight_links').upsert(
        {
          user_id: userId,
          schedule_item_id: scheduleItemId,
          carrier_code: carrierCode,
          flight_number: flightNumber,
          flight_date: flightDate,
          api_flight_id: null,
          tracked_flight_id: null,
          sync_status: 'not_found',
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,schedule_item_id' },
      );
      return jsonResponse({
        ok: true,
        data: {
          syncStatus: 'not_found',
          message: 'No matching flight for this schedule row.',
        },
      });
    }

    const tfRow = {
      user_id: userId,
      carrier_code: live.carrierCode,
      flight_number: live.flightNumber,
      display_flight_number: live.displayFlightNumber,
      flight_date: flightDate,
      departure_airport: live.departureAirport,
      arrival_airport: live.arrivalAirport,
      flight_key: live.flightKey ?? null,
      scheduled_departure_utc: live.scheduledDepartureUtc ?? null,
      scheduled_arrival_utc: live.scheduledArrivalUtc ?? null,
      estimated_departure_utc: live.estimatedDepartureUtc ?? null,
      estimated_arrival_utc: live.estimatedArrivalUtc ?? null,
      actual_departure_utc: live.actualDepartureUtc ?? null,
      actual_arrival_utc: live.actualArrivalUtc ?? null,
      departure_terminal: live.departureTerminal ?? null,
      arrival_terminal: live.arrivalTerminal ?? null,
      departure_gate: live.departureGate ?? null,
      arrival_gate: live.arrivalGate ?? null,
      status: live.status,
      tail_number: live.tailNumber ?? null,
      aircraft_type: live.aircraftType ?? null,
      api_provider: live.provider ?? provider.id,
      api_flight_id: live.providerFlightId ?? null,
      alerts_enabled: true,
      is_pinned: false,
      last_synced_at: new Date().toISOString(),
    };

    const { data: tf, error: tfErr } = await supabase
      .from('tracked_flights')
      .upsert(tfRow, { onConflict: 'user_id,carrier_code,flight_number,flight_date' })
      .select('id')
      .single();

    if (tfErr) throw tfErr;
    const trackedFlightId = tf?.id as string;

    await supabase.from('schedule_flight_links').upsert(
      {
        user_id: userId,
        schedule_item_id: scheduleItemId,
        carrier_code: carrierCode,
        flight_number: flightNumber,
        flight_date: flightDate,
        api_flight_id: live.providerFlightId ?? null,
        tracked_flight_id: trackedFlightId,
        sync_status: 'matched',
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,schedule_item_id' },
    );

    console.log('[sync-schedule-flight]', 'matched', { provider: provider.id });
    return jsonResponse({
      ok: true,
      data: {
        syncStatus: 'matched',
        trackedFlightId,
        flight: live,
        flightKey: live.flightKey,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sync-schedule-flight]', msg);
    await Promise.resolve();
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
