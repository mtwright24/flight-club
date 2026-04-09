import type { NormalizedFlight } from '../../lib/supabase/flightTracker';
import { buildFlightKey } from './flightKeys';
import type { NormalizedFlightTrackerResult, TrackedFlightRow, TrackerStatus } from './types';

function legacyStatusToTracker(s: NormalizedFlight['normalized_status']): TrackerStatus {
  if (s === 'en_route') return 'airborne';
  if (s === 'taxiing' || s === 'holding') return 'departed';
  if (
    s === 'scheduled' ||
    s === 'boarding' ||
    s === 'departed' ||
    s === 'delayed' ||
    s === 'landed' ||
    s === 'cancelled' ||
    s === 'unknown'
  ) {
    return s as TrackerStatus;
  }
  return 'unknown';
}

export function legacyToNormalized(f: NormalizedFlight): NormalizedFlightTrackerResult {
  return {
    carrierCode: f.airline_code,
    flightNumber: f.flight_number,
    displayFlightNumber: `${f.airline_code} ${f.flight_number}`,
    flightDate: f.service_date,
    status: legacyStatusToTracker(f.normalized_status),
    departureAirport: f.origin_airport,
    arrivalAirport: f.destination_airport,
    flightKey: f.flight_key,
    scheduledDepartureUtc: f.scheduled_departure,
    scheduledArrivalUtc: f.scheduled_arrival,
    estimatedDepartureUtc: f.estimated_departure,
    estimatedArrivalUtc: f.estimated_arrival,
    actualDepartureUtc: f.actual_departure,
    actualArrivalUtc: f.actual_arrival,
    delayMinutes: f.delay_minutes,
    tailNumber: f.registration,
    aircraftType: f.aircraft_type,
    departureTerminal: f.terminal,
    departureGate: f.gate,
    providerFlightId: f.provider_flight_id ?? undefined,
  };
}

function toLegacyStatus(s: TrackerStatus): NormalizedFlight['normalized_status'] {
  if (s === 'airborne') return 'en_route';
  if (s === 'diverted') return 'delayed';
  return s as NormalizedFlight['normalized_status'];
}

export function toLegacyNormalizedFlight(f: NormalizedFlightTrackerResult): NormalizedFlight {
  const flightKey =
    f.flightKey ??
    buildFlightKey({
      airlineCode: f.carrierCode,
      flightNumber: f.flightNumber,
      serviceDate: f.flightDate ?? new Date().toISOString().slice(0, 10),
      origin: f.departureAirport,
      destination: f.arrivalAirport,
    });

  return {
    flight_key: flightKey,
    provider_flight_id: f.providerFlightId ?? null,
    airline_code: f.carrierCode,
    airline_name: null,
    flight_number: f.flightNumber,
    origin_airport: f.departureAirport,
    destination_airport: f.arrivalAirport,
    service_date: f.flightDate ?? new Date().toISOString().slice(0, 10),
    normalized_status: toLegacyStatus(f.status),
    flight_status_raw: f.status,
    scheduled_departure: f.scheduledDepartureUtc ?? null,
    scheduled_arrival: f.scheduledArrivalUtc ?? null,
    estimated_departure: f.estimatedDepartureUtc ?? null,
    estimated_arrival: f.estimatedArrivalUtc ?? null,
    actual_departure: f.actualDepartureUtc ?? null,
    actual_arrival: f.actualArrivalUtc ?? null,
    delay_minutes: f.delayMinutes ?? null,
    aircraft_type: f.aircraftType ?? null,
    registration: f.tailNumber ?? null,
    terminal: f.departureTerminal ?? null,
    gate: f.departureGate ?? null,
    altitude: null,
    speed: null,
    heading: null,
    latitude: null,
    longitude: null,
    route_data: f.inboundSummary ? { inbound: f.inboundSummary } : null,
    last_provider_update_at: null,
    cached_at: null,
    updated_at: null,
  };
}

