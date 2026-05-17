/**
 * TB_postrequest.cgi inline activity scripts (ResetActivityList / SetAddedItems / GetSelectedString).
 * Extraction + rule inference from captured HTML — payload application lives in fieldMap.
 */

export const TB_POST_ACTIVITY_SCRIPT_NAMES = [
  "ResetActivityList",
  "SetAddedItems",
  "GetSelectedString",
] as const;

export type TbPostActivityScriptName = (typeof TB_POST_ACTIVITY_SCRIPT_NAMES)[number];

export type TbPostActivityScriptBodies = Record<TbPostActivityScriptName, string | null>;

/** Hidden fields SetAddedItems / ResetActivityList assign (parent-generated). */
export const ACTIVITY_PARENT_GENERATED_FIELD_ALIASES = {
  tripListCount: ["hdnTripListCount", "hdnTripCount"],
  schedulePairings: ["hdnSchedulePairings", "hdnSchedPairings"],
  splitStr: ["hdnSplitStr", "hdnSplits"],
  deleteAfter: ["hdnDeleteAfter", "hdnDeleteOn"],
  pairDate: ["PAIRDATE", "pairdate", "PairDate"],
  remPairCount: ["RemPairCount"],
  remPairIndex: ["RemPairIndex", "hdnPairingIndex"],
} as const;

export type ActivityParentFieldKey = keyof typeof ACTIVITY_PARENT_GENERATED_FIELD_ALIASES;

const LOG_BODY_MAX = 12_000;

export function truncateForActivityScriptLog(body: string | null): string | null {
  if (body == null) return null;
  const s = String(body);
  if (s.length <= LOG_BODY_MAX) return s;
  return `${s.slice(0, LOG_BODY_MAX)}\n/* …truncated ${s.length - LOG_BODY_MAX} chars */`;
}

/** Concatenate inline script text from HTML (best-effort). */
export function extractScriptSourcesFromHtml(html: string): string {
  const h = String(html ?? "");
  const chunks: string[] = [];
  const inlineRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = inlineRe.exec(h)) !== null) {
    const openTag = m[0].slice(0, m[0].indexOf(">") + 1);
    if (/\bsrc\s*=/i.test(openTag)) continue;
    const body = m[1]?.trim();
    if (body) chunks.push(body);
  }
  return chunks.join("\n\n");
}

/** Brace-match a `function Name(...) {` or `Name = function(...) {` body. */
export function extractJsFunctionBody(source: string, fnName: string): string | null {
  const src = String(source ?? "");
  const escaped = fnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`function\\s+${escaped}\\s*\\([^)]*\\)\\s*\\{`, "i"),
    new RegExp(`${escaped}\\s*=\\s*function\\s*\\([^)]*\\)\\s*\\{`, "i"),
    new RegExp(`${escaped}\\s*:\\s*function\\s*\\([^)]*\\)\\s*\\{`, "i"),
  ];
  let start = -1;
  for (const re of patterns) {
    const hit = re.exec(src);
    if (hit) {
      start = hit.index + hit[0].length;
      break;
    }
  }
  if (start < 0) return null;

  let depth = 1;
  let i = start;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < src.length && depth > 0) {
    const ch = src[i]!;
    const next = src[i + 1] ?? "";

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (inSingle) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i += 1;
      continue;
    }
    if (inDouble) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === '"') inDouble = false;
      i += 1;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    i += 1;
  }

  if (depth !== 0) return null;
  return src.slice(start, i - 1).trim();
}

export function extractTbPostRequestActivityScriptBodies(html: string): TbPostActivityScriptBodies {
  const script = extractScriptSourcesFromHtml(html);
  return {
    ResetActivityList: extractJsFunctionBody(script, "ResetActivityList"),
    SetAddedItems: extractJsFunctionBody(script, "SetAddedItems"),
    GetSelectedString: extractJsFunctionBody(script, "GetSelectedString"),
  };
}

function fieldNamesAssignedInBody(body: string): Set<string> {
  const names = new Set<string>();
  const re =
    /(?:\b(?:document|frm\w*|form\w*|f)\s*(?:\[[^\]]+\]|\.([A-Za-z_][\w]*)))\s*\.\s*value\s*=|getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.\s*value\s*=/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const n = m[1] || m[2];
    if (n) names.add(n);
  }
  return names;
}

function detectJoinDelimiter(body: string, fieldName: string): string {
  const esc = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`${esc}[^\\n]*\\+\\s*['"]\\|['"]`, "i").test(body)) return "|";
  if (new RegExp(`${esc}[^\\n]*\\+\\s*['"];['"]`, "i").test(body)) return ";";
  if (new RegExp(`${esc}[^\\n]*\\+\\s*['"],['"]`, "i").test(body)) return ",";
  return "|";
}

export type ActivityParentFieldRules = {
  scriptBodies: TbPostActivityScriptBodies;
  assignedInSetAdded: string[];
  assignedInReset: string[];
  schedulePairingsDelimiter: string;
  splitStrDelimiter: string;
  pairDateUsesColonDate: boolean;
};

export function buildActivityParentFieldRules(
  bodies: TbPostActivityScriptBodies,
): ActivityParentFieldRules {
  const setBody = bodies.SetAddedItems ?? "";
  const resetBody = bodies.ResetActivityList ?? "";
  const getBody = bodies.GetSelectedString ?? "";
  const assignedInSetAdded = [...fieldNamesAssignedInBody(setBody)];
  const assignedInReset = [...fieldNamesAssignedInBody(resetBody)];
  const schedName =
    assignedInSetAdded.find((n) => /schedulepair/i.test(n)) ?? "hdnSchedulePairings";
  const splitName = assignedInSetAdded.find((n) => /split/i.test(n)) ?? "hdnSplitStr";
  const pairDateUsesColonDate =
    /pairdate|pair\s*\+\s*['"]:['"]|:\s*\+\s*\w+\.date/i.test(setBody) ||
    /PAIRDATE/.test(getBody);
  return {
    scriptBodies: bodies,
    assignedInSetAdded,
    assignedInReset,
    schedulePairingsDelimiter: detectJoinDelimiter(setBody, schedName),
    splitStrDelimiter: detectJoinDelimiter(setBody, splitName),
    pairDateUsesColonDate,
  };
}
