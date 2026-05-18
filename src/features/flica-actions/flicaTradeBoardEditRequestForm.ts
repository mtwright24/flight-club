/**
 * TradeBoard Edit Request — parse TB_EditRequest.cgi HTML (editForm).
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import { detectFlicaHtmlState } from "./flicaActionsHttp";
import { resolveFlicaAbsoluteUrl } from "./flicaTradeBoardAllRequestsForm";
import {
  buildPostRequestFieldCatalog,
  logPostRequestFieldCatalog,
} from "./flicaTradeBoardPostRequestFieldMap";
import {
  applyCapturedSubmitToFormModel,
  capturedSubmitFromParsedForm,
  type TbPostRequestCapturedFormWire,
} from "./flicaTradeBoardPostRequestCapturedForm";
import {
  buildActivityParentFieldRules,
  extractTbPostRequestActivityScriptBodies,
  truncateForActivityScriptLog,
} from "./flicaTradeBoardPostRequestActivityScript";
import { extractFormFields } from "./flicaTradeBoardPostRequestForm";
import {
  detectEditRequestFields,
  extractEditFormFieldsAll,
} from "./flicaTradeBoardEditRequestDetect";
import { editRequestHtmlHasFormMarkers } from "./flicaTradeBoardEditRequestWebViewCaptureBridge";
import type {
  TradeboardPostRequestActivity,
  TradeboardPostRequestFormModel,
  TradeboardPostRequestFormParse,
} from "./flicaTradeBoardPostRequestTypes";

const LOG_TAG = "FC_TB_EDIT_REQUEST_PARSE";
const FETCH_LOG = "FC_TB_EDIT_REQUEST_FETCH";
const PARSE_MISSING_LOG = "FC_TB_EDIT_REQUEST_PARSE_MISSING_FORM";
const PARSE_SUCCESS_LOG = "FC_TB_EDIT_REQUEST_PARSE_SUCCESS";

export function tradeboardEditFormParseIsReady(
  parse: TradeboardPostRequestFormParse | null | undefined,
): boolean {
  return Boolean(parse?.ok && parse.primaryForm && parse.primaryForm.fields.length > 0);
}

function getAttr(tag: string, attr: string): string {
  const a = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const d = new RegExp(`\\b${a}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
  if (d) return d[1] ?? "";
  const s = new RegExp(`\\b${a}\\s*=\\s*'([^']*)'`, "i").exec(tag);
  if (s) return s[1] ?? "";
  const u = new RegExp(`\\b${a}\\s*=\\s*([^\\s>"']+)`, "i").exec(tag);
  return u?.[1] ?? "";
}

function fieldsIncludeName(
  fields: { name: string }[],
  name: string,
): boolean {
  const n = name.toLowerCase();
  return fields.some((f) => f.name.toLowerCase() === n);
}

function findTradeBoardEditRequestForm(
  html: string,
  documentUrl?: string,
): { form: TradeboardPostRequestFormModel; index: number } | null {
  const h = String(html ?? "");
  const frameUrl = String(documentUrl ?? "").trim();
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let best: { form: TradeboardPostRequestFormModel; index: number; score: number } | null =
    null;
  let m: RegExpExecArray | null;
  let index = 0;
  while ((m = formRe.exec(h)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    const nameAttr = getAttr(attrs ?? "", "name").toLowerCase();
    const actionRaw = getAttr(attrs ?? "", "action");
    const actionAbs = resolveFlicaAbsoluteUrl(actionRaw, frameUrl);
    const innerL = inner.toLowerCase();
    const actL = actionAbs.toLowerCase();
    let score = 0;
    if (nameAttr === "editform") score += 200;
    if (actL.includes("tb_editrequest") || actL.includes("editrequest")) score += 180;
    if (innerL.includes("hdnaction")) score += 60;
    if (innerL.includes("hdnrespairstr") || innerL.includes("hdnpairingstring")) score += 50;
    if (innerL.includes("commentfield")) score += 40;
    if (innerL.includes("cbmessages")) score += 30;
    score += Math.min(20, Math.floor(inner.length / 4000));
    if (score > 0 && (!best || score > best.score)) {
      const methodRaw = (getAttr(attrs ?? "", "method") || "POST").toUpperCase();
      const fields = extractEditFormFieldsAll(inner);
      best = {
        index,
        score,
        form: {
          index,
          actionRaw,
          actionUrl: actionAbs,
          frameUrl,
          method: methodRaw === "GET" ? "GET" : "POST",
          fields,
          hiddenFields: fields
            .filter((f) => f.type === "hidden")
            .map((f) => ({ name: f.name, value: f.value })),
          capturedSubmit: null,
        },
      };
    }
    index += 1;
  }
  return best ? { form: best.form, index: best.index } : null;
}

function pairingActivityFromColonStr(pairStr: string): TradeboardPostRequestActivity | null {
  const colon8 = /^([A-Z0-9]+):(\d{8})$/i.exec(pairStr.trim());
  if (colon8) {
    const pairingId = colon8[1]!.toUpperCase();
    const dateYmd = colon8[2]!;
    const dd = String(parseInt(dateYmd.slice(6, 8), 10));
    const mon = dateYmd.slice(4, 6);
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const dateLabel = `${dd}${months[parseInt(mon, 10) - 1] ?? "JAN"}`;
    return {
      pairingId,
      dateYmd,
      dateLabel,
      sourceType: "flica_selector",
      displayLabel: `${pairingId}:${dateLabel}`,
    };
  }
  const colonLbl = /^([A-Z0-9]+):(\d{1,2}[A-Z]{3})$/i.exec(pairStr.trim().toUpperCase());
  if (colonLbl) {
    return {
      pairingId: colonLbl[1]!.toUpperCase(),
      dateYmd: "",
      dateLabel: colonLbl[2]!.toUpperCase(),
      sourceType: "flica_selector",
      displayLabel: `${colonLbl[1]}:${colonLbl[2]}`,
    };
  }
  return null;
}

export function activityFromEditFormFields(
  fields: TradeboardPostRequestFormModel["fields"],
): TradeboardPostRequestActivity | null {
  const names = ["hdnResPairStr", "hdnPairingString", "hdnPairStr"];
  for (const n of names) {
    const hit = fields.find((f) => f.name.toLowerCase() === n.toLowerCase());
    if (hit?.value?.trim()) {
      const act = pairingActivityFromColonStr(hit.value);
      if (act) return act;
    }
  }
  return null;
}

export function activityFromEditFormHtml(
  html: string,
  fields: TradeboardPostRequestFormModel["fields"],
): TradeboardPostRequestActivity | null {
  const fromHidden = activityFromEditFormFields(fields);
  if (fromHidden) return fromHidden;

  const h = String(html ?? "");
  const resBlock =
    /(?:id|name)\s*=\s*["']resAdded["'][^>]*>([\s\S]*?)<\//i.exec(h) ??
    /resAdded[\s\S]{0,120}?>([\s\S]*?)<\//i.exec(h);
  if (resBlock?.[1]) {
    const text = resBlock[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const act = pairingActivityFromColonStr(text);
    if (act) return act;
  }

  const pairInScript = /GetActivityString\s*\(\s*\)[\s\S]{0,200}?['"]([A-Z0-9]+:\d{8})['"]/i.exec(h);
  if (pairInScript?.[1]) {
    return pairingActivityFromColonStr(pairInScript[1]);
  }

  return null;
}

export function logEditRequestParseMissingForm(meta: Record<string, unknown>): void {
  fcDevMirrorScheduleLogToFile(PARSE_MISSING_LOG, meta);
  if (__DEV__) {
    console.log(`[${PARSE_MISSING_LOG}]`, JSON.stringify(meta));
  }
}

export function logEditRequestParseSuccess(meta: Record<string, unknown>): void {
  fcDevMirrorScheduleLogToFile(PARSE_SUCCESS_LOG, meta);
  if (__DEV__) {
    console.log(`[${PARSE_SUCCESS_LOG}]`, JSON.stringify(meta));
  }
}

export function logEditRequestNativeResult(meta: Record<string, unknown>): void {
  fcDevMirrorScheduleLogToFile("FC_TB_EDIT_REQUEST_NATIVE_RESULT", meta);
  if (__DEV__) {
    console.log("[FC_TB_EDIT_REQUEST_NATIVE_RESULT]", JSON.stringify(meta));
  }
}

export function parseTradeboardEditRequestFormFromHtml(
  html: string,
  meta: {
    requestedUrl: string;
    finalUrl: string;
    reqId: string;
    htmlSource?: "native" | "webview";
  },
): TradeboardPostRequestFormParse {
  const safeHtml = String(html ?? "");
  const frameUrl = String(meta.finalUrl ?? meta.requestedUrl ?? "").trim();
  const htmlState = detectFlicaHtmlState(safeHtml);
  const warnings: string[] = [];
  const missingMappings: string[] = [];

  const forms: TradeboardPostRequestFormModel[] = [];
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = formRe.exec(safeHtml)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    const actionRaw = getAttr(attrs ?? "", "action");
    const methodRaw = (getAttr(attrs ?? "", "method") || "POST").toUpperCase();
    const fields = extractEditFormFieldsAll(inner);
    forms.push({
      index: idx,
      actionRaw,
      actionUrl: resolveFlicaAbsoluteUrl(actionRaw, frameUrl),
      frameUrl,
      method: methodRaw === "GET" ? "GET" : "POST",
      fields,
      hiddenFields: fields
        .filter((f) => f.type === "hidden")
        .map((f) => ({ name: f.name, value: f.value })),
      capturedSubmit: null,
    });
    idx += 1;
  }

  const picked = findTradeBoardEditRequestForm(safeHtml, frameUrl);
  let primaryForm = picked?.form ?? forms[0] ?? null;

  const hasEditFormMarker =
    editRequestHtmlHasFormMarkers(safeHtml) ||
    (primaryForm != null && fieldsIncludeName(primaryForm.fields, "CommentField"));

  if (!primaryForm || safeHtml.length === 0 || !hasEditFormMarker) {
    logEditRequestParseMissingForm({
      reqId: meta.reqId,
      htmlLength: safeHtml.length,
      htmlSource: meta.htmlSource ?? "native",
      htmlState,
      hasPrimaryForm: Boolean(primaryForm),
      hasEditFormMarker,
      formsCount: forms.length,
    });
  }

  let capturedSubmit: TradeboardPostRequestFormParse["capturedSubmit"] = null;
  if (primaryForm) {
    capturedSubmit = capturedSubmitFromParsedForm(primaryForm, frameUrl, "html_parse");
    if (capturedSubmit) {
      primaryForm = applyCapturedSubmitToFormModel(primaryForm, capturedSubmit);
      capturedSubmit = primaryForm.capturedSubmit;
    }
  }

  const reqId = meta.reqId.trim();
  const submitAction = reqId
    ? resolveFlicaAbsoluteUrl(`TB_EditRequest.cgi?reqId=${encodeURIComponent(reqId)}`, frameUrl)
    : primaryForm?.actionUrl ?? "";

  if (primaryForm && submitAction) {
    primaryForm = {
      ...primaryForm,
      actionUrl: submitAction,
    };
    if (capturedSubmit) {
      capturedSubmit = {
        ...capturedSubmit,
        actionResolved: submitAction,
        actionRaw: `TB_EditRequest.cgi?reqId=${reqId}`,
      };
    }
  }

  if (!capturedSubmit?.actionResolved?.trim()) {
    warnings.push("Edit form action URL was not captured — submit is blocked.");
    missingMappings.push("Captured edit form action missing.");
  }

  const baseDetected = {
    requestTypes: [] as TradeboardPostRequestFormParse["detected"]["requestTypes"],
    selectedRequestType: "",
    base: "",
    equipment: "",
    position: "",
    comments: "",
    flicaResponseRequired: true,
    flicaResponseChecked: true,
    emailResponse: false,
    emailAddress: "",
    phoneResponse: false,
    phoneNumber: "",
    deleteAfter: "",
    addActivityUrl: "",
    addActivityLabel: "Click here to add activity",
    pairingFieldNames: [],
  };
  const selectedActivity =
    activityFromEditFormHtml(safeHtml, primaryForm?.fields ?? []) ??
    activityFromEditFormFields(primaryForm?.fields ?? []) ??
    undefined;

  const detected = {
    ...detectEditRequestFields(primaryForm?.fields ?? [], safeHtml, baseDetected),
    selectedActivity,
  };
  const activityScriptBodies = extractTbPostRequestActivityScriptBodies(safeHtml);
  const activityParentFieldRules = buildActivityParentFieldRules(activityScriptBodies);

  if (!primaryForm) {
    warnings.push("No editForm found in TB_EditRequest HTML.");
  }
  if (!fieldsIncludeName(primaryForm?.fields ?? [], "CommentField")) {
    missingMappings.push("CommentField not found on edit form.");
  }

  const ok =
    htmlState === "ok" &&
    safeHtml.length > 400 &&
    primaryForm != null &&
    primaryForm.fields.length > 0 &&
    hasEditFormMarker;

  const result: TradeboardPostRequestFormParse = {
    ok,
    requestedUrl: meta.requestedUrl,
    finalUrl: meta.finalUrl,
    htmlLength: safeHtml.length,
    htmlState,
    forms,
    primaryForm,
    capturedSubmit,
    detected,
    warnings,
    missingMappings,
    activityScriptBodies,
    activityParentFieldRules,
  };

  if (primaryForm) {
    logPostRequestFieldCatalog(buildPostRequestFieldCatalog(primaryForm));
  }

  fcDevMirrorScheduleLogToFile(LOG_TAG, {
    ok: result.ok,
    reqId,
    htmlLength: result.htmlLength,
    primaryAction: primaryForm?.actionUrl ?? "",
    selectedRequestType: detected.selectedRequestType,
    requestTypeDisplayLabel: detected.requestTypeDisplayLabel,
    selectedDeleteDay: detected.selectedDeleteDay,
    selectedDeleteMonthYyyyMm: detected.selectedDeleteMonthYyyyMm,
    warnings,
    missingMappings,
  });

  if (ok) {
    logEditRequestParseSuccess({
      reqId,
      htmlLength: result.htmlLength,
      htmlSource: meta.htmlSource ?? "native",
      primaryAction: primaryForm?.actionUrl ?? "",
      fieldCount: primaryForm?.fields.length ?? 0,
    });
  }

  if (__DEV__) {
    console.log(`[${LOG_TAG}]`, JSON.stringify({ ok: result.ok, reqId }));
  }

  return result;
}

export function logEditRequestFetch(meta: Record<string, unknown>): void {
  fcDevMirrorScheduleLogToFile(FETCH_LOG, meta);
  if (__DEV__) {
    console.log(`[${FETCH_LOG}]`, JSON.stringify(meta));
  }
}
