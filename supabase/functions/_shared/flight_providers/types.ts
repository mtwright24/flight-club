/**
 * Provider-agnostic normalized flight data (Edge Functions).
 * All providers map their API responses into these shapes.
 */

export type FlightProviderId = 'flightaware' | 'aviationstack';

export type TrackerStatus =
  | 'scheduled'
  | 'boarding'
  | 'departed'
  | 'airborne'
  | 'landed'
  | 'delayed'
  | 'cancelled'
  | 'diverted'
  | 'unknown';

export type NormalizedFlightTrackerResult = {
  providerFlightId?: string;
  provider?: FlightProviderId;
  flightKey?: string;
  carrierCode: string;
  flightNumber: string;
  displayFlightNumber: string;
  flightDate?: string;
  status: TrackerStatus;
  departureAirport: string;
  arrivalAirport: string;
  departureTerminal?: string | null;
  arrivalTerminal?: string | null;
  departureGate?: string | null;
  arrivalGate?: string | null;
  scheduledDepartureUtc?: string | null;
  estimatedDepartureUtc?: string | null;
  actualDepartureUtc?: string | null;
  scheduledArrivalUtc?: string | null;
  estimatedArrivalUtc?: string | null;
  actualArrivalUtc?: string | null;
  delayMinutes?: number | null;
  tailNumber?: string | null;
  aircraftType?: string | null;
  routeLabel?: string | null;
  progressPercent?: number | null;
  /** Live position when provider supplies it (e.g. Aviationstack `live`) */
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
  heading?: number | null;
  speedHorizontal?: number | null;
  isPinned?: boolean;
  alertsEnabled?: boolean;
  inboundSummary?: {
    displayFlightNumber?: string | null;
    from?: string | null;
    to?: string | null;
    etaUtc?: string | null;
    delayMinutes?: number | null;
    riskLevel?: 'low' | 'medium' | 'high' | 'unknown';
  } | null;
};

export type NormalizedSearchResultItem = {
  kind: 'flight' | 'route_row' | 'airport_hint';
  carrierCode: string;
  flightNumber: string;
  displayFlightNumber: string;
  flightDate: string;
  departureAirport: string;
  arrivalAirport: string;
  status: TrackerStatus;
  providerFlightId?: string;
  scheduledDepartureUtc?: string | null;
  scheduledArrivalUtc?: string | null;
};

export type NormalizedBoardRow = {
  carrierCode: string;
  flightNumber: string;
  displayFlightNumber: string;
  origin: string;
  destination: string;
  scheduledDepartureUtc?: string | null;
  scheduledArrivalUtc?: string | null;
  estimatedDepartureUtc?: string | null;
  estimatedArrivalUtc?: string | null;
  status: TrackerStatus;
  gate?: string | null;
  terminal?: string | null;
  providerFlightId?: string;
};

/** Input for single-flight status / lookup (normalized request, not raw HTTP). */
export type LookupFlightInput = {
  ident: string;
  serviceDate: string;
  airlineCode?: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
};
