/**
 * Maps native Post Request composer state onto FLICA form field names (including hdn* hidden fields).
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import {
  applyChromePostRequestOverrides,
  chromeParityCriticalFieldNames,
  isIndexedPairingSlotField,
  replaceScalarPayloadField,
} from "./flicaTradeBoardPostRequestChromeParity";
import type { ActivityParentFieldRules } from "./flicaTradeBoardPostRequestActivityScript";
import type {
  TradeboardPostRequestActivity,
  TradeboardPostRequestComposerState,
  TradeboardPostRequestDetectedFields,
  TradeboardPostRequestFormField,
  TradeboardPostRequestFormModel,
} from "./flicaTradeBoardPostRequestTypes";

const CATALOG_LOG = "FC_TB_POST_FORM_FIELD_CATALOG";

export type PostRequestFieldCatalogEntry = {
  name: string;
  type: string;
  value: string;
  checked?: boolean;
  options?: Array<{ value: string; label: string; selected: boolean }>;
};

export type PostRequestFieldCatalog = {
  fieldNames: string[];
  entries: PostRequestFieldCatalogEntry[];
  hiddenNames: string[];
  selectNames: string[];
  textareaNames: string[];
  checkboxNames: string[];
  radioNames: string[];
};

/** Critical hidden fields for Drop + one activity (JetBlue FA post request capture). */
export const DROP_TRIP_ACTIVITY_CRITICAL_FIELDS = [
  "hdnType",
  "hdnDepDate",
  "hdnDays",
  "hdnDep",
  "hdnArr",
  "hdnBlkHrs",
  "hdnComments",
  "hdnFlicaResponse",
  "hdnMessages",
  "hdnBase",
  "hdnEqp",
  "hdnPairStr",
  "hdnDayStr",
  "hdnDayStrLong",
  "hdnMyDST",
  "hdnMyBlockDate",
] as const;

export type MappedPayloadField = {
  name: string;
  value: string;
  source: string;
};

