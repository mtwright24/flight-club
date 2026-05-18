/**
 * FLICA My Requests desktop row: "Edit Delete Drop J3379:11JUN JFK FA A 3 04:25 …"
 */

import {
  djb2Hex,
  detectTradeboardType,
  tradeboardSanitizeDisplayComment,
  tradeboardTypeLongLabel,
} from "../crew-schedule/flicaCrewHubMappers";
import type { TradeboardPost } from "../crew-schedule/flicaCrewHubTypes";
import { buildTradeboardPairingDetailUrl, parseFlicaPairOnclick } from "./flicaPairingDetailUrl";

const POSTED_EDT_COMPACT =
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+20\d{2}\s+\d{2}:\d{2}:\d{2}\s+EDT\b/i;

/** FLICA sometimes encodes pairing colon as an entity in HTML/plain text. */
const PAIRING_COLON = "(?::|&#58;|&#x3A;|&colon;)";

function collapseWs(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function splitLayoverAndComments(prePoster: string): { layover: string; comments: string } {
  const parts = prePoster.trim().split(/\s+/).filter(Boolean);
  const lay: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const tok = parts[i]!;
    if (
      /^[A-Z]{3}$/.test(tok) ||
      /^[A-Z]\d$/i.test(tok) ||
      /^F\d+$/i.test(tok) ||
      /^[A-Z]{2}\d$/i.test(tok)
    ) {
      lay.push(tok);
      i++;
      continue;
    }
    break;
  }
  return { layover: lay.join(" "), comments: parts.slice(i).join(" ").trim() };
}

function extractCompactRowScheduleTimes(rest: string): { times: string[]; remainder: string } {
  const times: string[] = [];
  let scan = rest.trim();
  let guard = 0;
  while (guard++ < 24 && scan.length > 0) {
    const tm = scan.match(/^(\d{1,2}:\d{2})\b/);
    if (tm) {
      times.push(tm[1]!);
      scan = scan.slice(tm[0]!.length).trim();
      if (times.length >= 5) break;
      continue;
    }
    if (times.length >= 3) break;
    const skip = scan.match(/^(\S+)/);
    if (!skip) break;
    scan = scan.slice(skip[0]!.length).trim();
  }
  return { times, remainder: scan };
}

function buildResponseLabel(line: string): string {
  const parts: string[] = [];
  if (/\bpropose\s+trade\b/i.test(line)) parts.push("Propose Trade");
  if (/\bpickup\s+trip\b/i.test(line) || /\bpick\s*up\b/i.test(line)) parts.push("Pickup Trip");
  const email = line.match(/\b[^\s@]+@[^\s@]+\.[^\s]+\b/);
  if (email) parts.push(email[0]!);
  const phone = line.match(/\b(\d{3})[-.\s]?(\d{3})[-.\s]?(\d{4})\b/);
  if (phone) parts.push(phone[0]!.replace(/\s+/g, ""));
  return parts.join(" · ");
}

/** Parse FLICA My Requests visible desktop row text (after Edit/Delete prefix). */
export function parseMyRequestsCompactDesktopRow(
  block: string,
  sourceUrl: string,
): TradeboardPost | null {
  let line = collapseWs(String(block ?? "").replace(/\|ROWSEP\|/g, " "));
  if (line.length < 32) return null;

  line = line.replace(/^\s*(?:Edit\s+Delete\s+)+/i, "").trim();

  const flexRe = new RegExp(
    `\\b(Drop|Trade\\s*\\/\\s*Drop|Trade|Pickup)\\s+(J[A-Z0-9]{3,5})\\s*${PAIRING_COLON}\\s*(\\d{1,2}[A-Z]{3})\\b`,
    "i",
  );
  const flex = line.match(flexRe);
  if (flex == null || flex.index == null) return null;
  line = line.slice(flex.index).trim();
  const leadRe = new RegExp(
    `^(Drop|Trade\\s*\\/\\s*Drop|Trade|Pickup)\\s+(J[A-Z0-9]{3,5})\\s*${PAIRING_COLON}\\s*(\\d{1,2}[A-Z]{3})\\b`,
    "i",
  );
  const lead = line.match(leadRe);
  if (!lead) return null;

  const pairingId = lead[2]!.toUpperCase();
  const pairingDateLabel = lead[3]!.toUpperCase();
  let rest = line.slice(lead[0].length).trim();

  const bp = rest.match(/^([A-Z]{3})\s+(FA|CA|FO|SC|FD)\s+(\S)\s+(\d{1,2})\s+/i);
  if (!bp) return null;
  const base = bp[1]!.toUpperCase();
  const position = bp[2]!.toUpperCase();
  const seat = String(bp[3] ?? "").toUpperCase();
  const days = bp[4]!;
  rest = rest.slice(bp[0].length).trim();

  const { times, remainder } = extractCompactRowScheduleTimes(rest);
  rest = remainder;
  if (times.length < 3) return null;
  const reportTime = times[0] ?? "";
  const departTime = times[1] ?? "";
  const arriveTime = times[2] ?? "";
  const blockTime = times[3] ?? "";
  const credit = times[4] ?? "";

  const postM = line.match(POSTED_EDT_COMPACT);
  const postedAtLabel = postM ? String(postM[0]).trim() : "";

  let posterName = "";
  const posterMatchesRest = [
    ...rest.matchAll(/\b([A-Z][A-Z'\-]+(?:\s+[A-Z][A-Z'\-]+)+)\s*\(\s*(\d{4,6})\s*\)/g),
  ];
  const posterMatch = posterMatchesRest.length ? posterMatchesRest[posterMatchesRest.length - 1]! : null;
  if (posterMatch) {
    posterName = posterMatch[1]!.replace(/\s+/g, " ").trim();
  }

  let prePoster = rest;
  if (posterMatch && typeof posterMatch.index === "number") {
    prePoster = rest.slice(0, posterMatch.index).trim();
  }
  const { layover, comments: splitComments } = splitLayoverAndComments(prePoster);
  const comments = tradeboardSanitizeDisplayComment(splitComments);

  const type = detectTradeboardType(`${lead[1]} ${line}`);
  const routeSummary = layover ? `${base} · ${layover}` : `${pairingId}:${pairingDateLabel} · ${base}`;
  const worthM = line.match(/\$\s*[\d,]{2,12}/);
  const worth = worthM?.[0] ? worthM[0] : null;
  const responseMethodLabel = buildResponseLabel(line);
  const canProposeTrade = /\bpropose\s+trade\b/i.test(line);
  const canPickup = /\bpickup\s+trip\b/i.test(line) || /\bpickup\b/i.test(line);

  const rawCells = line.split(/\s+/).filter(Boolean).slice(0, 48);
  const id = djb2Hex(["my_requests_desktop", pairingId, pairingDateLabel, type, line.slice(0, 240)]);
  const oc = parseFlicaPairOnclick(line);
  const pairingDetailUrl = oc ? buildTradeboardPairingDetailUrl(oc.pid, oc.dateYmd) : undefined;

  return {
    id: `tb-${id}`,
    type,
    typeLabel: tradeboardTypeLongLabel(type),
    posterName,
    pairingId,
    pairingDateLabel,
    routeSummary,
    base,
    position,
    date: pairingDateLabel,
    days,
    reportTime,
    departTime,
    arriveTime,
    block: blockTime,
    credit,
    worth,
    layover,
    comments,
    responseMethods: responseMethodLabel,
    responseMethodLabel,
    postedAt: postedAtLabel,
    postedAtLabel,
    canPickup,
    canProposeTrade,
    matchScore: null,
    legalCompatibility: /\blegal\b/i.test(line) ? true : null,
    sourceUrl,
    rawCells,
    rawText: line,
    offerCount: null,
    pairingDetailUrl,
    dateYmd: oc?.dateYmd,
    pairingDateYmd: oc?.dateYmd,
    seat,
    isMyRequest: true,
    sourceTab: "my_requests",
  };
}

