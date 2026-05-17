/**
 * TradeBoard My Requests — unified table-row parse (fields + edit/delete on same row).
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import type { TradeboardPost } from "../crew-schedule/flicaCrewHubTypes";
import { mapTradeboardRowsToPosts } from "../crew-schedule/flicaCrewHubMappers";
import { resolveFlicaAbsoluteUrl } from "./flicaTradeBoardAllRequestsForm";
import {
  tradeboardEditRequestUrl,
  tradeboardMyRequestDeleteUrl,
} from "./flicaTradeBoardMyRequestsActions";
import type { TradeboardMyRequestActionRow } from "./flicaTradeBoardPostRequestTypes";
import { parseFlicaPairOnclick, buildTradeboardPairingDetailUrl } from "./flicaPairingDetailUrl";

const LOG_ACTIONS = "FC_TB_MY_REQUESTS_PARSE_ACTIONS";
const LOG_FIELDS = "FC_TB_MY_REQUESTS_FIELD_PARSE";

export type MyRequestsTableRowRecord = {
  pipeLine: string;
  rawTrHtml: string;
  cells: string[];
};

function collapseWs(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function stripScripts(html: string): string {
  return String(html ?? "").replace(/<script\b[\s\S]*?<\/script>/gi, " ");
}

function decodeHtmlEntities(s: string): string {
  return String(s ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');
}

function tradeboardTdInnerToPlain(html: string): string {
  let s = String(html ?? "");
  s = s.replace(/<br\s*\/?>/gi, " ");
  s = s.replace(/<\/?[a-zA-Z][^>]{0,800}?>/g, " ");
  s = decodeHtmlEntities(s);
  return collapseWs(s);
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

function extractReqIdFromHaystack(hay: string): string {
  const h = String(hay ?? "");
  const m =
    /(?:^|[?&])reqId=(\d+)/i.exec(h) ??
    /TB_EditRequest\.cgi[^"']*reqId=(\d+)/i.exec(h) ??
    /(?:^|[?&])DeleteMe=(\d+)/i.exec(h) ??
    /TB_MyRequests\.cgi[^"']*DeleteMe=(\d+)/i.exec(h) ??
    /reqId\s*[=:]\s*['"]?(\d+)/i.exec(h) ??
    /DeleteMe\s*[=:]\s*['"]?(\d+)/i.exec(h);
  return m?.[1]?.trim() ?? "";
}

function lineHasPairingToken(line: string): boolean {
  return /\bJ[A-Z0-9]{3,5}\s*(?::|&#58;|&#x3A;|&colon;)?\s*\d{1,2}[A-Z]{3}\b/i.test(line);
}

const ACTION_CELL_RE = /^(?:edit|delete|remove|yes|no|\s|×|x|\u2713|\u2717|☐|☑|✓|✗|-+)$/i;

/** Drop leading action/checkbox column cells before column mapping. */
export function stripMyRequestsActionCells(cells: string[]): string[] {
  const out = [...cells];
  while (out.length > 0) {
    const c = out[0]!.trim();
    if (!c) {
      out.shift();
      continue;
    }
    if (ACTION_CELL_RE.test(c)) {
      out.shift();
      continue;
    }
    if (/^edit\s*delete$/i.test(c) || /^delete\s*edit$/i.test(c)) {
      out.shift();
      continue;
    }
    break;
  }
  return out;
}

/** Each data `<tr>` on TB_MyRequests.cgi → pipe line + raw HTML for action extraction. */
export function extractMyRequestsTableRowRecords(html: string): MyRequestsTableRowRecord[] {
  const src = stripScripts(String(html ?? ""));
  const records: MyRequestsTableRowRecord[] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(src)) !== null) {
    const inner = m[1] ?? "";
    const rawTrHtml = m[0] ?? "";
    const u = inner.toUpperCase();
    if (/PAIRING\s+DETAILS|RESPONSE\s+METHODS|TYPE\s+.*\s+TRIP/i.test(u) && inner.length < 500) {
      continue;
    }
    const hasPair = /\bJ[A-Z0-9]{3,5}\b/i.test(inner);
    const hasActions =
      /TB_EditRequest\.cgi/i.test(inner) ||
      /DeleteMe\s*=/i.test(inner) ||
      /\bEdit\b/i.test(inner) ||
      /\bDelete\b/i.test(inner);
    if (!hasPair && !hasActions) continue;

    const cells: string[] = [];
    const tdRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tm: RegExpExecArray | null;
    while ((tm = tdRe.exec(inner)) !== null) {
      cells.push(tradeboardTdInnerToPlain(tm[1] ?? ""));
    }
    if (cells.length < 3) continue;
    const pipe = cells.map((c) => c.replace(/\s*\|\s*/g, " ").trim()).join(" | ");
    if (pipe.length < 20) continue;
    if (!lineHasPairingToken(pipe) && !hasActions) continue;
    records.push({ pipeLine: pipe, rawTrHtml, cells });
  }
  return records;
}

