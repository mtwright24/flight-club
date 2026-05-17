/**
 * TB_EditRequest.cgi — field detection beyond generic post-request parse.
 */

import { resolveOptionTradeCode } from "./flicaTradeBoardPostRequestFieldMap";
import type {
  TradeboardPostRequestDetectedFields,
  TradeboardPostRequestFormField,
  TradeboardPostRequestSelectOption,
} from "./flicaTradeBoardPostRequestTypes";

function getAttr(tag: string, attr: string): string {
  const a = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const d = new RegExp(`\\b${a}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
  if (d) return d[1] ?? "";
  const s = new RegExp(`\\b${a}\\s*=\\s*'([^']*)'`, "i").exec(tag);
  if (s) return s[1] ?? "";
  return "";
}

function hasAttr(tag: string, attr: string): boolean {
  return new RegExp(`\\b${attr}\\b`, "i").test(tag);
}

function stripTags(s: string): string {
  return String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSelectOptions(block: string): TradeboardPostRequestSelectOption[] {
  const out: TradeboardPostRequestSelectOption[] = [];
  const optRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  let om: RegExpExecArray | null;
  while ((om = optRe.exec(block)) !== null) {
    const label = stripTags(om[2] ?? "");
    const value = getAttr(om[1] ?? "", "value") || label;
    out.push({
      value,
      label: label || value,
      selected: hasAttr(om[1] ?? "", "selected"),
    });
  }
  return out;
}

/** Include disabled controls for edit-form display (Type, Submit Method). */
export function extractEditFormFieldsAll(formInner: string): TradeboardPostRequestFormField[] {
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
      if (!name) continue;
      const value = getAttr(tag, "value");
      const disabled = hasAttr(tag, "disabled");
      const kind =
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
        checked: kind === "checkbox" || kind === "radio" ? hasAttr(tag, "checked") : undefined,
        disabled,
        label: value,
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
      if (!name) continue;
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
      if (!name) continue;
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

export function unescapeFlicaEditString(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

/** Comments from CommentField, SetCommentTextBox(...), or unescape(...) in page scripts. */
export function extractEditComments(html: string, fields: TradeboardPostRequestFormField[]): string {
  const ta = fields.find((f) => f.name.toLowerCase() === "commentfield");
  if (ta?.value?.trim()) return unescapeFlicaEditString(ta.value);

  const h = String(html ?? "");
  const setBox = /SetCommentTextBox\s*\(\s*(?:unescape\s*\(\s*)?['"]([^'"]*)['"]/i.exec(h);
  if (setBox?.[1]) return unescapeFlicaEditString(setBox[1]);

  const unesc =
    /(?:CommentField|hdnComments)[^;]{0,80}?unescape\s*\(\s*['"]([^'"]+)['"]\s*\)/i.exec(h);
  if (unesc?.[1]) return unescapeFlicaEditString(unesc[1]);

  const hidden = fields.find((f) => f.name.toLowerCase() === "hdncomments");
  if (hidden?.value?.trim()) return unescapeFlicaEditString(hidden.value);

  return "";
}

function fieldChecked(fields: TradeboardPostRequestFormField[], names: string[]): boolean {
  const want = new Set(names.map((n) => n.toLowerCase()));
  for (const f of fields) {
    if (!want.has(f.name.toLowerCase())) continue;
    if (f.type === "checkbox" || f.type === "radio") return Boolean(f.checked);
  }
  return false;
}

function fieldValue(fields: TradeboardPostRequestFormField[], names: string[]): string {
  const want = new Set(names.map((n) => n.toLowerCase()));
  for (const f of fields) {
    if (!want.has(f.name.toLowerCase())) continue;
    if (f.type === "checkbox" || f.type === "radio") {
      return f.checked ? f.value || "Y" : "";
    }
    return f.value;
  }
  return "";
}

function selectField(
  fields: TradeboardPostRequestFormField[],
  name: string,
): TradeboardPostRequestFormField | undefined {
  return fields.find((f) => f.name.toLowerCase() === name.toLowerCase());
}

export function detectEditRequestFields(
  fields: TradeboardPostRequestFormField[],
  html: string,
  base: TradeboardPostRequestDetectedFields,
): TradeboardPostRequestDetectedFields {
  const tradeTypeField = selectField(fields, "TradeType");
  const requestTypes = tradeTypeField?.options?.length
    ? tradeTypeField.options
    : base.requestTypes;
  const selectedOpt =
    tradeTypeField?.options?.find((o) => o.selected) ??
    tradeTypeField?.options?.find((o) => o.value === tradeTypeField.value);
  const selectedRequestType =
    resolveOptionTradeCode({
      value: selectedOpt?.value ?? tradeTypeField?.value ?? "",
      label: selectedOpt?.label ?? "",
    }) || base.selectedRequestType;
  const requestTypeDisplayLabel =
    selectedOpt?.label?.trim() || tradeTypeField?.value || base.requestTypeDisplayLabel || "";

  const dayField = selectField(fields, "Day");
  const monthField = selectField(fields, "Month");
  const deleteAfterDayOptions = dayField?.options ?? [];
  const deleteAfterMonthOptions = monthField?.options ?? [];
  const selectedDeleteDay =
    deleteAfterDayOptions.find((o) => o.selected)?.value ??
    dayField?.value ??
    base.selectedDeleteDay ??
    "";
  const selectedDeleteMonthYyyyMm =
    deleteAfterMonthOptions.find((o) => o.selected)?.value ??
    monthField?.value ??
    base.selectedDeleteMonthYyyyMm ??
    "";

  const htmlL = String(html ?? "").toLowerCase();
  const submitMethodFieldsPresent =
    htmlL.includes("submit method") ||
    fields.some((f) => /pickup|approval|autosubmit|hdnpickup/i.test(f.name));

  const allowNames = ["rAuto", "rbAuto", "cbAuto", "hdnPickup", "Pickup", "rPickup"];
  const waitNames = ["rWait", "rbWait", "cbWait", "hdnWait", "WaitApproval"];
  const submitMethodAllowPickupWithoutApproval =
    fieldChecked(fields, allowNames) ||
    /allow anyone to pickup without my approval/i.test(html);
  const submitMethodWaitForApproval =
    fieldChecked(fields, waitNames) || /wait for my approval/i.test(html);

  const allowField = fields.find((f) =>
    allowNames.some((n) => f.name.toLowerCase() === n.toLowerCase()),
  );
  const waitField = fields.find((f) =>
    waitNames.some((n) => f.name.toLowerCase() === n.toLowerCase()),
  );

  return {
    ...base,
    requestTypes,
    selectedRequestType,
    requestTypeDisplayLabel,
    comments: extractEditComments(html, fields) || base.comments,
    base: fieldValue(fields, ["selBase", "hdnBase", "Base"]) || base.base,
    equipment: fieldValue(fields, ["selEquip", "hdnEqp", "Equipment"]) || base.equipment,
    position: fieldValue(fields, ["selPos", "hdnPos", "Position"]) || base.position,
    flicaResponseChecked:
      fieldChecked(fields, ["cbMessages", "rFLiCA", "FLiCA"]) || base.flicaResponseChecked,
    emailResponse: fieldChecked(fields, ["cbemail", "rEMail", "EMail"]) || base.emailResponse,
    emailAddress: fieldValue(fields, ["email", "EMail"]) || base.emailAddress,
    phoneResponse: fieldChecked(fields, ["cbphone", "rPhone", "Phone"]) || base.phoneResponse,
    phoneNumber: fieldValue(fields, ["Phone", "phone"]) || base.phoneNumber,
    deleteAfterDayOptions,
    deleteAfterMonthOptions,
    selectedDeleteDay,
    selectedDeleteMonthYyyyMm,
    submitMethodFieldsPresent,
    submitMethodAllowPickupWithoutApproval,
    submitMethodWaitForApproval,
    submitMethodAllowPickupDisabled: Boolean(allowField?.disabled),
    submitMethodWaitDisabled: Boolean(waitField?.disabled),
  };
}

export function deleteAfterYmdFromMonthDay(monthYyyyMm: string, day: string): string {
  const m = String(monthYyyyMm ?? "").trim();
  const d = String(day ?? "").trim();
  if (m.length < 6 || !d) return "";
  const dd = String(parseInt(d, 10)).padStart(2, "0");
  if (!/^\d{2}$/.test(dd) || dd === "NaN") return "";
  return `${m.slice(0, 4)}${m.slice(4, 6)}${dd}`;
}
