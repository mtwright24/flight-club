import type { FlightTrackerProvider } from './provider.ts';
import type { NormalizedFlightTrackerResult, LookupFlightInput } from './types.ts';

/**
 * FlightAware AeroAPI — structural stub only (no HTTP).
 * Next: delegate to flightaware_aeroapi + normalize.mapProviderFlightToNormalized.
 */
export const flightawareProvider: FlightTrackerProvider = {
  id: 'flightaware',

  async getFlightStatus(): Promise<NormalizedFlightTrackerResult | null> {
    return null;
  },

  async lookupFlight(_input: LookupFlightInput): Promise<NormalizedFlightTrackerResult | null> {
    return null;
  },

  async searchByRoute(): Promise<NormalizedFlightTrackerResult[]> {
    return [];
  },

  async getAirportBoard(): Promise<NormalizedFlightTrackerResult[]> {
    return [];
  },
};
