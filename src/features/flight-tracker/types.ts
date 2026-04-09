/** Client-side mirror of edge-function normalized flight shape */
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
  provider?: 'flightaware';
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

export type TrackedFlightRow = {
  id: string;
  user_id: string;
  carrier_code: string;
  flight_number: string;
  display_flight_number: string | null;
  flight_date: string;
  departure_airport: string;
  arrival_airport: string;
  flight_key: string | null;
  scheduled_departure_utc: string | null;
  scheduled_arrival_utc: string | null;
  estimated_departure_utc: string | null;
  estimated_arrival_utc: string | null;
  status: string | null;
  departure_gate: string | null;
  arrival_gate: string | null;
  api_flight_id: string | null;
  is_pinned: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};
