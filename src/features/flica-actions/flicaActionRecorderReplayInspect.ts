import { detectFlicaPairingDetailHtml } from "./flicaPairingDetailDetect";

const PAIRING_ID_RE = /\b(J[A-Z0-9]{3,5}:\d{1,2}[A-Z]{3})\b/i;

const PARSE_PROBE_MARKERS = [
  "Pairing",
  "Report",
  "D-END",
  "TAFB",
  "Crew",
  "Hotel",
  "Layover",
  "Duty",
  "Flight",
  "Credit",
  "Block",
] as const;

export type FlicaReplayInspectSnapshot = {
  capturedAt: string;
  requestedUrl: string;
  ok: boolean;
  status: number;
  finalUrl: string;
  title: string;
  html: string;
  bodyText: string;
  htmlLen: number;
  textLen: number;
  detectedPairingId: string | null;
  isPairingDetailHtml: boolean;
  pairingDetailHints: string[];
  bodyTextPreview: string;
  error?: string;
};

export function htmlToVisibleBodyText(html: string): string {
  let s = String(html ?? "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|tr|td|th|li|h[1-6])>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

export function detectPairingIdInReplayContent(
  html: string,
  bodyText: string,
  hints: string[] = [],
): string | null {
  for (const h of hints) {
    const m = String(h ?? "").match(PAIRING_ID_RE);
    if (m?.[1]) return m[1].toUpperCase();
  }
  const blob = `${bodyText}\n${html}`;
  const m = blob.match(PAIRING_ID_RE);
  return m?.[1]?.toUpperCase() ?? null;
}

function snippetAround(text: string, needle: string, radius = 140): string | null {
  if (!needle) return null;
  const lower = text.toLowerCase();
  const n = needle.toLowerCase();
  const idx = lower.indexOf(n);
  if (idx < 0) return null;
  const slice = text.slice(Math.max(0, idx - radius), idx + needle.length + radius);
  return slice.replace(/\s+/g, " ").trim();
}

function markerPresent(html: string, bodyText: string, marker: string): boolean {
  const blob = `${bodyText}\n${html}`;
  return blob.toLowerCase().includes(marker.toLowerCase());
}

export function buildReplayInspectSnapshot(input: {
  requestedUrl: string;
  status: number;
  finalUrl: string;
  title: string;
  html: string;
  pairingIdHints?: string[];
  error?: string;
}): FlicaReplayInspectSnapshot {
  const html = String(input.html ?? "");
  const bodyText = htmlToVisibleBodyText(html);
  const detectedPairingId = detectPairingIdInReplayContent(html, bodyText, input.pairingIdHints ?? []);
  const detailDetection = detectFlicaPairingDetailHtml(html);
  const httpOk = !input.error && input.status >= 200 && input.status < 400;
  const ok = httpOk && html.length > 0 && (detailDetection.isPairingDetail || html.length > 0);

  return {
    capturedAt: new Date().toISOString(),
    requestedUrl: input.requestedUrl,
    ok,
    status: input.status,
    finalUrl: input.finalUrl || input.requestedUrl,
    title: input.title,
    html,
    bodyText,
    htmlLen: html.length,
    textLen: bodyText.length,
    detectedPairingId: detectedPairingId ?? detailDetection.pairingId ?? null,
    isPairingDetailHtml: detailDetection.isPairingDetail,
    pairingDetailHints: detailDetection.sourceHints,
    bodyTextPreview: bodyText.slice(0, 3000),
    error: input.error,
  };
}

export function formatReplayParseProbe(snap: FlicaReplayInspectSnapshot): string {
  const lines: string[] = [];
  lines.push("[FLICA_REPLAY_PARSE_PROBE]");
  lines.push(`finalUrl=${snap.finalUrl}`);
  lines.push(`requestedUrl=${snap.requestedUrl}`);
  lines.push(`status=${snap.status}`);
  lines.push(`ok=${snap.ok}`);
  lines.push(`title=${snap.title || "(empty)"}`);
  lines.push(`htmlLen=${snap.htmlLen}`);
  lines.push(`textLen=${snap.textLen}`);
  lines.push(`detectedPairingId=${snap.detectedPairingId ?? "(none)"}`);
  lines.push(`isPairingDetailHtml=${snap.isPairingDetailHtml}`);
  lines.push(`pairingDetailMarkers=${snap.pairingDetailHints.join(",") || "(none)"}`);
  if (snap.error) lines.push(`error=${snap.error}`);

  const blob = `${snap.bodyText}\n${snap.html}`;
  for (const marker of PARSE_PROBE_MARKERS) {
    lines.push(`contains_${marker.replace(/-/g, "_")}=${markerPresent(snap.html, snap.bodyText, marker) ? "yes" : "no"}`);
  }

  if (snap.detectedPairingId) {
    const ctx = snippetAround(blob, snap.detectedPairingId) ?? snippetAround(blob, snap.detectedPairingId.split(":")[0] ?? "");
    lines.push(`pairingId_context=${ctx ?? "(not found in text)"}`);
  }

  for (const marker of ["Report", "D-END", "TAFB", "Hotel", "Crew"] as const) {
    if (!markerPresent(snap.html, snap.bodyText, marker)) continue;
    const ctx = snippetAround(blob, marker, 160);
    lines.push(`${marker.replace(/-/g, "_")}_context=${ctx ?? "(present, no snippet)"}`);
  }

  return lines.join("\n");
}
