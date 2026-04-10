/**
 * Active flight data backend for Edge Functions (`flightaware` | `aviationstack`).
 * Secrets must be set in Supabase project secrets / env — never in client code.
 *
 * The FlightAware adapter is still a **stub** (no live HTTP) — it always returns empty results.
 * If `AVIATIONSTACK_API_KEY` is set, we **always** use Aviationstack so production data works
 * even when `FLIGHT_TRACKER_PROVIDER` was left as `flightaware` by mistake.
 */
export function getFlightTrackerProviderEnv(): 'flightaware' | 'aviationstack' {
  // @ts-expect-error Deno.env
  const hasAviationKey = !!(Deno.env.get('AVIATIONSTACK_API_KEY') ?? '').trim();
  if (hasAviationKey) return 'aviationstack';

  // @ts-expect-error Deno.env
  const explicit = (Deno.env.get('FLIGHT_TRACKER_PROVIDER') ?? '').toLowerCase().trim();
  if (explicit === 'aviationstack') return 'aviationstack';

  return 'flightaware';
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

/**
 * Aviationstack API base URL.
 * Free tier returns 403 `https_access_restricted` for HTTPS — default to HTTP from Edge Functions.
 * Paid plans can set `AVIATIONSTACK_BASE_URL=https://api.aviationstack.com/v1` in secrets.
 */
export function getAviationstackBaseUrl(): string {
  // @ts-expect-error Deno
  return (Deno.env.get('AVIATIONSTACK_BASE_URL') ?? 'http://api.aviationstack.com/v1').replace(/\/+$/, '');
}
