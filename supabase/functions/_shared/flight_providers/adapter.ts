import { getFlightTrackerProviderEnv } from '../env.ts';
import type { FlightTrackerProvider } from './provider.ts';
import { aviationstackProvider } from './aviationstackProvider.ts';
import { flightawareProvider } from './flightawareProvider.ts';

/**
 * Resolves the active flight data provider (FlightAware vs Aviationstack).
 * See `getFlightTrackerProviderEnv` for defaults when secrets are set.
 */
export function getFlightTrackerProvider(): FlightTrackerProvider {
  return getFlightTrackerProviderEnv() === 'aviationstack' ? aviationstackProvider : flightawareProvider;
}

export { flightawareProvider, aviationstackProvider };
