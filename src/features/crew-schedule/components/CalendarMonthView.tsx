import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { dateToIsoDateLocal } from "../modernClassic/classicMonthGridCore";
import { scheduleProgressFromMetrics } from "../modernClassic/modernClassicHeaderMetrics";
import { SCHEDULE_MOCK_HEADER_RED } from "../scheduleMockPalette";
import { scheduleTheme as T } from "../scheduleTheme";
import {
  PAIRING_DETAIL_STAT_DIGIT_TRACKING,
  PAIRING_DETAIL_STAT_DIGIT_TYPE,
} from "../scheduleTileNumerals";
import type { CrewScheduleLeg, CrewScheduleTrip, ScheduleMonthMetrics } from "../types";
import type { FlicaCalendarListModel } from "../flicaCalendarDisplaySource";
import {
  type FlicaCalendarCell,
  sanitizeFlicaLedgerCityText,
} from "../flicaMiniCalendarTableLedger";
import { tripForFlicaCalendarCell } from "../flicaCalendarLedgerDayRows";
import { stashTripForDetailNavigation } from "../tripDetailNavCache";
import TripQuickPreviewSheet from "./TripQuickPreviewSheet";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const PAGE_BG = "#F3F5F8";
const FC_RED = SCHEDULE_MOCK_HEADER_RED;
const RAIL_RED = "#C41230";
const RAIL_GREEN = "#16A34A";
const RAIL_AMBER = "#D97706";
const BASE_DEFAULT = "JFK";
const MAX_NORMAL_PAIRING_DAYS = 10;

type CalendarRailType = "working" | "ptv" | "reserve" | "dh";
type CalendarPillType = "layover" | "ptv" | "reserve" | "turn" | "home";
type RailColor = "red" | "green" | "amber";

type CalendarPillEvent = {
  dateIso: string;
  label: string;
  order?: number;
  type: CalendarPillType;
};

type CalendarSelectedPreview = {
  dateIso: string;
  pairingCode: string;
  destinationCode: string;
  destinationName?: string;
  tripLabel: string;
  dayLabel: string;
  routeLine: {
    origin: string;
    destination: string;
    departText?: string;
    arriveText?: string;
    statusText?: string;
  };
  reportText?: string;
  reportBase?: string;
  homeText?: string;
  creditText?: string;
  blockText?: string;
};

type CalendarTripRail = {
  id: string;
  pairingCode: string;
  type: CalendarRailType;
  startIso: string;
  endIso: string;
  reportText?: string;
  reportBase?: string;
  destinationSummary?: string;
  selectedPreview?: CalendarSelectedPreview;
  railColor: RailColor;
  pillEvents: CalendarPillEvent[];
  trip?: CrewScheduleTrip;
  lane: number;
};

type RailSegment = {
  rail: CalendarTripRail;
  isStart: boolean;
  isEnd: boolean;
  pills: CalendarPillEvent[];
};

