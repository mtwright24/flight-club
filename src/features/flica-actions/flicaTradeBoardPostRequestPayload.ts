/**
 * TradeBoard Post Request — build payload, dry run, submit (session cookies only).
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import {
  detectFlicaHtmlState,
  fetchFlicaHtmlUsingWebViewSession,
  flicaFetchNeedsWebVerification,
} from "./flicaActionsHttp";
import { tradeboardPostRequestBaselineEntries } from "./flicaTradeBoardPostRequestForm";
import {
  CAPTURED_FORM_ACTION_BLOCKER,
  formatSubmitButtonLabel,
} from "./flicaTradeBoardPostRequestCapturedForm";
import {
  buildChromeExpectedFields,
  computeChromeParityDiffs,
} from "./flicaTradeBoardPostRequestChromeParity";
import {
  applyComposerToPayloadEntries,
  computeBlankCriticalFields,
  criticalFieldsForComposer,
  DROP_TRIP_ACTIVITY_CRITICAL_FIELDS,
  entryValue,
  isDropTripRequestType,
  isPlaceholderRequestType,
  isValidCompactTradeTypeCode,
  resolveActivityDateYmd,
  resolveEffectiveTradeTypeCode,
} from "./flicaTradeBoardPostRequestFieldMap";
import type { CrewScheduleTrip } from "../crew-schedule/types";
import type {
  TradeboardPostRequestComposerState,
  TradeboardPostRequestDryRun,
  TradeboardPostRequestFormField,
  TradeboardPostRequestFormParse,
  TradeboardPostRequestPayload,
  TradeboardPostRequestSubmitResult,
} from "./flicaTradeBoardPostRequestTypes";

const DRY_RUN_TAG = "FC_TB_POST_PAYLOAD_DRY_RUN";
const SUBMIT_TAG = "FC_TB_POST_SUBMIT_RESULT";
const DELETE_DRY_TAG = "FC_TB_REQUEST_DELETE_DRY_RUN";
const DELETE_RESULT_TAG = "FC_TB_REQUEST_DELETE_RESULT";

/** Must be populated before submit when the field exists on the FLICA form. */
const SUBMIT_BLOCKER_FIELDS = [
  "hdnType",
  "hdnBase",
  "hdnComments",
  "hdnFlicaResponse",
  "hdnPairStr",
  "hdnDepDate",
  "hdnDayStr",
] as const;

function responseMethodLabels(state: TradeboardPostRequestComposerState): string[] {
  const out: string[] = [];
  if (state.flicaResponse) out.push("FLICA Response");
  if (state.emailResponse) out.push("Email");
  if (state.phoneResponse) out.push("Phone");
  return out;
}

const DROP_ROUTE_SUBMIT_FIELDS = ["hdnDep", "hdnArr", "hdnBlkHrs"] as const;

function computePostRequestPreviewBlockers(
  entries: Array<{ name: string; value: string }>,
  composer: TradeboardPostRequestComposerState,
  detected: TradeboardPostRequestFormParse["detected"],
  tradeTypeValue: string,
): string[] {
  const blockers: string[] = [];
  const tradeTypeField = entryValue(entries, "TradeType");
  const hdnTypeField = entryValue(entries, "hdnType");

  if (
    isPlaceholderRequestType(composer.requestType) ||
    isPlaceholderRequestType(tradeTypeField) ||
    isPlaceholderRequestType(hdnTypeField)
  ) {
    blockers.push("requestType (Select Type Here — choose Trade Trip, Drop Trip, or Trade/Drop)");
  }
  if (!isValidCompactTradeTypeCode(tradeTypeValue)) {
    blockers.push("TradeType (must be compact FLICA code T, D, P, or X)");
    blockers.push("hdnType (must be compact FLICA code T, D, P, or X)");
  }

  const activity = composer.activities[0];
  if (activity) {
    const formYear = entryValue(entries, "Year") || entryValue(entries, "Year1");
    const formMonth = entryValue(entries, "Month");
    const ymd = resolveActivityDateYmd(activity, {
      formYear,
      formMonthYyyyMm: formMonth,
    });
    if (formYear && /^\d{8}$/.test(ymd) && ymd.slice(0, 4) !== formYear.slice(0, 4)) {
      blockers.push(
        `activity date year ${ymd.slice(0, 4)} does not match form Year ${formYear.slice(0, 4)}`,
      );
    }
  }

  return blockers;
}