function collapseWs(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

export function buildPostRequestFieldCatalog(
  form: TradeboardPostRequestFormModel | null,
): PostRequestFieldCatalog {
  const fields = form?.fields ?? [];
  const entries: PostRequestFieldCatalogEntry[] = fields.map((f) => ({
    name: f.name,
    type: f.type,
    value: f.value,
    checked: f.checked,
    options: f.options?.map((o) => ({ value: o.value, label: o.label, selected: o.selected })),
  }));
  return {
    fieldNames: fields.map((f) => f.name),
    entries,
    hiddenNames: fields.filter((f) => f.type === "hidden").map((f) => f.name),
    selectNames: fields.filter((f) => f.type === "select").map((f) => f.name),
    textareaNames: fields.filter((f) => f.type === "textarea").map((f) => f.name),
    checkboxNames: fields.filter((f) => f.type === "checkbox").map((f) => f.name),
    radioNames: fields.filter((f) => f.type === "radio").map((f) => f.name),
  };
}

export function logPostRequestFieldCatalog(catalog: PostRequestFieldCatalog): void {
  fcDevMirrorScheduleLogToFile(CATALOG_LOG, {
    fieldCount: catalog.fieldNames.length,
    hiddenCount: catalog.hiddenNames.length,
    fieldNames: catalog.fieldNames,
    hiddenNames: catalog.hiddenNames,
    selects: catalog.entries
      .filter((e) => e.type === "select")
      .map((e) => ({
        name: e.name,
        value: e.value,
        options: e.options?.map((o) => `${o.value}:${o.label}${o.selected ? "*" : ""}`),
      })),
    textareas: catalog.entries.filter((e) => e.type === "textarea").map((e) => e.name),
    checkboxes: catalog.entries
      .filter((e) => e.type === "checkbox")
      .map((e) => ({ name: e.name, value: e.value, checked: e.checked })),
    radios: catalog.entries
      .filter((e) => e.type === "radio")
      .map((e) => ({ name: e.name, value: e.value, checked: e.checked })),
    hiddenDefaults: catalog.entries
      .filter((e) => e.type === "hidden")
      .slice(0, 80)
      .map((e) => `${e.name}=${e.value.slice(0, 100)}`),
  });
  if (__DEV__) {
    console.log(`[${CATALOG_LOG}]`, JSON.stringify({ fields: catalog.fieldNames.length }));
  }
}

export function entryValue(entries: Array<{ name: string; value: string }>, name: string): string {
  const n = name.toLowerCase();
  return entries.find((e) => e.name.toLowerCase() === n)?.value ?? "";
}

export function upsertPayloadEntry(
  entries: Array<{ name: string; value: string }>,
  name: string,
  value: string,
): Array<{ name: string; value: string }> {
  const n = name.toLowerCase();
  const next = entries.filter((e) => e.name.toLowerCase() !== n);
  next.push({ name, value: String(value ?? "") });
  return next;
}

/** First form field name matching any alias (case-insensitive). */
export function resolveFormFieldName(
  fields: TradeboardPostRequestFormField[],
  aliases: string[],
): string | null {
  const want = new Set(aliases.map((a) => a.toLowerCase()));
  const hit = fields.find((f) => want.has(f.name.toLowerCase()));
  return hit?.name ?? null;
}

/** Set value on scalar fields only — skips indexed hdnPairingN / hdnDepDateN slots. */
export function setPayloadByAliases(
  entries: Array<{ name: string; value: string }>,
  fields: TradeboardPostRequestFormField[],
  aliases: string[],
  value: string,
  source: string,
  mapped: MappedPayloadField[],
): Array<{ name: string; value: string }> {
  if (value === "") return entries;
  let next = entries;
  const namesWritten = new Set<string>();

  for (const alias of aliases) {
    if (isIndexedPairingSlotField(alias)) continue;
    const exact = entries.find((e) => e.name.toLowerCase() === alias.toLowerCase());
    if (exact && !isIndexedPairingSlotField(exact.name) && !namesWritten.has(exact.name.toLowerCase())) {
      next = replaceScalarPayloadField(next, exact.name, value);
      mapped.push({ name: exact.name, value, source });
      namesWritten.add(exact.name.toLowerCase());
    }
  }

  const formName = resolveFormFieldName(fields, aliases);
  if (
    formName &&
    !isIndexedPairingSlotField(formName) &&
    !namesWritten.has(formName.toLowerCase())
  ) {
    next = replaceScalarPayloadField(next, formName, value);
    mapped.push({ name: formName, value, source });
    namesWritten.add(formName.toLowerCase());
  }

  return next;
}

export function normalizePositionCode(raw: string): string {
  const s = collapseWs(raw).toUpperCase();
  if (!s) return "";
  if (s === "FA" || s.includes("FLIGHT ATTENDANT") || s === "F/A") return "FA";
  if (s === "FO" || s.includes("FIRST OFFICER")) return "FO";
  if (s === "CA" || s.includes("CAPTAIN")) return "CA";
  return s.length <= 4 ? s : "FA";
}

const PLACEHOLDER_REQUEST_TYPE_RE = /select\s+type\s+here/i;

/** FLICA placeholder option — not a valid TradeType / hdnType. */
export function isPlaceholderRequestType(raw: string): boolean {
  const s = collapseWs(raw);
  if (!s) return true;
  return PLACEHOLDER_REQUEST_TYPE_RE.test(s);
}

/** Compact FLICA request codes (T, D, P, X, R). */
export function isValidCompactTradeTypeCode(code: string): boolean {
  return /^[TDXPR]$/i.test(collapseWs(code));
}

/** FLICA TB_postrequest.cgi request types — always show all five chips. */
export const FLICA_CANONICAL_POST_REQUEST_TYPES: Array<{ value: string; label: string }> = [
  { value: "T", label: "Trade Trip" },
  { value: "D", label: "Drop Trip" },
  { value: "P", label: "Pick Up Trip" },
  { value: "X", label: "Trade/Drop" },
  { value: "R", label: "Trade a Reserve Day" },
];

/** hdnType uses the same compact code as TradeType (T, D, P, X). */
export function compactTradeTypeCode(raw: string): string {
  if (isPlaceholderRequestType(raw)) return "";
  const v = collapseWs(raw).toUpperCase();
  if (v === "D" || v.startsWith("DROP")) return "D";
  if (v === "T" || (v.startsWith("TRADE") && !v.includes("/"))) return "T";
  if (v === "P" || v.startsWith("PICK")) return "P";
  if (v === "X" || v.includes("TRADE/DROP")) return "X";
  if (v === "R" || (v.includes("RESERVE") && v.includes("TRADE"))) return "R";
  return v.length === 1 && isValidCompactTradeTypeCode(v) ? v : "";
}

/** Resolve compact code from a TradeType &lt;option&gt; (value may be placeholder; label is authoritative). */
export function resolveOptionTradeCode(opt: {
  value: string;
  label: string;
}): string {
  if (!isPlaceholderRequestType(opt.value)) {
    const fromValue = compactTradeTypeCode(opt.value);
    if (isValidCompactTradeTypeCode(fromValue)) return fromValue.toUpperCase();
  }
  const fromLabel = compactTradeTypeCode(opt.label);
  if (isValidCompactTradeTypeCode(fromLabel)) return fromLabel.toUpperCase();
  return "";
}

/** Chips / composer use compact codes; drop FLICA placeholder options. */
export function normalizeRequestTypeOptions(
  options: TradeboardPostRequestDetectedFields["requestTypes"],
): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const seen = new Set<string>();
  for (const o of options ?? []) {
    const code = resolveOptionTradeCode(o);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ value: code, label: collapseWs(o.label) || code });
  }
  return out;
}

