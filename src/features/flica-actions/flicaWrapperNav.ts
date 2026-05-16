import type { FlicaNavigationLogEntry } from "./flicaActionRecorderTypes";

export const FLICA_TRADEBOARD_FRAME_URL =
  "https://jetblue.flica.net/online/tb_frame.cgi?BCID=002.000&dp=mr";

/** Most recent Open Time frame URL from nav history (no guessing beyond captured URLs). */
export function findLatestOpenTimeFrameUrl(
  log: FlicaNavigationLogEntry[],
): string | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const u = String(log[i]?.url ?? "").toLowerCase();
    if (u.includes("otframe.cgi")) return log[i].url;
  }
  return null;
}

export function isFlicaJetblueUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "jetblue.flica.net";
  } catch {
    return false;
  }
}
