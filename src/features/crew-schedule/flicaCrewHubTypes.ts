/** Normalized Open Time pot row (FLICA native parse → UI). */
export type OpenTimeTrip = {
  pairingId: string;
  date: string;
  days: number | null;
  routeSummary: string;
  reportTime: string;
  departTime: string;
  arriveTime: string;
  block: string;
  credit: string;
  layover: string;
  worth: string;
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
  posterName: string;
  pairingId: string;
  routeSummary: string;
  base: string;
  position: string;
  date: string;
  days: string;
  reportTime: string;
  departTime: string;
  arriveTime: string;
  block: string;
  credit: string;
  worth: string;
  comments: string;
  responseMethods: string;
  postedAt: string;
  matchScore: number | null;
  legalCompatibility: boolean | null;
  sourceUrl: string;
  rawCells: string[];
  offerCount: number | null;
};