function computeSubmitBlockers(
  entries: Array<{ name: string; value: string }>,
  composer: TradeboardPostRequestComposerState,
  detected: TradeboardPostRequestFormParse["detected"],
  formFields: TradeboardPostRequestFormField[],
): string[] {
  const blockers: string[] = [];
  const hasActivity = composer.activities.length > 0;
  const hasComments = Boolean(composer.comments.trim());
  const dropTrip = isDropTripRequestType(composer.requestType, detected);

  if (hasActivity) {
    const tradeTypeValue = resolveEffectiveTradeTypeCode(composer.requestType, detected);
    const expected = buildChromeExpectedFields(
      composer,
      tradeTypeValue,
      composer.activities[0] ?? null,
      entries,
    );
    for (const [field, want] of Object.entries(expected)) {
      const inForm = formFields.some((f) => f.name.toLowerCase() === field.toLowerCase());
      if (!inForm) continue;
      if (field === "hdnComments" && !composer.comments.trim()) continue;
      const actual = entryValue(entries, field);
      if (!actual.trim() && want.trim()) blockers.push(field);
    }
    if (dropTrip) {
      for (const key of DROP_ROUTE_SUBMIT_FIELDS) {
        const inForm = entries.some((e) => e.name.toLowerCase() === key.toLowerCase());
        if (!inForm) continue;
        if (!entryValue(entries, key).trim()) blockers.push(key);
      }
    }
    return blockers;
  }

  for (const key of SUBMIT_BLOCKER_FIELDS) {
    if (!composer.flicaResponse && key === "hdnFlicaResponse") continue;
    if (!hasComments && key === "hdnComments") continue;

    const inForm = entries.some((e) => e.name.toLowerCase() === key.toLowerCase());
    if (!inForm) continue;
    if (!entryValue(entries, key).trim()) blockers.push(key);
  }

  if (!composer.flicaResponse) {
    return blockers.filter((b) => b !== "hdnFlicaResponse" && b !== "hdnMessages");
  }

  return blockers;
}

function buildSummary(
  composer: TradeboardPostRequestComposerState,
  detected: TradeboardPostRequestFormParse["detected"],
): TradeboardPostRequestPayload["summary"] {
  const tradeTypeValue = resolveEffectiveTradeTypeCode(composer.requestType, detected);
  return {
    requestType: tradeTypeValue || composer.requestType,
    base: composer.base,
    equipment: composer.equipment,
    position: composer.position,
    comments: composer.comments,
    responseMethods: responseMethodLabels(composer),
    activities: composer.activities,
    deleteAfter: composer.deleteAfter,
  };
}

export type BuildTradeboardPostRequestPayloadOpts = {
  /** @deprecated Post Request activities come from FLICA selector, not schedule cache. */
  monthTrips?: CrewScheduleTrip[];
};