type CalendarCell = { day: number; inMonth: true } | null;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function iso10(raw: string | null | undefined): string | null {
  const iso = String(raw ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function addIsoDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function spanDays(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T12:00:00`);
  const b = new Date(`${endIso}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

function datesBetween(startIso: string, endIso: string): string[] {
  if (endIso < startIso) return [];
  const out: string[] = [];
  let cursor = startIso;
  while (cursor <= endIso) {
    out.push(cursor);
    cursor = addIsoDays(cursor, 1);
  }
  return out;
}

function monthBounds(year: number, month: number) {
  const start = isoDate(year, month, 1);
  const end = isoDate(year, month, new Date(year, month, 0).getDate());
  return { start, end };
}

function initialSelectedIso(year: number, month: number): string {
  const now = new Date();
  if (now.getFullYear() === year && now.getMonth() + 1 === month) {
    return dateToIsoDateLocal(now);
  }
  return isoDate(year, month, 1);
}

function normCode(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/^PAIRING\s+/i, "")
    .split("·")[0]
    ?.trim() ?? "";
}

function isCalendarCode(raw: string | null | undefined): boolean {
  const code = normCode(raw);
  return Boolean(code && code !== "-" && code !== "—" && code !== "OFF" && code !== "DAY OFF");
}

function railTypeFromCodeOrTrip(
  codeRaw: string | null | undefined,
  trip: CrewScheduleTrip | undefined,
): CalendarRailType {
  const code = normCode(codeRaw || trip?.pairingCode);
  if (code === "PTV" || trip?.status === "ptv" || trip?.status === "pto") return "ptv";
  if (code === "RSV" || trip?.status === "rsv") return "reserve";
  if (trip?.status === "deadhead") return "dh";
  return "working";
}

function railColorForType(type: CalendarRailType): RailColor {
  if (type === "ptv") return "green";
  if (type === "reserve") return "amber";
  return "red";
}

function railHex(color: RailColor): string {
  if (color === "green") return RAIL_GREEN;
  if (color === "amber") return RAIL_AMBER;
  return RAIL_RED;
}

function pillTypeForRail(type: CalendarRailType, label: string, base: string): CalendarPillType {
  if (type === "ptv") return "ptv";
  if (type === "reserve") return "reserve";
  return label === base ? "turn" : "layover";
}

function baseForTrip(trip: CrewScheduleTrip | undefined): string {
  return station(trip?.base) || BASE_DEFAULT;
}

function station(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim().toUpperCase();
  if (!v) return "";
  const m = v.match(/[A-Z]{3,4}/);
  return m ? m[0] : "";
}

function splitAirportLabels(raw: string | null | undefined): string[] {
  const clean = sanitizeFlicaLedgerCityText(raw ?? "")
    .replace(/[·•→,;/|]+/g, " ")
    .replace(/\s+-\s+/g, " ")
    .trim()
    .toUpperCase();
  if (!clean || clean === "-" || clean === "—") return [];
  const out: string[] = [];
  for (const token of clean.split(/\s+/)) {
    const label = station(token);
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

function shortTime(raw: string | null | undefined): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value || value === "—") return undefined;
  const digits = value.replace(/[^\d]/g, "");
  if (/^\d{4}$/.test(digits)) {
    const hour = Number(digits.slice(0, 2));
    const min = digits.slice(2);
    const suffix = hour >= 12 ? "P" : "A";
    const h12 = hour % 12 || 12;
    return `${h12}:${min}${suffix}`;
  }
  return value;
}

function decimalHours(raw: number | null | undefined): string | undefined {
  if (raw == null || Number.isNaN(raw) || raw <= 0) return undefined;
  return `${raw.toFixed(1)}h`;
}

function tripLegsSorted(trip: CrewScheduleTrip | undefined): CrewScheduleLeg[] {
  return [...(trip?.legs ?? [])].sort((a, b) => {
    const ad = iso10(a.dutyDate) ?? "";
    const bd = iso10(b.dutyDate) ?? "";
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a.departLocal ?? a.reportLocal ?? "").localeCompare(
      String(b.departLocal ?? b.reportLocal ?? ""),
    );
  });
}

function legsForDate(trip: CrewScheduleTrip | undefined, iso: string): CrewScheduleLeg[] {
  return tripLegsSorted(trip).filter((leg) => iso10(leg.dutyDate) === iso);
}

function firstLegForTrip(trip: CrewScheduleTrip | undefined): CrewScheduleLeg | undefined {
  return tripLegsSorted(trip)[0];
}

function lastLegForTrip(trip: CrewScheduleTrip | undefined): CrewScheduleLeg | undefined {
  const legs = tripLegsSorted(trip);
  return legs[legs.length - 1];
}

function findTripForDateCode(
  trips: CrewScheduleTrip[],
  dateIso: string,
  codeRaw: string | null | undefined,
  ledgerCell: FlicaCalendarCell | undefined,
): CrewScheduleTrip | undefined {
  const byLedger = ledgerCell ? tripForFlicaCalendarCell(trips, ledgerCell) : undefined;
  if (byLedger) return byLedger;
  const code = normCode(codeRaw);
  return trips
    .filter((trip) => {
      if (dateIso < trip.startDate || dateIso > trip.endDate) return false;
      if (!code) return true;
      return normCode(trip.pairingCode) === code;
    })
    .sort((a, b) => spanDays(a.startDate, a.endDate) - spanDays(b.startDate, b.endDate))[0];
}

function tripForDay(iso: string, trips: CrewScheduleTrip[]): CrewScheduleTrip | undefined {
  return trips
    .filter((trip) => trip.status !== "off" && iso >= trip.startDate && iso <= trip.endDate)
    .sort((a, b) => spanDays(a.startDate, a.endDate) - spanDays(b.startDate, b.endDate))[0];
}

function hasOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return !(aEnd < bStart || aStart > bEnd);
}

function buildCalendarCells(year: number, month: number): { cells: CalendarCell[]; rowCount: number } {
  const first = new Date(year, month - 1, 1);
  const startPad = first.getDay();
  const dim = new Date(year, month, 0).getDate();
  const cells: CalendarCell[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let day = 1; day <= dim; day++) cells.push({ day, inMonth: true });
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);
  return { cells, rowCount: Math.ceil(cells.length / 7) };
}

function buildPillsFromLedger(
  startIso: string,
  endIso: string,
  type: CalendarRailType,
  trip: CrewScheduleTrip | undefined,
  flicaCellByIso: Map<string, FlicaCalendarCell> | undefined,
): CalendarPillEvent[] {
  const base = baseForTrip(trip);
  if (type === "ptv" || type === "reserve") {
    return [
      {
        dateIso: startIso,
        label: type === "ptv" ? "PTV" : "RSV",
        order: 0,
        type: type === "ptv" ? "ptv" : "reserve",
      },
    ];
  }

  const allLabels = datesBetween(startIso, endIso).flatMap((iso) =>
    splitAirportLabels(flicaCellByIso?.get(iso)?.displayCity),
  );
  const hasNonBase = allLabels.some((label) => label !== base);
  const pills: CalendarPillEvent[] = [];
  let previousLabels: string[] = [];

  for (const dateIso of datesBetween(startIso, endIso)) {
    const rawLabels = splitAirportLabels(flicaCellByIso?.get(dateIso)?.displayCity);
    const labels = rawLabels.filter((label) => {
      if (dateIso === endIso && label === base) return false;
      if (label === base && hasNonBase) return false;
      return true;
    });
    const freshLabels = labels.filter((label) => !previousLabels.includes(label));
    freshLabels.forEach((label, order) => {
      pills.push({
        dateIso,
        label,
        order,
        type: pillTypeForRail(type, label, base),
      });
    });
    previousLabels = rawLabels;
  }

  if (!pills.length) {
    const fallback = station(trip?.layoverCity) || station(trip?.destination);
    if (fallback) {
      pills.push({
        dateIso: startIso,
        label: fallback,
        order: 0,
        type: pillTypeForRail(type, fallback, base),
      });
    }
  }
  return pills;
}

