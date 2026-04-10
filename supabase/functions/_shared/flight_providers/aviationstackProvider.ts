import type { FlightTrackerProvider } from './provider.ts';
import type { LookupFlightInput, NormalizedFlightTrackerResult } from './types.ts';
import { aviationstackGet, allFlightRows, firstFlightRow } from './aviationstackHttp.ts';
import {
  mapAviationstackFlightToNormalized,
  parseAviationstackProviderFlightId,
  parseIdentToFlightQuery,
} from './aviationstackMapper.ts';

function sortByDeparture(a: NormalizedFlightTrackerResult, b: NormalizedFlightTrackerResult): number {
  const at = a.scheduledDepartureUtc ? new Date(a.scheduledDepartureUtc).getTime() : Number.MAX_SAFE_INTEGER;
  const bt = b.scheduledDepartureUtc ? new Date(b.scheduledDepartureUtc).getTime() : Number.MAX_SAFE_INTEGER;
  return at - bt;
}

export const aviationstackProvider: FlightTrackerProvider = {
  id: 'aviationstack',

  async getFlightStatus(input: {
    carrierCode: string;
    flightNumber: string;
    flightDate: string;
    providerFlightId?: string;
  }): Promise<NormalizedFlightTrackerResult | null> {
    if (input.providerFlightId) {
      const parsed = parseAviationstackProviderFlightId(input.providerFlightId);
      if (!parsed) return null;
      const { ok, body } = await aviationstackGet('flights', {
        flight_date: parsed.flightDate,
        flight_iata: parsed.flightIata,
        dep_iata: parsed.depIata,
        arr_iata: parsed.arrIata,
        limit: 10,
      });
      if (!ok || body.error) return null;
      for (const r of allFlightRows(body)) {
        const m = mapAviationstackFlightToNormalized(r);
        if (m && m.providerFlightId === input.providerFlightId) return m;
      }
      const fr = firstFlightRow(body);
      return fr ? mapAviationstackFlightToNormalized(fr) : null;
    }
    return aviationstackProvider.lookupFlight({
      ident: `${input.carrierCode}${input.flightNumber}`,
      serviceDate: input.flightDate,
      airlineCode: input.carrierCode,
      flightNumber: input.flightNumber,
    });
  },

  async lookupFlight(input: LookupFlightInput): Promise<NormalizedFlightTrackerResult | null> {
    const q = parseIdentToFlightQuery(input.ident);
    if (!q) return null;
    const first = await aviationstackGet('flights', {
      flight_date: input.serviceDate,
      flight_iata: q.flightIata,
      limit: 30,
    });
    if (!first.ok || first.body.error) return null;
    let rows = allFlightRows(first.body);
    if (rows.length === 0) {
      const r2 = await aviationstackGet('flights', {
        flight_date: input.serviceDate,
        airline_iata: q.airlineCode,
        flight_number: q.flightNumber,
        limit: 30,
      });
      if (!r2.ok || r2.body.error) return null;
      rows = allFlightRows(r2.body);
    }
    const origin = input.origin?.trim().toUpperCase();
    const dest = input.destination?.trim().toUpperCase();

    for (const r of rows) {
      const m = mapAviationstackFlightToNormalized(r);
      if (!m) continue;
      if (origin && m.departureAirport !== origin) continue;
      if (dest && m.arrivalAirport !== dest) continue;
      return m;
    }

    for (const r of rows) {
      const m = mapAviationstackFlightToNormalized(r);
      if (m) return m;
    }
    return null;
  },

  async searchByRoute(
    origin: string,
    destination: string,
    serviceDate: string,
  ): Promise<NormalizedFlightTrackerResult[]> {
    const o = origin.trim().toUpperCase();
    const d = destination.trim().toUpperCase();
    if (!o || !d) return [];

    const { ok, body } = await aviationstackGet('flights', {
      flight_date: serviceDate,
      dep_iata: o,
      arr_iata: d,
      limit: 40,
    });
    if (!ok || body.error) return [];

    const out: NormalizedFlightTrackerResult[] = [];
    for (const r of allFlightRows(body)) {
      const m = mapAviationstackFlightToNormalized(r);
      if (m && m.arrivalAirport === d && m.departureAirport === o) out.push(m);
    }
    return out.sort(sortByDeparture);
  },

  async getAirportBoard(
    airportCode: string,
    boardType: 'arrivals' | 'departures',
    serviceDate: string,
  ): Promise<NormalizedFlightTrackerResult[]> {
    const code = airportCode.trim().toUpperCase();
    if (code.length !== 3) return [];

    const params: Record<string, string | number | undefined> = {
      flight_date: serviceDate,
      limit: 50,
    };
    if (boardType === 'departures') params.dep_iata = code;
    else params.arr_iata = code;

    const { ok, body } = await aviationstackGet('flights', params);
    if (!ok || body.error) return [];

    const out: NormalizedFlightTrackerResult[] = [];
    for (const r of allFlightRows(body)) {
      const m = mapAviationstackFlightToNormalized(r);
      if (m) out.push(m);
    }
    return out.sort(sortByDeparture);
  },
};
