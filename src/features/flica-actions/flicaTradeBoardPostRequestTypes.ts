import type { ActivityParentFieldRules, TbPostActivityScriptBodies } from "./flicaTradeBoardPostRequestActivityScript";
import type { ChromeParityDiff } from "./flicaTradeBoardPostRequestChromeParity";
import type { FlicaHtmlState } from "./flicaActionsTypes";

export type TradeboardPostRequestFormFieldKind =
  | "hidden"
  | "text"
  | "textarea"
  | "select"
  | "checkbox"
  | "radio"
  | "submit"
  | "button"
  | "other";

export type TradeboardPostRequestSelectOption = {
  value: string;
  label: string;
  selected: boolean;
};

export type TradeboardPostRequestFormField = {
  name: string;
  value: string;
  type: TradeboardPostRequestFormFieldKind;
  label?: string;
  checked?: boolean;
  disabled?: boolean;
  options?: TradeboardPostRequestSelectOption[];
};

export type TradeboardPostRequestSubmitControl = {
  name: string;
  value: string;
  type: string;
};

export type TradeboardPostRequestCapturedSubmit = {
  actionRaw: string;
  actionResolved: string;
  frameUrl: string;
  method: "GET" | "POST";
  submitButton: TradeboardPostRequestSubmitControl | null;
  submitControls: TradeboardPostRequestSubmitControl[];
  hiddenFields: Array<{ name: string; value: string }>;
  source: "webview" | "html_parse";
};

export type TradeboardPostRequestFormModel = {
  index: number;
  /** Resolved absolute submit URL (from captured form action only). */
  actionUrl: string;
  /** Raw form `action` attribute before resolution. */
  actionRaw: string;
  /** Document/frame URL used to resolve `action`. */
  frameUrl: string;
  method: "GET" | "POST";
  fields: TradeboardPostRequestFormField[];
  hiddenFields: Array<{ name: string; value: string }>;
  capturedSubmit: TradeboardPostRequestCapturedSubmit | null;
};

export type TradeboardPostRequestDetectedFields = {
  requestTypes: TradeboardPostRequestSelectOption[];
  selectedRequestType: string;
  base: string;
  equipment: string;
  position: string;
  comments: string;
  flicaResponseRequired: boolean;
  flicaResponseChecked: boolean;
  emailResponse: boolean;
  emailAddress: string;
  phoneResponse: boolean;
  phoneNumber: string;
  deleteAfter: string;
  addActivityUrl: string;
  addActivityLabel: string;
  pairingFieldNames: string[];
  /** TB_EditRequest: human-readable selected type label */
  requestTypeDisplayLabel?: string;
  /** TB_EditRequest: delete-after selectors */
  deleteAfterDayOptions?: TradeboardPostRequestSelectOption[];
  deleteAfterMonthOptions?: TradeboardPostRequestSelectOption[];
  selectedDeleteDay?: string;
  selectedDeleteMonthYyyyMm?: string;
  /** TB_EditRequest: Submit Method section when present */
  submitMethodFieldsPresent?: boolean;
  submitMethodAllowPickupWithoutApproval?: boolean;
  submitMethodWaitForApproval?: boolean;
  submitMethodAllowPickupDisabled?: boolean;
  submitMethodWaitDisabled?: boolean;
  /** TB_EditRequest: pairing from hdnResPairStr / resAdded */
  selectedActivity?: TradeboardPostRequestActivity;
};

export type TradeboardPostRequestFormParse = {
  ok: boolean;
  requestedUrl: string;
  finalUrl: string;
  htmlLength: number;
  htmlState: FlicaHtmlState;
  forms: TradeboardPostRequestFormModel[];
  primaryForm: TradeboardPostRequestFormModel | null;
  /** Authoritative submit target from live capture or parsed form (never a guessed default). */
  capturedSubmit: TradeboardPostRequestCapturedSubmit | null;
  detected: TradeboardPostRequestDetectedFields;
  warnings: string[];
  missingMappings: string[];
  /** Inline TB_postrequest activity script bodies from captured HTML. */
  activityScriptBodies?: TbPostActivityScriptBodies;
  activityParentFieldRules?: ActivityParentFieldRules | null;
};

