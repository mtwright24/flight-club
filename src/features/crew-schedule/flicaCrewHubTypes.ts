/** Normalized Open Time pot row (FLICA native parse → UI). */
export type OpenTimeTrip = {
  pairingId: string;
  /** Human-readable date range or single date from FLICA. */
  date: string;
  /** Same as `date` when a range is shown; optional duplicate for clarity in payloads. */
  dates?: string;
  days: number | null;
  bidPos?: string;
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
};

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
};
