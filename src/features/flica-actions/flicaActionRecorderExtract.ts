import {
  inferPairingDetailSource,
  parseFlicaPairOnclick,
  resolveFlicaPairingDetailUrl,
  ymdToDdMmmToken,
} from "./flicaPairingDetailUrl";
import { resolveFlicaAbsoluteUrl } from "./flicaTradeBoardAllRequestsForm";
import type { CapturedFrame } from "./FlicaActionsWebView";
import type {
  CapturedFlicaOpenTimeRowActions,
  CapturedFlicaPairingLink,
  CapturedFlicaTradeboardRowActions,
} from "./flicaActionRecorderTypes";

const PAIRING_ID_RE = /\b(J[A-Z0-9]{3,5}:\d{1,2}[A-Z]{3})\b/i;
const DATE_TOKEN_RE = /\b\d{1,2}[A-Z]{3}(?:\s*[-–]\s*\d{1,2}[A-Z]{3})?\b/i;

export function inferPairingSourceFromUrl(url: string): CapturedFlicaPairingLink["source"] {
  const u = url.toLowerCase();
  if (u.includes("tb_") || u.includes("tradeboard") || u.includes("tb_frame")) return "tradeboard";
  if (u.includes("ot") || u.includes("opentime")) return "opentime";
  return "unknown";
}

function pickPairingIdFromText(text: string): string | null {
  const m = String(text ?? "").match(PAIRING_ID_RE);
  return m?.[1]?.toUpperCase() ?? null;
}

function pickDateFromText(text: string): string | undefined {
  const m = String(text ?? "").match(DATE_TOKEN_RE);
  return m?.[0];
}

function rowCellsFromTableSnippet(snippet: string): string[] {
  return String(snippet ?? "")
    .split(/\t|\|/)
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter((c) => c.length > 0 && c.length < 120)
    .slice(0, 24);
}

function findRowSnippetForPairing(frames: CapturedFrame[], pairingId: string): string | undefined {
  const id = pairingId.toUpperCase();
  for (const f of frames) {
    for (const sn of f.tableSnippets ?? []) {
      if (sn.toUpperCase().includes(id)) return sn;
    }
    for (const l of f.links) {
      if ((l.text || "").toUpperCase().includes(id)) {
        return snFromNearbyTables(f, l.text) ?? l.text;
      }
    }
  }
  return undefined;
}

function snFromNearbyTables(f: CapturedFrame, needle: string): string | undefined {
  const n = needle.toUpperCase();
  for (const sn of f.tableSnippets ?? []) {
    if (sn.toUpperCase().includes(n.slice(0, 8))) return sn;
  }
  return undefined;
}

function normalizeLinkTextKey(text: string): string {
  return String(text ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

/** Map visible anchor text → onclick snippet (javascript:void(0) pairing links). */
function frameOnclickByLinkText(f: CapturedFrame): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of f.clickables) {
    const t = normalizeLinkTextKey(c.text);
    const oc = String(c.onclickSnippet ?? "").trim();
    if (!t || !oc) continue;
    if (!m.has(t)) m.set(t, oc);
  }
  return m;
}

function pairingIdForCapture(
  textBlob: string,
  parsed: ReturnType<typeof parseFlicaPairOnclick>,
): string | null {
  const fromText = pickPairingIdFromText(textBlob);
  if (fromText) return fromText;
  if (!parsed) return null;
  const ddMmm = ymdToDdMmmToken(parsed.dateYmd);
  return ddMmm ? `${parsed.pid}:${ddMmm}` : parsed.pid;
}