function buildPillsFromTrip(
  trip: CrewScheduleTrip,
  type: CalendarRailType,
): CalendarPillEvent[] {
  if (type === "ptv" || type === "reserve") {
    return [
      {
        dateIso: trip.startDate,
        label: type === "ptv" ? "PTV" : "RSV",
        order: 0,
        type: type === "ptv" ? "ptv" : "reserve",
      },
    ];
  }
  const base = baseForTrip(trip);
  const byDate = trip.layoverStationByDate ?? {};
  const allLabels = Object.values(byDate).flatMap(splitAirportLabels);
  const hasNonBase = allLabels.some((label) => label !== base);
  const pills: CalendarPillEvent[] = [];
  let previousLabels: string[] = [];
  for (const dateIso of datesBetween(trip.startDate, trip.endDate)) {
    const rawLabels = splitAirportLabels(byDate[dateIso]);
    const labels = rawLabels.filter((label) => {
      if (dateIso === trip.endDate && label === base) return false;
      if (label === base && hasNonBase) return false;
      return true;
    });
    labels
      .filter((label) => !previousLabels.includes(label))
      .forEach((label, order) => {
        pills.push({
          dateIso,
          label,
          order,
          type: pillTypeForRail(type, label, base),
        });
      });
    previousLabels = rawLabels;
  }
  if (!pills.length) {
    const fallback = station(trip.destination) || station(lastLegForTrip(trip)?.arrivalAirport);
    if (fallback) {
      pills.push({
        dateIso: trip.startDate,
        label: fallback,
        order: 0,
        type: pillTypeForRail(type, fallback, base),
      });
    }
  }
  return pills;
}

function makeRail(args: {
  id: string;
  pairingCode: string;
  type: CalendarRailType;
  startIso: string;
  endIso: string;
  trip?: CrewScheduleTrip;
  flicaCellByIso?: Map<string, FlicaCalendarCell>;
}): CalendarTripRail {
  const firstLeg = firstLegForTrip(args.trip);
  const reportText = shortTime(firstLeg?.reportLocal);
  const reportBase = station(firstLeg?.departureAirport) || baseForTrip(args.trip);
  const pillEvents = args.flicaCellByIso
    ? buildPillsFromLedger(args.startIso, args.endIso, args.type, args.trip, args.flicaCellByIso)
    : args.trip
      ? buildPillsFromTrip(args.trip, args.type)
      : [];

  return {
    id: args.id,
    pairingCode: args.pairingCode,
    type: args.type,
    startIso: args.startIso,
    endIso: args.endIso,
    reportText,
    reportBase,
    destinationSummary: pillEvents.find((pill) => pill.type === "layover")?.label,
    railColor: railColorForType(args.type),
    pillEvents,
    trip: args.trip,
    lane: 0,
  };
}

function buildRailsFromLedger(args: {
  year: number;
  month: number;
  trips: CrewScheduleTrip[];
  flicaCellByIso?: Map<string, FlicaCalendarCell>;
}): CalendarTripRail[] {
  const { year, month, trips, flicaCellByIso } = args;
  if (!flicaCellByIso?.size) return [];
  const { start: monthStart, end: monthEnd } = monthBounds(year, month);
  const dates = datesBetween(monthStart, monthEnd);
  const rails: CalendarTripRail[] = [];

  for (let i = 0; i < dates.length; i++) {
    const startIso = dates[i]!;
    const cell = flicaCellByIso.get(startIso);
    const code = normCode(cell?.displayCode);
    if (!isCalendarCode(code)) continue;

    const trip = findTripForDateCode(trips, startIso, code, cell);
    const type = railTypeFromCodeOrTrip(code, trip);
    let endIso = startIso;

    if (type === "ptv" || type === "reserve") {
      const tripEnd = iso10(trip?.endDate);
      if (tripEnd && tripEnd >= startIso) {
        endIso = tripEnd;
      } else {
        for (let j = i + 1; j < dates.length; j++) {
          const nextCode = normCode(flicaCellByIso.get(dates[j]!)?.displayCode);
          if (nextCode !== code) break;
          endIso = dates[j]!;
        }
      }
    } else {
      const base = baseForTrip(trip);
      let ledgerEnd = startIso;
      for (let j = i + 1; j < dates.length; j++) {
        const probeIso = dates[j]!;
        const probeCell = flicaCellByIso.get(probeIso);
        const probeCode = normCode(probeCell?.displayCode);
        if (isCalendarCode(probeCode)) break;
        ledgerEnd = probeIso;
        const labels = splitAirportLabels(probeCell?.displayCity);
        if (labels.includes(base)) break;
      }

      const tripStart = iso10(trip?.startDate);
      const tripEnd = iso10(trip?.endDate);
      const tripSpan =
        tripStart && tripEnd && tripEnd >= startIso ? spanDays(startIso, tripEnd) : 0;
      if (tripEnd && tripSpan > 0 && tripSpan <= MAX_NORMAL_PAIRING_DAYS) {
        endIso = tripEnd;
      } else if (ledgerEnd >= startIso) {
        endIso = ledgerEnd;
      }
    }

    rails.push(
      makeRail({
        id: `ledger:${code}:${startIso}:${endIso}`,
        pairingCode: code,
        type,
        startIso,
        endIso,
        trip,
        flicaCellByIso,
      }),
    );
  }

  return rails;
}

function addFallbackTripRails(args: {
  rails: CalendarTripRail[];
  trips: CrewScheduleTrip[];
  year: number;
  month: number;
}): CalendarTripRail[] {
  const { rails, trips, year, month } = args;
  const { start: monthStart, end: monthEnd } = monthBounds(year, month);
  const out = [...rails];
  for (const trip of trips) {
    if (trip.status === "off") continue;
    if (!hasOverlap(trip.startDate, trip.endDate, monthStart, monthEnd)) continue;
    const code = normCode(trip.pairingCode);
    if (!code || code === "OFF") continue;
    const duplicate = out.some(
      (rail) =>
        rail.pairingCode === code &&
        hasOverlap(rail.startIso, rail.endIso, trip.startDate, trip.endDate),
    );
    if (duplicate) continue;
    const type = railTypeFromCodeOrTrip(code, trip);
    out.push(
      makeRail({
        id: `trip:${trip.id}:${trip.startDate}:${trip.endDate}`,
        pairingCode: code,
        type,
        startIso: trip.startDate,
        endIso: trip.endDate,
        trip,
      }),
    );
  }
  return out;
}

