/**
 * Typed FLICA Actions route / form / flow map derived from captured TradeBoard & OpenTime pages.
 * Mapping only — no POST or submit execution.
 */

export const FLICA_ACTION_MAP_BASE = "https://jetblue.flica.net" as const;

/** TradeBoard BCID family (JetBlue capture). */
export const FLICA_TRADEBOARD_BCID = "002.000" as const;

/** OpenTime BCID used by native dev fetches (see flicaActionsNativeService — keep in sync). */
export const FLICA_OPENTIME_ACTION_BCID = "029.055" as const;

/** BCID on ottrade / ottrade2 preview URLs (TradeBoard-originated trade UI). */
export const FLICA_OT_TRADE_PREVIEW_BCID = "002.000" as const;

const B = FLICA_ACTION_MAP_BASE;

/** Canonical TradeBoard GET targets (paths match captured FLICA HTML). */
export const TRADEBOARD_ACTION_URLS = {
  frame: `${B}/online/tb_frame.cgi?BCID=${FLICA_TRADEBOARD_BCID}&dp=mr`,
  myRequests: `${B}/online/TB_MyRequests.cgi?&bcid=${FLICA_TRADEBOARD_BCID}`,
  allRequests: `${B}/online/tb_otherrequests.cgi?bcid=${FLICA_TRADEBOARD_BCID}`,
  favorites: `${B}/online/tb_myfavorites.cgi?bcid=${FLICA_TRADEBOARD_BCID}`,
  myResponses: `${B}/online/tb_myresponses.cgi?bcid=${FLICA_TRADEBOARD_BCID}`,
  postRequest: `${B}/online/tb_postrequest.cgi?bcid=${FLICA_TRADEBOARD_BCID}`,
} as const;

export type TradeboardUrlKind = keyof typeof TRADEBOARD_ACTION_URLS;

export function getTradeboardUrl(kind: TradeboardUrlKind): string {
  return TRADEBOARD_ACTION_URLS[kind];
}

/** POST target for submitting the TradeBoard post-request form (mapping only). */
export const TRADEBOARD_POST_REQUEST_SUBMIT = {
  method: "POST" as const,
  path: "/online/TB_postrequest.cgi",
  query: `BCID=${FLICA_TRADEBOARD_BCID}`,
  get url(): string {
    return `${B}/online/TB_postrequest.cgi?BCID=${FLICA_TRADEBOARD_BCID}`;
  },
} as const;

/**
 * Known input names on tb_postrequest / TB_postrequest flows (from capture).
 * Duplicates in the source list are collapsed to one entry per name.
 */
export const TRADEBOARD_POST_REQUEST_FORM_FIELDS = [
  "TradeType",
  "selBase",
  "CommentField",
  "cbMessages",
  "cbemail",
  "email",
  "cbphone",
  "Phone",
  "rFLiCA",
  "FLiCA",
  "rEMail",
  "EMail",
  "rPhone",
  "Year",
  "Year1",
  "RemPairIndex",
  "RemPairCount",
  "Day",
  "Month",
  "postrequest",
  "reqId",
  "treq",
  "thecid",
  "PAIRDATE",
  "hdnWaiveDaysOff",
  "hdnWaiveMinRest",
  "hdnDeleting",
  "hdnPairingIndex",
  "hdnSubmit",
] as const;

export type TradeboardPostRequestFieldName =
  (typeof TRADEBOARD_POST_REQUEST_FORM_FIELDS)[number];

/** Ordered unique field names for dev / validation. */
export function getTradeboardPostRequestFields(): readonly TradeboardPostRequestFieldName[] {
  return TRADEBOARD_POST_REQUEST_FORM_FIELDS;
}

/** TradeBoard → OpenTime “create trade” pairing selection (GET). */
export const TRADEBOARD_CREATE_TRADE_FLOW = {
  pairingSelectionUrl: `${B}/full/ottrade.cgi?BCID=${FLICA_OT_TRADE_PREVIEW_BCID}&bFromTB=1&VerifyDates=1&act=D`,
  jsMarkers: {
    /** Pairing row selection in TB trade UI */
    selectTrip: "TradeTask(this, index)",
    /** Wizard advance */
    next: "goNext()",
  },
  /** Primary control labels seen on the flow */
  buttonLabels: ["Trade", "Undo", "Next", "Cancel"] as const,
} as const;

/**
 * OpenTime routes aligned with `FLICA_NATIVE_URLS` in flicaActionsNativeService (029.055 family).
 * Documented here for the action map; native fetches remain the source of truth for URLs used in tests.
 */
