(globalThis as { __DEV__?: boolean }).__DEV__ = false;

import {
  decimalHoursToFlicaBlockHhmm,
  deriveRouteBlockFromTrip,
  enrichTradeboardPostRequestActivity,
} from "../tradeBoardPostRequestActivityEnrich";
import type { CrewScheduleTrip } from "../types";
import type { TradeboardPostRequestActivity } from "../../flica-actions/flicaTradeBoardPostRequestTypes";

function sampleTrip(): CrewScheduleTrip {
  return {
    id: "trip-j1015",
    pairingCode: "J1015",
    month: 5,
    year: 2026,
    startDate: "2026-05-07",
    endDate: "2026-05-08",
    dutyDays: 2,
    status: "flying",
    routeSummary: "JFK–MCO–JFK",
    origin: "JFK",
    destination: "JFK",
    pairingBlockHours: 4.75,
    legs: [
      {
        id: "l1",
        dutyDate: "2026-05-07",
        departureAirport: "JFK",
        arrivalAirport: "MCO",
        blockTimeLocal: "0230",
        flightNumber: "123",
      },
      {
        id: "l2",
        dutyDate: "2026-05-08",
        departureAirport: "MCO",
        arrivalAirport: "JFK",
        blockTimeLocal: "0215",
        flightNumber: "456",
      },
    ],
  };
}

describe("tradeBoardPostRequestActivityEnrich", () => {
  it("derives dep, arr, and decimal block from pairingBlockHours", () => {
    const route = deriveRouteBlockFromTrip(sampleTrip());
    expect(route.depAirport).toBe("JFK");
    expect(route.arrAirport).toBe("JFK");
    expect(route.blockHrs).toBe("4.75");
  });

  it("sums canonical segment block into HHMM when pairing total missing", () => {
    const trip: CrewScheduleTrip = {
      id: "trip-canon",
      pairingCode: "J1010",
      month: 5,
      year: 2026,
      startDate: "2026-05-13",
      endDate: "2026-05-13",
      dutyDays: 1,
      status: "flying",
      routeSummary: "JFK-LAS-JFK",
      legs: [],
      canonicalPairingDays: {
        "2026-05-13": {
          pairingUuid: "u",
          pairingCode: "J1010",
          calendarDate: "2026-05-13",
          dutyDayIndex: 0,
          operatingDate: "2026-05-13",
          reportTimeDisplay: null,
          dEndTimeDisplay: null,
          segments: [
            {
              departureStation: "JFK",
              arrivalStation: "LAS",
              flightNumber: "100",
              isDeadhead: false,
              routeLabel: "JFK-LAS",
              departTimeLocal: null,
              arriveTimeLocal: null,
              blockTimeLocal: "0500",
              equipmentCode: null,
            },
            {
              departureStation: "LAS",
              arrivalStation: "JFK",
              flightNumber: "101",
              isDeadhead: false,
              routeLabel: "LAS-JFK",
              departTimeLocal: null,
              arriveTimeLocal: null,
              blockTimeLocal: "0450",
              equipmentCode: null,
            },
          ],
          displayCityLedger: "LAS",
          layoverStation: "LAS",
          layoverRestDisplay: null,
          baseReturnDay: true,
          continuationDay: false,
          sameDayTurn: false,
        },
      },
    };
    expect(deriveRouteBlockFromTrip(trip).blockHrs).toBe("0950");
  });

  it("decimalHoursToFlicaBlockHhmm formats totals", () => {
    expect(decimalHoursToFlicaBlockHhmm(4.75)).toBe("0445");
    expect(decimalHoursToFlicaBlockHhmm(19.5)).toBe("1930");
  });

  it("enriches activity from monthTrips by pairing and date", () => {
    const activity: TradeboardPostRequestActivity = {
      pairingId: "J1015",
      dateYmd: "",
      dateLabel: "7MAY",
      sourceType: "schedule",
      displayLabel: "J1015:7MAY",
    };
    const enriched = enrichTradeboardPostRequestActivity(activity, [sampleTrip()]);
    expect(enriched.depAirport).toBe("JFK");
    expect(enriched.arrAirport).toBe("JFK");
    expect(enriched.blockHrs).toBe("4.75");
    expect(enriched.dateYmd).toBe("20260507");
  });
});