function assignRailLanes(
  rails: CalendarTripRail[],
  year: number,
  month: number,
): CalendarTripRail[] {
  const { start: monthStart, end: monthEnd } = monthBounds(year, month);
  const occupied = new Map<string, Set<number>>();
  return [...rails]
    .sort((a, b) => {
      if (a.startIso !== b.startIso) return a.startIso.localeCompare(b.startIso);
      return a.endIso.localeCompare(b.endIso);
    })
    .map((rail) => {
      const visibleStart = rail.startIso > monthStart ? rail.startIso : monthStart;
      const visibleEnd = rail.endIso < monthEnd ? rail.endIso : monthEnd;
      let lane = 0;
      const visibleDates = datesBetween(visibleStart, visibleEnd);
      while (visibleDates.some((dateIso) => occupied.get(dateIso)?.has(lane))) {
        lane += 1;
      }
      visibleDates.forEach((dateIso) => {
        const set = occupied.get(dateIso) ?? new Set<number>();
        set.add(lane);
        occupied.set(dateIso, set);
      });
      return { ...rail, lane };
    });
}

function buildCalendarTripRails(args: {
  year: number;
  month: number;
  trips: CrewScheduleTrip[];
  flicaCellByIso?: Map<string, FlicaCalendarCell>;
  ledgerMode: boolean;
}): CalendarTripRail[] {
  const ledgerRails = args.ledgerMode
    ? buildRailsFromLedger(args)
    : [];
  return assignRailLanes(
    addFallbackTripRails({
      rails: ledgerRails,
      trips: args.trips,
      year: args.year,
      month: args.month,
    }),
    args.year,
    args.month,
  );
}

function segmentsByIso(rails: CalendarTripRail[], year: number, month: number) {
  const { start: monthStart, end: monthEnd } = monthBounds(year, month);
  const map = new Map<string, RailSegment[]>();
  for (const rail of rails) {
    const visibleStart = rail.startIso > monthStart ? rail.startIso : monthStart;
    const visibleEnd = rail.endIso < monthEnd ? rail.endIso : monthEnd;
    for (const dateIso of datesBetween(visibleStart, visibleEnd)) {
      const list = map.get(dateIso) ?? [];
      list.push({
        rail,
        isStart: dateIso === rail.startIso,
        isEnd: dateIso === rail.endIso,
        pills: rail.pillEvents.filter((pill) => pill.dateIso === dateIso),
      });
      map.set(dateIso, list);
    }
  }
  for (const [dateIso, list] of map.entries()) {
    map.set(dateIso, list.sort((a, b) => a.rail.lane - b.rail.lane));
  }
  return map;
}

function weekdayDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function destinationName(code: string): string | undefined {
  const names: Record<string, string> = {
    LHR: "London Heathrow",
    DUB: "Dublin",
    EDI: "Edinburgh",
    CDG: "Paris Charles de Gaulle",
    AMS: "Amsterdam",
    SFO: "San Francisco",
    FLL: "Fort Lauderdale",
    JFK: "New York JFK",
    BOS: "Boston",
    LAS: "Las Vegas",
    LAX: "Los Angeles",
    MCO: "Orlando",
  };
  return names[code];
}

function dayLabelForRail(rail: CalendarTripRail, selectedIso: string): string {
  const current = Math.max(1, spanDays(rail.startIso, selectedIso));
  const total = Math.max(1, spanDays(rail.startIso, rail.endIso));
  return `Day ${current} of ${total}`;
}

function blockDisplay(trip: CrewScheduleTrip | undefined, leg: CrewScheduleLeg | undefined): string | undefined {
  return leg?.blockTimeLocal?.trim() || decimalHours(trip?.pairingBlockHours);
}

function previewForRail(rail: CalendarTripRail, selectedIso: string): CalendarSelectedPreview {
  const trip = rail.trip;
  const first = firstLegForTrip(trip);
  const last = lastLegForTrip(trip);
  const selectedLeg = legsForDate(trip, selectedIso)[0] ?? first;
  const destination =
    rail.pillEvents.find((pill) => pill.type === "layover")?.label ||
    station(selectedLeg?.arrivalAirport) ||
    station(trip?.destination) ||
    rail.pairingCode;
  const origin = station(selectedLeg?.departureAirport) || station(first?.departureAirport) || baseForTrip(trip);
  const arrive = shortTime(selectedLeg?.arriveLocal);
  const depart = shortTime(selectedLeg?.departLocal ?? first?.departLocal);
  const report = rail.reportText ?? shortTime(first?.reportLocal);
  const release = shortTime(last?.releaseLocal);
  const homeDate = rail.endIso
    ? new Date(`${rail.endIso}T12:00:00`).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : undefined;

  return {
    dateIso: selectedIso,
    pairingCode: rail.pairingCode,
    destinationCode: destination,
    destinationName: destinationName(destination),
    tripLabel: `${spanDays(rail.startIso, rail.endIso)}-Day Pairing`,
    dayLabel: dayLabelForRail(rail, selectedIso),
    routeLine: {
      origin,
      destination,
      departText: depart,
      arriveText: arrive ? `${arrive}${depart && arrive < depart ? " +1" : ""}` : undefined,
      statusText: blockDisplay(trip, selectedLeg)
        ? `Non-stop · ${blockDisplay(trip, selectedLeg)}`
        : "Non-stop",
    },
    reportText: report,
    reportBase: rail.reportBase,
    homeText: homeDate && release ? `${homeDate} ${release}` : homeDate,
    creditText: decimalHours(trip?.pairingCreditHours ?? trip?.creditHours),
    blockText: decimalHours(trip?.pairingBlockHours),
  };
}

