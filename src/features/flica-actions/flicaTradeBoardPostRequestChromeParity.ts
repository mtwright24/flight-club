/**
 * Known-good TradeBoard Post Request POST shape (Chrome capture, Trade Trip).
 */

import type {
  TradeboardPostRequestActivity,
  TradeboardPostRequestComposerState,
  TradeboardPostRequestFormField,
} from "./flicaTradeBoardPostRequestTypes";

export type ChromeParityDiff = {
  field: string;
  expected: string;
  actual: string;
};

/** Indexed FLICA pairing slots — never overwrite from composer. */
export function isIndexedPairingSlotField(name: string): boolean {
  return /^(hdnPairing|hdnDepDate)\d+$/i.test(String(name ?? "").trim());
}

/** Replace only when the form has a single scalar field with this exact name. */
export function replaceScalarPayloadField(
  entries: Array<{ name: string; value: string }>,
  name: string,
  value: string,
): Array<{ name: string; value: string }> {
  const n = name.toLowerCase();
  const hits = entries.filter((e) => e.name.toLowerCase() === n);
  if (hits.length > 1) return entries;
  if (hits.length === 1) {
    return entries.map((e) => (e.name.toLowerCase() === n ? { name: e.name, value } : e));
  }
  return [...entries, { name, value }];
}

function activityYmd(activity: TradeboardPostRequestActivity): string {
  const ymd = activity.dateYmd?.trim();
  if (/^\d{8}$/.test(ymd ?? "")) return ymd!;
  return "";
}

function compactPosForHdn(raw: string, baselinePos: string): string {
  const b = baselinePos.trim();
  if (b) return b;
  const u = raw.trim().toUpperCase();
  if (u === "FA" || u.includes("FLIGHT ATTENDANT")) return "A";
  if (u === "FO" || u === "CA") return u.charAt(0);
  return u.length <= 2 ? u : "A";
}

export type ChromeExpectedFields = Record<string, string>;

/** Build expected scalar values for Chrome parity check (Trade Trip + one activity). */
export function buildChromeExpectedFields(
  composer: TradeboardPostRequestComposerState,
  tradeTypeCode: string,
  activity: TradeboardPostRequestActivity | null,
  baselineEntries: Array<{ name: string; value: string }>,
): ChromeExpectedFields {
  const tradeTypeValue = tradeTypeCode;
  const comments = composer.comments.trim();
  const ymd = activity ? activityYmd(activity) : "";
  const pairingId = activity?.pairingId.trim().toUpperCase() ?? "";
  const year = ymd.length >= 4 ? ymd.slice(0, 4) : new Date().getFullYear().toString();
  const monthYyyyMm = ymd.length >= 6 ? ymd.slice(0, 6) : "";
  const day = ymd.length >= 8 ? String(parseInt(ymd.slice(6, 8), 10)) : "";

  const baselinePos = baselineEntries.find((e) => e.name.toLowerCase() === "hdnpos")?.value ?? "";
  const baselineEqp = baselineEntries.find((e) => e.name.toLowerCase() === "hdneqp")?.value ?? "";

  const out: ChromeExpectedFields = {
    hdnSubmit: "submitting",
    hdnTripListCount: "0",
    RemPairIndex: "-1",
    RemPairCount: "0",
    PAIRDATE: "",
    selExtraPos: "_",
    hdnExtraPos: "_",
    hdnPickup: "0",
    Year: year,
    Year1: year,
    hdnBase: composer.base.trim().toUpperCase() || "JFK",
    hdnEqp: composer.equipment.trim().toUpperCase() || baselineEqp || "ALL",
    hdnPos: compactPosForHdn(composer.position, baselinePos),
    CommentField: comments,
    hdnComments: comments,
  };

  if (isValidCompactTradeTypeCode(tradeTypeValue)) {
    out.TradeType = tradeTypeValue.toUpperCase();
    out.hdnType = tradeTypeValue.toUpperCase();
  }

  if (day) out.Day = day;
  if (monthYyyyMm) out.Month = monthYyyyMm;

  if (composer.flicaResponse) {
    out.rFLiCA = "";
    out.FLiCA = "";
    out.hdnFlicaResponse = "true";
    out.hdnMessages = "true";
  }

  if (activity && ymd) {
    out.hdnPairStr = `${pairingId}:${ymd}`;
    out.hdnLateDepDate = ymd;
    out.hdnDeleteAfter = ymd;
  }

  return out;
}