function pushResolvedPairingLink(
  out: CapturedFlicaPairingLink[],
  seen: Set<string>,
  input: {
    source: CapturedFlicaPairingLink["source"];
    topUrl: string;
    frameUrl: string;
    text: string;
    href: string;
    onclick: string;
    capturedAt: string;
    frames: CapturedFrame[];
  },
): void {
  const text = String(input.text ?? "").trim();
  const hrefRaw = String(input.href ?? "").trim();
  const onclick = String(input.onclick ?? "").trim();
  const blob = `${text} ${hrefRaw} ${onclick}`;
  const parsed = parseFlicaPairOnclick(onclick);
  const pairingId = pairingIdForCapture(blob, parsed);
  if (!pairingId && !parsed) return;

  const frameSource = inferPairingDetailSource(input.source, input.frameUrl, input.topUrl);
  const resolved = resolveFlicaPairingDetailUrl({
    source: frameSource,
    href: hrefRaw,
    onclick,
    frameUrl: input.frameUrl,
    topUrl: input.topUrl,
  });

  let absoluteUrl = resolved?.absoluteUrl ?? "";
  let hrefOut = resolved?.href ?? hrefRaw;

  if (!absoluteUrl && hrefRaw && !/^javascript:/i.test(hrefRaw)) {
    absoluteUrl = resolveFlicaAbsoluteUrl(hrefRaw);
    hrefOut = absoluteUrl;
  }

  if (!absoluteUrl) return;

  const pid = pairingId ?? (parsed ? `${parsed.pid}` : pickPairingIdFromText(blob));
  if (!pid) return;

  const key = `${pid}|${absoluteUrl}`;
  if (seen.has(key)) return;
  seen.add(key);

  const rowSn = findRowSnippetForPairing(input.frames, pid);
  const dateText =
    pickDateFromText(blob) ??
    (parsed ? ymdToDdMmmToken(parsed.dateYmd) : undefined) ??
    pickDateFromText(rowSn ?? "");

  out.push({
    source: frameSource,
    pairingId: pid,
    dateText,
    href: hrefOut,
    absoluteUrl,
    rowText: rowSn?.replace(/\s+/g, " ").trim().slice(0, 500),
    rowCells: rowSn ? rowCellsFromTableSnippet(rowSn) : undefined,
    capturedAt: input.capturedAt,
  });
}

export function extractPairingLinksFromFrames(
  frames: CapturedFrame[],
  topUrl: string,
  capturedAt: string,
): CapturedFlicaPairingLink[] {
  const source = inferPairingSourceFromUrl(topUrl);
  const out: CapturedFlicaPairingLink[] = [];
  const seen = new Set<string>();

  for (const f of frames) {
    const onclickByText = frameOnclickByLinkText(f);
    const frameUrl = f.locationHref ?? "";

    for (const l of f.links) {
      const href = String(l.href ?? "").trim();
      const text = String(l.text ?? "").trim();
      const blob = `${text} ${href}`;
      const pid = pickPairingIdFromText(blob);
      const parsed = parseFlicaPairOnclick(onclickByText.get(normalizeLinkTextKey(text)) ?? "");
      if (!pid && !parsed) continue;

      const onclick = onclickByText.get(normalizeLinkTextKey(text)) ?? "";

      pushResolvedPairingLink(out, seen, {
        source,
        topUrl,
        frameUrl,
        text,
        href,
        onclick,
        capturedAt,
        frames,
      });
    }

    for (const c of f.clickables) {
      const onclick = String(c.onclickSnippet ?? "").trim();
      const text = String(c.text ?? "").trim();
      const href = String(c.href ?? "").trim();
      const blob = `${text} ${href} ${onclick}`;
      const pid = pickPairingIdFromText(blob);
      const parsed = parseFlicaPairOnclick(onclick);
      if (!pid && !parsed) continue;

      pushResolvedPairingLink(out, seen, {
        source,
        topUrl,
        frameUrl,
        text,
        href,
        onclick,
        capturedAt,
        frames,
      });
    }
  }

  return out;
}

/** Normalize a row-level pairing href for catalog / replay (void(0) → rbcpair/RBCPair). */
export function normalizeCapturedPairingHref(
  href: string,
  onclick: string,
  source: CapturedFlicaPairingLink["source"],
  topUrl: string,
  frameUrl?: string,
): string {
  const resolved = resolveFlicaPairingDetailUrl({
    source,
    href,
    onclick,
    frameUrl: frameUrl ?? "",
    topUrl,
  });
  if (resolved) return resolved.absoluteUrl;
  if (href && !/^javascript:/i.test(href)) return resolveFlicaAbsoluteUrl(href);
  return href;
}

function actionFromLink(
  text: string,
  href: string,
  onclick?: string,
): { text: string; href: string; onclick?: string } | undefined {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t && !href) return undefined;
  return { text: t || href.slice(0, 80), href, onclick };
}

