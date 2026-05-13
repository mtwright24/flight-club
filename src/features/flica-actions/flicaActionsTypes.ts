export type FlicaActionsCookies = {
  FLiCASession?: string;
  FLiCAService?: string;
  AWSALB?: string;
  AWSALBCORS?: string;
};

export type FlicaHtmlState =
  | "ok"
  | "application_error"
  | "login_required"
  | "captcha_required"
  | "too_short_or_unknown";

/** Normalized parse from native FLICA Actions HTML (dev/test layer). */
export type FlicaNativePageModel = {
  pageTitle: string | null;
  pageType: string;
  rows: string[][];
  buttons: Array<{
    tag: string;
    type: string;
    name: string;
    value: string;
    text: string;
  }>;
  forms: Array<{
    action: string;
    method: string;
    fieldCount: number;
    fieldNames: string[];
  }>;
  hiddenFields: Array<{ name: string; value: string }>;
  actionEndpoints: string[];
  warningsErrors: string[];
};

/** Dev-only TradeBoard warm-frame fetch diagnostics (native Actions tests). */
export type FlicaNativeTradeBoardFetchDebug = {
  requestedUrl: string;
  referer: string;
  fallbackUsed: boolean;
  firstRequestedUrl: string;
  htmlLength: number;
  title: string | null;
  preview300: string;
  pageType: string;
  buttonsCount: number;
  formsCount: number;
  hiddenFieldsCount: number;
  /** First N hidden inputs as `name=value` (values truncated) for filter-state debugging. */
  hiddenFieldsNameValuePreview?: string[];
  actionEndpointsCount: number;
};

/** Native All Requests: GET + optional filter-reset POST diagnostics. */
export type TradeBoardAllRequestsNativeDebug = {
  steps: string[];
  initialGet: {
    requestedUrl: string;
    method: "GET";
    finalUrl: string;
    pairingMatchCount: number;
    nothingMatchesCriteria: boolean;
  };
  resetPost?: {
    postUrl: string;
    method: "POST";
    requestBody: string;
    finalUrl: string;
    pairingMatchCount: number;
    nothingMatchesCriteria: boolean;
  };
  /** Hidden fields parsed from the HTML of the initial GET (name + value). */
  hiddenFieldsFromInitialPage: Array<{ name: string; value: string }>;
  fullHtmlContainsPairingPattern: boolean;
  nothingMatchesCriteriaFinal: boolean;
  getCandidatesTried: string[];
};

export type FlicaActionsFetchResult = {
  ok: boolean;
  /** URL requested for this response (before redirects); mirrors `toResult` first argument. */
  requestedUrl?: string;
  url: string;
  status?: number;
  htmlState?: FlicaHtmlState;
  htmlLength?: number;
  title?: string | null;
  detectedLinks?: string[];
  rowCount?: number;
  error?: string;
  bodyPreview?: string;
  /** Full HTML body from the last GET (for client-side fallback parsing when table rows are templates). */
  pageHtml?: string;
  /** When set, UI can show structured native parse (Phase 1 Actions). */
  nativeParse?: FlicaNativePageModel;
  /** Present after native TradeBoard tab fetches that use warm-frame + session prep. */
  nativeTradeBoardFetchDebug?: FlicaNativeTradeBoardFetchDebug;
  /** Present when {@link nativeFetchTradeBoardAllRequests} runs filter-reset / multi-endpoint logic. */
  tradeBoardAllRequestsNativeDebug?: TradeBoardAllRequestsNativeDebug;
  /**
   * TradeBoard Post Request: native GET is skipped; page is only reliable in FLICA WebView.
   * Dev/test UI should show a WebView-required banner, not FAILED.
   */
  tradeBoardPostWebviewRequired?: boolean;
  tradeBoardPostRequestMeta?: {
    pageType: "tradeboard_post_request";
    requestedUrl: string;
    referer: string;
    explanation: string;
  };
};

export type FlicaSessionPrepResult = {
  ok: boolean;
  reason?: string;
  leftMenuHtml?: string;
  mainMenuUrl?: string;
  cookies: FlicaActionsCookies;
  debug: {
    mainMenuStatus?: number;
    mainMenuHtmlState?: FlicaHtmlState;
    mainMenuTitle?: string | null;
    mainMenuLength?: number;
    leftMenuStatus?: number;
    leftMenuHtmlState?: FlicaHtmlState;
    leftMenuTitle?: string | null;
    leftMenuLength?: number;
  };
};