/** Scalar fields Chrome POST overrides (does not include indexed hdnPairingN / hdnDepDateN). */
export const CHROME_SCALAR_OVERRIDE_NAMES = [
  "TradeType",
  "selExtraPos",
  "CommentField",
  "rFLiCA",
  "FLiCA",
  "Year",
  "Year1",
  "RemPairIndex",
  "RemPairCount",
  "Day",
  "Month",
  "PAIRDATE",
  "hdnSubmit",
  "hdnTripListCount",
  "hdnType",
  "hdnComments",
  "hdnFlicaResponse",
  "hdnMessages",
  "hdnBase",
  "hdnEqp",
  "hdnPos",
  "hdnExtraPos",
  "hdnPickup",
  "hdnPairStr",
  "hdnLateDepDate",
  "hdnDeleteAfter",
] as const;

export function applyChromePostRequestOverrides(
  entries: Array<{ name: string; value: string }>,
  composer: TradeboardPostRequestComposerState,
  tradeTypeCode: string,
  activity: TradeboardPostRequestActivity | null,
): Array<{ name: string; value: string }> {
  const code = isValidCompactTradeTypeCode(tradeTypeCode) ? tradeTypeCode.toUpperCase() : "";
  const expected = buildChromeExpectedFields(composer, code, activity, entries);
  let next = entries;
  for (const name of CHROME_SCALAR_OVERRIDE_NAMES) {
    if (!(name in expected)) continue;
    next = replaceScalarPayloadField(next, name, expected[name]!);
  }
  return next;
}

const COMPACT_TYPE_FIELDS = ["TradeType", "hdnType"] as const;

function isValidCompactTradeTypeCode(code: string): boolean {
  return /^[TDXPR]$/i.test(String(code ?? "").trim());
}

function isPlaceholderRequestType(raw: string): boolean {
  return /select\s+type\s+here/i.test(String(raw ?? "").trim());
}

export function computeChromeParityDiffs(
  entries: Array<{ name: string; value: string }>,
  expected: ChromeExpectedFields,
): ChromeParityDiff[] {
  const diffs: ChromeParityDiff[] = [];
  for (const [field, want] of Object.entries(expected)) {
    const hit = entries.find((e) => e.name.toLowerCase() === field.toLowerCase());
    const actual = hit?.value ?? "";
    if (actual !== want) {
      diffs.push({ field, expected: want, actual });
    }
  }
  for (const field of COMPACT_TYPE_FIELDS) {
    const hit = entries.find((e) => e.name.toLowerCase() === field.toLowerCase());
    const actual = hit?.value ?? "";
    const want = expected[field] ?? "";
    if (
      isPlaceholderRequestType(actual) ||
      (actual.trim() && !isValidCompactTradeTypeCode(actual))
    ) {
      if (!diffs.some((d) => d.field === field)) {
        diffs.push({
          field,
          expected: want || "T|D|P|X",
          actual,
        });
      }
    }
  }
  return diffs;
}

export function chromeParityCriticalFieldNames(
  formFields: TradeboardPostRequestFormField[],
  hasActivity: boolean,
): string[] {
  const want = new Set<string>(["hdnSubmit", "hdnType", "hdnPairStr", "TradeType"]);
  if (hasActivity) {
    want.add("hdnLateDepDate");
    want.add("hdnDeleteAfter");
  }
  const names: string[] = [];
  for (const f of formFields) {
    if (want.has(f.name)) names.push(f.name);
    else if ([...want].some((w) => w.toLowerCase() === f.name.toLowerCase())) {
      names.push(f.name);
    }
  }
  return [...new Set(names)];
}
