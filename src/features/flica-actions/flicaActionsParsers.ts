import { extractHtmlTitle } from "./flicaActionsParser";
import type { FlicaNativePageModel } from "./flicaActionsTypes";

const FLICA_HOST = "https://jetblue.flica.net";

function safeStr(v: unknown): string {
  return v == null ? "" : String(v);
}

function safeLower(v: unknown): string {
  return safeStr(v).toLowerCase();
}

function decodeHtmlEntities(s: string): string {
  return (
    safeStr(s)
      .replace(/&nbsp;/gi, " ")
      .replace(/&#160;/g, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => {
        const n = parseInt(h, 16);
        return Number.isFinite(n) && n > 0 ? String.fromCharCode(n) : "";
      })
      .replace(/&#(\d{1,6});/g, (_, d) => {
        const n = Number(d);
        return Number.isFinite(n) && n > 0 ? String.fromCharCode(n) : "";
      })
  );
}

function stripTags(s: unknown): string {
  const t = safeStr(s)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ");
  return decodeHtmlEntities(t).replace(/\s+/g, " ").trim();
}

function resolveUrl(raw: unknown): string {
  const t = safeStr(raw).trim();
  if (!t) return "";
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (t.startsWith("//")) return `https:${t}`;
  if (t.startsWith("/")) return `${FLICA_HOST}${t}`;
  return `${FLICA_HOST}/${t.replace(/^\.\//, "")}`;
}

function collectWarningsErrors(html: unknown): string[] {
  const out: string[] = [];
  const lower = safeLower(html);
  if (lower.includes("application error")) out.push("application_error");
  if (lower.includes("page request failed")) out.push("page_request_failed");
  if (
    (lower.includes("userid") || lower.includes("user id")) &&
    lower.includes("password") &&
    lower.includes("login")
  ) {
    out.push("login_required");
  }
  if (
    lower.includes("g-recaptcha") ||
    lower.includes("recaptcha") ||
    lower.includes("turnstile")
  ) {
    out.push("captcha_or_bot_challenge");
  }
  const h = safeStr(html);
  const errMatch = h.match(/class\s*=\s*["'][^"']*error[^"']*["'][^>]*>([\s\S]{0,200})/i);
  if (errMatch && stripTags(errMatch[1]).length > 3) {
    out.push(`inline: ${stripTags(errMatch[1]).slice(0, 160)}`);
  }
  return out;
}

function inferPageType(url: unknown, html: unknown): string {
  const u = safeLower(url);
  const b = safeLower(html);
  if (u.includes("tb_frame.cgi")) return "tradeboard_frame";
  if (u.includes("tb_myrequests.cgi")) return "tradeboard_my_requests";
  if (u.includes("tb_otherrequests.cgi")) return "tradeboard_all_requests";
  if (u.includes("tb_myfavorites.cgi")) return "tradeboard_favorites";
  if (u.includes("tb_myresponses.cgi")) return "tradeboard_my_responses";
  if (u.includes("tb_postrequest.cgi")) return "tradeboard_post_request";
  if (u.includes("otframe.cgi")) return "opentime_frame";
  if (u.includes("otrequest.cgi")) return "opentime_requests";
  if (u.includes("otopentimepot.cgi")) return "opentime_pot";
  if (u.includes("otswap.cgi")) return "opentime_swap_preview";
  if (u.includes("ottrade2.cgi")) return "opentime_trade_preview_step2";
  if (u.includes("ottrade.cgi")) return "opentime_trade_preview";
  if (u.includes("otadd.cgi")) return "opentime_add_preview";
  if (u.includes("otdrop.cgi")) return "opentime_drop_preview";
  if (b.includes("tradeboard") && b.includes("my requests")) return "tradeboard_my_requests";
  if (b.includes("all requests")) return "tradeboard_all_requests";
  if (b.includes("opentime pot")) return "opentime_pot";
  return "unknown";
}

function extractTableRows(html: unknown, maxRows = 120): string[][] {
  const rows: string[][] = [];
  const h = safeStr(html);
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(h)) !== null && rows.length < maxRows) {
    const tr = safeStr(m[1]);
    const cells: string[] = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(tr)) !== null) {
      cells.push(stripTags(cm[1]));
    }
    if (cells.length > 0 && cells.some((c) => c.length > 0)) rows.push(cells);
  }
  return rows;
}