function previewForOffDay(selectedIso: string): CalendarSelectedPreview {
  return {
    dateIso: selectedIso,
    pairingCode: "DAY OFF",
    destinationCode: "OFF",
    tripLabel: "No Pairing",
    dayLabel: "Day Off",
    routeLine: {
      origin: "JFK",
      destination: "OFF",
      statusText: "No scheduled pairing",
    },
  };
}

function railForSelectedDate(
  selectedIso: string,
  segments: Map<string, RailSegment[]>,
): CalendarTripRail | undefined {
  return segments.get(selectedIso)?.[0]?.rail;
}

const TILE_DAY = Platform.select({
  android: { fontFamily: "sans-serif-thin", fontWeight: "normal" as const },
  ios: { fontWeight: "600" as const },
  web: { fontWeight: "600" as const },
  default: { fontWeight: "600" as const },
});

const androidNoFontPad =
  Platform.OS === "android" ? ({ includeFontPadding: false } as const) : {};

type Props = {
  year: number;
  month: number;
  monthLabel: string;
  canPrevMonth: boolean;
  canNextMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  monthMetrics: ScheduleMonthMetrics | null | undefined;
  trips: CrewScheduleTrip[];
  onPressDay: (isoDate: string) => void;
  onOpenTrip?: (trip: CrewScheduleTrip, cellIso?: string) => void;
  flicaCellByIso?: Map<string, FlicaCalendarCell>;
  flicaCalendarListModel: FlicaCalendarListModel;
};

