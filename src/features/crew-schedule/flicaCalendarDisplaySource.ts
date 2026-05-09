/**
 * Calendar/list display source for imported FLICA months (`crew_schedule`).
 * When a row exists for the visible month, mini-calendar HTML is the only allowed list/grid source;
 * duty-derived rows and UI snapshots must not override it.
 */

import { buildFlicaCalendarDisplayLedgerFromHtml } from "./flicaMiniCalendarTableLedger";
import type { FlicaCalendarCell } from "./flicaMiniCalendarTableLedger";
import { buildFlicaRawPairingDetailIndex } from "./flicaRawPairingDetailIndex";
import type { FlicaRawPairingDetailIndex } from "./flicaRawPairingDetailIndex";
import type { CrewScheduleFlicaRow } from "./scheduleApi";

/**
 * When true, a month with `crew_schedule` but missing `raw_html` falls back to trip/duty rows.
 * Default false: blocked state (empty calendar list until re-import fills raw_html).
 */
export const FC_FLICA_LEDGER_EMERGENCY_DUTY_FALLBACK = false;

export type FlicaCalendarListModel =
  | { mode: "trip_derived" }
  | {
      mode: "flica_mini_table";
      cells: FlicaCalendarCell[];
      visibleMonth: string;
      rawPairingDetailIndex: FlicaRawPairingDetailIndex;
    }
  | {
      mode: "flica_blocked";
      visibleMonth: string;
      reason: "no_raw_html" | "month_key_mismatch";
      crewScheduleMonthKey?: string;
    };

export function buildFlicaCalendarListModel(
  year: number,
  month: number,
  flicaRow: CrewScheduleFlicaRow | null,
): FlicaCalendarListModel {
  const mk = `${year}-${String(month).padStart(2, "0")}`;

  if (!flicaRow) {
    return { mode: "trip_derived" };
  }

  const raw = flicaRow.raw_html;
  const html = (raw ?? "").trim();
  const hasRaw = html.length > 0;
  const monthMatch = flicaRow.month_key === mk;

  if (!hasRaw || !monthMatch) {
    if (FC_FLICA_LEDGER_EMERGENCY_DUTY_FALLBACK) {
      return { mode: "trip_derived" };
    }
    return {
      mode: "flica_blocked",
      visibleMonth: mk,
      reason: !hasRaw ? "no_raw_html" : "month_key_mismatch",
      crewScheduleMonthKey: flicaRow.month_key,
    };
  }

  const cells = buildFlicaCalendarDisplayLedgerFromHtml(html, mk).cells;
  const rawPairingDetailIndex = buildFlicaRawPairingDetailIndex(html, mk);
  return {
    mode: "flica_mini_table",
    cells,
    visibleMonth: mk,
    rawPairingDetailIndex,
  };
}
