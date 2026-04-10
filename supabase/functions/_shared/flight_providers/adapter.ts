import { getFlightTrackerProviderEnv } from '../env.ts';
import type { FlightTrackerProvider } from './provider.ts';
import { aviationstackProvider } from './aviationstackProvider.ts';
import { flightawareProvider } from './flightawareProvider.ts';

/**
 * Resolves the active flight data provider (FlightAware vs Aviationstack).
 * Controlled by env `FLIGHT_TRACKER_PROVIDER` (`flightaware` | `aviationstack`).
 */
export function getFlightTrackerProvider(): FlightTrackerProvider {
  return getFlightTrackerProviderEnv() === 'aviationstack' ? aviationstackProvider : flightawareProvider;
}

export { flightawareProvider, aviationstackProvider };
