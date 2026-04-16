/**
 * JetBlue FLICA monthly screenshot — internal understanding layer (source of truth for app code).
 *
 * The parser’s job is to interpret JetBlue FLICA line-view screenshots into structured schedule
 * facts—not to blindly dump OCR. Contract pay/rig rules live in the CBA / contract-rules layer;
 * this module defines field semantics, obsolete codes, equipment (OAEQP), and the target object
 * hierarchy for import, UI, and downstream features.
 *
 * Carry-over trips may cross months (e.g. Mar 30–Apr 1); FLICA rows show DD only. The parser rolls
 * month when DD would go backward in time so legs keep correct ISO dates (see duty-date sequence).
 *
 * @see airline-docs/contracts/jetblue-inflight-cba.pdf (contract reference; rules engine consumes separately)
 */

/** Stored on imports when source is a JetBlue FLICA monthly screenshot. */
export const JETBLUE_FLICA_MONTHLY_SOURCE_TYPE = 'jetblue_flica_monthly_screenshot' as const;

/**
 * FLICA labels that are obsolete for JetBlue operational / schedule logic.
 * They may appear in raw OCR; do not branch import, legality, or pay features on these.
 */
export const JETBLUE_FLICA_OBSOLETE_FIELD_CODES = ['TACLAG', 'GRNT', 'DHC'] as const;

export type JetBlueObsoleteFieldCode = (typeof JETBLUE_FLICA_OBSOLETE_FIELD_CODES)[number];

/** Equipment / aircraft-type column on FLICA (e.g. 32S, 3NL). Preserve as metadata; aliases in OCR. */
export const JETBLUE_FLICA_EQUIPMENT_FIELD_CODES = ['OAEQP', 'OEQP'] as const;

export type JetBlueEquipmentFieldCode = (typeof JETBLUE_FLICA_EQUIPMENT_FIELD_CODES)[number];

/** Documented minimum for credit-day context; full rig/credit from CBA layer later. */
export const JETBLUE_MINIMUM_CREDIT_HOURS_PER_DAY = 5;

export function isObsoleteJetBlueFlicaFieldCode(field: string | null | undefined): boolean {
  if (!field) return false;
  const u = field.trim().toUpperCase();
  return (JETBLUE_FLICA_OBSOLETE_FIELD_CODES as readonly string[]).includes(u);
}

export function isJetBlueEquipmentFieldCode(field: string | null | undefined): boolean {
  if (!field) return false;
  const u = field.trim().toUpperCase();
  return (JETBLUE_FLICA_EQUIPMENT_FIELD_CODES as readonly string[]).includes(u);
}

// ---------------------------------------------------------------------------
// Target hierarchy (conceptual — maps to DB rows / JSON as product evolves)
// ---------------------------------------------------------------------------

export type JetBlueSegmentKind =
  | 'operating_flight'
  | 'deadhead'
  | 'ground_transport'
  | 'layover_marker'
  | 'hotel_marker';

export type JetBlueScheduleMonth = {
  crewMemberName: string | null;
  employeeId: string | null;
  monthLabel: string | null;
  year: number | null;
  lastUpdated: string | null;
  sourceType: typeof JETBLUE_FLICA_MONTHLY_SOURCE_TYPE;
  monthlyTotals: JetBlueMonthlyTotals | null;
  pairings: JetBluePairing[];
  rawTextOptional: string | null;
};

export type JetBlueMonthlyTotals = {
  block: string | null;
  credit: string | null;
  ytd: string | null;
  daysOff: string | null;
  rawMonthlyTotalsText: string | null;
};

export type JetBluePairingTotals = {
  block: string | null;
  deadhead: string | null;
  credit: string | null;
  duty: string | null;
};

export type JetBlueLayover = {
  station: string | null;
  hotelName: string | null;
  releaseTime: string | null;
  nextReportTime: string | null;
};

export type JetBlueSegment = {
  order: number;
  segmentDate: string | null;
  type: JetBlueSegmentKind;
  flightNumber: string | null;
  departureStation: string | null;
  arrivalStation: string | null;
  departureTimeLocal: string | null;
  arrivalTimeLocal: string | null;
  blockTime: string | null;
  equipmentCode: string | null;
  isDeadhead: boolean;
  layoverStationAfterSegment: string | null;
  confidenceNotes: string | null;
};

export type JetBlueDutyDay = {
  date: string | null;
  dayOfWeek: string | null;
  sequence: number;
  segments: JetBlueSegment[];
  layover: JetBlueLayover | null;
  dutyEndLocal: string | null;
  nextReportLocal: string | null;
  notes: string | null;
};

export type JetBluePairing = {
  pairingId: string | null;
  startDate: string | null;
  operateDateRange: string | null;
  operatePatternText: string | null;
  base: string | null;
  baseReportTime: string | null;
  equipmentSummary: string | null;
  operateWindow: string | null;
  dutyDays: JetBlueDutyDay[];
  totals: JetBluePairingTotals | null;
  tafb: string | null;
  tripRig: string | null;
  deadheadSummary: string | null;
  crewListRaw: string | null;
  /** Private / internal — do not expose publicly by default. */
  crewListRestricted: boolean;
};
