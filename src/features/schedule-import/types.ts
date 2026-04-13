/**
 * Normalized JetBlue FLICA schedule import — DB row shapes and parser drafts.
 * DB columns use snake_case; drafts use camelCase for ergonomic TS.
 *
 * CBA / contract evaluation attaches later via evaluatePairingRules(...) — not in the parser.
 * @see ../crew-schedule/jetblueFlicaUnderstanding.ts
 */

import type { ParserIssueCode } from './parser/parserIssues';

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

export type ConfidenceTier = 'high' | 'medium' | 'low';

export type FieldConfidence = {
  tier: ConfidenceTier;
  /** 0–1 when available */
  score: number | null;
  notes: string | null;
};

export type ParserNote = {
  stage: string;
  message: string;
  code?: ParserIssueCode;
};

// ---------------------------------------------------------------------------
// Supabase row types (match migrations)
// ---------------------------------------------------------------------------

export type ScheduleImportJobRow = {
  id: string;
  user_id: string;
  airline_code: string;
  source_type: string;
  source_month_label: string | null;
  source_year: number | null;
  import_status: string;
  parser_version: string;
  raw_metadata_json: Record<string, unknown>;
  notes: string | null;
  legacy_schedule_import_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleImportAssetRow = {
  id: string;
  import_job_id: string;
  user_id: string;
  original_file_path: string;
  processed_file_path: string | null;
  sort_order: number;
  width: number | null;
  height: number | null;
  source_device_type: string | null;
  content_hash: string | null;
  created_at: string;
};

export type RawScheduleExtractionRow = {
  id: string;
  import_job_id: string;
  asset_id: string | null;
  extraction_engine: string;
  raw_text: string | null;
  structured_blocks_json: unknown[];
  confidence_overall: number | null;
  created_at: string;
};

export type NormalizedScheduleMonthRow = {
  id: string;
  import_job_id: string;
  user_id: string;
  airline_code: string;
  crew_member_name: string | null;
  employee_id: string | null;
  schedule_month_label: string | null;
  schedule_month_number: number | null;
  schedule_year: number | null;
  last_updated_at_source: string | null;
  source_type: string;
  source_confidence: number | null;
  raw_snapshot_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type NormalizedMonthlyTotalsRow = {
  id: string;
  schedule_month_id: string;
  monthly_block_minutes: number | null;
  monthly_credit_minutes: number | null;
  monthly_ytd_minutes: number | null;
  monthly_days_off: number | null;
  raw_totals_json: Record<string, unknown>;
  confidence_score: number | null;
  created_at: string;
};

export type NormalizedPairingRow = {
  id: string;
  schedule_month_id: string;
  pairing_code: string | null;
  pairing_start_date: string | null;
  pairing_end_date: string | null;
  base_code: string | null;
  base_report_time_local: string | null;
  operate_window_text: string | null;
  operate_start_date: string | null;
  operate_end_date: string | null;
  operate_pattern_text: string | null;
  equipment_summary: string | null;
  pairing_total_block_minutes: number | null;
  pairing_total_deadhead_minutes: number | null;
  pairing_total_credit_minutes: number | null;
  pairing_total_duty_minutes: number | null;
  tafb_minutes: number | null;
  trip_rig_minutes: number | null;
  deadhead_summary_minutes: number | null;
  crew_list_raw_json: unknown[] | Record<string, unknown> | null;
  confidence_score: number | null;
  raw_pairing_text: string | null;
  created_at: string;
  updated_at: string;
};

export type NormalizedDutyDayRow = {
  id: string;
  pairing_id: string;
  duty_date: string | null;
  duty_day_of_week: string | null;
  sequence_index: number;
  duty_end_time_local: string | null;
  next_report_time_local: string | null;
  overnight_station: string | null;
  layover_hotel_name: string | null;
  release_context_text: string | null;
  notes: string | null;
  confidence_score: number | null;
  raw_duty_text: string | null;
  created_at: string;
  updated_at: string;
};

export type NormalizedSegmentType = 'operating_flight' | 'deadhead' | 'transport' | 'marker';

export type NormalizedSegmentRow = {
  id: string;
  duty_day_id: string;
  sequence_index: number;
  segment_type: NormalizedSegmentType;
  flight_number: string | null;
  departure_station: string | null;
  arrival_station: string | null;
  departure_time_local: string | null;
  arrival_time_local: string | null;
  block_minutes: number | null;
  equipment_code: string | null;
  layover_station_after_segment: string | null;
  is_deadhead: boolean;
  confidence_score: number | null;
  raw_segment_text: string | null;
  created_at: string;
  updated_at: string;
};

export type NormalizedLayoverRow = {
  id: string;
  duty_day_id: string;
  station_code: string | null;
  hotel_name: string | null;
  arrival_context_time_local: string | null;
  release_time_local: string | null;
  next_report_time_local: string | null;
  notes: string | null;
  confidence_score: number | null;
  raw_layover_text: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleParserIssueRow = {
  id: string;
  import_job_id: string;
  asset_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  severity: string;
  issue_code: string;
  issue_message: string | null;
  raw_context: Record<string, unknown> | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Parser drafts (pre-DB normalization)
// ---------------------------------------------------------------------------

export type ParsedSegmentDraft = {
  sequenceIndex: number;
  segmentType: NormalizedSegmentType;
  flightNumber: string | null;
  departureStation: string | null;
  arrivalStation: string | null;
  departureTimeLocal: string | null;
  arrivalTimeLocal: string | null;
  blockMinutes: number | null;
  equipmentCode: string | null;
  layoverStationAfterSegment: string | null;
  isDeadhead: boolean;
  confidence: FieldConfidence;
  rawSegmentText: string | null;
};

export type ParsedLayoverDraft = {
  stationCode: string | null;
  hotelName: string | null;
  arrivalContextTimeLocal: string | null;
  releaseTimeLocal: string | null;
  nextReportTimeLocal: string | null;
  notes: string | null;
  confidence: FieldConfidence;
  rawLayoverText: string | null;
};

export type ParsedDutyDayDraft = {
  dutyDate: string | null;
  dayOfWeek: string | null;
  sequenceIndex: number;
  dutyEndTimeLocal: string | null;
  nextReportTimeLocal: string | null;
  overnightStation: string | null;
  layoverHotelName: string | null;
  releaseContextText: string | null;
  notes: string | null;
  segments: ParsedSegmentDraft[];
  layovers: ParsedLayoverDraft[];
  confidence: FieldConfidence;
  rawDutyText: string | null;
};

export type ParsedPairingTotalsDraft = {
  blockMinutes: number | null;
  deadheadMinutes: number | null;
  creditMinutes: number | null;
  dutyMinutes: number | null;
  tafbMinutes: number | null;
  tripRigMinutes: number | null;
};

export type ParsedPairingDraft = {
  pairingCode: string | null;
  pairingStartDate: string | null;
  pairingEndDate: string | null;
  baseCode: string | null;
  baseReportTimeLocal: string | null;
  operateWindowText: string | null;
  operateStartDate: string | null;
  operateEndDate: string | null;
  operatePatternText: string | null;
  equipmentSummary: string | null;
  totals: ParsedPairingTotalsDraft;
  deadheadSummaryMinutes: number | null;
  crewListRaw: string[] | null;
  dutyDays: ParsedDutyDayDraft[];
  confidence: FieldConfidence;
  rawPairingText: string | null;
};

export type ParsedMonthlyTotalsDraft = {
  blockMinutes: number | null;
  creditMinutes: number | null;
  ytdMinutes: number | null;
  daysOff: number | null;
  rawTotalsJson: Record<string, unknown>;
  confidence: FieldConfidence;
};

export type ParsedScheduleMonthDraft = {
  crewMemberName: string | null;
  employeeId: string | null;
  scheduleMonthLabel: string | null;
  scheduleMonthNumber: number | null;
  scheduleYear: number | null;
  lastUpdatedAtSource: string | null;
  monthlyTotals: ParsedMonthlyTotalsDraft | null;
  pairings: ParsedPairingDraft[];
  sourceConfidence: FieldConfidence;
  rawSnapshotJson: Record<string, unknown>;
  parserNotes: ParserNote[];
};

/** Wire format for API / fixtures — mirrors example JSON in examples/. */
export type NormalizedScheduleMonthPayload = {
  scheduleMonth: {
    crewMemberName: string | null;
    employeeId: string | null;
    scheduleMonthLabel: string | null;
    scheduleYear: number | null;
    lastUpdatedAtSource: string | null;
    monthlyTotals: {
      blockMinutes: number | null;
      creditMinutes: number | null;
      ytdMinutes: number | null;
      daysOff: number | null;
    } | null;
    pairings: Array<{
      pairingCode: string | null;
      pairingStartDate: string | null;
      baseCode: string | null;
      baseReportTimeLocal: string | null;
      operatePatternText: string | null;
      equipmentSummary: string | null;
      totals: {
        blockMinutes: number | null;
        deadheadMinutes: number | null;
        creditMinutes: number | null;
        dutyMinutes: number | null;
        tafbMinutes: number | null;
        tripRigMinutes: number | null;
      };
      dutyDays: Array<{
        date: string | null;
        dayOfWeek: string | null;
        segments: Array<{
          segmentType: NormalizedSegmentType;
          flightNumber: string | null;
          departureStation: string | null;
          arrivalStation: string | null;
          departureTimeLocal: string | null;
          arrivalTimeLocal: string | null;
          blockMinutes: number | null;
          isDeadhead: boolean;
        }>;
        layover: {
          stationCode: string | null;
          hotelName: string | null;
        } | null;
      }>;
    }>;
  };
};