/** Merge parsed FLICA TradeType options with canonical five-type chips (never drop Reserve). */
export function mergeFlicaPostRequestTypeOptions(
  options: TradeboardPostRequestDetectedFields["requestTypes"],
): Array<{ value: string; label: string }> {
  const parsed = normalizeRequestTypeOptions(options);
  const byCode = new Map<string, { value: string; label: string }>();
  for (const c of FLICA_CANONICAL_POST_REQUEST_TYPES) {
    byCode.set(c.value, { ...c });
  }
  for (const o of parsed) {
    byCode.set(o.value, {
      value: o.value,
      label: collapseWs(o.label) || byCode.get(o.value)?.label || o.value,
    });
  }
  return FLICA_CANONICAL_POST_REQUEST_TYPES.map((c) => byCode.get(c.value)!);
}

/** Resolve TradeType value (D/T/P/X/R) from composer + detected options. */
export function resolveTradeTypeValue(
  composerType: string,
  detected: TradeboardPostRequestDetectedFields,
): { tradeTypeValue: string; hdnTypeValue: string } {
  const raw = collapseWs(composerType);
  const upper = raw.toUpperCase();
  const opts = detected.requestTypes ?? [];

  if (!isPlaceholderRequestType(raw)) {
    const direct = compactTradeTypeCode(raw);
    if (isValidCompactTradeTypeCode(direct)) {
      return { tradeTypeValue: direct.toUpperCase(), hdnTypeValue: direct.toUpperCase() };
    }
  }

  if (!isPlaceholderRequestType(raw)) {
    const byValue = opts.find((o) => o.value === raw);
    if (byValue) {
      const code = resolveOptionTradeCode(byValue);
      if (code) return { tradeTypeValue: code, hdnTypeValue: code };
    }
  }

  for (const o of opts) {
    const label = collapseWs(o.label).toUpperCase();
    if (label === upper) {
      const code = resolveOptionTradeCode(o);
      if (code) return { tradeTypeValue: code, hdnTypeValue: code };
    }
  }

  if (upper.length >= 4) {
    for (const o of opts) {
      const label = collapseWs(o.label).toUpperCase();
      if (label.includes(upper) || upper.includes(label)) {
        const code = resolveOptionTradeCode(o);
        if (code) return { tradeTypeValue: code, hdnTypeValue: code };
      }
    }
  }

  if (/^D(ROP)?$/i.test(raw) || upper.includes("DROP")) {
    return { tradeTypeValue: "D", hdnTypeValue: "D" };
  }
  if (/^T(RADE)?$/i.test(raw) || (upper.includes("TRADE") && !upper.includes("DROP"))) {
    return { tradeTypeValue: "T", hdnTypeValue: "T" };
  }
  if (/^P(ICK)?$/i.test(raw) || upper.includes("PICK")) {
    return { tradeTypeValue: "P", hdnTypeValue: "P" };
  }
  if (upper.includes("TRADE/DROP") || upper.includes("TRADE DROP")) {
    return { tradeTypeValue: "X", hdnTypeValue: "X" };
  }
  if (/^R\b/.test(raw) || upper.includes("RESERVE")) {
    return { tradeTypeValue: "R", hdnTypeValue: "R" };
  }

  return { tradeTypeValue: "", hdnTypeValue: "" };
}