export function buildTradeboardPostRequestPayload(
  formParse: TradeboardPostRequestFormParse,
  composer: TradeboardPostRequestComposerState,
  opts?: BuildTradeboardPostRequestPayloadOpts,
): TradeboardPostRequestPayload {
  const form = formParse.primaryForm;
  const missingMappings = [...formParse.missingMappings];
  const warnings = [...formParse.warnings];

  const capturedSubmit = formParse.capturedSubmit ?? form?.capturedSubmit ?? null;

  if (!form) {
    return {
      actionUrl: "",
      method: "POST",
      capturedSubmit: null,
      body: "",
      fields: [],
      summary: buildSummary(composer, formParse.detected),
      mappedFields: [],
      blankCriticalFields: [...DROP_TRIP_ACTIVITY_CRITICAL_FIELDS],
      submitBlockers: [CAPTURED_FORM_ACTION_BLOCKER, ...SUBMIT_BLOCKER_FIELDS],
      submitBlocked: true,
      missingMappings: [...missingMappings, "No primary FLICA form — cannot build payload."],
      warnings,
      chromeParityDiffs: [],
      activitySource: undefined,
    };
  }

  const enrichedComposer = { ...composer, activities: composer.activities };

  const baseline = tradeboardPostRequestBaselineEntries(form);
  const activityParentRules = formParse.activityParentFieldRules ?? null;
  const applied = applyComposerToPayloadEntries(
    baseline,
    form,
    enrichedComposer,
    formParse.detected,
    activityParentRules,
  );

  const blankCriticalFields = computeBlankCriticalFields(
    applied.entries,
    criticalFieldsForComposer(enrichedComposer, {
      formFields: form.fields,
      activityParentRules,
      detected: formParse.detected,
    }),
  );
  const resolvedTradeType = resolveEffectiveTradeTypeCode(
    enrichedComposer.requestType,
    formParse.detected,
  );
  const submitBlockers = [
    ...computePostRequestPreviewBlockers(
      applied.entries,
      enrichedComposer,
      formParse.detected,
      resolvedTradeType,
    ),
    ...computeSubmitBlockers(
      applied.entries,
      enrichedComposer,
      formParse.detected,
      form.fields,
    ),
  ];
  const actionUrl = capturedSubmit?.actionResolved?.trim() || form.actionUrl?.trim() || "";
  if (!actionUrl && !submitBlockers.includes(CAPTURED_FORM_ACTION_BLOCKER)) {
    submitBlockers.push(CAPTURED_FORM_ACTION_BLOCKER);
  }
  const uniqueSubmitBlockers = [...new Set(submitBlockers)];

  const usp = new URLSearchParams();
  for (const { name, value } of applied.entries) {
    if (!name) continue;
    usp.append(name, value);
  }

  const submitMethod = capturedSubmit?.method ?? form.method ?? "POST";

  const formYear =
    entryValue(applied.entries, "Year") || entryValue(applied.entries, "Year1");
  const formMonth = entryValue(applied.entries, "Month");
  const rawActivity = enrichedComposer.activities[0] ?? null;
  const activity = rawActivity
    ? {
        ...rawActivity,
        dateYmd:
          resolveActivityDateYmd(rawActivity, {
            formYear,
            formMonthYyyyMm: formMonth,
          }) || rawActivity.dateYmd,
      }
    : null;
  const enrichedWithActivity = activity
    ? { ...enrichedComposer, activities: [activity] }
    : enrichedComposer;

  const chromeExpected = buildChromeExpectedFields(
    enrichedWithActivity,
    resolvedTradeType,
    activity,
    applied.entries,
  );
  const chromeParityDiffs = computeChromeParityDiffs(applied.entries, chromeExpected);
  const activitySource = activity
    ? {
        label: "FLICA activity selector",
        selectorUrl: activity.flicaSelectorUrl ?? "",
        flicaRowIndex: activity.flicaRowIndex ?? null,
      }
    : undefined;

  fcDevMirrorScheduleLogToFile("FC_TB_POST_PAYLOAD_CHROME_PARITY", {
    submitBlocked: uniqueSubmitBlockers.length > 0,
    submitBlockers: uniqueSubmitBlockers,
    chromeParityDiffCount: chromeParityDiffs.length,
    chromeParityDiffs: chromeParityDiffs.slice(0, 40),
    activitySource,
    pairing: activity ? `${activity.pairingId}:${activity.dateYmd}` : "",
  });

  if (__DEV__) {
    console.log("[FC_TB_POST_PAYLOAD_CHROME_PARITY]", JSON.stringify({
      diffs: chromeParityDiffs.length,
      activitySource,
    }));
  }

  return {
    actionUrl,
    method: submitMethod,
    capturedSubmit,
    body: usp.toString(),
    fields: applied.entries,
    summary: buildSummary(enrichedComposer, formParse.detected),
    mappedFields: applied.mappedFields,
    blankCriticalFields,
    submitBlockers: uniqueSubmitBlockers,
    submitBlocked: uniqueSubmitBlockers.length > 0,
    missingMappings,
    warnings,
    chromeParityDiffs,
    activitySource,
  };
}

