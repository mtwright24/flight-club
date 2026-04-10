import type { FlightTrackerProvider } from './provider.ts';
import type { LookupFlightInput, NormalizedFlightTrackerResult } from './types.ts';

const STUB_MSG =
  'Flight data is not configured. In Supabase: Project Settings → Edge Functions → Secrets, set AVIATIONSTACK_API_KEY, then redeploy edge functions. The FlightAware adapter in this repo is still a stub.';

function notConfigured(): never {
  throw new Error(STUB_MSG);
}

/**
 * FlightAware AeroAPI — structural stub only (no HTTP).
 * Fails fast so the app does not show a misleading empty “success” state.
 */
export const flightawareProvider: FlightTrackerProvider = {
  id: 'flightaware',

  async getFlightStatus(): Promise<NormalizedFlightTrackerResult | null> {
    notConfigured();
  },

  async lookupFlight(_input: LookupFlightInput): Promise<NormalizedFlightTrackerResult | null> {
    notConfigured();
  },

  async searchByRoute(): Promise<NormalizedFlightTrackerResult[]> {
    notConfigured();
  },

  async getAirportBoard(): Promise<NormalizedFlightTrackerResult[]> {
    notConfigured();
  },
};
