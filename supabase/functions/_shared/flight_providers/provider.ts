import type {
  NormalizedFlightTrackerResult,
  FlightProviderId,
  LookupFlightInput,
} from './types.ts';

/**
 * Pluggable flight data provider. Implementations may call FlightAware, Aviationstack, etc.
 * Stub implementations return null / [] until wired to real APIs.
 */
export interface FlightTrackerProvider {
  readonly id: FlightProviderId;

  /** Resolve status for a known provider flight id or carrier/flight/date. */
  getFlightStatus(input: {
    carrierCode: string;
    flightNumber: string;
    flightDate: string;
    providerFlightId?: string;
  }): Promise<NormalizedFlightTrackerResult | null>;

  /** Lookup by ident (e.g. B61234) + date. */
  lookupFlight(input: LookupFlightInput): Promise<NormalizedFlightTrackerResult | null>;

  /** Route search (origin → dest on date). */
  searchByRoute(
    origin: string,
    destination: string,
    serviceDate: string,
  ): Promise<NormalizedFlightTrackerResult[]>;

  /** Airport arrivals or departures board. */
  getAirportBoard(
    airportCode: string,
    boardType: 'arrivals' | 'departures',
    serviceDate: string,
  ): Promise<NormalizedFlightTrackerResult[]>;
}