export function dryRunTradeboardPostRequest(
  payload: TradeboardPostRequestPayload,
): TradeboardPostRequestDryRun {
  const dry: TradeboardPostRequestDryRun = { ...payload, mode: "dry_run" };

  const cap = dry.capturedSubmit;
  fcDevMirrorScheduleLogToFile(DRY_RUN_TAG, {
    actionUrl: dry.actionUrl,
    method: dry.method,
    realCapturedFormAction: cap?.actionResolved ?? dry.actionUrl,
    realSubmitButton: formatSubmitButtonLabel(cap?.submitButton ?? null),
    frameUrl: cap?.frameUrl ?? "",
    capturedMethod: cap?.method ?? dry.method,
    fieldCount: dry.fields.length,
    bodyLength: dry.body.length,
    summary: dry.summary,
    mappedCount: dry.mappedFields.length,
    mappedPreview: dry.mappedFields.slice(0, 40).map((m) => `${m.name}=${m.value.slice(0, 80)} (${m.source})`),
    blankCriticalFields: dry.blankCriticalFields,
    submitBlockers: dry.submitBlockers,
    submitBlocked: dry.submitBlocked,
    missingMappings: dry.missingMappings,
    chromeParityDiffCount: dry.chromeParityDiffs.length,
    chromeParityDiffs: dry.chromeParityDiffs.slice(0, 30),
  });

  if (__DEV__) {
    console.log(`[${DRY_RUN_TAG}]`, JSON.stringify({
      REAL_CAPTURED_FORM_ACTION: cap?.actionResolved ?? dry.actionUrl,
      REAL_SUBMIT_BUTTON: formatSubmitButtonLabel(cap?.submitButton ?? null),
      FRAME_URL: cap?.frameUrl ?? "",
      METHOD: cap?.method ?? dry.method,
      mappedCount: dry.mappedFields.length,
      blankCritical: dry.blankCriticalFields,
      submitBlockers: dry.submitBlockers,
    }));
  }

  return dry;
}

function classifySubmitHtml(html: string): TradeboardPostRequestSubmitResult["outcome"] {
  const lower = String(html ?? "").toLowerCase();
  if (
    flicaFetchNeedsWebVerification(detectFlicaHtmlState(html)) ||
    lower.includes("login") ||
    lower.includes("session expired")
  ) {
    return "session_expired";
  }
  if (lower.includes("duplicate") || lower.includes("already posted")) {
    return "duplicate";
  }
  if (
    lower.includes("error") ||
    lower.includes("invalid") ||
    lower.includes("must enter") ||
    lower.includes("required field")
  ) {
    return "validation_error";
  }
  if (
    lower.includes("my requests") ||
    lower.includes("request posted") ||
    lower.includes("successfully") ||
    lower.includes("your request")
  ) {
    return "success";
  }
  return "unknown";
}

