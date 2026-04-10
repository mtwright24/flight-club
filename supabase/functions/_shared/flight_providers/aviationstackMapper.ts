import { buildFlightKey, num } from '../flightaware_aeroapi.ts';
import type { NormalizedBoardRow, NormalizedFlightTrackerResult, TrackerStatus } from './types.ts';

function parseIso(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function sub(o: unknown, k: string): Record<string, unknown> | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const v = (o as Record<string, unknown>)[k];
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
}

function mapAsStatus(raw: string): TrackerStatus {
  const s = raw.toLowerCase();
  if (s === 'scheduled') return 'scheduled';
  if (s === 'active') return 'airborne';
  if (s === 'landed') return 'landed';
  if (s === 'cancelled') return 'cancelled';
  if (s === 'diverted') return 'diverted';
  if (s === 'incident') return 'unknown';
  return 'unknown';
}

function computeDelayFromDepArr(
  dep?: Record<string, unknown>,
  arr?: Record<string, unknown>,
): number | null {
  const dd = dep?.delay;
  const ad = arr?.delay;
  if (typeof dd === 'number' && Number.isFinite(dd)) return Math.round(dd);
  if (typeof ad === 'number' && Number.isFinite(ad)) return Math.round(ad);
  return null;
}

/** Stable id for cache + client round-trip (no secrets). */
export function buildAviationstackProviderFlightId(
  flightIata: string,
  flightDate: string,
  depIata: string,
  arrIata: string,
): string {
  return `as:${flightIata}|${flightDate}|${depIata}|${arrIata}`;
}

export function parseAviationstackProviderFlightId(id: string): {
  flightIata: string;
  flightDate: string;
  depIata: string;
  arrIata: string;
} | null {
  if (!id.startsWith('as:')) return null;
  const parts = id.slice(3).split('|');
  if (parts.length !== 4) return null;
  return {
    flightIata: parts[0],
    flightDate: parts[1],
    depIata: parts[2],
    arrIata: parts[3],
  };
}

/** Parse ident like B6512 → airline B6 + number 512 + flight_iata B6512 */
export function parseIdentToFlightQuery(ident: string): {
  airlineCode: string;
  flightNumber: string;
  flightIata: string;
} | null {
  const s = ident.trim().toUpperCase().replace(/\s+/g, '');
  const m = s.match(/^([A-Z0-9]{2})(\d{1,4})$/);
  if (!m) return null;
  return { airlineCode: m[1], flightNumber: m[2], flightIata: `${m[1]}${m[2]}` };
}

export function mapAviationstackFlightToNormalized(row: Record<string, unknown>): NormalizedFlightTrackerResult | null {
  const dep = sub(row, 'departure');
  const arr = sub(row, 'arrival');
  const airline = sub(row, 'airline');
  const flight = sub(row, 'flight');
  const aircraft = sub(row, 'aircraft');
  const live = sub(row, 'live');

  const airlineCode = String(airline?.iata ?? '').trim().toUpperCase();
  const flightNumber = String(flight?.number ?? '').trim().toUpperCase();
  const flightDate = String(row.flight_date ?? '').trim();
  const depIata = String(dep?.iata ?? '').trim().toUpperCase();
  const arrIata = String(arr?.iata ?? '').trim().toUpperCase();

  if (!airlineCode || !flightNumber || !flightDate || !depIata || !arrIata) return null;

  const scheduledDepartureUtc = parseIso(dep?.scheduled);
  const estimatedDepartureUtc = parseIso(dep?.estimated);
  const actualDepartureUtc = parseIso(dep?.actual);
  const scheduledArrivalUtc = parseIso(arr?.scheduled);
  const estimatedArrivalUtc = parseIso(arr?.estimated);
  const actualArrivalUtc = parseIso(arr?.actual);

  const status = mapAsStatus(String(row.flight_status ?? ''));
  const delayMinutes = computeDelayFromDepArr(dep, arr);

  const flightIataRaw = String(flight?.iata ?? '').trim().toUpperCase();
  const flightIata = flightIataRaw || `${airlineCode}${flightNumber}`;

  const providerFlightId = buildAviationstackProviderFlightId(flightIata, flightDate, depIata, arrIata);

  const flightKey = buildFlightKey({
    airlineCode,
    flightNumber,
    serviceDate: flightDate,
    origin: depIata,
    destination: arrIata,
  });

  const routeLabel = `${depIata} → ${arrIata}`;

  let latitude: number | null = null;
  let longitude: number | null = null;
  let altitude: number | null = null;
  let heading: number | null = null;
  let speedHorizontal: number | null = null;
  if (live) {
    latitude = num(live.latitude);
    longitude = num(live.longitude);
    altitude = num(live.altitude);
    heading = num(live.direction);
    speedHorizontal = num(live.speed_horizontal);
  }

  return {
    provider: 'aviationstack',
    providerFlightId,
    flightKey,
    carrierCode: airlineCode,
    flightNumber,
    displayFlightNumber: `${airlineCode} ${flightNumber}`,
    flightDate,
    status,
    departureAirport: depIata,
    arrivalAirport: arrIata,
    departureTerminal: dep?.terminal != null ? String(dep.terminal) : null,
    arrivalTerminal: arr?.terminal != null ? String(arr.terminal) : null,
    departureGate: dep?.gate != null ? String(dep.gate) : null,
    arrivalGate: arr?.gate != null ? String(arr.gate) : null,
    scheduledDepartureUtc,
    estimatedDepartureUtc,
    actualDepartureUtc,
    scheduledArrivalUtc,
    estimatedArrivalUtc,
    actualArrivalUtc,
    delayMinutes,
    tailNumber: aircraft?.registration != null ? String(aircraft.registration) : null,
    aircraftType: aircraft?.iata != null ? String(aircraft.iata) : null,
    routeLabel,
    progressPercent: null,
    latitude,
    longitude,
    altitude,
    heading,
    speedHorizontal,
  };
}

export function mapAviationstackFlightToBoardRow(
  row: Record<string, unknown>,
  boardType: 'arrivals' | 'departures',
): NormalizedBoardRow | null {
  const f = mapAviationstackFlightToNormalized(row);
  if (!f) return null;
  return {
    carrierCode: f.carrierCode,
    flightNumber: f.flightNumber,
    displayFlightNumber: f.displayFlightNumber,
    origin: f.departureAirport,
    destination: f.arrivalAirport,
    scheduledDepartureUtc: f.scheduledDepartureUtc ?? null,
    scheduledArrivalUtc: f.scheduledArrivalUtc ?? null,
    estimatedDepartureUtc: f.estimatedDepartureUtc ?? null,
    estimatedArrivalUtc: f.estimatedArrivalUtc ?? null,
    status: f.status,
    gate: boardType === 'departures' ? f.departureGate : f.arrivalGate,
    terminal: boardType === 'departures' ? f.departureTerminal : f.arrivalTerminal,
    providerFlightId: f.providerFlightId,
  };
}
