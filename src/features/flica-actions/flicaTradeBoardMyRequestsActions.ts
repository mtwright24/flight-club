/**
 * TradeBoard My Requests — parse Edit/Delete action URLs and metadata from list HTML.
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import { FLICA_TRADEBOARD_BCID } from "./flicaActionsActionMap";
import { resolveFlicaAbsoluteUrl } from "./flicaTradeBoardAllRequestsForm";
import {
  collectReqIdsFromMyRequestsOnclick,
  extractReqIdFromMyRequestsOnclickHaystack,
} from "./flicaTradeBoardMyRequestsOnclickReqId";
import type {
  TradeboardMyRequestActionRow,
  TradeboardMyRequestsActionsParse,
} from "./flicaTradeBoardPostRequestTypes";

const LOG_TAG = "FC_TB_MY_REQUESTS_PARSE_ACTIONS";
const BASE = "https://jetblue.flica.net";

function getAttr(tag: string, attr: string): string {
  const a = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const d = new RegExp(`\\b${a}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
  if (d) return d[1] ?? "";
  const s = new RegExp(`\\b${a}\\s*=\\s*'([^']*)'`, "i").exec(tag);
  if (s) return s[1] ?? "";
  const u = new RegExp(`\\b${a}\\s*=\\s*([^\\s>"']+)`, "i").exec(tag);
  return u?.[1] ?? "";
}

function collapseWs(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function stripTags(s: string): string {
  return collapseWs(String(s ?? "").replace(/<[^>]+>/g, " "));
}

export function tradeboardEditRequestUrl(reqId: string): string {
  return `${BASE}/online/TB_EditRequest.cgi?BCID=${FLICA_TRADEBOARD_BCID}&reqId=${encodeURIComponent(reqId)}`;
}

export function tradeboardMyRequestDeleteUrl(reqId: string): string {
  return `${BASE}/online/TB_MyRequests.cgi?&bcid=${FLICA_TRADEBOARD_BCID}&DeleteMe=${encodeURIComponent(reqId)}&bRestore=0`;
}

export function tradeboardMyRequestsRefreshUrl(): string {
  return `${BASE}/online/TB_MyRequests.cgi?&bcid=${FLICA_TRADEBOARD_BCID}`;
}

function extractReqIdFromEditHref(href: string): string {
  const m =
    /(?:^|[?&])reqId=(\d+)/i.exec(href) ??
    /TB_EditRequest\.cgi[^"']*reqId=(\d+)/i.exec(href);
  return m?.[1]?.trim() ?? "";
}

function extractReqIdFromDeleteHref(href: string): string {
  const m = /(?:^|[?&])DeleteMe=(\d+)/i.exec(href);
  return m?.[1]?.trim() ?? "";
}

function extractPairingFromContext(ctx: string): { pairingId: string; dateLabel: string } {
  const m = /\b(J[A-Z0-9]{3,5})\s*:?\s*(\d{1,2}[A-Z]{3})\b/i.exec(ctx);
  return {
    pairingId: (m?.[1] ?? "").toUpperCase(),
    dateLabel: (m?.[2] ?? "").toUpperCase(),
  };
}

function extractRequestTypeFromContext(ctx: string): string {
  if (/trade\s*\/\s*drop|t\s*\/\s*d/i.test(ctx)) return "trade_drop";
  if (/\bdrop\b/i.test(ctx) && !/\btrade\b/i.test(ctx)) return "drop";
  if (/\btrade\b/i.test(ctx)) return "trade";
  if (/\bpickup\b/i.test(ctx)) return "pickup";
  return "";
}

function mergeRow(
  map: Map<string, TradeboardMyRequestActionRow>,
  reqId: string,
  patch: Partial<TradeboardMyRequestActionRow>,
): void {
  const prev = map.get(reqId);
  const editUrl = patch.editUrl || prev?.editUrl || tradeboardEditRequestUrl(reqId);
  const deleteUrl =
    patch.deleteUrl || prev?.deleteUrl || tradeboardMyRequestDeleteUrl(reqId);
  map.set(reqId, {
    pairingId: patch.pairingId || prev?.pairingId || "",
    dateLabel: patch.dateLabel || prev?.dateLabel || "",
    requestType: patch.requestType || prev?.requestType || "",
    reqId,
    treq: patch.treq || prev?.treq || "",
    editUrl,
    deleteUrl,
    editRequestId: reqId,
    deleteRequestId: reqId,
    base: patch.base || prev?.base,
    position: patch.position || prev?.position,
    comments: patch.comments || prev?.comments,
    postedAt: patch.postedAt || prev?.postedAt,
    responseMethods: patch.responseMethods || prev?.responseMethods,
    pairingDetailUrl: patch.pairingDetailUrl || prev?.pairingDetailUrl,
    rawPreview: patch.rawPreview || prev?.rawPreview || "",
  });
}

/** Parse My Requests HTML for per-row Edit/Delete targets. */
export function parseTradeboardMyRequestsActionsFromHtml(
  html: string,
): TradeboardMyRequestsActionsParse {
  const h = String(html ?? "");
  const warnings: string[] = [];
  const map = new Map<string, TradeboardMyRequestActionRow>();

  const controlRe = /<(?:input|button)\b([^>]*)>/gi;
  let cm: RegExpExecArray | null;
  while ((cm = controlRe.exec(h)) !== null) {
    const attrs = cm[1] ?? "";
    const onclick = getAttr(attrs, "onclick");
    const value = getAttr(attrs, "value");
    const hay = `${onclick} ${value} ${getAttr(attrs, "name")}`;
    const ctx = h.slice(Math.max(0, cm.index - 350), Math.min(h.length, cm.index + 450));
    const { pairingId, dateLabel } = extractPairingFromContext(ctx);
    const onclickReqId = extractReqIdFromMyRequestsOnclickHaystack(hay);
    if (onclickReqId) {
      mergeRow(map, onclickReqId, {
        pairingId,
        dateLabel,
        editUrl: tradeboardEditRequestUrl(onclickReqId),
        deleteUrl: tradeboardMyRequestDeleteUrl(onclickReqId),
        rawPreview: collapseWs(ctx).slice(0, 200),
      });
    }
    const editReqId = extractReqIdFromEditHref(hay);
    if (editReqId) {
      mergeRow(map, editReqId, {
        pairingId,
        dateLabel,
        editUrl: tradeboardEditRequestUrl(editReqId),
        rawPreview: collapseWs(ctx).slice(0, 200),
      });
    }
    const deleteReqId = extractReqIdFromDeleteHref(hay);
    if (deleteReqId) {
      mergeRow(map, deleteReqId, {
        pairingId,
        dateLabel,
        deleteUrl: tradeboardMyRequestDeleteUrl(deleteReqId),
        rawPreview: collapseWs(ctx).slice(0, 200),
      });
    }
  }

  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(h)) !== null) {
    const attrs = m[1] ?? "";
    const label = stripTags(m[2] ?? "");
    const href = resolveFlicaAbsoluteUrl(getAttr(attrs, "href"));
    const onclick = getAttr(attrs, "onclick");
    const hay = `${href} ${onclick} ${label}`;
    const ctx = h.slice(Math.max(0, m.index - 350), Math.min(h.length, m.index + 450));
    const { pairingId, dateLabel } = extractPairingFromContext(ctx);
    const requestType = extractRequestTypeFromContext(ctx);

    const onclickReqId = extractReqIdFromMyRequestsOnclickHaystack(hay);
    if (onclickReqId) {
      const treqM = /treq\s*[=:]\s*['"]?(\d+)/i.exec(ctx);
      mergeRow(map, onclickReqId, {
        pairingId,
        dateLabel,
        requestType,
        editUrl: tradeboardEditRequestUrl(onclickReqId),
        deleteUrl: tradeboardMyRequestDeleteUrl(onclickReqId),
        treq: treqM?.[1] ?? "",
        rawPreview: collapseWs(ctx).slice(0, 200),
      });
    }

    const editReqId = extractReqIdFromEditHref(hay);
    if (editReqId) {
      const treqM = /treq\s*[=:]\s*['"]?(\d+)/i.exec(ctx);
      mergeRow(map, editReqId, {
        pairingId,
        dateLabel,
        requestType,
        editUrl: href.includes("EditRequest") ? href : tradeboardEditRequestUrl(editReqId),
        treq: treqM?.[1] ?? "",
        rawPreview: collapseWs(ctx).slice(0, 200),
      });
    }

    const deleteReqId = extractReqIdFromDeleteHref(hay);
    if (deleteReqId) {
      mergeRow(map, deleteReqId, {
        pairingId,
        dateLabel,
        requestType,
        deleteUrl: hay.includes("DeleteMe") ? href : tradeboardMyRequestDeleteUrl(deleteReqId),
        rawPreview: collapseWs(ctx).slice(0, 200),
      });
    }
  }

  for (const reqId of collectReqIdsFromMyRequestsOnclick(h)) {
    if (map.has(reqId)) continue;
    const idx = h.search(
      new RegExp(
        `EditRequest\\s*\\(\\s*${reqId}\\s*\\)|DeleteRequest\\s*\\(\\s*${reqId}\\s*,|GetNumOfActiveResponses\\s*\\(\\s*${reqId}\\s*\\)`,
        "i",
      ),
    );
    const ctx =
      idx >= 0
        ? h.slice(Math.max(0, idx - 400), Math.min(h.length, idx + 1200))
        : h.slice(0, 2000);
    const { pairingId, dateLabel } = extractPairingFromContext(ctx);
    mergeRow(map, reqId, {
      pairingId,
      dateLabel,
      requestType: extractRequestTypeFromContext(ctx),
      editUrl: tradeboardEditRequestUrl(reqId),
      deleteUrl: tradeboardMyRequestDeleteUrl(reqId),
      rawPreview: collapseWs(ctx).slice(0, 200),
    });
  }

  const delCheckboxRe = /\bname\s*=\s*["']del(\d+)["']/gi;
  let dcm: RegExpExecArray | null;
  while ((dcm = delCheckboxRe.exec(h)) !== null) {
    const reqId = dcm[1] ?? "";
    if (!reqId) continue;
    const ctx = h.slice(Math.max(0, dcm.index - 350), Math.min(h.length, dcm.index + 450));
    const { pairingId, dateLabel } = extractPairingFromContext(ctx);
    mergeRow(map, reqId, {
      pairingId,
      dateLabel,
      editUrl: tradeboardEditRequestUrl(reqId),
      deleteUrl: tradeboardMyRequestDeleteUrl(reqId),
      rawPreview: collapseWs(ctx).slice(0, 200),
    });
  }

  const deleteRe = /TB_MyRequests\.cgi[^"'>\s]*DeleteMe=(\d+)/gi;
  let dm: RegExpExecArray | null;
  while ((dm = deleteRe.exec(h)) !== null) {
    const reqId = dm[1] ?? "";
    if (!reqId) continue;
    const ctx = h.slice(Math.max(0, dm.index - 350), Math.min(h.length, dm.index + 200));
    const { pairingId, dateLabel } = extractPairingFromContext(ctx);
    mergeRow(map, reqId, {
      pairingId,
      dateLabel,
      deleteUrl: tradeboardMyRequestDeleteUrl(reqId),
      rawPreview: collapseWs(ctx).slice(0, 200),
    });
  }

  const rowRe =
    /\b(J[A-Z0-9]{3,5})\s*:?\s*(\d{1,2}[A-Z]{3})[\s\S]{0,500}?(?:reqId|treq)\s*[=:]\s*['"]?(\d+)/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(h)) !== null) {
    const pairingId = rm[1]!.toUpperCase();
    const dateLabel = rm[2]!.toUpperCase();
    const reqId = rm[3] ?? "";
    if (!reqId) continue;
    const ctx = h.slice(Math.max(0, rm.index - 80), Math.min(h.length, rm.index + 500));
    const treqM = /treq\s*[=:]\s*['"]?(\d+)/i.exec(ctx);
    mergeRow(map, reqId, {
      pairingId,
      dateLabel,
      requestType: extractRequestTypeFromContext(ctx),
      treq: treqM?.[1] ?? "",
      editUrl: tradeboardEditRequestUrl(reqId),
      deleteUrl: tradeboardMyRequestDeleteUrl(reqId),
      rawPreview: collapseWs(ctx).slice(0, 200),
    });
  }

  const rows = [...map.values()];
  if (rows.length === 0) {
    warnings.push("No editable request rows with reqId found in My Requests HTML.");
  }

  const reqIdsFromOnclick = collectReqIdsFromMyRequestsOnclick(h);

  fcDevMirrorScheduleLogToFile(LOG_TAG, {
    ok: rows.length > 0,
    htmlLength: h.length,
    rowCount: rows.length,
    reqIdsFromOnclick,
    warnings,
    firstRows: rows.slice(0, 5).map((r) => ({
      pairingId: r.pairingId,
      reqId: r.reqId,
      editUrl: r.editUrl,
      deleteUrl: r.deleteUrl,
      hasEdit: Boolean(r.editUrl),
      hasDelete: Boolean(r.deleteUrl),
      rawText: r.rawPreview,
    })),
  });

  if (__DEV__) {
    console.log(
      `[${LOG_TAG}]`,
      JSON.stringify({
        htmlLength: h.length,
        rowCount: rows.length,
        reqIdsFromOnclick,
        warnings,
      }),
    );
  }

  return { ok: rows.length > 0, rows, warnings };
}

/** Build action rows from native-parse href/action endpoints (Edit/Delete URLs). */
export function buildMyRequestActionRowsFromEndpoints(
  endpoints: string[] | undefined,
): TradeboardMyRequestActionRow[] {
  const map = new Map<string, TradeboardMyRequestActionRow>();
  for (const raw of endpoints ?? []) {
    const href = resolveFlicaAbsoluteUrl(String(raw ?? "").trim());
    if (!href) continue;
    const editReqId = extractReqIdFromEditHref(href);
    const deleteReqId = extractReqIdFromDeleteHref(href);
    const reqId = editReqId || deleteReqId;
    if (!reqId) continue;
    mergeRow(map, reqId, {
      editUrl: editReqId && href.includes("EditRequest") ? href : tradeboardEditRequestUrl(reqId),
      deleteUrl:
        deleteReqId && href.includes("DeleteMe") ? href : tradeboardMyRequestDeleteUrl(reqId),
    });
  }
  return [...map.values()];
}
