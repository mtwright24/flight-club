/**
 * Enrich TradeBoard Post Request activities with dep/arr/block from schedule trips
 * (monthTrips / pairing legs) — never inferred from pairing ID alone.
 */

import type { PairingDaySegment } from "./pairingDayModel";
import type { CrewScheduleLeg, CrewScheduleTrip } from "./types";
import type { TradeboardPostRequestActivity } from "../flica-actions/flicaTradeBoardPostRequestTypes";

const IATA_RE = /^[A-Z]{3}$/;

function routeOrderedIatasFromRouteString(route: string | null | undefined): string[] {
  const raw = String(route ?? "").trim();
  if (!raw) return [];
  const parts = raw.split(/[–—\-/→]+/).flatMap((seg) => seg.trim().split(/\s+/).filter(Boolean));
  const out: string[] = [];
  for (const tok of parts) {
    const u = tok.trim().toUpperCase();
    if (IATA_RE.test(u)) out.push(u);
  }
  return out;
}

function tripEnrichmentScore(t: CrewScheduleTrip): number {
  let s = 0;
  s += (t.legs?.length ?? 0) * 10;
  if (t.pairingBlockHours != null && t.pairingBlockHours > 0) s += 40;
  const blockMin = totalBlockMinutesFromTrip(t);
  if (blockMin != null && blockMin > 0) s += 50;
  if (t.origin?.trim()) s += 5;
  if (t.destination?.trim()) s += 5;
  if (String(t.routeSummary ?? "").trim()) s += 10;
  return s;
}

function normPairingCode(code: string): string {
  return String(code ?? "").trim().toUpperCase();
}

function normIata(raw: string | null | undefined): string {
  const u = String(raw ?? "").trim().toUpperCase();
  return IATA_RE.test(u) ? u : "";
}

function iso10(s: string | null | undefined): string {
  return String(s ?? "").slice(0, 10);
}

