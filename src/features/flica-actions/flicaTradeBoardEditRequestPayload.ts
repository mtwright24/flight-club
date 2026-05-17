/**
 * TradeBoard Edit Request — build POST payload and submit to TB_EditRequest.cgi.
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import {
  detectFlicaHtmlState,
  fetchFlicaHtmlUsingWebViewSession,
} from "./flicaActionsHttp";
import { tradeboardPostRequestBaselineEntries } from "./flicaTradeBoardPostRequestForm";
import { CAPTURED_FORM_ACTION_BLOCKER } from "./flicaTradeBoardPostRequestCapturedForm";
import { replaceScalarPayloadField } from "./flicaTradeBoardPostRequestChromeParity";
import {
  entryValue,
  resolveActivityDateYmd,
  resolveEffectiveTradeTypeCode,
} from "./flicaTradeBoardPostRequestFieldMap";
import { deleteAfterYmdFromMonthDay } from "./flicaTradeBoardEditRequestDetect";
import { tradeboardEditRequestUrl } from "./flicaTradeBoardMyRequestsActions";
import type {
  TradeboardPostRequestComposerState,
  TradeboardPostRequestDryRun,
  TradeboardPostRequestFormParse,
  TradeboardPostRequestPayload,
  TradeboardPostRequestSubmitResult,
} from "./flicaTradeBoardPostRequestTypes";

const PREVIEW_TAG = "FC_TB_EDIT_REQUEST_PREVIEW";
const SUBMIT_TAG = "FC_TB_EDIT_REQUEST_SUBMIT";

function compactPosForHdn(raw: string, baselinePos: string): string {
  const b = baselinePos.trim();
  if (b) return b;
  const u = raw.trim().toUpperCase();
  if (u === "FA" || u.includes("FLIGHT ATTENDANT")) return "A";
  if (u === "FO" || u === "CA") return u.charAt(0);
  return u.length <= 2 ? u : "A";
}

function escapeFlicaComment(value: string): string {
  const t = value.trim();
  if (!t) return "";
  if (/^[\.\*\+\?\^\$\[\]\(\)\|\\]/.test(t.charAt(0))) return t;
  if (/[<>&]/.test(t)) return `.${t}`;
  return t;
}

function computeEditSubmitBlockers(
  composer: TradeboardPostRequestComposerState,
): string[] {
  const blockers: string[] = [];
  const hasResponse =
    composer.flicaResponse || composer.emailResponse || composer.phoneResponse;
  if (!hasResponse) {
    blockers.push("response method (select FLICA, Email, or Phone)");
  }
  if (!composer.activities.length) {
    blockers.push("activity (select a pairing via Add Activity)");
  }
  if (!composer.reqId?.trim()) {
    blockers.push("reqId (missing edit request id)");
  }
  return blockers;
}

export type BuildTradeboardEditRequestPayloadOpts = {
  deleteAfterMonthYyyyMm?: string;
  deleteAfterDay?: string;
  submitMethodAllowPickupWithoutApproval?: boolean;
  submitMethodWaitForApproval?: boolean;
};

export function buildTradeboardEditRequestPayload(
  formParse: TradeboardPostRequestFormParse,
  composer: TradeboardPostRequestComposerState,
  opts?: BuildTradeboardEditRequestPayloadOpts,
): TradeboardPostRequestPayload {
  const form = formParse.primaryForm;
  const warnings = [...formParse.warnings];
  const missingMappings = [...formParse.missingMappings];

  if (!form) {
    return {
      actionUrl: "",
      method: "POST",
      capturedSubmit: null,
      body: "",
      fields: [],
      summary: {
        requestType: composer.requestType,
        base: composer.base,
        equipment: composer.equipment,
        position: composer.position,
        comments: composer.comments,
        responseMethods: [],
        activities: composer.activities,
        deleteAfter: composer.deleteAfter,
      },
      mappedFields: [],
      blankCriticalFields: [],
      submitBlockers: [CAPTURED_FORM_ACTION_BLOCKER, "No edit form"],
      submitBlocked: true,
      missingMappings,
      warnings,
      chromeParityDiffs: [],
    };
  }

  const reqId = String(composer.reqId ?? "").trim();
  const actionUrl = reqId
    ? tradeboardEditRequestUrl(reqId)
    : formParse.capturedSubmit?.actionResolved?.trim() || form.actionUrl;

  let entries = tradeboardPostRequestBaselineEntries(form);
  const formYear = entryValue(entries, "Year") || entryValue(entries, "Year1");
  const formMonth = entryValue(entries, "Month");
  const activity = composer.activities[0];
  const deleteMonth =
    opts?.deleteAfterMonthYyyyMm?.trim() ||
    formParse.detected.selectedDeleteMonthYyyyMm?.trim() ||
    "";
  const deleteDay =
    opts?.deleteAfterDay?.trim() || formParse.detected.selectedDeleteDay?.trim() || "";
  const deleteYmd = deleteAfterYmdFromMonthDay(deleteMonth, deleteDay);

  const ymd = activity
    ? resolveActivityDateYmd(activity, { formYear, formMonthYyyyMm: formMonth })
    : "";
  const pairingId = activity?.pairingId.trim().toUpperCase() ?? "";
  const pairStr = ymd && pairingId ? `${pairingId}:${ymd}` : "";
  const lateDepDate = deleteYmd || ymd || entryValue(entries, "hdnLateDepDate");
  const tradeType = resolveEffectiveTradeTypeCode(composer.requestType, formParse.detected);
  const splitStr =
    entryValue(entries, "hdnSplitStr") ||
    entryValue(entries, "hdnSplitString") ||
    "";

  const hdnPos = compactPosForHdn(
    composer.position,
    entryValue(entries, "hdnPos"),
  );
  const comments = escapeFlicaComment(composer.comments);

  const overrides: Record<string, string> = {
    TradeType: tradeType,
    hdnType: tradeType,
    hdnAction: "3",
    hdnComments: comments,
    hdnMessages: composer.flicaResponse ? "true" : "false",
    hdnEmail: composer.emailResponse ? composer.emailAddress.trim() : "",
    hdnPhone: composer.phoneResponse ? composer.phoneNumber.trim() : "",
    hdnBase: composer.base.trim().toUpperCase() || "JFK",
    hdnAutoSubmit: "true",
    hdnEqp: composer.equipment.trim().toUpperCase() || "ALL",
    hdnPos,
    hdnExtraPos: "_",
    hdnResPairStr: pairStr,
    hdnSplitStr: splitStr,
    hdnPairingString: pairStr,
    hdnLateDepDate: lateDepDate,
    hdnSubmit: "submitting",
  };

  if (deleteMonth) {
    overrides.Month = deleteMonth;
  }
  if (deleteDay) {
    overrides.Day = deleteDay;
  }
  if (formParse.detected.submitMethodFieldsPresent) {
    const allowPickup = opts?.submitMethodAllowPickupWithoutApproval ?? false;
    const waitApproval = opts?.submitMethodWaitForApproval ?? false;
    overrides.hdnPickup = allowPickup ? "1" : "0";
    overrides.hdnWait = waitApproval ? "1" : "0";
  }

  if (composer.emailResponse) {
    overrides.cbemail = "Y";
    overrides.rEMail = "Y";
    overrides.email = composer.emailAddress.trim();
  }
  if (composer.phoneResponse) {
    overrides.cbphone = "Y";
    overrides.rPhone = "Y";
    overrides.Phone = composer.phoneNumber.trim();
  }
  if (composer.flicaResponse) {
    overrides.hdnFlicaResponse = "true";
    overrides.cbMessages = "Y";
  }
  if (composer.deleteAfter?.trim()) {
    overrides.Year = composer.deleteAfter;
    overrides.Year1 = composer.deleteAfter;
  }
  if (reqId) {
    overrides.reqId = reqId;
  }
  if (composer.treq?.trim()) {
    overrides.treq = composer.treq.trim();
  }

  for (const [name, value] of Object.entries(overrides)) {
    entries = replaceScalarPayloadField(entries, name, value);
  }

  const submitBlockers = [
    ...computeEditSubmitBlockers(composer),
    ...(actionUrl ? [] : [CAPTURED_FORM_ACTION_BLOCKER]),
  ];
  if (!tradeType) {
    submitBlockers.push("TradeType (read-only type missing from form)");
  }

  const usp = new URLSearchParams();
  for (const { name, value } of entries) {
    if (!name) continue;
    usp.append(name, value);
  }

  const payload: TradeboardPostRequestPayload = {
    actionUrl,
    method: "POST",
    capturedSubmit: formParse.capturedSubmit,
    body: usp.toString(),
    fields: entries,
    summary: {
      requestType: tradeType || composer.requestType,
      base: composer.base,
      equipment: composer.equipment,
      position: composer.position,
      comments: composer.comments,
      responseMethods: [
        ...(composer.flicaResponse ? ["FLICA Response"] : []),
        ...(composer.emailResponse ? ["Email"] : []),
        ...(composer.phoneResponse ? ["Phone"] : []),
      ],
      activities: composer.activities,
      deleteAfter: composer.deleteAfter,
    },
    mappedFields: Object.entries(overrides).map(([name, value]) => ({
      name,
      value,
      source: "edit:override",
    })),
    blankCriticalFields: [],
    submitBlockers: [...new Set(submitBlockers)],
    submitBlocked: submitBlockers.length > 0,
    missingMappings,
    warnings,
    chromeParityDiffs: [],
  };

  return payload;
}

export function dryRunTradeboardEditRequest(
  payload: TradeboardPostRequestPayload,
): TradeboardPostRequestDryRun {
  const dry: TradeboardPostRequestDryRun = { ...payload, mode: "dry_run" };
  fcDevMirrorScheduleLogToFile(PREVIEW_TAG, {
    actionUrl: dry.actionUrl,
    method: dry.method,
    fieldCount: dry.fields.length,
    submitBlocked: dry.submitBlocked,
    submitBlockers: dry.submitBlockers,
    previewFields: dry.fields
      .filter((f) => /^hdn|TradeType|Comment|reqId/i.test(f.name))
      .slice(0, 40)
      .map((f) => `${f.name}=${f.value.slice(0, 80)}`),
  });
  if (__DEV__) {
    console.log(`[${PREVIEW_TAG}]`, JSON.stringify({ actionUrl: dry.actionUrl }));
  }
  return dry;
}

export async function submitTradeboardEditRequest(
  payload: TradeboardPostRequestPayload,
  opts?: { referer?: string },
): Promise<TradeboardPostRequestSubmitResult> {
  dryRunTradeboardEditRequest(payload);
  try {
    const res = await fetchFlicaHtmlUsingWebViewSession(payload.actionUrl, {
      method: "POST",
      body: payload.body,
      contentType: "application/x-www-form-urlencoded",
      referer: opts?.referer,
    });
    const html = String(res.html ?? "");
    const htmlState = detectFlicaHtmlState(html);
    const ok = res.status === 200 && htmlState === "ok";
    const outcome = ok ? "success" : htmlState === "login" ? "session_expired" : "unknown";
    const result: TradeboardPostRequestSubmitResult = {
      ok,
      status: res.status,
      htmlState,
      outcome,
      message: ok
        ? "Request updated on TradeBoard."
        : "FLICA did not confirm the update — refresh My Requests and try again.",
      finalUrl: String(res.url ?? payload.actionUrl),
    };
    fcDevMirrorScheduleLogToFile(SUBMIT_TAG, result);
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