export function searchItemToLegacyFlight(
  item: import('./types').NormalizedSearchResultItem,
): NormalizedFlight {
  const flightKey = buildFlightKey({
    airlineCode: item.carrierCode,
    flightNumber: item.flightNumber,
    serviceDate: item.flightDate,
    origin: item.departureAirport,
    destination: item.arrivalAirport,
  });
  return {
    flight_key: flightKey,
    provider_flight_id: item.providerFlightId ?? null,
    airline_code: item.carrierCode,
    airline_name: null,
    flight_number: item.flightNumber,
    origin_airport: item.departureAirport,
    destination_airport: item.arrivalAirport,
    service_date: item.flightDate,
    normalized_status: toLegacyStatus(item.status),
    flight_status_raw: item.status,
    scheduled_departure: item.scheduledDepartureUtc ?? null,
    scheduled_arrival: item.scheduledArrivalUtc ?? null,
    estimated_departure: null,
    estimated_arrival: null,
    actual_departure: null,
    actual_arrival: null,
    delay_minutes: null,
    aircraft_type: null,
    registration: null,
    terminal: null,
    gate: null,
    altitude: null,
    speed: null,
    heading: null,
    latitude: null,
    longitude: null,
    route_data: null,
    last_provider_update_at: null,
    cached_at: null,
    updated_at: null,
  };
}

export function boardRowToLegacyFlight(row: import('./types').NormalizedBoardRow, serviceDate: string): NormalizedFlight {
  const flightKey = buildFlightKey({
    airlineCode: row.carrierCode,
    flightNumber: row.flightNumber,
    serviceDate,
    origin: row.origin,
    destination: row.destination,
  });
  return {
    flight_key: flightKey,
    provider_flight_id: row.providerFlightId ?? null,
    airline_code: row.carrierCode,
    airline_name: null,
    flight_number: row.flightNumber,
    origin_airport: row.origin,
    destination_airport: row.destination,
    service_date: serviceDate,
    normalized_status: toLegacyStatus(row.status),
    flight_status_raw: row.status,
    scheduled_departure: row.scheduledDepartureUtc ?? null,
    scheduled_arrival: row.scheduledArrivalUtc ?? null,
    estimated_departure: row.estimatedDepartureUtc ?? null,
    estimated_arrival: row.estimatedArrivalUtc ?? null,
    actual_departure: null,
    actual_arrival: null,
    delay_minutes: null,
    aircraft_type: null,
    registration: null,
    terminal: null,
    gate: row.gate ?? null,
    altitude: null,
    speed: null,
    heading: null,
    latitude: null,
    longitude: null,
    route_data: null,
    last_provider_update_at: null,
    cached_at: null,
    updated_at: null,
  };
}

export function trackedRowToLegacyFlight(row: TrackedFlightRow): NormalizedFlight {
  const fk =
    row.flight_key ||
    buildFlightKey({
      airlineCode: row.carrier_code,
      flightNumber: row.flight_number,
      serviceDate: row.flight_date,
      origin: row.departure_airport,
      destination: row.arrival_airport,
    });
  return {
    flight_key: fk,
    provider_flight_id: row.api_flight_id,
    airline_code: row.carrier_code,
    airline_name: null,
    flight_number: row.flight_number,
    origin_airport: row.departure_airport,
    destination_airport: row.arrival_airport,
    service_date: row.flight_date,
    normalized_status: (row.status as NormalizedFlight['normalized_status']) || 'unknown',
    flight_status_raw: row.status,
    scheduled_departure: row.scheduled_departure_utc,
    scheduled_arrival: row.scheduled_arrival_utc,
    estimated_departure: row.estimated_departure_utc,
    estimated_arrival: row.estimated_arrival_utc,
    actual_departure: null,
    actual_arrival: null,
    delay_minutes: null,
    aircraft_type: null,
    registration: null,
    terminal: null,
    gate: row.departure_gate,
    altitude: null,
    speed: null,
    heading: null,
    latitude: null,
    longitude: null,
    route_data: null,
    last_provider_update_at: row.last_synced_at,
    cached_at: null,
    updated_at: row.updated_at,
  };
}

export function toNormalizedFlightTrackerFromRow(row: TrackedFlightRow): NormalizedFlightTrackerResult {
  return {
    carrierCode: row.carrier_code,
    flightNumber: row.flight_number,
    displayFlightNumber: row.display_flight_number || `${row.carrier_code} ${row.flight_number}`,
    flightDate: row.flight_date,
    status: ((row.status as TrackerStatus) || 'unknown') as NormalizedFlightTrackerResult['status'],
    departureAirport: row.departure_airport,
    arrivalAirport: row.arrival_airport,
    flightKey: row.flight_key ?? undefined,
    scheduledDepartureUtc: row.scheduled_departure_utc,
    scheduledArrivalUtc: row.scheduled_arrival_utc,
    estimatedDepartureUtc: row.estimated_departure_utc,
    estimatedArrivalUtc: row.estimated_arrival_utc,
    departureGate: row.departure_gate,
    arrivalGate: row.arrival_gate,
    providerFlightId: row.api_flight_id ?? undefined,
    isPinned: row.is_pinned,
  };
}
