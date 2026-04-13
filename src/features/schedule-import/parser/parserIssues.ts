/**
 * Parser issue codes — logged to schedule_parser_issues and attached to ParserNote.
 */

export const PARSER_ISSUE_CODES = [
  'HEADER_MONTH_NOT_FOUND',
  'CREW_NAME_UNCERTAIN',
  'EMPLOYEE_ID_UNCERTAIN',
  'MONTHLY_TOTALS_PARTIAL',
  'PAIRING_HEADER_NOT_CONFIRMED',
  'DUTY_DAY_SPLIT_UNCERTAIN',
  'SEGMENT_CLASSIFICATION_UNCERTAIN',
  'HOTEL_NAME_UNCERTAIN',
  'TIME_PARSE_FAILED',
  'DATE_PARSE_FAILED',
  'CROSS_MONTH_INFERENCE_USED',
  'OCR_LOW_CONFIDENCE',
] as const;

export type ParserIssueCode = (typeof PARSER_ISSUE_CODES)[number];

export function isParserIssueCode(s: string): s is ParserIssueCode {
  return (PARSER_ISSUE_CODES as readonly string[]).includes(s);
}
