/**
 * TripSummary: derived pairing summary for quick preview / popups (normalized legs + duties only).
 */

import type { ScheduleDuty, SchedulePairingLegLite } from "./buildClassicRows";
import { departureTimeForDutyDaySortKey } from "./scheduleNormalizer";
import {
    extractLayoverRestFourDigits,
    parseScheduleTimeMinutes,
} from "./scheduleTime";
import type { TripSummary } from "./types";

export type TripSummaryPackExtra = {
  crew?: Array<{
    position?: string | null;
    crew_name?: string | null;
    role_label?: string | null;
  }>;
  hotels?: Array<{
    hotel_name?: string | null;
    layover_city?: string | null;
    duty_date?: string | null;
    nights?: number | null;
  }>;
};

function sliceIso10(raw: unknown): string | null {
  const s = String(raw ?? "")
    .trim()
    .slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function calendarSpanDays(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T12:00:00`);
  const b = new Date(`${endIso}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function formatTimeToken(t: string | null | undefined): string | undefined {
  if (t == null || !String(t).trim()) return undefined;
  const s = String(t).trim();
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2)}`;
  return s;
}

function legBlockHours(L: SchedulePairingLegLite): number {
  const n = L.block_time;
  if (n != null && Number.isFinite(Number(n))) return Number(n);
  const nj = L.normalized_json as Record<string, unknown> | undefined;
  const hhmm =
    nj && typeof nj.flica_block_hhmm === "string"
      ? String(nj.flica_block_hhmm).trim()
      : "";
  if (/^\d{4}$/.test(hhmm)) {
    const h = parseInt(hhmm.slice(0, 2), 10);
    const m = parseInt(hhmm.slice(2), 10);
    if (h <= 99 && m <= 59) return (h * 60 + m) / 60;
  }
  return 0;
}

function legCreditHours(L: SchedulePairingLegLite): number {
  const nj = L.normalized_json as Record<string, unknown> | undefined;
  if (!nj) return 0;
  const c = nj.credit_hours;
  if (typeof c === "number" && Number.isFinite(c)) return c;
  const cm = nj.credit_minutes;
  if (typeof cm === "number" && Number.isFinite(cm)) return cm / 60;
  return 0;
}

function restFourToDurationMinutes(four: string): number | null {
  if (!/^\d{4}$/.test(four)) return null;
  const h = parseInt(four.slice(0, 2), 10);
  const m = parseInt(four.slice(2), 10);
  if (h > 47 || m > 59) return null;
  return h * 60 + m;
}

function sumDutyLayoverMinutes(tripDuties: ScheduleDuty[]): number {
  let sum = 0;
  for (const d of tripDuties) {
    const four = extractLayoverRestFourDigits(d.layover_time ?? null);
    if (four) {
      const mm = restFourToDurationMinutes(four);
      if (mm != null) sum += mm;
    }
  }
  return sum;
}

function computeTafbMinutes(
  tripDuties: ScheduleDuty[],
  legsChrono: SchedulePairingLegLite[],
): number {
  const firstIso =
    tripDuties.length > 0
      ? sliceIso10(tripDuties[0]!.duty_date)
      : legsChrono.length
        ? sliceIso10(legsChrono[0]!.duty_date)
        : null;
  const lastIso =
    legsChrono.length > 0
      ? sliceIso10(legsChrono[legsChrono.length - 1]!.duty_date)
      : tripDuties.length
        ? sliceIso10(tripDuties[tripDuties.length - 1]!.duty_date)
        : null;
  if (!firstIso || !lastIso) return 0;
  const firstRep =
    tripDuties.length > 0
      ? parseScheduleTimeMinutes(tripDuties[0]!.report_time)
      : parseScheduleTimeMinutes(legsChrono[0]?.scheduled_departure_local);
  const lastEnd = (() => {
    const L = legsChrono[legsChrono.length - 1];
    if (!L)
      return parseScheduleTimeMinutes(
        tripDuties[tripDuties.length - 1]?.duty_off_time,
      );
    const pm = parseScheduleTimeMinutes(L.release_time_local);
    if (pm != null) return pm;
    return parseScheduleTimeMinutes(L.scheduled_arrival_local);
  })();
  if (firstRep == null || lastEnd == null) return 0;
  const d0 = new Date(`${firstIso}T12:00:00`);
  const d1 = new Date(`${lastIso}T12:00:00`);
  const dayDiff = Math.round((d1.getTime() - d0.getTime()) / 86400000);
  let span = dayDiff * 1440 + lastEnd - firstRep;
  if (span < 0) span += 1440;
  return Math.max(0, span);
}

function buildRouteDash(
  legs: SchedulePairingLegLite[],
  tripDuties: ScheduleDuty[],
  base?: string | null,
): string {
  const b = (base ?? "").trim().toUpperCase().slice(0, 4);
  const chain: string[] = [];
  const push = (code: string) => {
    const u = code.trim().toUpperCase().slice(0, 4);
    if (!u) return;
    if (chain.length === 0 || chain[chain.length - 1] !== u) chain.push(u);
  };
  if (legs.length) push(String(legs[0]!.departure_station ?? ""));
  const sortedDuties = [...tripDuties].sort((a, b) =>
    String(a.duty_date).localeCompare(String(b.duty_date)),
  );
  for (const d of sortedDuties) {
    const c = String(d.layover_city ?? "").trim();
    if (c) push(c);
  }
  const hadLayovers = sortedDuties.some((d) =>
    String(d.layover_city ?? "").trim(),
  );
  if (!hadLayovers && legs.length) {
    for (const L of legs) push(String(L.arrival_station ?? ""));
  }
  if (b) push(b);
  if (!chain.length) return b || "—";
  return chain.join("–");
}

function countLayoverNightsFromDuties(tripDuties: ScheduleDuty[]): number {
  const withStop = tripDuties.filter(
    (d) =>
      String(d.layover_city ?? "").trim().length > 0 ||
      String(d.hotel_name ?? "").trim().length > 0,
  );
  return new Set(withStop.map((d) => sliceIso10(d.duty_date)).filter(Boolean))
    .size;
}

function pickHotel(
  tripDuties: ScheduleDuty[],
  hotels: TripSummaryPackExtra["hotels"] | undefined,
): TripSummary["hotel"] | undefined {
  if (hotels?.length) {
    const sorted = [...hotels].sort(
      (a, b) => (Number(b.nights) || 0) - (Number(a.nights) || 0),
    );
    const h = sorted[0]!;
    const name = String(h.hotel_name ?? "").trim();
    const city = String(h.layover_city ?? "").trim();
    if (!name && !city) return undefined;
    const inferred = countLayoverNightsFromDuties(tripDuties);
    const nights = Math.max(1, h.nights ?? (inferred || 1));
    return { name: name || city || "Hotel", city: city || name || "—", nights };
  }
  const d = tripDuties.find(
    (x) =>
      String(x.hotel_name ?? "").trim() || String(x.layover_city ?? "").trim(),
  );
  if (!d) return undefined;
  const name = String(d.hotel_name ?? "").trim();
  const city = String(d.layover_city ?? "").trim();
  const nights = Math.max(1, countLayoverNightsFromDuties(tripDuties) || 1);
  return { name: name || city || "—", city: city || name || "—", nights };
}

export function buildTripSummaryFromNormalized(
  pairingCode: string,
  baseCode: string | null | undefined,
  startDate: string,
  endDate: string,
  tripDuties: ScheduleDuty[],
  tripLegsRaw: SchedulePairingLegLite[],
  extra?: TripSummaryPackExtra,
): TripSummary {
  const legs = [...tripLegsRaw].sort((a, b) => {
    const da = String(a.duty_date ?? "");
    const db = String(b.duty_date ?? "");
    if (da !== db) return da.localeCompare(db);
    const ta = departureTimeForDutyDaySortKey(
      a.scheduled_departure_local as string | null | undefined,
    );
    const tb = departureTimeForDutyDaySortKey(
      b.scheduled_departure_local as string | null | undefined,
    );
    const td = ta.localeCompare(tb);
    if (td !== 0) return td;
    return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
  });

  const dutyDateSet = new Set<string>();
  for (const d of tripDuties) {
    const iso = sliceIso10(d.duty_date);
    if (iso) dutyDateSet.add(iso);
  }
  for (const L of legs) {
    const iso = sliceIso10(L.duty_date);
    if (iso) dutyDateSet.add(iso);
  }

  const dutyDays =
    dutyDateSet.size > 0
      ? dutyDateSet.size
      : startDate &&
          endDate &&
          /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
          /^\d{4}-\d{2}-\d{2}$/.test(endDate)
        ? calendarSpanDays(startDate.slice(0, 10), endDate.slice(0, 10))
        : 0;

  const legsCount = legs.length;

  let blockTotal = 0;
  let creditTotal = 0;
  for (const L of legs) {
    blockTotal += legBlockHours(L);
    creditTotal += legCreditHours(L);
  }

  const layoverTotal = sumDutyLayoverMinutes(tripDuties);
  const tafbTotal = computeTafbMinutes(tripDuties, legs);
  const route = buildRouteDash(legs, tripDuties, baseCode);

  let dateOrder = [...dutyDateSet].sort((a, b) => a.localeCompare(b));
  if (!dateOrder.length && legs.length) {
    dateOrder = [
      ...new Set(
        legs
          .map((l) => sliceIso10(l.duty_date))
          .filter((x): x is string => Boolean(x)),
      ),
    ].sort();
  }

  const dutyByDate = new Map<string, ScheduleDuty>();
  for (const d of tripDuties) {
    const iso = sliceIso10(d.duty_date);
    if (iso) dutyByDate.set(iso, d);
  }

  const summaryLegs: TripSummary["legs"] = [];
  let dayIndex = 0;
  for (const dateIso of dateOrder) {
    dayIndex += 1;
    const dayLegs = legs.filter((L) => sliceIso10(L.duty_date) === dateIso);
    if (!dayLegs.length) continue;
    const first = dayLegs[0]!;
    const last = dayLegs[dayLegs.length - 1]!;
    const dep = String(first.departure_station ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 4);
    const arr = String(last.arrival_station ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 4);
    const duty = dutyByDate.get(dateIso);
    let dayBlock = 0;
    for (const L of dayLegs) dayBlock += legBlockHours(L);
    const report = formatTimeToken(
      duty?.report_time ?? first.scheduled_departure_local,
    );
    const departStr = formatTimeToken(first.scheduled_departure_local) ?? "—";
    const arrStr = formatTimeToken(last.scheduled_arrival_local) ?? "—";
    const dutyEnd = formatTimeToken(
      last.release_time_local ?? last.scheduled_arrival_local,
    );
    let layoverMin: number | undefined;
    const four = extractLayoverRestFourDigits(duty?.layover_time ?? null);
    if (four) {
      const mm = restFourToDurationMinutes(four);
      if (mm != null) layoverMin = mm;
    }
    summaryLegs.push({
      dayIndex,
      route: `${dep}→${arr}`,
      date: dateIso,
      report,
      dep: departStr,
      arr: arrStr,
      block: dayBlock,
      layover: layoverMin,
      dutyEnd,
    });
  }

  const crew = (extra?.crew ?? []).slice(0, 4).map((c) => ({
    position: String(c.position ?? "").trim() || "—",
    name: String(c.crew_name ?? "").trim() || "—",
    role: c.role_label?.trim() || undefined,
  }));

  const hotel = pickHotel(tripDuties, extra?.hotels);

  return {
    pairingCode,
    route,
    startDate,
    endDate,
    dutyDays,
    legsCount,
    blockTotal,
    creditTotal,
    tafbTotal,
    layoverTotal,
    legs: summaryLegs,
    crew,
    hotel,
  };
}