export const OPENTIME_ACTION_URLS = {
  frameView: `${B}/full/otframe.cgi?BCID=${FLICA_OPENTIME_ACTION_BCID}&ViewOT=1`,
  frame: `${B}/full/otframe.cgi?BCID=${FLICA_OPENTIME_ACTION_BCID}`,
  request: (token: string) =>
    `${B}/full/otrequest.cgi?token=${encodeURIComponent(token)}&BCID=${FLICA_OPENTIME_ACTION_BCID}&isInFrame=1`,
  pot: (token: string) =>
    `${B}/full/otopentimepot.cgi?token=${encodeURIComponent(token)}&BCID=${FLICA_OPENTIME_ACTION_BCID}&GO=1`,
  previewSwap: `${B}/full/otswap.cgi?GO=1&BCID=${FLICA_OPENTIME_ACTION_BCID}&PIDX=0`,
  previewTrade: `${B}/full/ottrade.cgi?BCID=${FLICA_OT_TRADE_PREVIEW_BCID}&PIDX=0`,
  previewTrade2: `${B}/full/ottrade2.cgi?BCID=${FLICA_OT_TRADE_PREVIEW_BCID}&PIDX=0`,
  previewAdd: `${B}/full/otadd.cgi?GO=1&BCID=${FLICA_OPENTIME_ACTION_BCID}&PIDX=0`,
  previewDrop: `${B}/full/otdrop.cgi?GO=1&BCID=${FLICA_OPENTIME_ACTION_BCID}&PIDX=0`,
} as const;

export type FlicaActionCaptureInput = {
  href?: string | null;
  destinationUrl?: string | null;
  onclick?: string | null;
  clickedText?: string | null;
  clickedName?: string | null;
  topUrlBefore?: string | null;
  frameUrlBefore?: string | null;
};

export type ClassifiedFlicaMappedAction = Readonly<{
  /** High-level surface */
  surface: "tradeboard" | "opentime" | "mixed" | "unknown";
  /** Stable key for future UI wiring */
  actionKey: string;
  summary: string;
  matchedMarkers: readonly string[];
}>;

