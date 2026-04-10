import type { FlightTrackerProvider } from './provider.ts';
import type { LookupFlightInput, NormalizedFlightTrackerResult } from './types.ts';
import {
  aviationstackGet,
  allFlightRows,
  firstFlightRow,
  shouldTryAviationstackUnfilteredFallback,
  throwIfAviationstackFailed,
} from './aviationstackHttp.ts';
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

/** Free tier: unfiltered `/flights` sample — keep rows for this airport (date not enforced: UTC vs local was dropping valid rows). */
function filterBoardRows(
  rows: Record<string, unknown>[],
  code: string,
  boardType: 'arrivals' | 'departures',
  _serviceDate: string,
): NormalizedFlightTrackerResult[] {
  const out: NormalizedFlightTrackerResult[] = [];
  for (const r of rows) {
    const m = mapAviationstackFlightToNormalized(r);
    if (!m) continue;
    if (boardType === 'departures') {
      if (m.departureAirport !== code) continue;
    } else if (m.arrivalAirport !== code) {
      continue;
    }
    out.push(m);
  }
  return out.sort(sortByDeparture);
}

function filterRouteRows(
  rows: Record<string, unknown>[],
  origin: string,
  destination: string,
  _serviceDate: string,
): NormalizedFlightTrackerResult[] {
  const out: NormalizedFlightTrackerResult[] = [];
  for (const r of rows) {
    const m = mapAviationstackFlightToNormalized(r);
    if (!m) continue;
    if (m.departureAirport !== origin || m.arrivalAirport !== destination) continue;
    out.push(m);
  }
  return out.sort(sortByDeparture);
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
      let res = await aviationstackGet('flights', {
        flight_date: parsed.flightDate,
        flight_iata: parsed.flightIata,
        dep_iata: parsed.depIata,
        arr_iata: parsed.arrIata,
        limit: 10,
      });
      if (shouldTryAviationstackUnfilteredFallback(res)) {
        res = await aviationstackGet('flights', {});
        throwIfAviationstackFailed(res, 'flight status');
        const { body } = res;
        for (const r of allFlightRows(body)) {
          const m = mapAviationstackFlightToNormalized(r);
          if (m && m.providerFlightId === input.providerFlightId) return m;
        }
        const fr = firstFlightRow(body);
        return fr ? mapAviationstackFlightToNormalized(fr) : null;
      }
      throwIfAviationstackFailed(res, 'flight status');
      const { body } = res;
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

    const pickFromRows = (rows: Record<string, unknown>[]): NormalizedFlightTrackerResult | null => {
      const origin = input.origin?.trim().toUpperCase();
      const dest = input.destination?.trim().toUpperCase();
      const targetCompact = `${q.airlineCode}${q.flightNumber}`.toUpperCase();

      const matchesSearchIdent = (m: NormalizedFlightTrackerResult): boolean => {
        const compact = `${m.carrierCode}${m.flightNumber}`.toUpperCase();
        if (compact === targetCompact) return true;
        return q.flightIata.toUpperCase() === compact;
      };

      for (const r of rows) {
        const m = mapAviationstackFlightToNormalized(r);
        if (!m) continue;
        if (!matchesSearchIdent(m)) continue;
        if (origin && m.departureAirport !== origin) continue;
        if (dest && m.arrivalAirport !== dest) continue;
        return m;
      }
      return null;
    };

    let first = await aviationstackGet('flights', {
      flight_date: input.serviceDate,
      flight_iata: q.flightIata,
      limit: 30,
    });
    if (shouldTryAviationstackUnfilteredFallback(first)) {
      first = await aviationstackGet('flights', {});
      throwIfAviationstackFailed(first, 'flight lookup');
      return pickFromRows(allFlightRows(first.body));
    }
    throwIfAviationstackFailed(first, 'flight lookup');
    let rows = allFlightRows(first.body);
    if (rows.length === 0) {
      const r2 = await aviationstackGet('flights', {
        flight_date: input.serviceDate,
        airline_iata: q.airlineCode,
        flight_number: q.flightNumber,
        limit: 30,
      });
      if (shouldTryAviationstackUnfilteredFallback(r2)) {
        const bulk = await aviationstackGet('flights', {});
        throwIfAviationstackFailed(bulk, 'flight lookup');
        return pickFromRows(allFlightRows(bulk.body));
      }
      throwIfAviationstackFailed(r2, 'flight lookup (fallback)');
      rows = allFlightRows(r2.body);
    }
    return pickFromRows(rows);
  },

  async searchByRoute(
    origin: string,
    destination: string,
    serviceDate: string,
  ): Promise<NormalizedFlightTrackerResult[]> {
    const o = origin.trim().toUpperCase();
    const d = destination.trim().toUpperCase();
    if (!o || !d) return [];

    let res = await aviationstackGet('flights', {
      flight_date: serviceDate,
      dep_iata: o,
      arr_iata: d,
      limit: 40,
    });
    if (shouldTryAviationstackUnfilteredFallback(res)) {
      res = await aviationstackGet('flights', {});
      throwIfAviationstackFailed(res, 'route search (free-tier sample)');
      return filterRouteRows(allFlightRows(res.body), o, d, serviceDate);
    }
    throwIfAviationstackFailed(res, 'route search');
    const { body } = res;

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

    let res = await aviationstackGet('flights', params);
    if (shouldTryAviationstackUnfilteredFallback(res)) {
      res = await aviationstackGet('flights', {});
      throwIfAviationstackFailed(res, 'airport board (free-tier sample)');
      return filterBoardRows(allFlightRows(res.body), code, boardType, serviceDate);
    }
    throwIfAviationstackFailed(res, 'airport board');

    const out: NormalizedFlightTrackerResult[] = [];
    const { body } = res;
    for (const r of allFlightRows(body)) {
      const m = mapAviationstackFlightToNormalized(r);
      if (m) out.push(m);
    }
    return out.sort(sortByDeparture);
  },
};