/** Compact FLICA code for payload mapping; empty when composer is still placeholder. */
export function resolveEffectiveTradeTypeCode(
  composerType: string,
  detected: TradeboardPostRequestDetectedFields,
): string {
  if (isPlaceholderRequestType(composerType)) {
    return "";
  }
  const { tradeTypeValue } = resolveTradeTypeValue(composerType, detected);
  if (isValidCompactTradeTypeCode(tradeTypeValue)) {
    return tradeTypeValue.toUpperCase();
  }
  const normalized = normalizeRequestTypeOptions(detected.requestTypes);
  const byChip = normalized.find((o) => o.value === collapseWs(composerType));
  if (byChip && isValidCompactTradeTypeCode(byChip.value)) {
    return byChip.value.toUpperCase();
  }
  const rawUpper = collapseWs(composerType).toUpperCase();
  for (const opt of normalized) {
    const label = collapseWs(opt.label).toUpperCase();
    if (label === rawUpper || (rawUpper.length >= 4 && (label.includes(rawUpper) || rawUpper.includes(label)))) {
      return opt.value.toUpperCase();
    }
  }
  return "";
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function dateLabelToDdMmm(label: string): string {
  const m = collapseWs(label).toUpperCase().match(/^(\d{1,2})([A-Z]{3})$/);
  if (!m) return collapseWs(label).toUpperCase();
  return `${parseInt(m[1]!, 10)}${m[2]!}`;
}

export function dateLabelToYmd(
  dateLabel: string,
  dateYmd: string,
  yearHint?: string,
): string {
  if (/^\d{8}$/.test(dateYmd)) return dateYmd;
  const tok = dateLabelToDdMmm(dateLabel);
  const m = tok.match(/^(\d{1,2})([A-Z]{3})$/);
  if (!m) return "";
  const day = parseInt(m[1]!, 10);
  const mon = MONTHS.indexOf(m[2]!);
  if (mon < 0) return "";
  const years: number[] = [];
  if (yearHint && /^\d{4}$/.test(yearHint)) {
    const y = parseInt(yearHint, 10);
    years.push(y, y + 1, y - 1);
  } else {
    const y0 = new Date().getFullYear();
    years.push(y0, y0 + 1, y0 - 1);
  }
  for (const year of years) {
    const d = new Date(year, mon, day, 12, 0, 0, 0);
    if (d.getMonth() === mon && d.getDate() === day) {
      const y = d.getFullYear();
      const mo = String(mon + 1).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${y}${mo}${dd}`;
    }
  }
  return "";
}

/** Prefer FLICA selector / TAry dateYmd; align year with form Year/Month when FLICA row year is wrong. */
export function resolveActivityDateYmd(
  activity: TradeboardPostRequestActivity,
  opts?: { formYear?: string; formMonthYyyyMm?: string },
): string {
  const yearHint =
    opts?.formYear?.trim().slice(0, 4) ||
    opts?.formMonthYyyyMm?.trim().slice(0, 4) ||
    "";
  const monthHint = opts?.formMonthYyyyMm?.trim().slice(4, 6) || "";
  const direct = activity.dateYmd?.trim();

  if (/^\d{8}$/.test(direct ?? "")) {
    if (yearHint && monthHint && direct!.slice(4, 6) === monthHint && direct!.slice(0, 4) !== yearHint) {
      return `${yearHint}${monthHint}${direct!.slice(6, 8)}`;
    }
    if (yearHint && direct!.slice(0, 4) !== yearHint) {
      const fromLabel = dateLabelToYmd(activity.dateLabel, "", yearHint);
      if (/^\d{8}$/.test(fromLabel)) return fromLabel;
    }
    return direct!;
  }

  return dateLabelToYmd(activity.dateLabel, "", yearHint);
}

export function activityPairingPayload(activity: TradeboardPostRequestActivity): {
  pairingId: string;
  ddMmm: string;
  ymd: string;
  pairColon: string;
  pairStr: string;
} {
  const pairingId = activity.pairingId.trim().toUpperCase();
  const ddMmm = dateLabelToDdMmm(activity.dateLabel);
  const ymd = resolveActivityDateYmd(activity);
  const pairColon = activity.displayLabel.includes(":")
    ? activity.displayLabel.trim().toUpperCase()
    : `${pairingId}:${ddMmm}`;
  const pairStr = ymd ? `${pairingId}:${ymd}` : pairColon;
  return { pairingId, ddMmm, ymd, pairColon, pairStr };
}

function compactPosForHdn(raw: string, baselinePos: string): string {
  const b = baselinePos.trim();
  if (b) return b;
  const u = collapseWs(raw).toUpperCase();
  if (u === "FA" || u.includes("FLIGHT ATTENDANT")) return "A";
  if (u === "FO" || u === "CA") return u;
  return u.length <= 2 ? u : "A";
}

export type ApplyComposerResult = {
  entries: Array<{ name: string; value: string }>;
  mappedFields: MappedPayloadField[];
  blankCriticalFields: string[];
};

export function applyComposerToPayloadEntries(
  baseline: Array<{ name: string; value: string }>,
  form: TradeboardPostRequestFormModel,
  composer: TradeboardPostRequestComposerState,
  detected: TradeboardPostRequestDetectedFields,
  activityParentRules?: ActivityParentFieldRules | null,
): ApplyComposerResult {
  const fields = form.fields;
  let entries = baseline.slice();
  const mapped: MappedPayloadField[] = [];

  const tradeTypeValue = resolveEffectiveTradeTypeCode(composer.requestType, detected);
  const hdnTypeValue = tradeTypeValue;
  const formYear =
    entryValue(baseline, "Year") ||
    entryValue(baseline, "Year1") ||
    composer.deleteAfter?.trim().slice(0, 4) ||
    "";
  const formMonthYyyyMm = entryValue(baseline, "Month");
  const posCode = normalizePositionCode(composer.position);
  const base = collapseWs(composer.base).toUpperCase();
  const comments = collapseWs(composer.comments);
  const equip = collapseWs(composer.equipment).toUpperCase();

  entries = setPayloadByAliases(
    entries,
    fields,
    ["TradeType"],
    tradeTypeValue,
    "requestType:TradeType",
    mapped,
  );
  entries = setPayloadByAliases(
    entries,
    fields,
    ["hdnType"],
    hdnTypeValue,
    "requestType:hdnType",
    mapped,
  );

  if (isValidCompactTradeTypeCode(tradeTypeValue)) {
    for (const name of ["TradeType", "hdnType"]) {
      const formName = resolveFormFieldName(fields, [name]);
      const target = formName ?? name;
      entries = replaceScalarPayloadField(entries, target, tradeTypeValue);
      mapped.push({ name: target, value: tradeTypeValue, source: "requestType:force" });
    }
  }

  entries = setPayloadByAliases(entries, fields, ["selBase", "Base"], base, "base:selBase", mapped);
  entries = setPayloadByAliases(entries, fields, ["hdnBase"], base, "base:hdnBase", mapped);

  entries = setPayloadByAliases(
    entries,
    fields,
    ["selPos", "Position", "selPosition"],
    posCode,
    "position:selPos",
    mapped,
  );
  const hdnPosCode = compactPosForHdn(posCode, entryValue(baseline, "hdnPos"));
  entries = setPayloadByAliases(entries, fields, ["hdnPos"], hdnPosCode, "position:hdnPos", mapped);
  entries = setPayloadByAliases(entries, fields, ["selExtraPos"], "_", "position:selExtraPos", mapped);
  entries = setPayloadByAliases(entries, fields, ["hdnExtraPos"], "_", "position:hdnExtraPos", mapped);
  const eqpVal = equip || entryValue(baseline, "hdnEqp") || "ALL";
  entries = setPayloadByAliases(
    entries,
    fields,
    ["hdnEqp", "selEquip", "Equipment"],
    eqpVal,
    "equipment:hdnEqp",
    mapped,
  );

  entries = setPayloadByAliases(
    entries,
    fields,
    ["CommentField", "comment", "comments"],
    comments,
    "comments:visible",
    mapped,
  );
  entries = setPayloadByAliases(
    entries,
    fields,
    ["hdnComments", "hdnMessage"],
    comments,
    "comments:hdnComments",
    mapped,
  );
  if (comments) {
    entries = setPayloadByAliases(
      entries,
      fields,
      ["hdnMessages"],
      comments,
      "comments:hdnMessages",
      mapped,
    );
  }

  if (composer.flicaResponse) {
    entries = setPayloadByAliases(entries, fields, ["rFLiCA", "FLiCA"], "", "response:flica:empty", mapped);
    entries = setPayloadByAliases(
      entries,
      fields,
      ["hdnFlicaResponse"],
      "true",
      "response:flica:hdnFlicaResponse",
      mapped,
    );
    entries = setPayloadByAliases(
      entries,
      fields,
      ["hdnMessages"],
      "true",
      "response:hdnMessages",
      mapped,
    );
  } else {
    for (const alias of ["rFLiCA", "FLiCA", "hdnFlicaResponse", "hdnMessages", "cbMessages"]) {
      const n = resolveFormFieldName(fields, [alias]);
      if (n) entries = entries.filter((e) => e.name.toLowerCase() !== n.toLowerCase());
    }
  }

  if (composer.emailResponse) {
    entries = setPayloadByAliases(
      entries,
      fields,
      ["cbemail", "rEMail", "EMail"],
      "Y",
      "response:email",
      mapped,
    );
    entries = setPayloadByAliases(
      entries,
      fields,
      ["email"],
      collapseWs(composer.emailAddress),
      "email:address",
      mapped,
    );
  }

  if (composer.phoneResponse) {
    entries = setPayloadByAliases(
      entries,
      fields,
      ["cbphone", "rPhone"],
      "Y",
      "response:phone",
      mapped,
    );
    entries = setPayloadByAliases(
      entries,
      fields,
      ["Phone", "phone"],
      collapseWs(composer.phoneNumber),
      "phone:number",
      mapped,
    );
  }

  if (composer.deleteAfter) {
    entries = setPayloadByAliases(
      entries,
      fields,
      ["Year", "Year1", "DeleteAfter"],
      composer.deleteAfter,
      "deleteAfter",
      mapped,
    );
  }

  if (composer.reqId) {
    entries = setPayloadByAliases(entries, fields, ["reqId"], composer.reqId, "edit:reqId", mapped);
  }
  if (composer.treq) {
    entries = setPayloadByAliases(entries, fields, ["treq"], composer.treq, "edit:treq", mapped);
  }

  const activity = composer.activities[0] ?? null;
  if (activity && isDropTripRequestType(composer.requestType, detected)) {
    const dep = String(activity.depAirport ?? "").trim().toUpperCase();
    const arr = String(activity.arrAirport ?? "").trim().toUpperCase();
    const blk = String(activity.blockHrs ?? "").trim();
    const lay = String(activity.layovers ?? "").trim();

    if (dep) {
      entries = setPayloadByAliases(
        entries,
        fields,
        ["hdnDep", "Dep", "hdnDepCity", "selDep"],
        dep,
        "activity:hdnDep",
        mapped,
      );
    }
    if (arr) {
      entries = setPayloadByAliases(
        entries,
        fields,
        ["hdnArr", "Arr", "hdnArrCity", "selArr"],
        arr,
        "activity:hdnArr",
        mapped,
      );
    }
    if (blk) {
      entries = setPayloadByAliases(
        entries,
        fields,
        ["hdnBlkHrs", "hdnBlockHrs", "BlkHrs", "hdnBlock", "hdnBlk", "BlockHrs"],
        blk,
        "activity:hdnBlkHrs",
        mapped,
      );
    }
    if (lay) {
      entries = setPayloadByAliases(
        entries,
        fields,
        ["hdnLayovers", "Layovers"],
        lay,
        "activity:hdnLayovers",
        mapped,
      );
    }
  }

  const activityForPayload =
    activity != null
      ? {
          ...activity,
          dateYmd:
            resolveActivityDateYmd(activity, {
              formYear,
              formMonthYyyyMm,
            }) || activity.dateYmd,
        }
      : null;

  entries = applyChromePostRequestOverrides(
    entries,
    composer,
    tradeTypeValue,
    activityForPayload,
  );
  mapped.push({
    name: "(chrome overrides)",
    value: tradeTypeValue,
    source: "chrome:scalarOverrides",
  });

  const capturedBtn = form.capturedSubmit?.submitButton;
  if (capturedBtn?.name) {
    entries = upsertPayloadEntry(
      entries,
      capturedBtn.name,
      capturedBtn.value || "Post Request",
    );
    mapped.push({
      name: capturedBtn.name,
      value: capturedBtn.value || "Post Request",
      source: "captured:submitButton",
    });
  } else {
    const submitField = fields.find((f) => f.type === "submit");
    if (submitField?.name) {
      entries = upsertPayloadEntry(entries, submitField.name, submitField.value || "Submit");
    }
  }
  return { entries, mappedFields: mapped, blankCriticalFields: [] };
}

export function criticalFieldsForComposer(
  composer: TradeboardPostRequestComposerState,
  opts?: {
    formFields?: TradeboardPostRequestFormField[];
    activityParentRules?: ActivityParentFieldRules | null;
    detected?: TradeboardPostRequestDetectedFields;
  },
): readonly string[] {
  const formFields = opts?.formFields;
  const detected = opts?.detected;

  if (composer.activities.length > 0 && formFields?.length) {
    const chromeNames = chromeParityCriticalFieldNames(formFields, true);
    const dropRoute =
      detected != null && isDropTripRequestType(composer.requestType, detected);
    const extra = dropRoute ? (["hdnDep", "hdnArr", "hdnBlkHrs"] as const) : ([] as const);
    return [...chromeNames, ...extra];
  }

  const base = [...DROP_TRIP_ACTIVITY_CRITICAL_FIELDS];
  if (composer.activities.length === 0) {
    return base.filter(
      (f) =>
        !f.startsWith("hdnPair") &&
        !f.startsWith("hdnDep") &&
        !f.startsWith("hdnDay") &&
        !f.startsWith("hdnMy") &&
        f !== "hdnArr" &&
        f !== "hdnDep" &&
        f !== "hdnBlkHrs",
    );
  }
  return base;
}

export function isDropTripRequestType(
  requestType: string,
  detected: TradeboardPostRequestDetectedFields,
): boolean {
  const tradeTypeValue = resolveEffectiveTradeTypeCode(requestType, detected);
  if (tradeTypeValue === "D") return true;
  return /drop/i.test(requestType);
}

export function computeBlankCriticalFields(
  entries: Array<{ name: string; value: string }>,
  criticalNames: readonly string[],
): string[] {
  const blank: string[] = [];
  for (const key of criticalNames) {
    const hit = entries.find((e) => e.name.toLowerCase() === key.toLowerCase());
    if (!hit) {
      blank.push(`${key} (missing from form)`);
      continue;
    }
    if (!String(hit.value ?? "").trim()) blank.push(key);
  }
  return blank;
}
