/**
 * TradeBoard Post Request — parse tb_postrequest.cgi HTML into structured form models.
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import { detectFlicaHtmlState } from "./flicaActionsHttp";
import {
  extractHiddenFieldsFromHtml,
  resolveFlicaAbsoluteUrl,
} from "./flicaTradeBoardAllRequestsForm";
import {
  applyCapturedSubmitToFormModel,
  capturedSubmitFromParsedForm,
  type TbPostRequestCapturedFormWire,
  wireToCapturedSubmit,
} from "./flicaTradeBoardPostRequestCapturedForm";
import {
  buildActivityParentFieldRules,
  extractTbPostRequestActivityScriptBodies,
  truncateForActivityScriptLog,
} from "./flicaTradeBoardPostRequestActivityScript";
import {
  buildPostRequestFieldCatalog,
  logPostRequestFieldCatalog,
  resolveOptionTradeCode,
} from "./flicaTradeBoardPostRequestFieldMap";
import type {
  TradeboardPostRequestDetectedFields,
  TradeboardPostRequestFormField,
  TradeboardPostRequestFormFieldKind,
  TradeboardPostRequestFormModel,
  TradeboardPostRequestFormParse,
  TradeboardPostRequestSelectOption,
} from "./flicaTradeBoardPostRequestTypes";

const LOG_TAG = "FC_TB_POST_FORM_PARSE";

function getAttr(tag: string, attr: string): string {
  const a = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const d = new RegExp(`\\b${a}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
  if (d) return d[1] ?? "";
  const s = new RegExp(`\\b${a}\\s*=\\s*'([^']*)'`, "i").exec(tag);
  if (s) return s[1] ?? "";
  const u = new RegExp(`\\b${a}\\s*=\\s*([^\\s>"']+)`, "i").exec(tag);
  return u?.[1] ?? "";
}

function hasAttr(tag: string, attr: string): boolean {
  return new RegExp(`\\b${attr}\\b`, "i").test(tag);
}

function collapseWs(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function stripTags(s: string): string {
  return collapseWs(String(s ?? "").replace(/<[^>]+>/g, " "));
}

function parseSelectOptions(block: string): TradeboardPostRequestSelectOption[] {
  const out: TradeboardPostRequestSelectOption[] = [];
  const optRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  let om: RegExpExecArray | null;
  while ((om = optRe.exec(block)) !== null) {
    const oa = om[1];
    const label = stripTags(om[2] ?? "");
    const value = getAttr(oa, "value") || label;
    out.push({
      value,
      label: label || value,
      selected: hasAttr(oa, "selected"),
    });
  }
  return out;
}

function fieldValueByName(
  fields: TradeboardPostRequestFormField[],
  names: string[],
): string {
  const want = new Set(names.map((n) => n.toLowerCase()));
  for (const f of fields) {
    if (want.has(f.name.toLowerCase())) {
      if (f.type === "checkbox" || f.type === "radio") {
        return f.checked ? f.value || "Y" : "";
      }
      return f.value;
    }
  }
  return "";
}

function isChecked(fields: TradeboardPostRequestFormField[], names: string[]): boolean {
  const want = new Set(names.map((n) => n.toLowerCase()));
  for (const f of fields) {
    if (!want.has(f.name.toLowerCase())) continue;
    if (f.type === "checkbox" || f.type === "radio") return Boolean(f.checked);
  }
  return false;
}

export function extractFormFields(formInner: string): TradeboardPostRequestFormField[] {
  const fields: TradeboardPostRequestFormField[] = [];
  const inner = String(formInner ?? "");
  let pos = 0;

  while (pos < inner.length) {
    const low = inner.toLowerCase();
    const iIn = low.indexOf("<input", pos);
    const iTa = low.indexOf("<textarea", pos);
    const iSel = low.indexOf("<select", pos);
    const next = [iIn, iTa, iSel].filter((x) => x >= 0);
    if (!next.length) break;
    const iMin = Math.min(...next);

    if (iMin === iIn && iIn >= 0) {
      const gt = inner.indexOf(">", iIn);
      if (gt < 0) break;
      const tag = inner.slice(iIn, gt + 1);
      pos = gt + 1;
      const typeRaw = (getAttr(tag, "type") || "text").toLowerCase();
      const name = getAttr(tag, "name");
      if (!name || hasAttr(tag, "disabled")) continue;
      const value = getAttr(tag, "value");
      const kind: TradeboardPostRequestFormFieldKind =
        typeRaw === "hidden"
          ? "hidden"
          : typeRaw === "checkbox"
            ? "checkbox"
            : typeRaw === "radio"
              ? "radio"
              : typeRaw === "submit" || typeRaw === "image"
                ? "submit"
                : typeRaw === "button"
                  ? "button"
                  : "text";
      fields.push({
        name,
        value,
        type: kind,
        checked:
          kind === "checkbox" || kind === "radio" ? hasAttr(tag, "checked") : undefined,
        disabled: hasAttr(tag, "disabled"),
      });
      continue;
    }

    if (iMin === iTa && iTa >= 0) {
      const close = low.indexOf("</textarea", iTa);
      if (close < 0) break;
      const openEnd = inner.indexOf(">", iTa);
      const openTag = openEnd > 0 ? inner.slice(iTa, openEnd + 1) : "";
      const body = inner.slice(openEnd + 1, close);
      pos = close + 11;
      const name = getAttr(openTag, "name");
      if (!name || hasAttr(openTag, "disabled")) continue;
      fields.push({
        name,
        value: stripTags(body),
        type: "textarea",
        disabled: hasAttr(openTag, "disabled"),
      });
      continue;
    }

    if (iMin === iSel && iSel >= 0) {
      const close = low.indexOf("</select", iSel);
      if (close < 0) break;
      const endGt = inner.indexOf(">", close);
      if (endGt < 0) break;
      const block = inner.slice(iSel, endGt + 1);
      pos = endGt + 1;
      const openEnd = inner.indexOf(">", iSel);
      const openTag = openEnd > 0 ? inner.slice(iSel, openEnd + 1) : "";
      const name = getAttr(openTag, "name");
      if (!name || hasAttr(openTag, "disabled")) continue;
      const options = parseSelectOptions(block);
      const selected = options.find((o) => o.selected) ?? options[0];
      fields.push({
        name,
        value: selected?.value ?? "",
        type: "select",
        options,
        disabled: hasAttr(openTag, "disabled"),
      });
      continue;
    }

    break;
  }

  return fields;
}

export function findTradeBoardPostRequestForm(
  html: string,
  documentUrl: string,
): {
  form: TradeboardPostRequestFormModel;
  index: number;
} | null {
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
    const actionRaw = getAttr(attrs, "action");
    const actionAbs = resolveFlicaAbsoluteUrl(actionRaw, frameUrl);
    const innerL = inner.toLowerCase();
    const actL = actionAbs.toLowerCase();
    let score = 0;
    if (actL.includes("tb_postrequest") || actL.includes("postrequest")) score += 150;
    if (innerL.includes("tradetype")) score += 80;
    if (innerL.includes("commentfield")) score += 60;
    if (innerL.includes("selbase")) score += 40;
    if (innerL.includes("cbmessages") || innerL.includes("rflica")) score += 30;
    if (innerL.includes("rempairindex") || innerL.includes("pairdate")) score += 25;
    score += Math.min(30, Math.floor(inner.length / 3000));
    if (score > 0 && (!best || score > best.score)) {
      const methodRaw = (getAttr(attrs, "method") || "POST").toUpperCase();
      const fields = extractFormFields(inner);
      const hiddenFields = fields
        .filter((f) => f.type === "hidden")
        .map((f) => ({ name: f.name, value: f.value }));
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
          hiddenFields,
          capturedSubmit: null,
        },
      };
    }
    index += 1;
  }
  return best ? { form: best.form, index: best.index } : null;
}

function findAddActivityLink(html: string): { url: string; label: string } {
  const h = String(html ?? "");
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  let best = { url: "", label: "", score: 0 };
  while ((m = anchorRe.exec(h)) !== null) {
    const attrs = m[1];
    const label = stripTags(m[2] ?? "");
    const href = resolveFlicaAbsoluteUrl(getAttr(attrs, "href"));
    const onclick = getAttr(attrs, "onclick");
    const hay = `${href} ${onclick} ${label}`.toLowerCase();
    let score = 0;
    if (hay.includes("add activity") || hay.includes("addactivity")) score += 80;
    if (hay.includes("ottrade") || hay.includes("bfromtb")) score += 60;
    if (hay.includes("add pair") || hay.includes("select trip")) score += 40;
    if (score > best.score) {
      best = { url: href || resolveFlicaAbsoluteUrl(onclick), label: label || "Add Activity", score };
    }
  }
  return { url: best.url, label: best.label || "Add Activity" };
}

export function detectFieldsFromForm(
  form: TradeboardPostRequestFormModel | null,
  html: string,
): TradeboardPostRequestDetectedFields {
  const fields = form?.fields ?? [];
  const tradeTypeField = fields.find((f) => f.name.toLowerCase() === "tradetype");
  const requestTypes = tradeTypeField?.options ?? [];
  let selectedRequestType = "";
  const fieldValueCode = resolveOptionTradeCode({
    value: tradeTypeField?.value ?? "",
    label: tradeTypeField?.value ?? "",
  });
  if (fieldValueCode) {
    selectedRequestType = fieldValueCode;
  } else {
    for (const o of requestTypes) {
      if (!o.selected) continue;
      const code = resolveOptionTradeCode(o);
      if (code) {
        selectedRequestType = code;
        break;
      }
    }
  }
  if (!selectedRequestType) {
    for (const o of requestTypes) {
      const code = resolveOptionTradeCode(o);
      if (code) {
        selectedRequestType = code;
        break;
      }
    }
  }

  const add = findAddActivityLink(html);
  const pairingFieldNames = fields
    .map((f) => f.name)
    .filter((n) => /pair|rempair|day|month|pairdate/i.test(n));

  return {
    requestTypes,
    selectedRequestType,
    base: fieldValueByName(fields, ["selBase", "hdnBase", "Base"]),
    equipment: fieldValueByName(fields, ["selEquip", "Equipment", "selEquipment"]),
    position: fieldValueByName(fields, ["selPos", "Position", "selPosition", "hdnPos"]),
    comments: fieldValueByName(fields, ["CommentField", "comment", "comments"]),
    flicaResponseRequired:
      isChecked(fields, ["cbMessages", "rFLiCA", "FLiCA"]) ||
      /response\s+required/i.test(html),
    flicaResponseChecked: isChecked(fields, ["cbMessages", "rFLiCA", "FLiCA"]),
    emailResponse: isChecked(fields, ["cbemail", "rEMail", "EMail"]),
    emailAddress: fieldValueByName(fields, ["email", "EMail"]),
    phoneResponse: isChecked(fields, ["cbphone", "rPhone", "Phone"]),
    phoneNumber: fieldValueByName(fields, ["Phone", "phone"]),
    deleteAfter: fieldValueByName(fields, ["Year", "Year1", "DeleteAfter"]),
    addActivityUrl: add.url,
    addActivityLabel: add.label,
    pairingFieldNames,
  };
}

export function parseTradeboardPostRequestFormFromHtml(
  html: string,
  meta: {
    requestedUrl: string;
    finalUrl: string;
    webviewCapturedForm?: TbPostRequestCapturedFormWire | null;
    htmlSource?: "native" | "native_fallback_get" | "webview";
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
    const actionRaw = getAttr(attrs, "action");
    const methodRaw = (getAttr(attrs, "method") || "POST").toUpperCase();
    const fields = extractFormFields(inner);
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

  const picked = findTradeBoardPostRequestForm(safeHtml, frameUrl);
  let primaryForm = picked?.form ?? forms[0] ?? null;

  let capturedSubmit =
    meta.webviewCapturedForm?.actionResolved?.trim()
      ? wireToCapturedSubmit(meta.webviewCapturedForm, "webview")
      : null;

  if (primaryForm) {
    if (capturedSubmit) {
      primaryForm = applyCapturedSubmitToFormModel(primaryForm, capturedSubmit);
    } else {
      capturedSubmit = capturedSubmitFromParsedForm(
        primaryForm,
        frameUrl,
        meta.htmlSource === "webview" ? "webview" : "html_parse",
      );
      if (capturedSubmit) {
        primaryForm = applyCapturedSubmitToFormModel(primaryForm, capturedSubmit);
      }
    }
  }

  if (!capturedSubmit?.actionResolved?.trim()) {
    warnings.push("Real FLICA form action URL was not captured — submit is blocked.");
    missingMappings.push("Captured form action missing (form.action empty or not resolved).");
  }
  const detected = detectFieldsFromForm(primaryForm, safeHtml);

  if (!primaryForm) {
    warnings.push("No post-request form found in HTML.");
  } else if (primaryForm.method !== "POST") {
    warnings.push(`Primary form method is ${primaryForm.method}; expected POST.`);
  }
  if (!detected.requestTypes.length) {
    missingMappings.push("TradeType options not found — request type dropdown may be missing.");
  }
  if (!fieldsIncludeName(primaryForm?.fields ?? [], "CommentField")) {
    missingMappings.push("CommentField not found — comment mapping may fail.");
  }
  if (detected.pairingFieldNames.length === 0) {
    missingMappings.push(
      "No pairing/activity field names detected — activity payload mapping is uncertain.",
    );
  }

  const activityScriptBodies = extractTbPostRequestActivityScriptBodies(safeHtml);
  const activityParentFieldRules = buildActivityParentFieldRules(activityScriptBodies);

  const ok =
    htmlState === "ok" &&
    safeHtml.length > 400 &&
    primaryForm != null &&
    primaryForm.fields.length > 0;

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

  if (!activityScriptBodies.SetAddedItems) {
    missingMappings.push(
      "SetAddedItems script not found — parent-generated activity hidden fields may be incomplete.",
    );
  }

  fcDevMirrorScheduleLogToFile(LOG_TAG, {
    ok: result.ok,
    htmlLength: result.htmlLength,
    htmlState: result.htmlState,
    formsCount: forms.length,
    primaryAction: primaryForm?.actionUrl ?? "",
    capturedActionRaw: capturedSubmit?.actionRaw ?? "",
    capturedActionResolved: capturedSubmit?.actionResolved ?? "",
    capturedFrameUrl: capturedSubmit?.frameUrl ?? "",
    capturedMethod: capturedSubmit?.method ?? "",
    capturedSubmitButton: capturedSubmit?.submitButton ?? null,
    requestTypes: detected.requestTypes.map((t) => t.value),
    selectedRequestType: detected.selectedRequestType,
    base: detected.base,
    position: detected.position,
    pairingFieldNames: detected.pairingFieldNames,
    addActivityUrl: detected.addActivityUrl,
    warnings,
    missingMappings,
    activityScriptFunctions: {
      ResetActivityList: truncateForActivityScriptLog(activityScriptBodies.ResetActivityList),
      SetAddedItems: truncateForActivityScriptLog(activityScriptBodies.SetAddedItems),
      GetSelectedString: truncateForActivityScriptLog(activityScriptBodies.GetSelectedString),
    },
    activityParentAssignedFields: activityParentFieldRules.assignedInSetAdded,
    activityParentResetFields: activityParentFieldRules.assignedInReset,
  });

  if (__DEV__) {
    console.log(`[${LOG_TAG}]`, JSON.stringify({
      ok: result.ok,
      htmlLength: result.htmlLength,
      forms: forms.length,
      requestType: detected.selectedRequestType,
      missingMappings,
      hasSetAddedItems: Boolean(activityScriptBodies.SetAddedItems),
      hasResetActivityList: Boolean(activityScriptBodies.ResetActivityList),
      hasGetSelectedString: Boolean(activityScriptBodies.GetSelectedString),
    }));
  }

  return result;
}

function fieldsIncludeName(fields: TradeboardPostRequestFormField[], name: string): boolean {
  const n = name.toLowerCase();
  return fields.some((f) => f.name.toLowerCase() === n);
}

/** Baseline URL-encoded entries from parsed primary form (hidden + checked + text values). */
export function tradeboardPostRequestBaselineEntries(
  form: TradeboardPostRequestFormModel,
): Array<{ name: string; value: string }> {
  const entries: Array<{ name: string; value: string }> = [];
  for (const f of form.fields) {
    if (f.type === "submit" || f.type === "button" || f.type === "other") continue;
    if (f.type === "checkbox" || f.type === "radio") {
      if (f.checked) entries.push({ name: f.name, value: f.value || "Y" });
      continue;
    }
    entries.push({ name: f.name, value: f.value });
  }
  return entries;
}

export function tradeboardPostRequestHiddenSnapshot(html: string): Array<{ name: string; value: string }> {
  return extractHiddenFieldsFromHtml(html, 120);
}
