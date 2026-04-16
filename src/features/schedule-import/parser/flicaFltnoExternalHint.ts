/**
 * Optional assistive flight-number hints for FLICA screenshot review (JetBlue / B6).
 * Not used by the core parser — only for surfacing schedule-backed suggestions when wired.
 */

export type FlicaFltnoExternalHintParams = {
  carrier?: 'B6' | 'jetblue';
  departureAirport: string;
  arrivalAirport: string;
  /** ISO calendar date for departure (local pairing day). */
  departureLocalDate?: string;
  departureLocalTime?: string;
  arrivalLocalTime?: string;
};

/**
 * Returns plausible flight numbers from an external schedule/flight API, best first.
 * Default: no network — empty list. Callers must never treat results as authoritative.
 */
export async function fetchFlicaFltnoExternalHints(_params: FlicaFltnoExternalHintParams): Promise<string[]> {
  return [];
}
