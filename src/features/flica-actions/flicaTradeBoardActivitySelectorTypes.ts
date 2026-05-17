/**
 * FLICA TradeBoard Post Request activity selector (ottrade.cgi) — parsed row models.
 */

export type FlicaActivitySelectorAction = "trade" | "drop" | "undo" | "locked" | "none";

export type FlicaActivitySelectorRowKind = "date_header" | "trip" | "blank" | "carryover";

export type FlicaActivitySelectorRow = {
  /** Preserve FLICA document order (0-based). */
  orderIndex: number;
  kind: FlicaActivitySelectorRowKind;
  pairingId: string;
  dateLabel: string;
  dateYmd: string;
  days: string;
  report: string;
  depart: string;
  arrive: string;
  blockHrs: string;
  layover: string;
  actionType: FlicaActivitySelectorAction;
  /** Trade / Drop button label from FLICA when present. */
  actionLabel?: string;
  /** Raw onclick handler (TradeTask / DropTask). */
  rawOnclick?: string;
  /** TradeTask(this, N) / DropTask(this, N) index when present. */
  flicaRowIndex: number | null;
  selectable: boolean;
  /** True when FLICA shows Undo on the row (already selected on their page). */
  selectedOnFlica: boolean;
  locked: boolean;
  sectionDateLabel: string;
  rawRowText: string;
  rawCells: string[];
};

export type TradeboardActivitySelectorParse = {
  ok: boolean;
  requestedUrl: string;
  finalUrl: string;
  htmlLength: number;
  act: string;
  rows: FlicaActivitySelectorRow[];
  eligibleRows: FlicaActivitySelectorRow[];
  warnings: string[];
  htmlSource?: "native" | "webview";
  taskRecordsFound?: number;
  tradeTaskHandlersFound?: number;
  dropTaskHandlersFound?: number;
  eligibleRowsFound?: number;
};