/** Every visible FLICA My Requests desktop row block (Edit Delete …), in order. */
export function extractAllMyRequestsDesktopRowBlocks(html: string): string[] {
  const plain = collapseWs(
    String(html ?? "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
  if (!plain) return [];

  const rowStartRe = new RegExp(
    `\\bEdit\\s+Delete\\s+(?=(?:Drop|Trade\\s*\\/\\s*Drop|Trade|Pickup)\\s+J[A-Z0-9]{3,5}\\s*${PAIRING_COLON}\\s*\\d{1,2}[A-Z]{3}\\b)`,
    "gi",
  );
  const starts: number[] = [];
  for (const m of plain.matchAll(rowStartRe)) {
    if (m.index != null) starts.push(m.index);
  }

  if (starts.length === 0) {
    const line = extractMyRequestsDesktopRowLine(html);
    return line ? [line] : [];
  }

  const blocks: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!;
    const end = i + 1 < starts.length ? starts[i + 1]! : plain.length;
    const slice = plain.slice(start, end).trim();
    if ((slice.match(/\b\d{1,2}:\d{2}\b/g) ?? []).length >= 3) blocks.push(slice);
  }
  return blocks;
}

/** Locate the real FLICA My Requests desktop row in page plain text. */
export function extractMyRequestsDesktopRowLine(html: string): string | null {
  const plain = collapseWs(
    String(html ?? "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
  if (!plain) return null;

  const withActionsRe = new RegExp(
    `\\bEdit\\s+Delete\\s+(Drop|Trade\\s*\\/\\s*Drop|Trade|Pickup)\\s+(J[A-Z0-9]{3,5})\\s*${PAIRING_COLON}\\s*(\\d{1,2}[A-Z]{3})\\b`,
    "i",
  );
  const withActions = withActionsRe.exec(plain);
  if (withActions?.index != null) {
    const slice = plain.slice(withActions.index, withActions.index + 2400);
    if ((slice.match(/\b\d{1,2}:\d{2}\b/g) ?? []).length >= 3) return slice;
  }

  const typePairRe = new RegExp(
    `\\b(Drop|Trade\\s*\\/\\s*Drop|Trade|Pickup)\\s+(J[A-Z0-9]{3,5})\\s*${PAIRING_COLON}\\s*(\\d{1,2}[A-Z]{3})\\b`,
    "gi",
  );
  let best: string | null = null;
  let bestScore = 0;
  for (const m of plain.matchAll(typePairRe)) {
    const start = m.index ?? 0;
    const slice = plain.slice(Math.max(0, start - 12), start + 2400);
    const timeCount = (slice.match(/\b\d{1,2}:\d{2}\b/g) ?? []).length;
    const score =
      timeCount * 10 +
      (/\bEdit\b/i.test(slice.slice(0, 80)) ? 4 : 0) +
      (/\bDelete\b/i.test(slice.slice(0, 80)) ? 4 : 0) +
      (/\b[A-Z]{3}\s+[A-Z]{3}\b/.test(slice) ? 2 : 0);
    if (timeCount >= 3 && score > bestScore) {
      bestScore = score;
      best = plain.slice(start, start + 2400);
    }
  }
  return best;
}

export function pagePlainTextHasMyRequestsDesktopRow(html: string): boolean {
  return extractMyRequestsDesktopRowLine(html) != null;
}