export async function submitTradeboardPostRequest(
  payload: TradeboardPostRequestPayload,
  opts?: { referer?: string },
): Promise<TradeboardPostRequestSubmitResult> {
  if (!payload.actionUrl?.trim()) {
    return {
      ok: false,
      status: 0,
      htmlState: "too_short_or_unknown",
      outcome: "validation_error",
      message:
        "Cannot submit: real FLICA form action was not captured from the Post Request page. Refresh FLICA and open Post a Request again.",
      finalUrl: payload.capturedSubmit?.frameUrl ?? "",
    };
  }

  if (payload.submitBlocked) {
    return {
      ok: false,
      status: 0,
      htmlState: "too_short_or_unknown",
      outcome: "validation_error",
      message: `Cannot submit: required FLICA fields still blank (${payload.submitBlockers.join(", ")}).`,
      finalUrl: payload.actionUrl,
    };
  }

  const referer = opts?.referer?.trim() || payload.capturedSubmit?.frameUrl || payload.actionUrl;
  try {
    const res = await fetchFlicaHtmlUsingWebViewSession(payload.actionUrl, {
      method: "POST",
      body: payload.body,
      referer,
      contentType: "application/x-www-form-urlencoded",
    });
    const html = String(res.html ?? "");
    const htmlState = detectFlicaHtmlState(html);
    const outcome = classifySubmitHtml(html);
    const ok = outcome === "success" && res.status === 200 && htmlState === "ok";

    const message =
      outcome === "success"
        ? "Request submitted to FLICA."
        : outcome === "session_expired"
          ? "FLICA session expired. Refresh FLICA first, then try again."
          : outcome === "validation_error"
            ? "FLICA rejected the request. Check comments, activity, and response methods."
            : outcome === "duplicate"
              ? "FLICA reported a duplicate or conflicting request."
              : "FLICA submit finished with an unknown result — review preview fields.";

    const result: TradeboardPostRequestSubmitResult = {
      ok,
      status: res.status,
      htmlState,
      outcome,
      message,
      finalUrl: String(res.url ?? payload.actionUrl),
    };

    fcDevMirrorScheduleLogToFile(SUBMIT_TAG, {
      ok: result.ok,
      status: result.status,
      outcome: result.outcome,
      htmlState: result.htmlState,
      finalUrl: result.finalUrl,
      message: result.message,
      bodyLength: html.length,
    });

    if (__DEV__) {
      console.log(`[${SUBMIT_TAG}]`, JSON.stringify(result));
    }

    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const result: TradeboardPostRequestSubmitResult = {
      ok: false,
      status: 0,
      htmlState: "too_short_or_unknown",
      outcome: "unknown",
      message: msg,
      finalUrl: payload.actionUrl,
    };
    fcDevMirrorScheduleLogToFile(SUBMIT_TAG, { ok: false, error: msg });
    return result;
  }
}

export function buildTradeboardDeleteRequestPayload(
  formParse: TradeboardPostRequestFormParse,
  reqId: string,
  treq?: string,
): TradeboardPostRequestPayload {
  const composer: TradeboardPostRequestComposerState = {
    requestType: formParse.detected.selectedRequestType,
    base: formParse.detected.base,
    equipment: formParse.detected.equipment,
    position: formParse.detected.position,
    comments: formParse.detected.comments,
    flicaResponse: formParse.detected.flicaResponseChecked,
    emailResponse: formParse.detected.emailResponse,
    emailAddress: formParse.detected.emailAddress,
    phoneResponse: formParse.detected.phoneResponse,
    phoneNumber: formParse.detected.phoneNumber,
    deleteAfter: formParse.detected.deleteAfter,
    activities: [],
    reqId,
    treq,
  };
  const payload = buildTradeboardPostRequestPayload(formParse, composer);
  const entries = payload.fields.map((e) =>
    e.name.toLowerCase() === "hdndeleting" ? { ...e, value: "1" } : e,
  );
  const usp = new URLSearchParams();
  for (const { name, value } of entries) {
    if (!name) continue;
    usp.append(name, value);
  }
  return {
    ...payload,
    fields: entries,
    body: usp.toString(),
    submitBlocked: false,
    submitBlockers: [],
  };
}

export function dryRunTradeboardDeleteRequest(payload: TradeboardPostRequestPayload): void {
  fcDevMirrorScheduleLogToFile(DELETE_DRY_TAG, {
    actionUrl: payload.actionUrl,
    method: payload.method,
    reqId: payload.fields.find((f) => f.name.toLowerCase() === "reqid")?.value,
    hdnDeleting: payload.fields.find((f) => f.name.toLowerCase() === "hdndeleting")?.value,
    fieldCount: payload.fields.length,
  });
  if (__DEV__) {
    console.log(`[${DELETE_DRY_TAG}]`, JSON.stringify({ actionUrl: payload.actionUrl }));
  }
}

export async function submitTradeboardDeleteRequest(
  payload: TradeboardPostRequestPayload,
  opts?: { referer?: string },
): Promise<TradeboardPostRequestSubmitResult> {
  dryRunTradeboardDeleteRequest(payload);
  const result = await submitTradeboardPostRequest(payload, opts);
  fcDevMirrorScheduleLogToFile(DELETE_RESULT_TAG, {
    ok: result.ok,
    outcome: result.outcome,
    message: result.message,
  });
  if (__DEV__) {
    console.log(`[${DELETE_RESULT_TAG}]`, JSON.stringify(result));
  }
  return result;
}
