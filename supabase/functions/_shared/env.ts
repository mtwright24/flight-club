/**
 * Active flight data backend for Edge Functions (`flightaware` | `aviationstack`).
 * Secrets must be set in Supabase project secrets / env — never in client code.
 */
export function getFlightTrackerProviderEnv(): 'flightaware' | 'aviationstack' {
  // @ts-expect-error Deno.env
  const v = (Deno.env.get('FLIGHT_TRACKER_PROVIDER') ?? 'flightaware').toLowerCase().trim();
  return v === 'aviationstack' ? 'aviationstack' : 'flightaware';
}

/** FlightAware AeroAPI key (legacy names supported). */
export function getAeroApiKey(): string {
  // @ts-expect-error Deno
  const k =
    Deno.env.get('FLIGHTAWARE_API_KEY') ??
    Deno.env.get('FLIGHTAWARE_AEROAPI_KEY') ??
    '';
  return k;
}

/** FlightAware HTTP base (AeroAPI). */
export function getAeroBaseUrl(): string {
  // @ts-expect-error Deno
  return (Deno.env.get('FLIGHTAWARE_BASE_URL') ?? Deno.env.get('FLIGHTAWARE_AEROAPI_BASE_URL') ?? 'https://aeroapi.flightaware.com/aeroapi').replace(
    /\/+$/,
    '',
  );
}

/** Aviationstack REST API key (query param `access_key`). */
export function getAviationstackApiKey(): string {
  // @ts-expect-error Deno
  return Deno.env.get('AVIATIONSTACK_API_KEY') ?? '';
}

/** Aviationstack API base URL. */
export function getAviationstackBaseUrl(): string {
  // @ts-expect-error Deno
  return (Deno.env.get('AVIATIONSTACK_BASE_URL') ?? 'https://api.aviationstack.com/v1').replace(/\/+$/, '');
}