function activityStartIso(activity: TradeboardPostRequestActivity): string | null {
  const ymd = String(activity.dateYmd ?? "").trim();
  if (/^\d{8}$/.test(ymd)) {
    return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  }
  const label = String(activity.dateLabel ?? "").trim().toUpperCase();
  const m = label.match(/^(\d{1,2})([A-Z]{3})$/);
  if (!m) return null;
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const mon = months.indexOf(m[2]!);
  if (mon < 0) return null;
  const day = parseInt(m[1]!, 10);
  const now = new Date();
  for (const year of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
    const d = new Date(year, mon, day, 12, 0, 0, 0);
    if (d.getMonth() === mon && d.getDate() === day) {
      const mo = String(mon + 1).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${year}-${mo}-${dd}`;
    }
  }
  return null;
}

function tripLegsChronological(trip: CrewScheduleTrip): CrewScheduleLeg[] {
  return [...(trip.legs ?? [])].sort((a, b) => {
    const ad = iso10(a.dutyDate) ?? "";
    const bd = iso10(b.dutyDate) ?? "";
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a.departLocal ?? a.reportLocal ?? "").localeCompare(
      String(b.departLocal ?? b.reportLocal ?? ""),
    );
  });
}

function operatingLegs(legs: CrewScheduleLeg[]): CrewScheduleLeg[] {
  const ops = legs.filter((l) => !l.isDeadhead);
  return ops.length > 0 ? ops : legs;
}

function blockMinutesFromDisplayToken(blockTimeLocal?: string | null): number {
  if (!blockTimeLocal) return 0;
  const s = String(blockTimeLocal).trim();
  if (!s) return 0;
  if (/^\d{4}$/.test(s)) {
    const h = parseInt(s.slice(0, 2), 10);
    const m = parseInt(s.slice(2), 10);
    if (h > 99 || m > 59) return 0;
    return h * 60 + m;
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1]!, 10);
    const m = parseInt(m24[2]!, 10);
    if (h > 99 || m > 59) return 0;
    return h * 60 + m;
  }
  const dec = Number(s);
  if (Number.isFinite(dec) && dec > 0 && dec < 100) {
    return Math.round(dec * 60);
  }
  return 0;
}

function blockMinutesFromLeg(leg: CrewScheduleLeg): number {
  return blockMinutesFromDisplayToken(leg.blockTimeLocal);
}

function blockMinutesFromSegment(seg: PairingDaySegment): number {
  return blockMinutesFromDisplayToken(seg.blockTimeLocal);
}

/** FLICA post-request hidden block fields use 4-digit HHMM total when built from leg sums. */
export function minutesToFlicaBlockHhmm(totalMinutes: number | null | undefined): string {
  if (totalMinutes == null || !Number.isFinite(totalMinutes) || totalMinutes <= 0) return "";
  const rounded = Math.round(totalMinutes);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h > 99) return "";
  return `${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}`;
}

/** @deprecated use minutesToFlicaBlockHhmm */
export function decimalHoursToFlicaBlockHhmm(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return "";
  return minutesToFlicaBlockHhmm(hours * 60);
}

function formatDecimalBlockHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  if (Number.isInteger(rounded)) return rounded.toFixed(1);
  const one = rounded.toFixed(1);
  if (Math.abs(rounded - Number(one)) < 0.001) return one;
  return rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function blockMinutesFromCanonicalDays(trip: CrewScheduleTrip): number {
  let sum = 0;
  let any = false;
  for (const day of Object.values(trip.canonicalPairingDays ?? {})) {
    for (const seg of day.segments ?? []) {
      const m = blockMinutesFromSegment(seg);
      if (m > 0) {
        sum += m;
        any = true;
      }
    }
  }
  return any ? sum : 0;
}

function blockMinutesFromSummaryLegs(trip: CrewScheduleTrip): number {
  let sum = 0;
  let any = false;
  for (const leg of trip.summary?.legs ?? []) {
    if (leg.block != null && Number.isFinite(leg.block) && leg.block > 0) {
      sum += Math.round(leg.block * 60);
      any = true;
    }
  }
  return any ? sum : 0;
}

export function totalBlockMinutesFromTrip(trip: CrewScheduleTrip): number | null {
  let legSum = 0;
  let legAny = false;
  for (const leg of operatingLegs(tripLegsChronological(trip))) {
    const m = blockMinutesFromLeg(leg);
    if (m > 0) {
      legSum += m;
      legAny = true;
    }
  }
  if (legAny && legSum > 0) return legSum;

  const canon = blockMinutesFromCanonicalDays(trip);
  if (canon > 0) return canon;

  const summaryLegs = blockMinutesFromSummaryLegs(trip);
  if (summaryLegs > 0) return summaryLegs;

  if (trip.summary?.blockTotal != null && trip.summary.blockTotal > 0) {
    return Math.round(trip.summary.blockTotal * 60);
  }

  if (trip.pairingBlockHours != null && trip.pairingBlockHours > 0) {
    return Math.round(trip.pairingBlockHours * 60);
  }

  return null;
}

/** Block string for TradeBoard post-request `hdnBlkHrs` (decimal when pairing total known, else HHMM). */
export function blockHrsForFlicaPostRequest(trip: CrewScheduleTrip): string {
  if (trip.pairingBlockHours != null && trip.pairingBlockHours > 0) {
    return formatDecimalBlockHours(trip.pairingBlockHours);
  }
  const minutes = totalBlockMinutesFromTrip(trip);
  if (minutes == null || minutes <= 0) return "";
  return minutesToFlicaBlockHhmm(minutes);
}

function firstOperatingDeparture(trip: CrewScheduleTrip): string {
  const legs = operatingLegs(tripLegsChronological(trip));
  for (const leg of legs) {
    const d = normIata(leg.departureAirport);
    if (d) return d;
  }
  const origin = normIata(trip.origin);
  if (origin) return origin;
  const routeIatas = routeOrderedIatasFromRouteString(trip.routeSummary);
  return routeIatas[0] ?? "";
}

function finalOperatingArrival(trip: CrewScheduleTrip): string {
  const legs = operatingLegs(tripLegsChronological(trip));
  for (let i = legs.length - 1; i >= 0; i--) {
    const a = normIata(legs[i]!.arrivalAirport);
    if (a) return a;
  }
  const dest = normIata(trip.destination);
  if (dest) return dest;
  const routeIatas = routeOrderedIatasFromRouteString(trip.routeSummary);
  return routeIatas.length > 0 ? (routeIatas[routeIatas.length - 1] ?? "") : "";
}

function layoverSummaryFromTrip(trip: CrewScheduleTrip): string {
  const cities = new Set<string>();
  for (const city of Object.values(trip.layoverStationByDate ?? {})) {
    const c = normIata(city);
    if (c) cities.add(c);
  }
  const lay = normIata(trip.layoverCity);
  if (lay) cities.add(lay);
  for (const leg of trip.legs ?? []) {
    const c = normIata(leg.layoverCityLeg);
    if (c) cities.add(c);
  }
  if (cities.size > 0) return [...cities].join("/");
  const routeIatas = routeOrderedIatasFromRouteString(trip.routeSummary);
  if (routeIatas.length > 2) {
    return routeIatas.slice(1, -1).join("/");
  }
  return "";
}

export type ActivityRouteEnrichment = {
  depAirport: string;
  arrAirport: string;
  blockHrs: string;
  layovers: string;
  tripId?: string;
};

export function deriveRouteBlockFromTrip(trip: CrewScheduleTrip): ActivityRouteEnrichment {
  const depAirport = firstOperatingDeparture(trip);
  const arrAirport = finalOperatingArrival(trip);
  const blockHrs = blockHrsForFlicaPostRequest(trip);
  const layovers = layoverSummaryFromTrip(trip);
  return {
    depAirport,
    arrAirport,
    blockHrs,
    layovers,
    tripId: trip.id,
  };
}

function pickBestTrip(candidates: CrewScheduleTrip[]): CrewScheduleTrip | null {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => tripEnrichmentScore(b) - tripEnrichmentScore(a))[0]!;
}

export function findScheduleTripForActivity(
  monthTrips: CrewScheduleTrip[],
  activity: TradeboardPostRequestActivity,
): CrewScheduleTrip | null {
  const code = normPairingCode(activity.pairingId);
  if (!code) return null;
  const candidates = monthTrips.filter((t) => normPairingCode(t.pairingCode) === code);
  if (!candidates.length) return null;

  const startIso = activityStartIso(activity);
  if (startIso) {
    const inSpan = candidates.filter((t) => {
      const s = iso10(t.startDate);
      const e = iso10(t.endDate);
      return s && e && startIso >= s && startIso <= e;
    });
    if (inSpan.length) return pickBestTrip(inSpan);
  }

  return pickBestTrip(candidates);
}

export function enrichTradeboardPostRequestActivity(
  activity: TradeboardPostRequestActivity,
  monthTrips: CrewScheduleTrip[],
): TradeboardPostRequestActivity {
  const trip = findScheduleTripForActivity(monthTrips, activity);
  if (!trip) return activity;

  const derived = deriveRouteBlockFromTrip(trip);
  return {
    ...activity,
    depAirport: activity.depAirport?.trim() || derived.depAirport,
    arrAirport: activity.arrAirport?.trim() || derived.arrAirport,
    blockHrs: activity.blockHrs?.trim() || derived.blockHrs,
    layovers: activity.layovers?.trim() || derived.layovers,
    tripId: activity.tripId ?? derived.tripId,
    dateYmd:
      activity.dateYmd?.trim() ||
      String(trip.startDate ?? "").replace(/-/g, "").slice(0, 8),
  };
}

export function enrichComposerActivities(
  activities: TradeboardPostRequestActivity[],
  monthTrips: CrewScheduleTrip[],
): TradeboardPostRequestActivity[] {
  if (!monthTrips.length || !activities.length) return activities;
  return activities.map((a) => enrichTradeboardPostRequestActivity(a, monthTrips));
}
