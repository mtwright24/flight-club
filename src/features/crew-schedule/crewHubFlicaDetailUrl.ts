import {
  buildOpenTimePairingDetailUrl,
  buildTradeboardPairingDetailUrl,
} from "../flica-actions/flicaPairingDetailUrl";
import type { OpenTimeTrip, TradeboardPost } from "./flicaCrewHubTypes";

const MMM: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

/** `13JUN` + year → `20260613` */
export function crewHubDdMmmToYmd(tok: string, year: number): string | null {
  const m = String(tok ?? "")
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2})([A-Z]{3})$/);
  if (!m) return null;
  const dom = String(parseInt(m[1]!, 10)).padStart(2, "0");
  const mm = MMM[m[2]!];
  if (!mm) return null;
  return `${year}${mm}${dom}`;
}

function extractPidAndDateTokFromBlob(blob: string): { pid: string; dateTok: string } | null {
  const u = blob.toUpperCase();
  const colon = u.match(/\b(J[A-Z0-9]{3,5})\s*:\s*(\d{1,2}[A-Z]{3})\b/);
  if (colon) {
    return { pid: colon[1]!, dateTok: colon[2]! };
  }
  const pj = u.match(/\b(J[A-Z0-9]{3,5})\b/);
  const dt = u.match(/\b(\d{1,2}[A-Z]{3})\b/);
  if (pj?.[1] && dt?.[1]) {
    return { pid: pj[1], dateTok: dt[1] };
  }
  return null;
}

export function crewHubTradeboardPairingDetailUrl(
  post: TradeboardPost,
  yearHint: number,
): string | null {
  const rawId = post.pairingId.trim().toUpperCase();
  const blob = `${rawId} ${post.pairingDateLabel} ${post.date}`.trim();
  const got = extractPidAndDateTokFromBlob(blob);
  if (!got) return null;
  if (!/^J[A-Z0-9]{3,5}$/.test(got.pid)) return null;
  const ymd = crewHubDdMmmToYmd(got.dateTok, yearHint);
  if (!ymd) return null;
  return buildTradeboardPairingDetailUrl(got.pid, ymd);
}

export function crewHubOpenTimePairingDetailUrl(
  trip: OpenTimeTrip,
  yearHint: number,
): string | null {
  const blob = `${trip.pairingId} ${trip.dateLabel ?? ""} ${trip.date} ${trip.dates ?? ""}`.trim();
  const got = extractPidAndDateTokFromBlob(blob);
  if (!got) return null;
  if (!/^J[A-Z0-9]{3,5}$/.test(got.pid)) return null;
  const ymd = crewHubDdMmmToYmd(got.dateTok, yearHint);
  if (!ymd) return null;
  return buildOpenTimePairingDetailUrl(got.pid, ymd);
}

export function resolveCrewHubTradeboardPairingDetailUrl(
  post: TradeboardPost,
  yearHint: number,
): string | null {
  const stored = post.pairingDetailUrl?.trim();
  if (stored) return stored;
  const ymd = post.dateYmd?.trim();
  const pid = post.pairingId?.trim().toUpperCase();
  if (pid && ymd && /^\d{8}$/.test(ymd) && /^J[A-Z0-9]{3,5}$/i.test(pid)) {
    return buildTradeboardPairingDetailUrl(pid, ymd);
  }
  return crewHubTradeboardPairingDetailUrl(post, yearHint);
}

export function resolveCrewHubOpenTimePairingDetailUrl(
  trip: OpenTimeTrip,
  yearHint: number,
): string | null {
  const stored = trip.pairingDetailUrl?.trim();
  if (stored) return stored;
  const ymd = trip.dateYmd?.trim();
  const pid = trip.pairingId?.trim().toUpperCase();
  if (pid && ymd && /^\d{8}$/.test(ymd) && /^J[A-Z0-9]{3,5}$/i.test(pid)) {
    return buildOpenTimePairingDetailUrl(pid, ymd);
  }
  return crewHubOpenTimePairingDetailUrl(trip, yearHint);
}
