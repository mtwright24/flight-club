export type FlicaActionSafetyClass = "SAFE_READ" | "MAY_MUTATE";

export type FlicaActionEventType =
  | "click"
  | "change"
  | "submit"
  | "navigation"
  | "dom_snapshot"
  | "manual_snapshot";

export type CapturedFlicaPairingLink = {
  source: "opentime" | "tradeboard" | "unknown";
  pairingId: string;
  dateText?: string;
  href: string;
  absoluteUrl: string;
  rowText?: string;
  rowCells?: string[];
  capturedAt: string;
};

export type CapturedFlicaTradeboardRowActions = {
  pairingId: string;
  rowText?: string;
  rowCells?: string[];
  pairingHref?: string;
  pickupTrip?: { text: string; href: string; onclick?: string };
  proposeTrade?: { text: string; href: string; onclick?: string };
  addToFavorites?: { text: string; href: string; onclick?: string };
  responseLinks?: Array<{ text: string; href: string }>;
  comments?: string;
  posterName?: string;
  capturedAt: string;
};

export type CapturedFlicaOpenTimeRowActions = {
  pairingId: string;
  rowText?: string;
  rowCells?: string[];
  pairingHref?: string;
  addPickup?: { text: string; href: string; onclick?: string };
  drop?: { text: string; href: string; onclick?: string };
  swap?: { text: string; href: string; onclick?: string };
  trade?: { text: string; href: string; onclick?: string };
  capturedAt: string;
};

export type FlicaNavigationLogEntry = {
  timestamp: string;
  phase: "navigation" | "load_start" | "load_end" | "should_start";
  url: string;
  title?: string;
  loading?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  navigationType?: string;
  mainDocumentURL?: string;
};

/** Extra fields merged onto {@link CapturedFlicaActionEvent} in the recorder UI. */
export type FlicaActionRecorderExtra = {
  eventType: FlicaActionEventType;
  safetyClassification: FlicaActionSafetyClass;
  pageLabel: string;
  nearestFormAction: string;
  formMethod: string;
  formTarget: string;
  formEnctype: string;
  formName: string;
  formId: string;
  formFieldCount: number;
  hiddenFieldCount: number;
  frameCount: number;
  anchorCount: number;
  buttonCount: number;
  tableCount: number;
  htmlLength: number;
  bodyPreview: string;
  selectsSnapshot: string;
  hiddenFieldsSnapshot: string;
  frameUrlsBefore: string[];
  frameUrlsAfterNav: string[] | null;
  pairingLinks: CapturedFlicaPairingLink[];
  tradeboardRows: CapturedFlicaTradeboardRowActions[];
  openTimeRows: CapturedFlicaOpenTimeRowActions[];
  replayGetUrl: string;
  replayTargetReason: string;
  popupAbsoluteUrl: string;
  replayReferer: string;
  replayPostBody: string | null;
  replayWarning: string | null;
};

export type FlicaReplayDryRunPayload = {
  method: "GET" | "POST";
  url: string;
  referer: string;
  origin: string;
  userAgentNote: string;
  headers: Record<string, string>;
  body: string | null;
  classification: FlicaActionSafetyClass;
  warning: string | null;
  willSend: false;
};

export type FlicaReplayGetResult = {
  ok: boolean;
  status: number;
  htmlLength: number;
  title: string;
  error?: string;
  classification: FlicaActionSafetyClass;
  /** Populated for debug inspection after GET replay (not sent to Share by default). */
  html?: string;
  finalUrl?: string;
  requestedUrl?: string;
};
