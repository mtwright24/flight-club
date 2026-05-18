/**
 * TradeBoard My Requests — unified table-row parse (fields + edit/delete on same row).
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import type { TradeboardPost } from "../crew-schedule/flicaCrewHubTypes";
import {
  detectTradeboardType,
  mapTradeboardRowsToPosts,
  tradeboardTypeLongLabel,
} from "../crew-schedule/flicaCrewHubMappers";
import { resolveFlicaAbsoluteUrl } from "./flicaTradeBoardAllRequestsForm";
import {
  parseTradeboardMyRequestsActionsFromHtml,
  tradeboardEditRequestUrl,
  tradeboardMyRequestDeleteUrl,
} from "./flicaTradeBoardMyRequestsActions";
import { extractReqIdFromMyRequestsOnclickHaystack } from "./flicaTradeBoardMyRequestsOnclickReqId";
import type {
  TradeboardMyRequestActionRow,
} from "./flicaTradeBoardPostRequestTypes";
import { parseFlicaPairOnclick, buildTradeboardPairingDetailUrl } from "./flicaPairingDetailUrl";
import {
  extractAllMyRequestsDesktopRowBlocks,
  pagePlainTextHasMyRequestsDesktopRow,
  parseMyRequestsCompactDesktopRow,
} from "./flicaTradeBoardMyRequestsCompactRow";
import {
  findDesktopBlockHtmlContext,
  findHtmlContextForReqId,
  logFcTbMultirowParseResult,
  logFcTbTabIsolationDebug,
  mergeMyRequestsPostsByReqId,
} from "./flicaTradeBoardMyRequestsMultirow";

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
  const fromOnclick = extractReqIdFromMyRequestsOnclickHaystack(h);
  if (fromOnclick) return fromOnclick;
  const m =
    /(?:^|[?&])reqId=(\d+)/i.exec(h) ??
    /TB_EditRequest\.cgi[^"']*reqId=(\d+)/i.exec(h) ??
    /(?:^|[?&])DeleteMe=(\d+)/i.exec(h) ??
    /TB_MyRequests\.cgi[^"']*DeleteMe=(\d+)/i.exec(h) ??
    /\bname\s*=\s*["']del(\d+)["']/i.exec(h) ??
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

function buildPostFromActionRow(
  row: TradeboardMyRequestActionRow,
  ctx: string,
  sourceUrl: string,
): TradeboardPost | null {
  const plain = tradeboardTdInnerToPlain(ctx);
  const compact = parseMyRequestsCompactDesktopRow(plain, sourceUrl);
  const type = (compact?.type ??
    row.requestType ??
    detectTradeboardType(plain)) as TradeboardPost["type"];
  const pairingId = (row.pairingId || compact?.pairingId || "").toUpperCase();
  const dateLabel = (row.dateLabel || compact?.pairingDateLabel || "").toUpperCase();
  if (!pairingId) return null;

  const actions: MyRequestRowActions = {
    reqId: row.reqId,
    editRequestId: row.reqId,
    deleteRequestId: row.reqId,
    editUrl: row.editUrl || tradeboardEditRequestUrl(row.reqId),
    deleteUrl: row.deleteUrl || tradeboardMyRequestDeleteUrl(row.reqId),
    hasEdit: true,
    hasDelete: true,
    treq: row.treq ?? "",
  };

  if (compact) {
    return applyMyRequestFieldsToPost(compact, actions, ctx);
  }

  const post: TradeboardPost = {
    id: `tb-my-req-${row.reqId}`,
    type: (type as TradeboardPost["type"]) || "trade",
    typeLabel: tradeboardTypeLongLabel((type as TradeboardPost["type"]) || "trade"),
    posterName: "",
    pairingId,
    pairingDateLabel: dateLabel,
    routeSummary: `${pairingId}:${dateLabel}`,
    base: row.base ?? "",
    position: row.position ?? "",
    date: dateLabel,
    days: "",
    reportTime: "",
    departTime: "",
    arriveTime: "",
    block: "",
    credit: "",
    worth: null,
    layover: "",
    comments: row.comments ?? "",
    responseMethods: row.responseMethods ?? "",
    responseMethodLabel: row.responseMethods ?? "",
    postedAt: row.postedAt ?? "",
    postedAtLabel: row.postedAt ?? "",
    canPickup: false,
    canProposeTrade: false,
    matchScore: null,
    legalCompatibility: null,
    sourceUrl,
    rawCells: plain.split(/\s+/).filter(Boolean).slice(0, 48),
    rawText: plain.slice(0, 900),
    offerCount: null,
    isMyRequest: true,
    sourceTab: "my_requests",
    pairingDetailUrl: row.pairingDetailUrl,
  };
  return applyMyRequestFieldsToPost(post, actions, ctx);
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
    if (/\bEdit\b/i.test(hay) || /TB_EditRequest\.cgi/i.test(hay) || /EditRequest\s*\(\s*\d+/i.test(hay)) {
      hasEdit = true;
    }
    if (
      /\bDelete\b/i.test(hay) ||
      /DeleteMe\s*=/i.test(hay) ||
      /DeleteRequest\s*\(\s*\d+/i.test(hay)
    ) {
      hasDelete = true;
    }
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
  mode: string;
};

export function extractPageLevelReqIdActions(html: string): MyRequestRowActions {
  const h = String(html ?? "");
  const reqIdSet = new Set<string>();
  for (const m of h.matchAll(/(?:reqId|DeleteMe)\s*=\s*(\d+)/gi)) {
    const id = m[1]?.trim();
    if (id) reqIdSet.add(id);
  }
  for (const m of h.matchAll(/\bname\s*=\s*["']del(\d+)["']/gi)) {
    const id = m[1]?.trim();
    if (id) reqIdSet.add(id);
  }
  for (const m of h.matchAll(/EditRequest\s*\(\s*(\d+)\s*\)/gi)) {
    const id = m[1]?.trim();
    if (id) reqIdSet.add(id);
  }
  for (const m of h.matchAll(/DeleteRequest\s*\(\s*(\d+)\s*,/gi)) {
    const id = m[1]?.trim();
    if (id) reqIdSet.add(id);
  }
  for (const m of h.matchAll(/GetNumOfActiveResponses\s*\(\s*(\d+)\s*\)/gi)) {
    const id = m[1]?.trim();
    if (id) reqIdSet.add(id);
  }
  const reqIds = [...reqIdSet];
  const reqId =
    reqIds.length === 1 ? reqIds[0]! : reqIds.length === 0 ? extractReqIdFromHaystack(h) : "";
  if (!reqId) {
    return {
      reqId: "",
      editRequestId: "",
      deleteRequestId: "",
      editUrl: "",
      deleteUrl: "",
      hasEdit: false,
      hasDelete: false,
      treq: "",
    };
  }
  return {
    reqId,
    editRequestId: reqId,
    deleteRequestId: reqId,
    editUrl: tradeboardEditRequestUrl(reqId),
    deleteUrl: tradeboardMyRequestDeleteUrl(reqId),
    hasEdit: true,
    hasDelete: true,
    treq: "",
  };
}

function postReqId(p: TradeboardPost): string {
  return (p.myRequest?.reqId ?? p.reqId ?? "").trim();
}

export function isCompleteMyRequestsPost(p: TradeboardPost): boolean {
  return Boolean(
    postReqId(p) && p.reportTime?.trim() && p.departTime?.trim() && p.pairingId?.trim(),
  );
}

export function myRequestsPostsReadyForHub(posts: TradeboardPost[]): boolean {
  return posts.some((p) => isCompleteMyRequestsPost(p));
}

function resolveActionRowForDesktopPost(
  compact: TradeboardPost,
  blockIndex: number,
  desktopBlocks: string[],
  actionRows: TradeboardMyRequestActionRow[],
  sourceUrl: string,
): TradeboardMyRequestActionRow | undefined {
  const pid = compact.pairingId.trim().toUpperCase();
  const date = compact.pairingDateLabel.trim().toUpperCase();
  if (!pid) return undefined;
  const candidates = actionRows.filter(
    (r) =>
      r.pairingId.toUpperCase() === pid &&
      (!date || !r.dateLabel || r.dateLabel.toUpperCase() === date),
  );
  const priorSamePairing = desktopBlocks.slice(0, blockIndex).filter((b) => {
    const c = parseMyRequestsCompactDesktopRow(b, sourceUrl);
    return (
      c &&
      c.pairingId.toUpperCase() === pid &&
      c.pairingDateLabel.toUpperCase() === date
    );
  }).length;
  if (candidates.length) return candidates[priorSamePairing];
  if (blockIndex >= 0 && blockIndex < actionRows.length) return actionRows[blockIndex];
  return undefined;
}

function upsertMyRequestByReqId(
  map: Map<string, TradeboardPost>,
  post: TradeboardPost | null,
): void {
  if (!post) return;
  const reqId = postReqId(post);
  if (!reqId) return;
  const existing = map.get(reqId);
  if (!existing) {
    map.set(reqId, post);
    return;
  }
  const score = (p: TradeboardPost) =>
    (p.reportTime?.trim() ? 4 : 0) +
    (p.departTime?.trim() ? 2 : 0) +
    (p.comments?.trim() ? 1 : 0) +
    (p.postedAtLabel?.trim() ? 1 : 0);
  if (score(post) >= score(existing)) map.set(reqId, post);
}

/** Primary My Requests page parser — one TB_MyRequests.cgi row per reqId, no cross-tab logic. */
export function parseTradeboardMyRequestsPage(
  html: string,
  sourceUrl: string,
): TradeboardMyRequestsPageParse {
  const h = String(html ?? "");
  let mode = "none";
  const byReqId = new Map<string, TradeboardPost>();
  const rawCollected: TradeboardPost[] = [];

  const records = extractMyRequestsTableRowRecords(h);
  const desktopBlocks = extractAllMyRequestsDesktopRowBlocks(h);
  const actionRows = parseTradeboardMyRequestsActionsFromHtml(h).rows;

  for (let blockIndex = 0; blockIndex < desktopBlocks.length; blockIndex++) {
    const block = desktopBlocks[blockIndex]!;
    const compact = parseMyRequestsCompactDesktopRow(block, sourceUrl);
    if (!compact) continue;
    const ctx = findDesktopBlockHtmlContext(h, block, compact);
    const actions = extractMyRequestActionsFromRowHtml(ctx);
    const actionRow = resolveActionRowForDesktopPost(
      compact,
      blockIndex,
      desktopBlocks,
      actionRows,
      sourceUrl,
    );
    if (actionRow) {
      actions.reqId = actionRow.reqId;
      actions.editRequestId = actionRow.reqId;
      actions.deleteRequestId = actionRow.reqId;
      actions.editUrl = actionRow.editUrl || tradeboardEditRequestUrl(actionRow.reqId);
      actions.deleteUrl = actionRow.deleteUrl || tradeboardMyRequestDeleteUrl(actionRow.reqId);
      actions.hasEdit = true;
      actions.hasDelete = true;
    }
    const post = applyMyRequestFieldsToPost(compact, actions, ctx);
    rawCollected.push(post);
    upsertMyRequestByReqId(byReqId, post);
    mode = "my_requests_desktop";
  }

  for (const rec of records) {
    const post = buildPostFromTableRecord(rec, sourceUrl);
    if (!post) continue;
    rawCollected.push(post);
    const rid = postReqId(post);
    if (rid && !byReqId.has(rid)) {
      upsertMyRequestByReqId(byReqId, post);
      if (mode === "none") mode = "my_requests_table";
    }
  }

  for (const row of actionRows) {
    if (byReqId.has(row.reqId)) continue;
    const ctx = findHtmlContextForReqId(h, row.reqId);
    const post = buildPostFromActionRow(row, ctx, sourceUrl);
    if (!post || !postReqId(post)) continue;
    rawCollected.push(post);
    upsertMyRequestByReqId(byReqId, post);
    if (mode === "none") mode = "my_requests_action_row";
  }

  const posts = [...byReqId.values()];
  const fetchedRowCount = Math.max(desktopBlocks.length, actionRows.length, records.length);
  const parsedRowCount = rawCollected.length;
  const dedupedRowCount = Math.max(0, parsedRowCount - posts.length);
  const syntheticRowCount = rawCollected.filter((p) => !postReqId(p)).length;
  const detectedRowCount = fetchedRowCount;
  const suppressedRowCount = Math.max(0, fetchedRowCount - posts.length);

  logFcTbTabIsolationDebug({
    sourceTab: "my_requests",
    fetchedRowCount,
    parsedRowCount,
    renderedRowCount: posts.length,
    syntheticRowCount,
    dedupedRowCount,
    reqIds: posts.map((p) => postReqId(p)).filter(Boolean),
    pairingIds: posts.map((p) => p.pairingId).filter(Boolean),
    parseMode: mode,
  });
  logFcTbMultirowParseResult({
    detectedRowCount,
    renderedRowCount: posts.length,
    reqIds: posts.map((p) => postReqId(p)).filter(Boolean),
    pairingIds: posts.map((p) => p.pairingId).filter(Boolean),
    suppressedRowCount,
    mode,
    tableRowCount: records.length,
  });

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
    mode,
    hasDesktopRowInPlainText: pagePlainTextHasMyRequestsDesktopRow(h),
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

  return { posts, tableRowCount: records.length, mode };
}

