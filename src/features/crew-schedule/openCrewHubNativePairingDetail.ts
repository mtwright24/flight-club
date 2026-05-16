import type { Href, Router } from "expo-router";

import { fetchFlicaHtmlUsingWebViewSession } from "../flica-actions/flicaActionsHttp";
import { parseFlicaScheduleHtml } from "../../services/flicaScheduleHtmlParser";
import { crewHubFlicaPairingToCrewScheduleTrip } from "./crewHubFlicaPairingToCrewScheduleTrip";
import { flicaPairingHotelsToDetailRows } from "./crewHubFlicaHotelsToDetailRows";
import { stashCrewHubFlicaPairingForTripDetail } from "./tripDetailNavCache";

function monthKeyFromDetailUrl(url: string, fallback: string): string {
  try {
    const pid = new URL(url).searchParams.get("DATE");
    if (pid && /^\d{8}$/.test(pid)) {
      return `${pid.slice(0, 4)}-${pid.slice(4, 6)}`;
    }
  } catch {
    /* ignore */
  }
  return fallback.length >= 7 ? fallback.slice(0, 7) : "2026-01";
}

function pickPairingForUrl(
  pairings: ReturnType<typeof parseFlicaScheduleHtml>["pairings"],
  detailUrl: string,
): (typeof pairings)[0] | null {
  if (!pairings.length) return null;
  try {
    const pid = new URL(detailUrl).searchParams.get("PID")?.trim().toUpperCase();
    if (pid) {
      const hit = pairings.find((p) => p.id.toUpperCase() === pid);
      if (hit) return hit;
    }
  } catch {
    /* ignore */
  }
  return pairings.length === 1 ? pairings[0]! : pairings[0] ?? null;
}

/**
 * Native fetch (saved FLICA session cookies) → schedule HTML parser → stash → Trip Detail route.
 */
export async function openCrewHubNativePairingDetailFromFlicaUrl(opts: {
  router: Router;
  detailUrl: string;
  referer?: string;
}): Promise<void> {
  const { router, detailUrl, referer } = opts;
  const { status, html } = await fetchFlicaHtmlUsingWebViewSession(detailUrl, {
    referer: referer?.trim() || undefined,
  });
  if (status < 200 || status >= 400 || !html?.trim()) {
    throw new Error(`FLICA pairing detail HTTP ${status} (empty body)`);
  }

  const parseMonth = monthKeyFromDetailUrl(detailUrl, new Date().toISOString().slice(0, 7));
  const month = parseFlicaScheduleHtml(html, parseMonth);
  const pairing = pickPairingForUrl(month.pairings, detailUrl);
  if (!pairing) {
    throw new Error("Parser found no pairing block in FLICA detail HTML");
  }

  const tripId = `crew-hub-flica-${pairing.id}-${pairing.startDate.replace(/-/g, "")}`;
  const trip = crewHubFlicaPairingToCrewScheduleTrip(pairing, tripId);
  const prefetchedHotels = flicaPairingHotelsToDetailRows(pairing.hotels ?? []);

  stashCrewHubFlicaPairingForTripDetail({
    trip,
    prefetchedHotels: prefetchedHotels.length ? prefetchedHotels : undefined,
  });

  router.push(
    `/crew-schedule/trip-detail?tripId=${encodeURIComponent(tripId)}` as Href,
  );
}
