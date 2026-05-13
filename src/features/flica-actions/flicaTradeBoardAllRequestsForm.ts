/**
 * TradeBoard "All Requests" — parse FLICA filter form and build a reset POST body
 * so native fetch matches an unfiltered Safari view (pairing tokens in HTML).
 */

const FLICA_ORIGIN = "https://jetblue.flica.net";

/** Same shape as crew-hub fallback pairing detector (keep in sync). */
export const TRADE_BOARD_PAIRING_TOKEN_RE = /\bJ[A-Z0-9]{3,5}:\d{1,2}[A-Z]{3}\b/gi;

export function tradeBoardPairingMatchCount(html: string): number {
  const m = String(html ?? "").match(new RegExp(TRADE_BOARD_PAIRING_TOKEN_RE.source, "gi"));
  return m?.length ?? 0;
}

export function tradeBoardHtmlContainsNothingMatchesCriteria(html: string): boolean {
  return /nothing\s+matches\s+your\s+criteria/i.test(String(html ?? ""));
}

export function resolveFlicaAbsoluteUrl(raw: string): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (t.startsWith("//")) return `https:${t}`;
  if (t.startsWith("/")) return `${FLICA_ORIGIN}${t}`;
  return `${FLICA_ORIGIN}/${t.replace(/^\.\//, "")}`;
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

function hasAttr(tag: string, attr: string): boolean {
  return new RegExp(`\\b${attr}\\b`, "i").test(tag);
}

export type TradeBoardOtherRequestsFormPick = {
  formOpenTagAttrs: string;
  innerHtml: string;
  actionUrl: string;
  method: "GET" | "POST";
};

/**
 * Pick the main All Requests filter form (action or fields reference tb_otherrequests / hdnType).
 */
export function findTradeBoardOtherRequestsForm(html: string): TradeBoardOtherRequestsFormPick | null {
  const h = String(html ?? "");
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let best: TradeBoardOtherRequestsFormPick | null = null;
  let bestScore = -1;
  let m: RegExpExecArray | null;
  while ((m = formRe.exec(h)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    const actionRaw = getAttr(attrs, "action");
    const actionAbs = resolveFlicaAbsoluteUrl(actionRaw);
    const innerL = inner.toLowerCase();
    const actL = actionAbs.toLowerCase();
    let score = 0;
    if (actL.includes("tb_otherrequests") || actL.includes("otherrequests")) score += 120;
    if (innerL.includes("hdntype")) score += 60;
    if (innerL.includes("chkreqtype")) score += 40;
    if (innerL.includes("hdnreqtypes")) score += 20;
    if (innerL.includes("hdnbase")) score += 10;
    score += Math.min(40, Math.floor(inner.length / 2500));
    if (score > bestScore) {
      bestScore = score;
      const methodRaw = (getAttr(attrs, "method") || "GET").toUpperCase();
      best = {
        formOpenTagAttrs: attrs,
        innerHtml: inner,
        actionUrl: actionAbs || `${FLICA_ORIGIN}/online/tb_otherrequests.cgi?bcid=002.000`,
        method: methodRaw === "POST" ? "POST" : "GET",
      };
    }
  }
  return bestScore > 0 ? best : null;
}

type FormEntry = { name: string; value: string };

function isReqTypeCheckboxName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === "chkreqtype" || n === "chkreqtypes" || (n.includes("chk") && n.includes("req") && n.includes("type"));
}

