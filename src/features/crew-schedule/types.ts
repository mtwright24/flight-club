/**
 * Crew Schedule domain types — future-proof for import pipeline, tradeboard, chat, hotels, alerts.
 */

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
  departureAirport: string;
  arrivalAirport: string;
  reportLocal?: string;
  departLocal?: string;
  arriveLocal?: string;
  releaseLocal?: string;
  isDeadhead?: boolean;
  flightNumber?: string;
}

export interface CrewScheduleHotelStub {
  name?: string;
  city?: string;
  address?: string;
  shuttleNotes?: string;
  foodNearbyNote?: string;
  safetyNote?: string;
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
  routeSummary: string;
  /** e.g. JFK → SFO */
  origin?: string;
  destination?: string;
  layoverCity?: string;
  legs: CrewScheduleLeg[];
  hotel?: CrewScheduleHotelStub;
  postedToTradeboardId?: string | null;
  tripChatThreadId?: string | null;
  alertIds?: string[];
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