export type TradeboardPostRequestActivitySource =
  | "schedule"
  | "open_time"
  | "tradeboard"
  | "flica_selector";

export type TradeboardPostRequestActivity = {
  pairingId: string;
  dateYmd: string;
  dateLabel: string;
  sourceType: TradeboardPostRequestActivitySource;
  displayLabel: string;
  /** First operating departure IATA (from schedule trip legs). */
  depAirport?: string;
  /** Final operating arrival IATA (from schedule trip legs). */
  arrAirport?: string;
  /** Total block in FLICA HHMM form (e.g. 0455). */
  blockHrs?: string;
  /** Layover station summary when known from schedule. */
  layovers?: string;
  /** `CrewScheduleTrip.id` when resolved from monthTrips. */
  tripId?: string;
  /** Live ottrade.cgi URL used to list this row. */
  flicaSelectorUrl?: string;
  /** TradeTask row index from FLICA selector. */
  flicaRowIndex?: number;
  flicaActionType?: string;
  days?: string;
  report?: string;
  depart?: string;
  arrive?: string;
};

export type TradeboardPostRequestActivitySourceMeta = {
  label: string;
  selectorUrl: string;
  flicaRowIndex: number | null;
};

export type TradeboardPostRequestComposerState = {
  requestType: string;
  base: string;
  equipment: string;
  position: string;
  comments: string;
  flicaResponse: boolean;
  emailResponse: boolean;
  emailAddress: string;
  phoneResponse: boolean;
  phoneNumber: string;
  deleteAfter: string;
  activities: TradeboardPostRequestActivity[];
  /** Set when editing an existing request. */
  reqId?: string;
  treq?: string;
};

export type TradeboardPostRequestMappedField = {
  name: string;
  value: string;
  source: string;
};

export type TradeboardPostRequestPayload = {
  actionUrl: string;
  method: "GET" | "POST";
  /** Real FLICA form submit metadata (for dry-run / submit guard). */
  capturedSubmit: TradeboardPostRequestCapturedSubmit | null;
  body: string;
  fields: Array<{ name: string; value: string }>;
  summary: {
    requestType: string;
    base: string;
    equipment: string;
    position: string;
    comments: string;
    responseMethods: string[];
    activities: TradeboardPostRequestActivity[];
    deleteAfter: string;
  };
  mappedFields: TradeboardPostRequestMappedField[];
  /** Critical hdn* fields still empty after mapping (includes optional trip-time fields). */
  blankCriticalFields: string[];
  /** Fields that block Confirm Submit when empty and present on the form. */
  submitBlockers: string[];
  submitBlocked: boolean;
  missingMappings: string[];
  warnings: string[];
  /** Fields that differ from the known-good Chrome POST capture. */
  chromeParityDiffs: ChromeParityDiff[];
  activitySource?: TradeboardPostRequestActivitySourceMeta;
};

export type TradeboardPostRequestDryRun = TradeboardPostRequestPayload & {
  mode: "dry_run";
};

export type TradeboardPostRequestSubmitResult = {
  ok: boolean;
  status: number;
  htmlState: FlicaHtmlState;
  outcome: "success" | "validation_error" | "session_expired" | "duplicate" | "unknown";
  message: string;
  finalUrl: string;
};

export type TradeboardMyRequestActionRow = {
  pairingId: string;
  dateLabel: string;
  requestType: string;
  reqId: string;
  treq: string;
  editUrl: string;
  deleteUrl: string;
  editRequestId: string;
  deleteRequestId: string;
  base?: string;
  position?: string;
  comments?: string;
  postedAt?: string;
  responseMethods?: string;
  pairingDetailUrl?: string;
  pairingDateYmd?: string;
  sourcePage?: "my_requests";
  rawPreview: string;
};

export type TradeboardMyRequestsActionsParse = {
  ok: boolean;
  rows: TradeboardMyRequestActionRow[];
  warnings: string[];
};
