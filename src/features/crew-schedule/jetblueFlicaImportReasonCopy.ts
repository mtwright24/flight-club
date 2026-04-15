/**
 * Structured validation reasons for import review (user-facing copy).
 * No OCR/parser implementation details in primary strings.
 */

export type ValidationReasonCode =
  | 'not_visible'
  | 'unreadable'
  | 'low_confidence_match'
  | 'multiple_possible_matches'
  | 'conflicting_context'
  | 'inferred_value'
  | 'required_for_save'
  | 'suspicious_code';

/** Default one-line explanations when a field-specific reason is not set. */
export const DEFAULT_REASON_COPY: Record<ValidationReasonCode, string> = {
  not_visible: 'This field was not clearly visible in the screenshot.',
  unreadable: 'This field appears in the screenshot, but we could not read it reliably.',
  low_confidence_match: 'We found a value, but it may be incorrect.',
  multiple_possible_matches: 'We found more than one possible value.',
  conflicting_context: 'This value conflicts with other trip details.',
  inferred_value: 'This value was filled in from nearby trip details.',
  required_for_save: 'This field is required before saving.',
  suspicious_code: 'This code may be a scan mistake — please confirm.',
};