/** True when post is a token-only fallback, not a parsed My Requests row. */
export function isWeakMyRequestsFallbackPost(p: TradeboardPost): boolean {
  if (isCompleteMyRequestsPost(p)) return false;
  const raw = collapseWs(p.rawText ?? "");
  if (!raw) return true;
  if (postReqId(p) && p.reportTime?.trim()) return false;
  if (/^J[A-Z0-9]{3,5}\s*:\s*\d{1,2}[A-Z]{3}$/i.test(raw)) return true;
  if (raw.length < 48 && !/\d{1,2}:\d{2}/.test(raw)) return true;
  return !p.reportTime?.trim() && !p.departTime?.trim();
}

export function tradeboardPostMyRequestReqId(p: TradeboardPost): string {
  return postReqId(p);
}

/** Copy reqId/edit/delete from a freshly parsed My Requests row onto a stale list row. */
export function mergeMyRequestReqIdFromFreshPosts(
  post: TradeboardPost,
  freshPosts: TradeboardPost[],
): TradeboardPost {
  if (tradeboardPostMyRequestReqId(post)) return post;
  const pid = post.pairingId.trim().toUpperCase();
  const date = post.pairingDateLabel.trim().toUpperCase();
  if (!pid) return post;

  const hasReqId = (p: TradeboardPost) => Boolean(tradeboardPostMyRequestReqId(p));

  const existingReqId = tradeboardPostMyRequestReqId(post);
  let match: TradeboardPost | null = null;
  if (existingReqId) {
    match = freshPosts.find((p) => tradeboardPostMyRequestReqId(p) === existingReqId) ?? null;
  }
  if (!match) {
    match =
      freshPosts.find(
        (p) =>
          p.pairingId.trim().toUpperCase() === pid &&
          hasReqId(p) &&
          p.type === post.type &&
          (!date || p.pairingDateLabel.trim().toUpperCase() === date),
      ) ?? null;
  }
  if (!match) return post;

  return {
    ...post,
    reqId: match.reqId ?? match.myRequest?.reqId ?? post.reqId,
    editRequestId: match.editRequestId ?? post.editRequestId,
    deleteRequestId: match.deleteRequestId ?? post.deleteRequestId,
    editUrl: match.editUrl ?? post.editUrl,
    deleteUrl: match.deleteUrl ?? post.deleteUrl,
    canEdit: match.canEdit ?? post.canEdit,
    canDelete: match.canDelete ?? post.canDelete,
    myRequest: match.myRequest ?? post.myRequest,
  };
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

function attachActionsFromPairingWindow(
  post: TradeboardPost,
  html: string,
): TradeboardPost {
  const pid = post.pairingId.trim().toUpperCase();
  if (!pid) return { ...post, isMyRequest: true, sourceTab: "my_requests" };
  const date = post.pairingDateLabel.trim().toUpperCase();
  const dateRe = date ? date.replace(/([A-Z]{3})/i, "$1") : "\\d{1,2}[A-Z]{3}";
  const idx = html.search(
    new RegExp(`\\b${pid}\\s*(?::|&#58;)?\\s*${date || dateRe}`, "i"),
  );
  const ctx =
    idx >= 0
      ? html.slice(Math.max(0, idx - 500), Math.min(html.length, idx + 3500))
      : html;
  const actions = extractMyRequestActionsFromRowHtml(ctx);
  if (!actions.reqId && !actions.editUrl && !actions.deleteUrl) {
    return { ...post, isMyRequest: true, sourceTab: "my_requests" };
  }
  return applyMyRequestFieldsToPost(
    { ...post, isMyRequest: true, sourceTab: "my_requests" },
    actions,
    ctx,
  );
}

/** Force reqId/edit/delete onto parsed posts using full page HTML (always run for My Requests). */
export function applyMyRequestActionsFromFullHtml(
  posts: TradeboardPost[],
  html: string,
): TradeboardPost[] {
  const h = String(html ?? "");
  if (!h.length) {
    return posts.map((p) => ({ ...p, isMyRequest: true, sourceTab: "my_requests" as const }));
  }

  const actionRows = parseTradeboardMyRequestsActionsFromHtml(h).rows;
  let out = posts.map((p) => ({ ...p, isMyRequest: true, sourceTab: "my_requests" as const }));

  if (actionRows.length) {
    out = out.map((p) => {
      if (tradeboardPostShowsMyRequestActions(p)) return p;
      const rid = tradeboardPostMyRequestReqId(p);
      let row = rid ? actionRows.find((r) => r.reqId === rid) : undefined;
      if (!row?.reqId) return p;
      const actions = extractMyRequestActionsFromRowHtml(
        `${row.editUrl} ${row.deleteUrl} reqId=${row.reqId}`,
      );
      actions.reqId = row.reqId;
      actions.editUrl = row.editUrl || actions.editUrl;
      actions.deleteUrl = row.deleteUrl || actions.deleteUrl;
      actions.editRequestId = row.reqId;
      actions.deleteRequestId = row.reqId;
      actions.hasEdit = Boolean(actions.editUrl || actions.reqId);
      actions.hasDelete = Boolean(actions.deleteUrl || actions.reqId);
      return applyMyRequestFieldsToPost(p, actions, h);
    });
  }

  out = out.map((p) => {
    if (tradeboardPostShowsMyRequestActions(p)) return p;
    const rid = tradeboardPostMyRequestReqId(p);
    if (rid) {
      const ctx = findHtmlContextForReqId(h, rid);
      const actions = extractMyRequestActionsFromRowHtml(ctx);
      if (actions.reqId || actions.editUrl || actions.deleteUrl) {
        return applyMyRequestFieldsToPost(
          { ...p, isMyRequest: true, sourceTab: "my_requests" },
          actions,
          ctx,
        );
      }
    }
    return attachActionsFromPairingWindow(p, h);
  });

  return out;
}

/** Attach row-level edit/delete when fallback paths produced posts without reqId. */
export function enrichMyRequestsPostsFromPageHtml(
  posts: TradeboardPost[],
  html: string,
): TradeboardPost[] {
  return applyMyRequestActionsFromFullHtml(posts, html);
}

/** @deprecated Use parseTradeboardMyRequestsPage only — no second-stage hub merge. */
export function finalizeMyRequestsPostsForHub(
  _posts: TradeboardPost[],
  html: string,
  sourceUrl: string,
): TradeboardPost[] {
  const h = String(html ?? "").trim();
  if (!h.length) return [];
  return parseTradeboardMyRequestsPage(h, sourceUrl).posts;
}

export function logTradeboardMyRequestsRenderActions(
  tradeFeedTab: string,
  posts: TradeboardPost[],
): void {
  if (tradeFeedTab !== "my") return;
  const first = posts[0];
  const reqId = first ? tradeboardPostMyRequestReqId(first) : "";
  const payload = {
    tradeFeedTab,
    postCount: posts.length,
    hubReady: myRequestsPostsReadyForHub(posts),
    firstPosts: posts.slice(0, 5).map((p) => ({
      pairingId: p.pairingId,
      reqId: tradeboardPostMyRequestReqId(p),
      hasMyRequest: Boolean(p.myRequest?.reqId || p.reqId),
      canEdit: Boolean(p.canEdit ?? (p.editUrl || p.reqId)),
      canDelete: Boolean(p.canDelete ?? (p.deleteUrl || p.reqId)),
      type: p.type,
      layover: p.layover,
      reportTime: p.reportTime,
      departTime: p.departTime,
      arriveTime: p.arriveTime,
      block: p.block,
      credit: p.credit,
    })),
    firstPostComplete: first ? isCompleteMyRequestsPost(first) : false,
    reqIdPopulated: Boolean(reqId),
  };
  fcDevMirrorScheduleLogToFile(LOG_RENDER, payload);
  if (__DEV__) {
    console.log(`[${LOG_RENDER}]`, JSON.stringify(payload));
  }
}