function parseSelect(name: string, block: string): string {
  const optRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  let chosen = "";
  let fallback = "";
  let om: RegExpExecArray | null;
  while ((om = optRe.exec(block)) !== null) {
    const oa = om[1];
    const ot = om[2];
    const v = getAttr(oa, "value");
    const label = String(ot ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const val = v || label;
    if (!fallback && val) fallback = val;
    if (hasAttr(oa, "selected") && val) {
      chosen = val;
      break;
    }
  }
  return chosen || fallback;
}

/**
 * Serialize fields from a form body in DOM order (inputs + selects). Checkboxes: checked only,
 * except req-type checkboxes are handled separately in {@link buildTradeBoardAllRequestsResetBody}.
 */
export function extractTradeBoardFormEntries(formInner: string): {
  entries: FormEntry[];
  reqTypeCheckboxValues: string[];
  reqTypeCheckboxName: string | null;
  submit: FormEntry | null;
} {
  const entries: FormEntry[] = [];
  const reqTypeCheckboxValues: string[] = [];
  let reqTypeCheckboxName: string | null = null;
  let submit: FormEntry | null = null;

  let pos = 0;
  const inner = String(formInner ?? "");
  while (pos < inner.length) {
    const low = inner.toLowerCase();
    const iIn = low.indexOf("<input", pos);
    const iSel = low.indexOf("<select", pos);
    const takeInput = iIn >= 0 && (iSel < 0 || iIn <= iSel);
    if (takeInput && iIn >= 0) {
      const gt = inner.indexOf(">", iIn);
      if (gt < 0) break;
      const tag = inner.slice(iIn, gt + 1);
      pos = gt + 1;
      const type = (getAttr(tag, "type") || "text").toLowerCase();
      const name = getAttr(tag, "name");
      const value = getAttr(tag, "value");
      const disabled = hasAttr(tag, "disabled");
      if (disabled || !name) continue;
      if (type === "submit" || type === "image" || type === "button") {
        if (type === "submit" || type === "image") {
          if (!submit || type === "submit") {
            submit = { name, value: value || "Submit" };
          }
        }
        continue;
      }
      if (type === "hidden") {
        entries.push({ name, value });
        continue;
      }
      if (type === "checkbox") {
        if (isReqTypeCheckboxName(name)) {
          if (!reqTypeCheckboxName) reqTypeCheckboxName = name;
          if (value) reqTypeCheckboxValues.push(value);
          if (hasAttr(tag, "checked") && value) {
            entries.push({ name, value });
          }
        } else if (hasAttr(tag, "checked")) {
          entries.push({ name, value: value || "on" });
        }
        continue;
      }
      if (type === "radio") {
        if (hasAttr(tag, "checked")) entries.push({ name, value });
        continue;
      }
      entries.push({ name, value });
      continue;
    }
    if (iSel >= 0) {
      const close = low.indexOf("</select", iSel);
      if (close < 0) break;
      const endGt = inner.indexOf(">", close);
      if (endGt < 0) break;
      const block = inner.slice(iSel, endGt + 1);
      pos = endGt + 1;
      const openEnd = inner.indexOf(">", iSel);
      const openTag = openEnd > 0 ? inner.slice(iSel, openEnd + 1) : "";
      const selName = getAttr(openTag, "name");
      if (!selName || hasAttr(openTag, "disabled")) continue;
      const selVal = parseSelect(selName, block);
      entries.push({ name: selName, value: selVal });
      continue;
    }
    break;
  }

  const effectiveSubmit = submit ?? fallbackSubmitFromInner(inner);
  return { entries, reqTypeCheckboxValues, reqTypeCheckboxName, submit: effectiveSubmit };
}

function fallbackSubmitFromInner(inner: string): FormEntry | null {
  const re = /<input\b([^>]*\btype\s*=\s*["']submit["'][^>]*)>/gi;
  let m: RegExpExecArray | null;
  let last: FormEntry | null = null;
  while ((m = re.exec(inner)) !== null) {
    const tag = m[0];
    const name = getAttr(tag, "name");
    const value = getAttr(tag, "value") || "Submit";
    if (name) last = { name, value };
  }
  return last;
}

function uniqPreserveOrder(vals: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of vals) {
    const k = v.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function entriesWithoutNames(entries: FormEntry[], names: Set<string>): FormEntry[] {
  return entries.filter((e) => !names.has(e.name.toLowerCase()));
}

export type TradeBoardAllRequestsResetOptions = {
  /** e.g. JFK — overrides hdnBase when present in form. */
  base?: string | null;
  /** e.g. FA — overrides hdnPos when present in form. */
  position?: string | null;
};

/**
 * Build application/x-www-form-urlencoded body: start from parsed form entries, widen request-type
 * checkboxes to every option found in markup, then apply known-good filter defaults.
 */
export function buildTradeBoardAllRequestsResetBody(
  formInner: string,
  opts?: TradeBoardAllRequestsResetOptions,
): { body: string; debug: { submitUsed: FormEntry | null; reqTypeValuesUsed: string[] } } {
  const { entries, reqTypeCheckboxValues, reqTypeCheckboxName, submit } =
    extractTradeBoardFormEntries(formInner);
  const chkName = reqTypeCheckboxName || (reqTypeCheckboxValues.length ? "chkReqType" : "");

  let next = entries.slice();
  const omit = new Set<string>(["chkreqtype", "chkreqtypes"]);

  next = entriesWithoutNames(next, omit);

  const allReqTypes = uniqPreserveOrder(reqTypeCheckboxValues);
  if (chkName && allReqTypes.length) {
    for (const v of allReqTypes) {
      next.push({ name: chkName, value: v });
    }
  }

  const overrides: FormEntry[] = [
    { name: "hdnType", value: "All" },
    { name: "hdnPageNum", value: "1" },
    { name: "hdnHideConflicts", value: "N" },
    { name: "hdnSaveFilter", value: "N" },
    { name: "hdnNumPerPage", value: "200" },
    { name: "hdnSetRequestsPerPage", value: "200" },
  ];

  const oNames = new Set(overrides.map((o) => o.name.toLowerCase()));
  next = next.filter((e) => !oNames.has(e.name.toLowerCase()));
  next.push(...overrides);

  if (/\bname\s*=\s*["']WithSorting["']/i.test(formInner)) {
    next = next.filter((e) => e.name.toLowerCase() !== "withsorting");
    next.push({ name: "WithSorting", value: "Y" });
  }
  if (/\bname\s*=\s*["']OptOrder["']/i.test(formInner)) {
    next = next.filter((e) => e.name.toLowerCase() !== "optorder");
    next.push({ name: "OptOrder", value: "0" });
  }
  if (/\bname\s*=\s*["']hdnReqTypes["']/i.test(formInner) && allReqTypes.length) {
    next = next.filter((e) => e.name.toLowerCase() !== "hdnreqtypes");
    next.push({ name: "hdnReqTypes", value: allReqTypes.join(",") });
  }

  const baseTrim = String(opts?.base ?? "").trim();
  if (baseTrim) {
    next = next.filter((e) => e.name.toLowerCase() !== "hdnbase");
    next.push({ name: "hdnBase", value: baseTrim });
  }
  const posTrim = String(opts?.position ?? "").trim();
  if (posTrim) {
    next = next.filter((e) => e.name.toLowerCase() !== "hdnpos");
    next.push({ name: "hdnPos", value: posTrim });
  }

  const submitUsed = submit ?? ({ name: "", value: "" } as FormEntry);
  if (submitUsed.name) {
    next = next.filter(
      (e) => e.name.toLowerCase() !== submitUsed.name.toLowerCase(),
    );
    next.push(submitUsed);
  }

  const usp = new URLSearchParams();
  for (const { name, value } of next) {
    if (!name) continue;
    usp.append(name, value);
  }

  return {
    body: usp.toString(),
    debug: { submitUsed: submitUsed.name ? submitUsed : null, reqTypeValuesUsed: allReqTypes },
  };
}

export function extractHiddenFieldsFromHtml(html: string, max = 200): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  const h = String(html ?? "");
  const re = /<input([^>]*type\s*=\s*["']hidden["'][^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(h)) !== null && out.length < max) {
    const attrs = m[1];
    const name = getAttr(attrs, "name");
    const value = getAttr(attrs, "value");
    if (name) out.push({ name, value: value.slice(0, 400) });
  }
  return out;
}

export function tradeBoardAllRequestsGetCandidateUrls(bcid: string): string[] {
  const b = String(bcid ?? "").trim() || "002.000";
  const raw = [
    `${FLICA_ORIGIN}/online/tb_otherrequests.cgi?bcid=${b}`,
    `${FLICA_ORIGIN}/online/tb_otherrequests.cgi?BCID=${b}`,
    `${FLICA_ORIGIN}/online/TB_otherrequests.cgi?bcid=${b}`,
    `${FLICA_ORIGIN}/online/TB_otherrequests.cgi?BCID=${b}`,
    `${FLICA_ORIGIN}/TB_otherrequests.cgi?BCID=${b}`,
    new URL(`../online/TB_otherrequests.cgi?BCID=${encodeURIComponent(b)}`, `${FLICA_ORIGIN}/online/`).href,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of raw) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}