export type MyRequestRowActions = {
  reqId: string;
  editRequestId: string;
  deleteRequestId: string;
  editUrl: string;
  deleteUrl: string;
  hasEdit: boolean;
  hasDelete: boolean;
  treq: string;
};

/** Extract reqId + URLs from one table row's raw HTML (anchors, inputs, onclick). */
export function extractMyRequestActionsFromRowHtml(rawRowHtml: string): MyRequestRowActions {
  const h = String(rawRowHtml ?? "");
  const haystacks: string[] = [h];

  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let am: RegExpExecArray | null;
  while ((am = anchorRe.exec(h)) !== null) {
    const attrs = am[1] ?? "";
    const label = tradeboardTdInnerToPlain(am[2] ?? "");
    const href = resolveFlicaAbsoluteUrl(getAttr(attrs, "href"));
    const onclick = getAttr(attrs, "onclick");
    haystacks.push(`${href} ${onclick} ${label}`);
  }

  const controlRe = /<(?:input|button)\b([^>]*)>/gi;
  let cm: RegExpExecArray | null;
  while ((cm = controlRe.exec(h)) !== null) {
    const attrs = cm[1] ?? "";
    const onclick = getAttr(attrs, "onclick");
    const value = getAttr(attrs, "value");
    haystacks.push(`${onclick} ${value} ${getAttr(attrs, "name")}`);
  }

  let reqId = "";
  let editUrl = "";
  let deleteUrl = "";
  let hasEdit = false;
  let hasDelete = false;

  for (const hay of haystacks) {
    if (/\bEdit\b/i.test(hay) || /TB_EditRequest\.cgi/i.test(hay)) hasEdit = true;
    if (/\bDelete\b/i.test(hay) || /DeleteMe\s*=/i.test(hay)) hasDelete = true;
    const rid = extractReqIdFromHaystack(hay);
    if (rid && !reqId) reqId = rid;
    if (/TB_EditRequest\.cgi/i.test(hay) || /reqId\s*=/i.test(hay)) {
      const eu =
        resolveFlicaAbsoluteUrl(
          (/(https?:\/\/[^\s"'<>]+TB_EditRequest\.cgi[^\s"'<>]*)/i.exec(hay)?.[1] ??
            /(\/online\/TB_EditRequest\.cgi[^\s"'<>]*)/i.exec(hay)?.[1]) ||
            "",
        ) || (reqId ? tradeboardEditRequestUrl(reqId) : "");
      if (eu) editUrl = eu;
    }
    if (/DeleteMe\s*=/i.test(hay)) {
      const du =
        resolveFlicaAbsoluteUrl(
          (/(https?:\/\/[^\s"'<>]+TB_MyRequests\.cgi[^\s"'<>]*DeleteMe=\d+[^\s"'<>]*)/i.exec(
            hay,
          )?.[1] ??
            /(\/online\/TB_MyRequests\.cgi[^\s"'<>]*DeleteMe=\d+[^\s"'<>]*)/i.exec(hay)?.[1]) ||
            "",
        ) || (reqId ? tradeboardMyRequestDeleteUrl(reqId) : "");
      if (du) deleteUrl = du;
    }
  }

  if (!reqId) reqId = extractReqIdFromHaystack(h);
  if (reqId && !editUrl) editUrl = tradeboardEditRequestUrl(reqId);
  if (reqId && !deleteUrl) deleteUrl = tradeboardMyRequestDeleteUrl(reqId);

  const treqM = /treq\s*[=:]\s*['"]?(\d+)/i.exec(h);
  return {
    reqId,
    editRequestId: reqId,
    deleteRequestId: reqId,
    editUrl,
    deleteUrl,
    hasEdit: hasEdit || Boolean(editUrl || reqId),
    hasDelete: hasDelete || Boolean(deleteUrl || reqId),
    treq: treqM?.[1] ?? "",
  };
}

function pickSeat(cells: string[]): string {
  for (const c of cells) {
    const t = c.trim();
    if (/^[A-Z]$/i.test(t)) return t.toUpperCase();
  }
  return "";
}

function buildMyRequestActionRow(
  post: TradeboardPost,
  actions: MyRequestRowActions,
): TradeboardMyRequestActionRow {
  return {
    pairingId: post.pairingId,
    dateLabel: post.pairingDateLabel,
    requestType: post.type,
    reqId: actions.reqId,
    treq: actions.treq,
    editUrl: actions.editUrl,
    deleteUrl: actions.deleteUrl,
    editRequestId: actions.editRequestId,
    deleteRequestId: actions.deleteRequestId,
    base: post.base,
    position: post.position,
    comments: post.comments,
    postedAt: post.postedAtLabel || post.postedAt,
    responseMethods: post.responseMethodLabel || post.responseMethods,
    pairingDetailUrl: post.pairingDetailUrl,
    sourcePage: "my_requests",
    pairingDateYmd: post.pairingDateYmd ?? post.dateYmd,
    rawPreview: post.rawText.slice(0, 200),
  };
}

/** Attach top-level + myRequest edit/delete fields on a parsed My Requests row. */
export function applyMyRequestFieldsToPost(
  post: TradeboardPost,
  actions: MyRequestRowActions,
  rawTrHtml: string,
): TradeboardPost {
  const oc = parseFlicaPairOnclick(rawTrHtml);
  const pairingDetailUrl =
    post.pairingDetailUrl?.trim() ||
    (oc ? buildTradeboardPairingDetailUrl(oc.pid, oc.dateYmd) : undefined);
  const pairingDateYmd = post.pairingDateYmd ?? post.dateYmd ?? oc?.dateYmd;

  const myRequest =
    actions.reqId || actions.editUrl || actions.deleteUrl
      ? buildMyRequestActionRow(post, actions)
      : post.myRequest;

  return {
    ...post,
    isMyRequest: true,
    sourceTab: "my_requests",
    seat: post.seat || pickSeat(post.rawCells),
    pairingDetailUrl,
    pairingDateYmd,
    dateYmd: pairingDateYmd,
    pairingDetailUrlFromLiveHtml: post.pairingDetailUrlFromLiveHtml || Boolean(oc && pairingDetailUrl),
    reqId: actions.reqId || post.reqId,
    editRequestId: actions.editRequestId || post.editRequestId,
    deleteRequestId: actions.deleteRequestId || post.deleteRequestId,
    editUrl: actions.editUrl || post.editUrl,
    deleteUrl: actions.deleteUrl || post.deleteUrl,
    canEdit: actions.hasEdit || Boolean(actions.editUrl || actions.reqId),
    canDelete: actions.hasDelete || Boolean(actions.deleteUrl || actions.reqId),
    myRequest,
  };
}

function buildPostFromTableRecord(
  record: MyRequestsTableRowRecord,
  sourceUrl: string,
): TradeboardPost | null {
  const mappedCells = stripMyRequestsActionCells(record.cells);
  const fromMapper = mapTradeboardRowsToPosts([mappedCells], "my_requests", sourceUrl);
  let post = fromMapper[0] ?? null;
  if (!post) {
    const fromLine = mapTradeboardRowsToPosts([[record.pipeLine]], "my_requests", sourceUrl);
    post = fromLine[0] ?? null;
  }
  if (!post) return null;

  const actions = extractMyRequestActionsFromRowHtml(record.rawTrHtml);
  return applyMyRequestFieldsToPost(
    {
      ...post,
      rawCells: mappedCells.length ? mappedCells : post.rawCells,
      rawText: record.pipeLine,
      isMyRequest: true,
      sourceTab: "my_requests",
    },
    actions,
    record.rawTrHtml,
  );
}

export type TradeboardMyRequestsPageParse = {
  posts: TradeboardPost[];
  tableRowCount: number;
};

/** Primary My Requests page parser — one object per visible FLICA row. */
export function parseTradeboardMyRequestsPage(
  html: string,
  sourceUrl: string,
): TradeboardMyRequestsPageParse {
  const h = String(html ?? "");
  const records = extractMyRequestsTableRowRecords(h);
  const posts: TradeboardPost[] = [];
  const seen = new Set<string>();

  for (const rec of records) {
    const post = buildPostFromTableRecord(rec, sourceUrl);
    if (!post?.pairingId) continue;
    const k = `${post.pairingId}:${post.pairingDateLabel}:${post.reqId ?? ""}:${post.type}`;
    if (seen.has(k)) continue;
    seen.add(k);
    posts.push(post);
  }

  const first = posts[0];
  fcDevMirrorScheduleLogToFile(LOG_FIELDS, {
    tableRowCount: records.length,
    postCount: posts.length,
    firstRow: first
      ? {
          type: first.type,
          typeLabel: first.typeLabel,
          pairingId: first.pairingId,
          pairingDateLabel: first.pairingDateLabel,
          pairingDateYmd: first.pairingDateYmd,
          base: first.base,
          position: first.position,
          seat: first.seat,
          days: first.days,
          reportTime: first.reportTime,
          departTime: first.departTime,
          arriveTime: first.arriveTime,
          block: first.block,
          credit: first.credit,
          layover: first.layover,
          comments: first.comments,
          postedAtLabel: first.postedAtLabel,
          responseMethods: first.responseMethods,
          reqId: first.reqId,
          editUrl: first.editUrl,
          deleteUrl: first.deleteUrl,
        }
      : null,
  });

  fcDevMirrorScheduleLogToFile(LOG_ACTIONS, {
    htmlLength: h.length,
    rowCount: posts.length,
    tableRowCount: records.length,
    firstRows: posts.slice(0, 5).map((r) => ({
      pairingId: r.pairingId,
      reqId: r.reqId ?? r.myRequest?.reqId,
      editUrl: r.editUrl ?? r.myRequest?.editUrl,
      deleteUrl: r.deleteUrl ?? r.myRequest?.deleteUrl,
      hasEdit: r.canEdit,
      hasDelete: r.canDelete,
      rawText: r.rawText.slice(0, 120),
    })),
  });

  if (__DEV__) {
    console.log(`[${LOG_ACTIONS}]`, JSON.stringify({ rowCount: posts.length, tableRowCount: records.length }));
    console.log(`[${LOG_FIELDS}]`, JSON.stringify({ postCount: posts.length }));
  }

  return { posts, tableRowCount: records.length };
}

export function tradeboardPostMyRequestReqId(p: TradeboardPost): string {
  return (p.myRequest?.reqId ?? p.reqId ?? "").trim();
}

export function tradeboardPostMyRequestDeleteUrl(p: TradeboardPost): string {
  return (p.myRequest?.deleteUrl ?? p.deleteUrl ?? "").trim();
}

export function tradeboardPostShowsMyRequestActions(p: TradeboardPost): boolean {
  return Boolean(
    tradeboardPostMyRequestReqId(p) ||
      p.editUrl?.trim() ||
      p.deleteUrl?.trim() ||
      p.canEdit ||
      p.canDelete,
  );
}

const LOG_RENDER = "FC_TB_MY_REQUESTS_RENDER_ACTIONS";

/** Log what the My Requests list will render for action buttons. */
/** Attach row-level edit/delete when fallback paths produced posts without reqId. */
export function enrichMyRequestsPostsFromPageHtml(
  posts: TradeboardPost[],
  html: string,
): TradeboardPost[] {
  const records = extractMyRequestsTableRowRecords(html);
  if (!records.length) {
    return posts.map((p) => ({ ...p, isMyRequest: true, sourceTab: "my_requests" as const }));
  }

  return posts.map((p) => {
    if (tradeboardPostShowsMyRequestActions(p)) {
      return { ...p, isMyRequest: true, sourceTab: "my_requests" as const };
    }
    const pid = p.pairingId.trim().toUpperCase();
    const date = p.pairingDateLabel.trim().toUpperCase();
    const rec =
      records.find((r) => {
        const m = /\b(J[A-Z0-9]{3,5})\s*:?\s*(\d{1,2}[A-Z]{3})\b/i.exec(r.pipeLine);
        if (!m) return false;
        return (
          m[1]!.toUpperCase() === pid &&
          (!date || m[2]!.toUpperCase() === date)
        );
      }) ?? records.find((r) => r.pipeLine.toUpperCase().includes(pid));
    if (!rec) {
      return { ...p, isMyRequest: true, sourceTab: "my_requests" as const };
    }
    const actions = extractMyRequestActionsFromRowHtml(rec.rawTrHtml);
    if (!actions.reqId && !actions.editUrl && !actions.deleteUrl) {
      return { ...p, isMyRequest: true, sourceTab: "my_requests" as const };
    }
    return applyMyRequestFieldsToPost(
      { ...p, isMyRequest: true, sourceTab: "my_requests" },
      actions,
      rec.rawTrHtml,
    );
  });
}

export function logTradeboardMyRequestsRenderActions(
  tradeFeedTab: string,
  posts: TradeboardPost[],
): void {
  if (tradeFeedTab !== "my") return;
  const payload = {
    tradeFeedTab,
    postCount: posts.length,
    firstPosts: posts.slice(0, 5).map((p) => ({
      pairingId: p.pairingId,
      reqId: tradeboardPostMyRequestReqId(p),
      hasMyRequest: Boolean(p.myRequest?.reqId),
      canEdit: p.canEdit ?? Boolean(p.editUrl || p.reqId),
      canDelete: p.canDelete ?? Boolean(p.deleteUrl || p.reqId),
    })),
  };
  fcDevMirrorScheduleLogToFile(LOG_RENDER, payload);
  if (__DEV__) {
    console.log(`[${LOG_RENDER}]`, JSON.stringify(payload));
  }
}