function safeLower(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function haystackFromCapture(c: FlicaActionCaptureInput): string {
  return [
    c.href,
    c.destinationUrl,
    c.onclick,
    c.clickedText,
    c.clickedName,
    c.topUrlBefore,
    c.frameUrlBefore,
  ]
    .map(safeLower)
    .join("\n");
}

/**
 * Classify a captured click/link/onclick payload against the action map (heuristic).
 */
export function classifyCapturedFlicaAction(
  capture: FlicaActionCaptureInput,
): ClassifiedFlicaMappedAction {
  const hay = haystackFromCapture(capture);
  const markers: string[] = [];
  const push = (m: string) => {
    if (!markers.includes(m)) markers.push(m);
  };

  if (hay.includes("tradetask(this")) push("js:TradeTask");
  if (hay.includes("gonext()")) push("js:goNext");

  const tbHits: string[] = [];
  const otHits: string[] = [];
  const addTb = (x: string) => {
    if (!tbHits.includes(x)) tbHits.push(x);
  };
  const addOt = (x: string) => {
    if (!otHits.includes(x)) otHits.push(x);
  };

  if (hay.includes("tb_frame.cgi")) addTb("frame");
  if (hay.includes("myrequests.cgi")) addTb("myRequests");
  if (hay.includes("tb_otherrequests.cgi")) addTb("allRequests");
  if (hay.includes("tb_myfavorites.cgi")) addTb("favorites");
  if (hay.includes("tb_myresponses.cgi")) addTb("myResponses");
  if (hay.includes("tb_postrequest.cgi")) addTb("postRequest");

  const isTbPairingSelection =
    hay.includes("ottrade.cgi") &&
    hay.includes("bfromtb=1") &&
    hay.includes("verifydates=1");
  if (isTbPairingSelection) {
    addTb("createTradePairing");
    push("url:pairingSelection");
  }

  if (hay.includes("otframe.cgi")) addOt("frame");
  if (hay.includes("otrequest.cgi")) addOt("request");
  if (hay.includes("otopentimepot.cgi")) addOt("pot");
  if (hay.includes("otswap.cgi")) addOt("previewSwap");
  if (hay.includes("ottrade2.cgi")) addOt("previewTrade2");
  if (hay.includes("ottrade.cgi") && !isTbPairingSelection) addOt("previewTrade");
  if (hay.includes("otadd.cgi")) addOt("previewAdd");
  if (hay.includes("otdrop.cgi")) addOt("previewDrop");

  for (const label of TRADEBOARD_CREATE_TRADE_FLOW.buttonLabels) {
    if (hay.includes(label.toLowerCase())) push(`label:${label}`);
  }

  let surface: ClassifiedFlicaMappedAction["surface"] = "unknown";
  if (tbHits.length && otHits.length) surface = "mixed";
  else if (tbHits.length) surface = "tradeboard";
  else if (otHits.length) surface = "opentime";

  let actionKey = "unknown";
  if (markers.includes("js:TradeTask")) actionKey = "tradeboard:create_trade_select_trip";
  else if (markers.includes("js:goNext")) actionKey = "tradeboard:create_trade_next";
  else if (tbHits.includes("createTradePairing")) actionKey = "tradeboard:create_trade_pairing_page";
  else if (tbHits.includes("postRequest")) actionKey = "tradeboard:post_request";
  else if (tbHits.includes("frame")) actionKey = "tradeboard:frame";
  else if (tbHits.includes("myRequests")) actionKey = "tradeboard:my_requests";
  else if (tbHits.includes("allRequests")) actionKey = "tradeboard:all_requests";
  else if (tbHits.includes("favorites")) actionKey = "tradeboard:favorites";
  else if (tbHits.includes("myResponses")) actionKey = "tradeboard:my_responses";
  else if (otHits.includes("pot")) actionKey = "opentime:pot";
  else if (otHits.includes("request")) actionKey = "opentime:request";
  else if (otHits.includes("frame")) actionKey = "opentime:frame";
  else if (otHits.includes("previewTrade")) actionKey = "opentime:preview_trade";
  else if (otHits.includes("previewTrade2")) actionKey = "opentime:preview_trade_step2";
  else if (otHits.includes("previewAdd")) actionKey = "opentime:preview_add";
  else if (otHits.includes("previewDrop")) actionKey = "opentime:preview_drop";
  else if (otHits.includes("previewSwap")) actionKey = "opentime:preview_swap";

  const parts = [
    `surface=${surface}`,
    `actionKey=${actionKey}`,
    tbHits.length ? `tradeboardHits=${tbHits.join(",")}` : null,
    otHits.length ? `opentimeHits=${otHits.join(",")}` : null,
    markers.length ? `markers=${markers.join(",")}` : null,
  ].filter(Boolean);

  return {
    surface,
    actionKey,
    summary: parts.join(" | "),
    matchedMarkers: markers,
  };
}

/**
 * Human-readable dump of normalized endpoints, POST map, form fields, and flow markers (dev).
 */
export function summarizeActionMapForDev(): string {
  const lines: string[] = [
    "=== FLICA Actions — Action Map (dev) ===",
    "",
    "--- TradeBoard GET ---",
    ...Object.entries(TRADEBOARD_ACTION_URLS).map(([k, u]) => `${k}: ${u}`),
    "",
    "--- TradeBoard POST (submit mapping only) ---",
    `${TRADEBOARD_POST_REQUEST_SUBMIT.method} ${TRADEBOARD_POST_REQUEST_SUBMIT.url}`,
    `path: ${TRADEBOARD_POST_REQUEST_SUBMIT.path}?${TRADEBOARD_POST_REQUEST_SUBMIT.query}`,
    "",
    "--- TradeBoard post-request form fields ---",
    getTradeboardPostRequestFields().join(", "),
    "",
    "--- TradeBoard → create trade flow ---",
    `pairingSelectionUrl: ${TRADEBOARD_CREATE_TRADE_FLOW.pairingSelectionUrl}`,
    `js: ${TRADEBOARD_CREATE_TRADE_FLOW.jsMarkers.selectTrip}`,
    `js: ${TRADEBOARD_CREATE_TRADE_FLOW.jsMarkers.next}`,
    `buttons: ${TRADEBOARD_CREATE_TRADE_FLOW.buttonLabels.join(", ")}`,
    "",
    "--- OpenTime (BCID " + FLICA_OPENTIME_ACTION_BCID + ", mirrors native dev URLs) ---",
    `frameView: ${OPENTIME_ACTION_URLS.frameView}`,
    `frame: ${OPENTIME_ACTION_URLS.frame}`,
    "request(token): /full/otrequest.cgi?token=…&BCID=…&isInFrame=1",
    "pot(token): /full/otopentimepot.cgi?token=…&BCID=…&GO=1",
    `previewSwap: ${OPENTIME_ACTION_URLS.previewSwap}`,
    `previewTrade: ${OPENTIME_ACTION_URLS.previewTrade}`,
    `previewTrade2: ${OPENTIME_ACTION_URLS.previewTrade2}`,
    `previewAdd: ${OPENTIME_ACTION_URLS.previewAdd}`,
    `previewDrop: ${OPENTIME_ACTION_URLS.previewDrop}`,
    "",
    "Example classify (post-request page + TradeTask):",
    JSON.stringify(
      classifyCapturedFlicaAction({
        href: TRADEBOARD_ACTION_URLS.postRequest,
        onclick: "TradeTask(this, 3)",
      }),
      null,
      2,
    ),
  ];
  return lines.join("\n");
}
