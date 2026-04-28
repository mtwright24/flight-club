/**
 * Crew Schedule domain types — future-proof for import pipeline, tradeboard, chat, hotels, alerts.
 */

import type { PairingDay } from './pairingDayModel';

export type ScheduleDutyStatus =
  | 'flying'
  | 'deadhead'
  | 'off'
  | 'rsv'
  | 'pto'
  | 'continuation'
  | 'training'
  | 'other';

export interface CrewScheduleLeg {
  id: string;
  /** schedule_entries.id for Flight Tracker sync */
  scheduleEntryId?: string;
  /** Calendar day this leg operates (matches schedule_entries.date). */
  dutyDate?: string;
  departureAirport: string;
  arrivalAirport: string;
  reportLocal?: string;
  departLocal?: string;
  arriveLocal?: string;
  releaseLocal?: string;
  isDeadhead?: boolean;
  flightNumber?: string;
  /** Block as stored for the leg (e.g. "06:32" or FLICA 4-digit). */
  blockTimeLocal?: string;
  /** Aircraft / equipment (e.g. 32N, 3NS) from the pairing leg row. */
  equipmentCode?: string;
}

export interface CrewScheduleHotelStub {
  name?: string;
  city?: string;
  address?: string;
  shuttleNotes?: string;
  foodNearbyNote?: string;
  safetyNote?: string;
}

/** Crew line from pairing detail (FLICA-style position + name). */
export interface ScheduleCrewMember {
  position: string;
  name: string;
}

export interface CrewScheduleTrip {
  id: string;
  pairingCode: string;
  base?: string;
  month: number;
  year: number;
  /** First calendar day of this trip block */
  startDate: string; // ISO date
  endDate: string;
  dutyDays: number;
  creditHours?: number;
  status: ScheduleDutyStatus;
  /** Aviation-style compact trip line (layover pattern + return base), not a full leg chain. */
  routeSummary: string;
  /** First departure airport on the trip (not necessarily crew base). */
  origin?: string;
  destination?: string;
  layoverCity?: string;
  legs: CrewScheduleLeg[];
  hotel?: CrewScheduleHotelStub;
  /** From schedule_trip_metadata — pairing totals (hours) for detail + trade post prefill (whole trip or per-leg later). */
  pairingBlockHours?: number;
  pairingCreditHours?: number;
  pairingTafbHours?: number;
  /** Sum of layover time for this pairing (minutes), when sourced from schedule. */
  tripLayoverTotalMinutes?: number;
  /**
   * Per calendar day: `schedule_entries.layover` from import (FLICA-style e.g. city + HHMM after each leg).
   */
  layoverByDate?: Record<string, string>;
  /**
   * Crewline “CITY” = overnight layover station (from pairing leg `layover_city` / fcv import notes), not
   * always the last sector arrival on that duty day.
   */
  layoverStationByDate?: Record<string, string>;
  /**
   * Canonical duty days from `schedule_pairings` + `schedule_pairing_legs` (FLICA); when set, classic
   * ledger prefers this over `schedule_entries`-derived legs and display heuristics.
   */
  canonicalPairingDays?: Record<string, PairingDay>;
  /**
   * Monthly ledger: cross-month hints from adjacent `schedule_entries` fetches (display-only; no import change).
   */
  ledgerContext?: {
    carryInFromPriorMonth: boolean;
    carryOutToNextMonth: boolean;
  };
  crewMembers?: ScheduleCrewMember[];
  postedToTradeboardId?: string | null;
  tripChatThreadId?: string | null;
  alertIds?: string[];
}

/** Month header strip — values from import/DB only; not computed from trip rows in the app. */
export interface ScheduleMonthMetrics {
  monthKey: string;
  monthlyTafbHours: number | null;
  blockHours: number | null;
  creditHours: number | null;
  ytdCreditHours: number | null;
  daysOff: number | null;
  layoverTotalMinutes: number | null;
  updatedAt?: string | null;
}

export interface CrewScheduleMonthState {
  year: number;
  month: number; // 1–12
  trips: CrewScheduleTrip[];
  lastUpdatedAt: string; // ISO
  employeeId?: string;
}

export type ScheduleViewMode = 'classic' | 'calendar' | 'smart';

export const DEFAULT_SCHEDULE_VIEW: ScheduleViewMode = 'classic';