export function extractTradeboardRowsFromFrames(
  frames: CapturedFrame[],
  capturedAt: string,
): CapturedFlicaTradeboardRowActions[] {
  const rows: CapturedFlicaTradeboardRowActions[] = [];
  const byPairing = new Map<string, CapturedFlicaTradeboardRowActions>();

  for (const f of frames) {
    const onclickByText = frameOnclickByLinkText(f);
    const frameUrl = f.locationHref ?? "";
    const rowSource = inferPairingSourceFromUrl(frameUrl);
    for (const sn of f.tableSnippets ?? []) {
      const pid = pickPairingIdFromText(sn);
      if (!pid) continue;
      let row = byPairing.get(pid);
      if (!row) {
        row = {
          pairingId: pid,
          rowText: sn.replace(/\s+/g, " ").trim().slice(0, 600),
          rowCells: rowCellsFromTableSnippet(sn),
          capturedAt,
        };
        byPairing.set(pid, row);
      }
    }

    for (const l of f.links) {
      const pid = pickPairingIdFromText(`${l.text} ${l.href}`);
      const t = (l.text || "").toLowerCase();
      const h = (l.href || "").toLowerCase();
      if (!pid && !t.includes("pickup") && !t.includes("propose") && !t.includes("favorite")) continue;

      const targetPid = pid ?? pickPairingIdFromText(f.bodyPreview) ?? "";
      if (!targetPid) continue;
      let row = byPairing.get(targetPid);
      if (!row) {
        row = { pairingId: targetPid, capturedAt };
        byPairing.set(targetPid, row);
      }

      if (pid && (l.href || l.text)) {
        const oc = onclickByText.get(normalizeLinkTextKey(l.text)) ?? "";
        row.pairingHref = normalizeCapturedPairingHref(l.href, oc, rowSource, frameUrl, frameUrl);
      }
      if (t.includes("pickup") || h.includes("pickup") || h.includes("hdnpickup")) {
        row.pickupTrip = actionFromLink(l.text, l.href);
      } else if (t.includes("propose") || h.includes("restrade") || h.includes("restrade")) {
        row.proposeTrade = actionFromLink(l.text, l.href);
      } else if (t.includes("favorite") || h.includes("favorite")) {
        row.addToFavorites = actionFromLink(l.text, l.href);
      } else if (t.includes("response") || t.includes("contact") || t.includes("method")) {
        row.responseLinks = row.responseLinks ?? [];
        row.responseLinks.push({ text: l.text, href: l.href });
      }
    }

    for (const b of f.buttons) {
      const t = `${b.text} ${b.name} ${b.value}`.toLowerCase();
      const pid = pickPairingIdFromText(f.bodyPreview) ?? "";
      if (!pid) continue;
      let row = byPairing.get(pid);
      if (!row) {
        row = { pairingId: pid, capturedAt };
        byPairing.set(pid, row);
      }
      if (t.includes("pickup")) row.pickupTrip = actionFromLink(b.text || b.value, "", b.name);
      if (t.includes("propose")) row.proposeTrade = actionFromLink(b.text || b.value, "", b.name);
      if (t.includes("favorite")) row.addToFavorites = actionFromLink(b.text || b.value, "", b.name);
    }
  }

  for (const r of byPairing.values()) rows.push(r);
  return rows;
}

