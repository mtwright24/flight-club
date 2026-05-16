/** FLICA Open Time pot/frame identity for a row (required for live pairing detail fetch). */
export type OpenTimeRowSourceContext = {
  sourceBcid: string;
  /** Final URL after redirects for `otframe.cgi?…&ViewOT=1`. */
  sourceOtFrameUrl: string;
  /** Pot list URL used to parse this row. */
  sourceOpenTimePotUrl: string;
  /** `otopentimepot.cgi` token query value when present. */
  sourceToken: string;
  /** `YYYY-MM` from crew hub month strip or inferred from row. */
  sourceMonthKey?: string;
  /** e.g. MainFrame when known from FLICA frameset (optional). */
  sourceFrameName?: string;
};

/** Normalized Open Time pot row (FLICA native parse → UI). */
export type OpenTimeTrip = {
  pairingId: string;
  /** `YYYYMMDD` from live `pair("PID","YYYYMMDD",…)` when extracted. */
  dateYmd?: string;
  /** Human-readable date range or single date from FLICA. */
  date: string;
  /** Same as `date` when a range is shown; optional duplicate for clarity in payloads. */
  dates?: string;
  /** FLICA-style report date token (e.g. 01JUN) when present in pairing column. */
  dateLabel?: string;
  days: number | null;
  bidPos?: string;
  /** Layover / overnight line from FLICA Layover column only — not a computed leg chain. */
  routeSummary: string;
  reportTime: string;
  departTime: string;
  arriveTime: string;
  block: string;
  credit: string;
  layover: string;
  worth: string;
  premium?: string;
  dollarPerCreditHour: string;
  legalityStatus: string;
  sourceUrl: string;
  rawCells: string[];
  /**
   * Full FLICA pairing detail URL (`rbcpair.cgi`), from onclick `pair("PID","YYYYMMDD",…)` when present.
   */
  pairingDetailUrl?: string;
  /**
   * True when `pairingDetailUrl` was resolved from live pot HTML (`pair(...)` / same-document enrichment)
   * during a hub refresh — never synthetic PID/DATE build for marketplace.
   */
  pairingDetailUrlFromLiveHtml?: boolean;
  /** Stable order within the source pot list (0-based). */
  originalDisplayOrder?: number;
} & Partial<OpenTimeRowSourceContext>;

export type TradeboardPostType =
  | "swap"
  | "drop"
  | "pickup"
  | "trade"
  | "trade_drop"
  | "unknown";

/** Normalized TradeBoard row (FLICA native parse → UI). */
export type TradeboardPost = {
  id: string;
  type: TradeboardPostType;
  typeLabel: string;
  posterName: string;
  pairingId: string;
  pairingDateLabel: string;
  routeSummary: string;
  base: string;
  position: string;
  /** Legacy display date (often same as pairingDateLabel or calendar text). */
  date: string;
  days: string;
  reportTime: string;
  departTime: string;
  arriveTime: string;
  block: string;
  credit: string;
  worth: string | null;
  layover: string;
  comments: string;
  /** Legacy combined response hints. */
  responseMethods: string;
  responseMethodLabel: string;
  postedAt: string;
  postedAtLabel: string;
  canPickup: boolean;
  canProposeTrade: boolean;
  matchScore: number | null;
  legalCompatibility: boolean | null;
  sourceUrl: string;
  rawCells: string[];
  rawText: string;
  offerCount: number | null;
  /**
   * Full FLICA pairing detail URL (`RBCPair.cgi`), from onclick or normalized pairing+date when present.
   */
  pairingDetailUrl?: string;
  /** `YYYYMMDD` when resolved from live onclick / enrichment. */
  dateYmd?: string;
  /** True when URL came from live Tradeboard HTML row/onclick enrichment (hub refresh). */
  pairingDetailUrlFromLiveHtml?: boolean;
};
