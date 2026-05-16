/**
 * One-off trip snapshot from FLICA pairing-detail HTML — for Crew Hub → native Trip Detail (no DB row).
 */
import type { FlicaPairing } from "../../services/flicaScheduleHtmlParser";
import { resolveFlicaLegCalendarIso } from "./flicaDutyDateResolve";
import type { CrewScheduleLeg, CrewScheduleTrip, ScheduleCrewMember } from "./types";

function flicaRouteToAirports(route: string): { dep: string; arr: string } {
  const raw = (route ?? "").trim();
  if (!raw) return { dep: "", arr: "" };
  const n = raw.replace(/[–—−]/g, "-").replace(/\s+/g, "");
  const pair = n.match(/^([A-Z]{3,4})-([A-Z]{3,4})$/i);
  if (pair) {
    return { dep: pair[1]!.toUpperCase(), arr: pair[2]!.toUpperCase() };
  }
  const parts = n
    .split("-")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return {
      dep: (parts[0] ?? "").toUpperCase(),
      arr: (parts[parts.length - 1] ?? "").toUpperCase(),
    };
  }
  return { dep: "", arr: "" };
}

function minutesToDisplayHours(m: number | null | undefined): number | undefined {
  if (m == null || !Number.isFinite(m) || m <= 0) return undefined;
  return Math.round((m / 60) * 100) / 100;
}

/** Build a detail-ready {@link CrewScheduleTrip} from parser output (session fetch path). */
export function crewHubFlicaPairingToCrewScheduleTrip(
  pairing: FlicaPairing,
  tripId: string,
): CrewScheduleTrip {
  const start = pairing.startDate.slice(0, 10);
  const end = (pairing.endDate ?? pairing.startDate).slice(0, 10);
  const y = parseInt(start.slice(0, 4), 10);
  const mo = parseInt(start.slice(5, 7), 10);
  const monthKey = start.length >= 7 ? start.slice(0, 7) : "2026-01";

  let prevAnchor: string | null = null;
  const legs: CrewScheduleLeg[] = [];
  const pairingLegs = pairing.legs ?? [];
  for (let i = 0; i < pairingLegs.length; i++) {
    const leg = pairingLegs[i]!;
    const dutyIso = resolveFlicaLegCalendarIso(pairing, leg, monthKey, "row", prevAnchor);
    prevAnchor = dutyIso;
    const { dep, arr } = flicaRouteToAirports(leg.route);
    legs.push({
      id: `${tripId}-leg-${i}`,
      dutyDate: dutyIso,
      dutyDayCalendarDom: leg.date > 0 ? leg.date : undefined,
      departureAirport: dep,
      arrivalAirport: arr,
      departLocal: leg.departLocal,
      arriveLocal: leg.arriveLocal,
      flightNumber: leg.flightNumber,
      blockTimeLocal: leg.blockTime,
      isDeadhead: leg.isDeadhead,
      equipmentCode: leg.equipment,
      layoverCityLeg: leg.layoverCity?.trim() || undefined,
      layoverRestDisplay: leg.layoverTime?.trim() || undefined,
    });
  }

  const blockH = minutesToDisplayHours(pairing.totalBlockMinutes);
  const creditH = minutesToDisplayHours(pairing.totalCreditMinutes);
  const tafbH = minutesToDisplayHours(
    pairing.totalTafbMinutes ?? pairing.pairingTafbSumMinutes,
  );

  const crewMembers: ScheduleCrewMember[] = (pairing.crewMembers ?? []).map((c) => ({
    position: c.position,
    name: c.name,
    employeeId: c.employeeId || undefined,
    roleLabel: c.roleLabel,
  }));

  const firstHotel = pairing.hotels?.[0];
  const hotel =
    firstHotel?.hotelName || firstHotel?.layoverCity
      ? {
          name: firstHotel.hotelName?.trim() || undefined,
          city: firstHotel.layoverCity?.trim() || undefined,
          phone: firstHotel.hotelPhone?.trim() || undefined,
        }
      : undefined;

  const dutyDates = new Set(legs.map((l) => l.dutyDate).filter(Boolean) as string[]);

  return {
    id: tripId,
    pairingCode: pairing.id.trim().toUpperCase(),
    base: pairing.base?.trim() || undefined,
    month: mo,
    year: y,
    startDate: start,
    endDate: end,
    dutyDays: dutyDates.size || 1,
    creditHours: creditH,
    status: "flying",
    routeSummary: pairing.routeSummary ?? "",
    origin: legs[0]?.departureAirport,
    destination: legs[legs.length - 1]?.arrivalAirport,
    legs,
    hotel,
    pairingBlockHours: blockH,
    pairingCreditHours: creditH,
    pairingTafbHours: tafbH,
    tripLayoverTotalMinutes: pairing.layoverTotalMinutes ?? undefined,
    crewMembers: crewMembers.length ? crewMembers : undefined,
  };
}