export function extractOpenTimeRowsFromFrames(
  frames: CapturedFrame[],
  capturedAt: string,
): CapturedFlicaOpenTimeRowActions[] {
  const byPairing = new Map<string, CapturedFlicaOpenTimeRowActions>();

  for (const f of frames) {
    const onclickByText = frameOnclickByLinkText(f);
    const frameUrl = f.locationHref ?? "";
    const rowSource = inferPairingSourceFromUrl(frameUrl);
    for (const sn of f.tableSnippets ?? []) {
      const pid = pickPairingIdFromText(sn);
      if (!pid) continue;
      if (!byPairing.has(pid)) {
        byPairing.set(pid, {
          pairingId: pid,
          rowText: sn.replace(/\s+/g, " ").trim().slice(0, 600),
          rowCells: rowCellsFromTableSnippet(sn),
          capturedAt,
        });
      }
    }

    for (const l of f.links) {
      const pid = pickPairingIdFromText(`${l.text} ${l.href}`);
      if (!pid) continue;
      let row = byPairing.get(pid);
      if (!row) {
        row = { pairingId: pid, capturedAt };
        byPairing.set(pid, row);
      }
      const oc = onclickByText.get(normalizeLinkTextKey(l.text)) ?? "";
      row.pairingHref = normalizeCapturedPairingHref(l.href, oc, rowSource, frameUrl, frameUrl);
      const t = (l.text || "").toLowerCase();
      const h = (l.href || "").toLowerCase();
      if (t === "add" || t.includes("pickup") || h.includes("createreq(1)")) {
        row.addPickup = actionFromLink(l.text, l.href);
      } else if (t.includes("drop") || h.includes("createreq(2)")) {
        row.drop = actionFromLink(l.text, l.href);
      } else if (t.includes("swap") || h.includes("otswap")) {
        row.swap = actionFromLink(l.text, l.href);
      } else if (t.includes("trade") || h.includes("createreq(3)")) {
        row.trade = actionFromLink(l.text, l.href);
      }
    }

    for (const c of f.clickables) {
      const oc = (c.onclickSnippet || "").toLowerCase();
      const pid = pickPairingIdFromText(`${c.text} ${c.href} ${oc}`);
      if (!pid) continue;
      let row = byPairing.get(pid);
      if (!row) {
        row = { pairingId: pid, capturedAt };
        byPairing.set(pid, row);
      }
      if (oc.includes("createreq(1)")) row.addPickup = actionFromLink(c.text, c.href, oc);
      if (oc.includes("createreq(2)")) row.drop = actionFromLink(c.text, c.href, oc);
      if (oc.includes("createreq(3)")) row.trade = actionFromLink(c.text, c.href, oc);
      if (oc.includes("createreq(4)")) row.swap = actionFromLink(c.text, c.href, oc);
    }
  }

  return [...byPairing.values()];
}

export function aggregateFrameMetrics(frames: CapturedFrame[]): {
  formFieldCount: number;
  hiddenFieldCount: number;
  anchorCount: number;
  buttonCount: number;
  tableCount: number;
  htmlLength: number;
  bodyPreview: string;
} {
  let formFieldCount = 0;
  let hiddenFieldCount = 0;
  let anchorCount = 0;
  let buttonCount = 0;
  let tableCount = 0;
  let htmlLength = 0;
  let bodyPreview = "";
  for (const f of frames) {
    anchorCount += f.links.length;
    buttonCount += f.buttons.length;
    tableCount += f.tableSnippets?.length ?? 0;
    htmlLength += f.htmlLength;
    if (!bodyPreview && f.bodyPreview) bodyPreview = f.bodyPreview.slice(0, 400);
    for (const form of f.forms) {
      formFieldCount += form.inputs.length;
      for (const inp of form.inputs) {
        if (inp.type === "hidden") hiddenFieldCount += 1;
      }
    }
    for (const fc of f.fieldControls ?? []) {
      if (fc.type === "hidden") hiddenFieldCount += 1;
    }
  }
  return {
    formFieldCount,
    hiddenFieldCount,
    anchorCount,
    buttonCount,
    tableCount,
    htmlLength,
    bodyPreview,
  };
}

export function aggregateSelectsSnapshot(frames: CapturedFrame[]): string {
  const lines: string[] = [];
  for (const f of frames) {
    for (const fc of f.fieldControls ?? []) {
      if (fc.tag !== "SELECT") continue;
      lines.push(
        `[${f.frameName}] name=${fc.name} id=${fc.id} selected=${fc.value}`,
      );
    }
    for (const form of f.forms) {
      for (const inp of form.inputs) {
        if (inp.tag === "SELECT") {
          lines.push(
            `[${f.frameName}] form field name=${inp.name} value=${inp.value}`,
          );
        }
      }
    }
  }
  return lines.join("\n").slice(0, 8000);
}

export function aggregateHiddenFieldsSnapshot(frames: CapturedFrame[]): string {
  const lines: string[] = [];
  for (const f of frames) {
    for (const form of f.forms) {
      for (const inp of form.inputs) {
        if (inp.type !== "hidden") continue;
        lines.push(`[${f.frameName}] ${inp.name}=${inp.value}`);
      }
    }
    for (const fc of f.fieldControls ?? []) {
      if (fc.type !== "hidden") continue;
      lines.push(`[${f.frameName}] ${fc.name || fc.id}=${fc.value}`);
    }
  }
  return lines.join("\n").slice(0, 8000);
}