function extractButtons(html: unknown, max = 80): FlicaNativePageModel["buttons"] {
  const out: FlicaNativePageModel["buttons"] = [];
  const h = safeStr(html);
  const btnRe = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
  let m: RegExpExecArray | null;
  while ((m = btnRe.exec(h)) !== null && out.length < max) {
    const attrs = safeStr(m[1]);
    const text = stripTags(m[2]);
    const name = safeStr((attrs.match(/\bname\s*=\s*["']([^"']*)["']/i) || [])[1]);
    const typRaw = (attrs.match(/\btype\s*=\s*["']([^"']*)["']/i) || [])[1];
    const typ = safeLower(typRaw || "submit");
    const value = safeStr((attrs.match(/\bvalue\s*=\s*["']([^"']*)["']/i) || [])[1]);
    out.push({ tag: "BUTTON", type: typ || "submit", name, value, text });
  }
  const inputRe =
    /<input\s([^>]*type\s*=\s*["'](?:button|submit|reset|image)["'][^>]*)>/gi;
  while ((m = inputRe.exec(h)) !== null && out.length < max) {
    const attrs = safeStr(m[1]);
    const typRaw = (attrs.match(/\btype\s*=\s*["']([^"']*)["']/i) || [])[1];
    const typ = safeLower(typRaw || "button") || "button";
    const name = safeStr((attrs.match(/\bname\s*=\s*["']([^"']*)["']/i) || [])[1]);
    const value = safeStr((attrs.match(/\bvalue\s*=\s*["']([^"']*)["']/i) || [])[1]);
    const alt = safeStr((attrs.match(/\balt\s*=\s*["']([^"']*)["']/i) || [])[1]);
    out.push({
      tag: "INPUT",
      type: typ,
      name,
      value,
      text: value || alt,
    });
  }
  return out;
}

function extractForms(html: unknown, maxForms = 25): FlicaNativePageModel["forms"] {
  const forms: FlicaNativePageModel["forms"] = [];
  const h = safeStr(html);
  const formRe = /<form([^>]*)>([\s\S]*?)<\/form>/gi;
  let fm: RegExpExecArray | null;
  while ((fm = formRe.exec(h)) !== null && forms.length < maxForms) {
    const attrs = safeStr(fm[1]);
    const body = safeStr(fm[2]);
    const actionRaw = (attrs.match(/\baction\s*=\s*["']([^"']*)["']/i) || [])[1];
    const methodRaw = (attrs.match(/\bmethod\s*=\s*["']([^"']*)["']/i) || [])[1];
    const action = resolveUrl(actionRaw);
    const method = safeStr(methodRaw || "get").trim().toUpperCase() || "GET";
    const names: string[] = [];
    const inputNameRe = /<input[^>]*\bname\s*=\s*["']([^"']*)["']/gi;
    let im: RegExpExecArray | null;
    while ((im = inputNameRe.exec(body)) !== null) {
      const nm = safeStr(im[1]).trim();
      if (nm) names.push(nm);
    }
    const selRe = /<select[^>]*\bname\s*=\s*["']([^"']*)["']/gi;
    while ((im = selRe.exec(body)) !== null) {
      const nm = safeStr(im[1]).trim();
      if (nm) names.push(nm);
    }
    const taRe = /<textarea[^>]*\bname\s*=\s*["']([^"']*)["']/gi;
    while ((im = taRe.exec(body)) !== null) {
      const nm = safeStr(im[1]).trim();
      if (nm) names.push(nm);
    }
    forms.push({
      action,
      method,
      fieldCount: names.length,
      fieldNames: names.slice(0, 60),
    });
  }
  return forms;
}

function extractHiddenFields(
  html: unknown,
  max = 120,
): FlicaNativePageModel["hiddenFields"] {
  const out: FlicaNativePageModel["hiddenFields"] = [];
  const h = safeStr(html);
  const re = /<input([^>]*type\s*=\s*["']hidden["'][^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(h)) !== null && out.length < max) {
    const attrs = safeStr(m[1]);
    const name = safeStr((attrs.match(/\bname\s*=\s*["']([^"']*)["']/i) || [])[1]);
    const value = safeStr((attrs.match(/\bvalue\s*=\s*["']([^"']*)["']/i) || [])[1]);
    out.push({ name, value: value.slice(0, 400) });
  }
  return out;
}

function extractActionEndpoints(html: unknown, max = 150): string[] {
  const set = new Set<string>();
  const h = safeStr(html);
  const re = /(?:href|action)\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(h)) !== null && set.size < max) {
    const raw = m[1];
    const u = resolveUrl(raw);
    if (u && u.includes("flica.net")) set.add(u);
  }
  return [...set].sort();
}

function emptyModel(
  requestUrl: unknown,
  html: unknown,
  extraWarnings: string[],
): FlicaNativePageModel {
  const safeUrl = safeStr(requestUrl);
  const safeHtml = safeStr(html);
  const baseWarnings = collectWarningsErrors(safeHtml);
  return {
    pageTitle: null,
    pageType: inferPageType(safeUrl, safeHtml),
    rows: [],
    buttons: [],
    forms: [],
    hiddenFields: [],
    actionEndpoints: [],
    warningsErrors: [...baseWarnings, ...extraWarnings],
  };
}

/**
 * Parse FLICA HTML into a normalized structure for dev/native preview (GET responses only).
 */
export function parseFlicaNativePage(html: string, requestUrl: string): FlicaNativePageModel {
  const safeHtml = safeStr(html);
  const safeUrl = safeStr(requestUrl);
  try {
    const pageTitle = extractHtmlTitle(safeHtml);
    const pageType = inferPageType(safeUrl, safeHtml);
    const warningsErrors = collectWarningsErrors(safeHtml);
    return {
      pageTitle,
      pageType,
      rows: extractTableRows(safeHtml),
      buttons: extractButtons(safeHtml),
      forms: extractForms(safeHtml),
      hiddenFields: extractHiddenFields(safeHtml),
      actionEndpoints: extractActionEndpoints(safeHtml),
      warningsErrors,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const m = emptyModel(safeUrl, safeHtml, [
      `parse_exception: ${msg.slice(0, 240)}`,
    ]);
    if (safeLower(safeUrl).includes("tb_postrequest.cgi")) {
      m.pageType = "tradeboard_post_request";
    }
    return m;
  }
}

export function summarizeNativeParseForPreview(p: FlicaNativePageModel, maxRows = 8): string {
  const lines: string[] = [
    `type=${safeStr(p.pageType)} title=${p.pageTitle ?? "(none)"}`,
    `rows=${p.rows?.length ?? 0} buttons=${p.buttons?.length ?? 0} forms=${p.forms?.length ?? 0} hidden=${p.hiddenFields?.length ?? 0}`,
    `warnings=${(p.warningsErrors ?? []).join("; ") || "(none)"}`,
  ];
  const rows = p.rows ?? [];
  for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
    const cells = (rows[i] ?? []).map((c) => safeStr(c));
    lines.push(`row[${i}]: ${cells.join(" | ").slice(0, 200)}`);
  }
  const buttons = p.buttons ?? [];
  if (buttons.length) {
    lines.push(
      `buttons: ${buttons
        .slice(0, 12)
        .map((b) => safeStr(b.text ?? b.name ?? b.value ?? b.type))
        .join("; ")}`,
    );
  }
  const hidden = p.hiddenFields ?? [];
  if (hidden.length) {
    lines.push(
      `hidden (name=value): ${hidden
        .slice(0, 24)
        .map((h) => `${safeStr(h.name)}=${safeStr(h.value).slice(0, 100)}`)
        .join(" | ")}`,
    );
  }
  return lines.join("\n");
}