export default function CalendarMonthView({
  year,
  month,
  monthLabel,
  canPrevMonth,
  canNextMonth,
  onPrevMonth,
  onNextMonth,
  monthMetrics,
  trips,
  onPressDay: _onPressDay,
  onOpenTrip,
  flicaCellByIso,
  flicaCalendarListModel,
}: Props) {
  const [selectedIso, setSelectedIso] = useState(() =>
    initialSelectedIso(year, month),
  );
  const [displayMode, setDisplayMode] = useState<"compact" | "detailed" | "route">("detailed");
  const [previewTrip, setPreviewTrip] = useState<CrewScheduleTrip | null>(null);
  const [previewDateIso, setPreviewDateIso] = useState<string | null>(null);

  useEffect(() => {
    setSelectedIso(initialSelectedIso(year, month));
  }, [year, month]);

  const { cells, rowCount } = useMemo(
    () => buildCalendarCells(year, month),
    [year, month],
  );
  const ledgerMode =
    flicaCalendarListModel.mode === "flica_mini_table" && (flicaCellByIso?.size ?? 0) > 0;
  const rails = useMemo(
    () =>
      buildCalendarTripRails({
        year,
        month,
        trips,
        flicaCellByIso,
        ledgerMode,
      }),
    [year, month, trips, flicaCellByIso, ledgerMode],
  );
  const segmentMap = useMemo(
    () => segmentsByIso(rails, year, month),
    [rails, year, month],
  );

  const selectedRail = railForSelectedDate(selectedIso, segmentMap);
  const selectedTrip =
    selectedRail?.trip ??
    (flicaCellByIso?.get(selectedIso)
      ? tripForFlicaCalendarCell(trips, flicaCellByIso.get(selectedIso)!)
      : null) ??
    tripForDay(selectedIso, trips);
  const selectedPreview = selectedRail
    ? previewForRail(selectedRail, selectedIso)
    : previewForOffDay(selectedIso);

  const prog = useMemo(
    () => scheduleProgressFromMetrics(monthMetrics ?? null),
    [monthMetrics],
  );
  const pctFill = Math.min(100, Math.round(prog.pct * 100));
  const progressRight = `${Math.round(prog.pct * 100)}% · ${Math.round(
    prog.workedH,
  )}/${Math.round(prog.targetH)}h`;

  const todayIso = dateToIsoDateLocal(new Date());
  const openSelectedTrip = useCallback(() => {
    if (selectedTrip && onOpenTrip) onOpenTrip(selectedTrip, selectedIso);
  }, [selectedTrip, selectedIso, onOpenTrip]);
  const tripForIso = useCallback(
    (iso: string): CrewScheduleTrip | null => {
      const railTrip = railForSelectedDate(iso, segmentMap)?.trip ?? null;
      const ledgerTrip = flicaCellByIso?.get(iso)
        ? tripForFlicaCalendarCell(trips, flicaCellByIso.get(iso)!)
        : null;
      return railTrip ?? ledgerTrip ?? tripForDay(iso, trips) ?? null;
    },
    [flicaCellByIso, segmentMap, trips],
  );
  const openDayDetail = useCallback(
    (iso: string) => {
      setSelectedIso(iso);
      const trip = tripForIso(iso);
      if (trip && onOpenTrip) onOpenTrip(trip, iso);
    },
    [onOpenTrip, tripForIso],
  );
  const openDaySummary = useCallback(
    (iso: string) => {
      const trip = tripForIso(iso);
      if (!trip) return;
      setSelectedIso(iso);
      stashTripForDetailNavigation(trip, trips, {
        visibleMonth: { year, month },
        rowDateIso: iso,
      });
      setPreviewTrip(trip);
      setPreviewDateIso(iso);
    },
    [month, tripForIso, trips, year],
  );
  const openRailDetail = useCallback(
    (rail: CalendarTripRail, iso: string) => {
      if (rail.trip && onOpenTrip) {
        setSelectedIso(iso);
        onOpenTrip(rail.trip, iso);
      }
    },
    [onOpenTrip],
  );
  const openRailSummary = useCallback(
    (rail: CalendarTripRail, iso: string) => {
      if (!rail.trip) return;
      setSelectedIso(iso);
      stashTripForDetailNavigation(rail.trip, trips, {
        visibleMonth: { year, month },
        rowDateIso: iso,
      });
      setPreviewTrip(rail.trip);
      setPreviewDateIso(iso);
    },
    [month, trips, year],
  );
  const closePreview = useCallback(() => {
    setPreviewTrip(null);
    setPreviewDateIso(null);
  }, []);
  const openFullFromPreview = useCallback(() => {
    const trip = previewTrip;
    const iso = previewDateIso ?? undefined;
    setPreviewTrip(null);
    setPreviewDateIso(null);
    if (trip && onOpenTrip) onOpenTrip(trip, iso);
  }, [onOpenTrip, previewDateIso, previewTrip]);

  return (
    <View style={styles.page}>
      <View style={styles.guaranteeCard}>
        <View style={styles.guaranteeTop}>
          <View style={styles.guaranteeTitleRow}>
            <Text style={styles.guaranteeTitle}>Guarantee</Text>
            <Ionicons name="checkmark-circle" size={15} color="#16A34A" />
          </View>
          <Text style={styles.guaranteeStat} numberOfLines={1}>
            {progressRight}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pctFill}%` }]} />
        </View>
      </View>

      <View style={styles.modeChips}>
        {(["compact", "detailed", "route"] as const).map((mode) => (
          <Pressable
            key={mode}
            onPress={() => setDisplayMode(mode)}
            style={[
              styles.modeChip,
              displayMode === mode && styles.modeChipActive,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${mode} calendar display mode`}
          >
            <Text
              style={[
                styles.modeChipText,
                displayMode === mode && styles.modeChipTextActive,
              ]}
            >
              {mode[0]!.toUpperCase() + mode.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.monthNav}>
        <Pressable
          onPress={onPrevMonth}
          disabled={!canPrevMonth}
          style={[styles.monthCircleNav, !canPrevMonth && styles.monthCircleNavOff]}
          accessibilityLabel="Previous month"
        >
          <Ionicons
            name="chevron-back"
            size={16}
            color={canPrevMonth ? T.text : T.line}
          />
        </Pressable>
        <Text style={styles.monthNavTitle} numberOfLines={1}>
          {monthLabel}
        </Text>
        <Pressable
          onPress={onNextMonth}
          disabled={!canNextMonth}
          style={[styles.monthCircleNav, !canNextMonth && styles.monthCircleNavOff]}
          accessibilityLabel="Next month"
        >
          <Ionicons
            name="chevron-forward"
            size={16}
            color={canNextMonth ? T.text : T.line}
          />
        </Pressable>
      </View>

      <View style={styles.gridCard}>
        <View style={styles.dowRow}>
          {WEEKDAYS.map((w) => (
            <Text key={w} style={styles.dowCell}>
              {w}
            </Text>
          ))}
        </View>
        {Array.from({ length: rowCount }).map((_, ri) => (
          <View key={ri} style={styles.weekRow}>
            {cells.slice(ri * 7, ri * 7 + 7).map((cell, ci) => {
              if (!cell?.inMonth) {
                return <View key={`pad-${ri}-${ci}`} style={styles.cellSlot} />;
              }
              const iso = isoDate(year, month, cell.day);
              const segments = segmentMap.get(iso) ?? [];
              const selected = iso === selectedIso;
              const hasPtv = segments.some((segment) => segment.rail.type === "ptv");
              const hasReserve = segments.some((segment) => segment.rail.type === "reserve");
              const hasWorkedPairing = segments.some(
                (segment) =>
                  segment.rail.type === "working" || segment.rail.type === "dh",
              );
              const isPastWorkedPairing = iso < todayIso && hasWorkedPairing;

              return (
                <Pressable
                  key={iso}
                  onPress={() => openDayDetail(iso)}
                  onLongPress={() => openDaySummary(iso)}
                  delayLongPress={420}
                  style={[
                    styles.cellSlot,
                    hasPtv && styles.cellPtvTint,
                    hasReserve && styles.cellReserveTint,
                    isPastWorkedPairing && styles.pastWorkedPairingCell,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open schedule for ${iso}`}
                  accessibilityHint="Opens pairing detail when this date is part of a pairing. Long press for pairing summary."
                >
                  <Text
                    style={[
                      styles.dayNum,
                      TILE_DAY,
                      PAIRING_DETAIL_STAT_DIGIT_TYPE,
                      PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                      selected && styles.dayNumSelected,
                    ]}
                    {...androidNoFontPad}
                  >
                    {cell.day}
                  </Text>
                  {selected ? <View style={styles.selectedDayRing} /> : null}
                  <View style={styles.railLayer} pointerEvents="box-none">
                    {segments.map((segment) => (
                      <CalendarRailSegmentView
                        key={`${segment.rail.id}-${iso}`}
                        segment={segment}
                        currentIso={iso}
                        onPressRail={openRailDetail}
                        onLongPressRail={openRailSummary}
                      />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <SelectedDayPreviewCard
        preview={selectedPreview}
        isToday={selectedIso === todayIso}
        canOpen={Boolean(selectedTrip && onOpenTrip)}
        onOpen={openSelectedTrip}
      />
      <TripQuickPreviewSheet
        visible={previewTrip != null}
        trip={previewTrip}
        pairingUuid={previewTrip?.schedulePairingId}
        onClose={closePreview}
        onOpenFullTrip={openFullFromPreview}
      />
    </View>
  );
}

function CalendarRailSegmentView({
  segment,
  currentIso,
  onPressRail,
  onLongPressRail,
}: {
  segment: RailSegment;
  currentIso: string;
  onPressRail: (rail: CalendarTripRail, iso: string) => void;
  onLongPressRail: (rail: CalendarTripRail, iso: string) => void;
}) {
  const color = railHex(segment.rail.railColor);
  const top = 30 + segment.rail.lane * 13;
  const isSingleDay = segment.isStart && segment.isEnd;
  const canOpen = Boolean(segment.rail.trip);
  return (
    <Pressable
      disabled={!canOpen}
      onPress={() => onPressRail(segment.rail, currentIso)}
      onLongPress={() => onLongPressRail(segment.rail, currentIso)}
      delayLongPress={420}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={({ pressed }) => [
        styles.segmentWrap,
        { top },
        pressed && canOpen && styles.segmentPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open pairing ${segment.rail.pairingCode}`}
      accessibilityHint="Opens pairing detail. Long press for pairing summary."
    >
      <View
        style={[
          styles.railLine,
          {
            borderColor: color,
            left: isSingleDay ? "42%" : segment.isStart ? "50%" : -1,
            right: isSingleDay ? "42%" : segment.isEnd ? "50%" : -1,
          },
        ]}
      />
      {(segment.isStart || segment.isEnd) ? (
        <View style={[styles.railCap, { backgroundColor: color }]} />
      ) : null}
      {segment.isStart && segment.rail.type === "working" ? (
        <>
          <Text style={[styles.pairingCode, { color }]} numberOfLines={1}>
            {segment.rail.pairingCode}
          </Text>
          {segment.rail.reportText ? (
            <Text style={styles.reportText} numberOfLines={1}>
              Rpt {segment.rail.reportText}
            </Text>
          ) : null}
        </>
      ) : null}
      {segment.pills.map((pill, idx) => (
        <View
          key={`${currentIso}-${pill.label}-${idx}`}
          style={[
            styles.pill,
            pill.type === "ptv" && styles.pillPtv,
            pill.type === "reserve" && styles.pillReserve,
            pill.type !== "ptv" && pill.type !== "reserve" && styles.pillWork,
            { top: -8 + idx * 15 },
          ]}
        >
          <Text
            style={[
              styles.pillText,
              pill.type === "ptv" && styles.pillTextPtv,
              pill.type === "reserve" && styles.pillTextReserve,
            ]}
            numberOfLines={1}
          >
            {pill.label}
          </Text>
        </View>
      ))}
    </Pressable>
  );
}

function SelectedDayPreviewCard({
  preview,
  isToday,
  canOpen,
  onOpen,
}: {
  preview: CalendarSelectedPreview;
  isToday: boolean;
  canOpen: boolean;
  onOpen: () => void;
}) {
  const isOff = preview.pairingCode === "DAY OFF";
  return (
    <View style={previewStyles.card}>
      <View style={previewStyles.accent} />
      <View style={previewStyles.handle} />
      <View style={previewStyles.content}>
        <View style={previewStyles.topRow}>
          <Text style={previewStyles.dateText}>
            {weekdayDate(preview.dateIso)}
            {isToday ? " · Today" : ""}
          </Text>
          <View style={previewStyles.codeCluster}>
            <Text style={previewStyles.pairingCode}>{preview.pairingCode}</Text>
            <View style={previewStyles.dayPill}>
              <Text style={previewStyles.dayPillText}>{preview.dayLabel}</Text>
            </View>
          </View>
        </View>

        <View style={previewStyles.heroRow}>
          <View style={previewStyles.aircraftCircle}>
            <Ionicons name={isOff ? "cafe-outline" : "airplane"} size={22} color="#FFFFFF" />
          </View>
          <View style={previewStyles.heroCopy}>
            <Text style={previewStyles.destination}>{preview.destinationCode}</Text>
            {preview.destinationName ? (
              <Text style={previewStyles.destinationName}>{preview.destinationName}</Text>
            ) : null}
            <Text style={previewStyles.tripKind}>
              {isOff ? "No scheduled pairing" : "International"}
            </Text>
          </View>
        </View>

        <View style={previewStyles.routeTile}>
          <View style={previewStyles.routeEndpoint}>
            <Text style={previewStyles.routeAirport}>{preview.routeLine.origin}</Text>
            <Text style={previewStyles.routeTime}>
              {preview.routeLine.departText ?? preview.reportText ?? "—"}
            </Text>
          </View>
          <View style={previewStyles.routeLineWrap}>
            <View style={previewStyles.routeDash} />
            <View style={previewStyles.routePlane}>
              <Ionicons name="airplane" size={14} color={FC_RED} />
            </View>
          </View>
          <View style={[previewStyles.routeEndpoint, previewStyles.routeEndpointRight]}>
            <Text style={previewStyles.routeAirport}>{preview.routeLine.destination}</Text>
            <Text style={previewStyles.routeTime}>
              {preview.routeLine.arriveText ?? "—"}
            </Text>
          </View>
          <Text style={previewStyles.routeStatus}>{preview.routeLine.statusText}</Text>
        </View>

        <View style={previewStyles.metaRow}>
          <PreviewMeta label="REPORT" value={preview.reportText && preview.reportBase ? `${preview.reportText} ${preview.reportBase}` : "—"} />
          <PreviewMeta label="HOME" value={preview.homeText ?? "—"} />
          <PreviewMeta label="CREDIT" value={preview.creditText ?? "—"} sub={preview.blockText ? `BLOCK ${preview.blockText}` : undefined} />
        </View>

        <View style={previewStyles.statusStrip}>
          <View>
            <Text style={previewStyles.statusLabel}>STATUS</Text>
            <Text style={previewStyles.statusTitle}>
              {isOff ? "Day Off" : "Currently Flying"}
            </Text>
            <Text style={previewStyles.statusSub}>
              {isOff ? "No active trip selected" : `En route to ${preview.destinationCode}`}
            </Text>
          </View>
          <Ionicons name="airplane-outline" size={32} color="rgba(196,18,48,0.18)" />
        </View>

        <Pressable
          disabled={!canOpen}
          onPress={onOpen}
          style={[previewStyles.cta, !canOpen && previewStyles.ctaDisabled]}
          accessibilityRole="button"
          accessibilityLabel="View pairing summary"
        >
          <Text style={previewStyles.ctaText}>
            {canOpen ? "View Pairing Summary" : "No Pairing To View"}
          </Text>
          {canOpen ? <Ionicons name="arrow-forward" size={18} color="#FFFFFF" /> : null}
        </Pressable>
      </View>
    </View>
  );
}

function PreviewMeta({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <View style={previewStyles.metaItem}>
      <Text style={previewStyles.metaLabel}>{label}</Text>
      <Text style={previewStyles.metaValue} numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text style={previewStyles.metaSub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: "100%",
    backgroundColor: PAGE_BG,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 24,
  },
  guaranteeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  guaranteeTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
  },
  guaranteeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  guaranteeTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: T.text,
  },
  guaranteeStat: {
    fontSize: 12,
    fontWeight: "800",
    color: "#16A34A",
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#16A34A",
    maxWidth: "100%",
  },
  modeChips: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
  },
  modeChipActive: {
    backgroundColor: FC_RED,
    borderColor: FC_RED,
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
  },
  modeChipTextActive: {
    color: "#FFFFFF",
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 12,
    paddingBottom: 8,
    gap: 14,
    marginBottom: 10,
  },
  monthCircleNav: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
  },
  monthCircleNavOff: { opacity: 0.45 },
  monthNavTitle: { fontSize: 14, fontWeight: "500", color: T.text },
  gridCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  dowRow: {
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  dowCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 9,
    color: "#64748B",
    paddingVertical: 8,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  weekRow: {
    flexDirection: "row",
  },
  cellSlot: {
    flex: 1,
    minWidth: 0,
    height: 70,
    backgroundColor: "#FFFFFF",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    position: "relative",
    overflow: "hidden",
  },
  cellPtvTint: {
    backgroundColor: "#F0FDF4",
  },
  cellReserveTint: {
    backgroundColor: "#FFFBEB",
  },
  pastWorkedPairingCell: {
    opacity: 0.72,
  },
  dayNum: {
    position: "absolute",
    top: 6,
    left: 7,
    zIndex: 6,
    fontSize: 13,
    color: "#334155",
  },
  dayNumSelected: {
    color: FC_RED,
    fontWeight: "900",
  },
  selectedDayRing: {
    position: "absolute",
    top: 2,
    left: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: FC_RED,
    zIndex: 5,
  },
  railLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  segmentWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentPressed: {
    opacity: 0.72,
  },
  railLine: {
    position: "absolute",
    top: 8,
    height: 0,
    borderTopWidth: 2,
    borderStyle: "dotted",
  },
  railCap: {
    position: "absolute",
    top: 4,
    left: "50%",
    marginLeft: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    zIndex: 4,
  },
  pairingCode: {
    position: "absolute",
    top: -18,
    left: 2,
    right: 2,
    textAlign: "center",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: -0.1,
    zIndex: 5,
  },
  reportText: {
    position: "absolute",
    top: 14,
    left: 1,
    right: 1,
    textAlign: "center",
    fontSize: 7,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: -0.2,
    zIndex: 5,
  },
  pill: {
    position: "absolute",
    alignSelf: "center",
    minWidth: 28,
    maxWidth: 46,
    paddingHorizontal: 5,
    height: 15,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillWork: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
  },
  pillPtv: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },
  pillReserve: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FCD34D",
  },
  pillText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#991B1B",
  },
  pillTextPtv: {
    color: "#166534",
  },
  pillTextReserve: {
    color: "#92400E",
  },
});

const previewStyles = StyleSheet.create({
  card: {
    marginTop: 14,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  accent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: FC_RED,
    zIndex: 2,
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#CBD5E1",
    marginTop: 9,
  },
  content: {
    paddingHorizontal: 17,
    paddingTop: 12,
    paddingBottom: 16,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  dateText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
  },
  codeCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  pairingCode: {
    fontSize: 13,
    fontWeight: "900",
    color: FC_RED,
  },
  dayPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#FEE2E2",
  },
  dayPillText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#991B1B",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginTop: 15,
  },
  aircraftCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: FC_RED,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: FC_RED,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  destination: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -1.4,
  },
  destinationName: {
    marginTop: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  tripKind: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "800",
    color: FC_RED,
  },
  routeTile: {
    marginTop: 15,
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 22,
    flexDirection: "row",
    alignItems: "center",
  },
  routeEndpoint: {
    width: 58,
  },
  routeEndpointRight: {
    alignItems: "flex-end",
  },
  routeAirport: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
  },
  routeTime: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
  },
  routeLineWrap: {
    flex: 1,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  routeDash: {
    position: "absolute",
    left: 4,
    right: 4,
    borderTopWidth: 1.5,
    borderColor: "#CBD5E1",
  },
  routePlane: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  routeStatus: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 7,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
  },
  metaRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 13,
  },
  metaItem: {
    flex: 1,
    minWidth: 0,
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: "#94A3B8",
    letterSpacing: 0.5,
  },
  metaValue: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "900",
    color: "#0F172A",
  },
  metaSub: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "800",
    color: "#64748B",
  },
  statusStrip: {
    marginTop: 14,
    borderRadius: 16,
    backgroundColor: "#FFF1F2",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FFE4E6",
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: "#BE123C",
    letterSpacing: 0.5,
  },
  statusTitle: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "900",
    color: "#881337",
  },
  statusSub: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#9F1239",
  },
  cta: {
    marginTop: 14,
    height: 48,
    borderRadius: 16,
    backgroundColor: FC_RED,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ctaDisabled: {
    backgroundColor: "#CBD5E1",
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
  },
});
