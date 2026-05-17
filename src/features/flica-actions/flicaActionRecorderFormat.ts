import type { CapturedFrame, CapturedFlicaActionEvent, FlicaClickActionKind } from "./FlicaActionsWebView";
import { classifyFlicaActionSafety, mayMutateWarning } from "./flicaActionRecorderClassify";
import {
  aggregateFrameMetrics,
  aggregateHiddenFieldsSnapshot,
  aggregateSelectsSnapshot,
  extractOpenTimeRowsFromFrames,
  extractPairingLinksFromFrames,
  extractTradeboardRowsFromFrames,
} from "./flicaActionRecorderExtract";
import type {
  CapturedFlicaPairingLink,
  FlicaActionEventType,
  FlicaActionRecorderExtra,
  FlicaNavigationLogEntry,
  FlicaReplayDryRunPayload,
} from "./flicaActionRecorderTypes";
import { applyReplayTargetFields } from "./flicaReplayTarget";
import { resolveFlicaAbsoluteUrl } from "./flicaTradeBoardAllRequestsForm";

export type FlicaActionRecorderEvent = CapturedFlicaActionEvent & FlicaActionRecorderExtra;

export function pageLabelFromDetected(detected: string, topUrl: string): string {
  const u = topUrl.toLowerCase();
  if (detected && detected !== "unknown") {
    return detected.replace(/_/g, " ");
  }
  if (u.includes("tb_otherrequests")) return "Tradeboard All Requests";
  if (u.includes("tb_myrequests")) return "Tradeboard My Requests";
  if (u.includes("tb_postrequest")) return "Tradeboard Post Request";
  if (u.includes("otopentimepot")) return "Open Time Pot";
  return topUrl.split("/").pop() || topUrl;
}

export function formatFlicaActionEventDebugReport(e: FlicaActionRecorderEvent): string {
  const lines: string[] = [];
  lines.push("[FLICA_ACTION_EVENT]");
  lines.push(`type=${e.eventType}`);
  lines.push(`page=${e.pageLabel}`);
  lines.push(`url=${e.topUrlBefore}`);
  lines.push(`frame=${e.frameName} | ${e.frameUrlBefore}`);
  lines.push(`clickedText=${e.clickedText || "(empty)"}`);
  lines.push(`tag=${e.clickedTag} type=${e.clickedType} name=${e.clickedName}`);
  lines.push(`href=${e.href || "(none)"}`);
  lines.push(`destination=${e.destinationUrl || "(none)"}`);
  lines.push(`nearestFormAction=${e.nearestFormAction || "(none)"}`);
  lines.push(`method=${e.formMethod || "GET"}`);
  lines.push(`classification=${e.safetyClassification}`);
  lines.push(`replayTarget=${e.replayGetUrl || "(none)"} reason=${e.replayTargetReason || "—"}`);
  if (e.popupAbsoluteUrl) lines.push(`popupUrl=${e.popupAbsoluteUrl}`);
  if (e.replayWarning) lines.push(`warning=${e.replayWarning}`);
  lines.push(
    `counts: forms=${e.formFieldCount} hidden=${e.hiddenFieldCount} frames=${e.frameCount} anchors=${e.anchorCount} buttons=${e.buttonCount} tables=${e.tableCount} htmlLen=${e.htmlLength}`,
  );
  lines.push(`frameUrlsBefore=${e.frameUrlsBefore.join(" | ") || "(none)"}`);
  lines.push(`frameUrlsAfter500ms=${(e.frameUrlsAfter500ms ?? []).join(" | ") || "(none)"}`);
  lines.push(`frameUrlsAfter1500ms=${(e.frameUrlsAfter1500ms ?? []).join(" | ") || "(none)"}`);
  lines.push(`frameUrlsAfter3000ms=${(e.frameUrlsAfter3000ms ?? []).join(" | ") || "(none)"}`);
  lines.push(`frameUrlsAfter6000ms=${(e.frameUrlsAfter6000ms ?? []).join(" | ") || "(none)"}`);
  if (e.activityNextNote) lines.push(`activityNextNote=${e.activityNextNote}`);
  if (e.activityPopupBlockNote) lines.push(`activityPopupBlockNote=${e.activityPopupBlockNote}`);
  if (e.popupFrameNames) lines.push(`popupFrameNames=${e.popupFrameNames}`);
  if (e.flicaHandlerSources) lines.push(`flicaHandlerSources=\n${e.flicaHandlerSources}`);
  if (e.selectsSnapshot) {
    lines.push(`selects=\n${e.selectsSnapshot}`);
  }
  if (e.hiddenFieldsSnapshot) {
    lines.push(`hiddenFields=\n${e.hiddenFieldsSnapshot}`);
  }
  if (e.pairingLinks.length) {
    lines.push(`pairingLinks=${e.pairingLinks.length}`);
    for (const p of e.pairingLinks.slice(0, 8)) {
      lines.push(`  ${p.pairingId} | ${p.source} | ${p.absoluteUrl}`);
    }
  }
  if (e.tradeboardRows.length) {
    lines.push(`tradeboardRows=${e.tradeboardRows.length}`);
    for (const r of e.tradeboardRows.slice(0, 5)) {
      lines.push(
        `  ${r.pairingId} pickup=${r.pickupTrip?.text ?? "—"} propose=${r.proposeTrade?.text ?? "—"} fav=${r.addToFavorites?.text ?? "—"}`,
      );
    }
  }
  lines.push(`onclick=${e.onclick || "(none)"}`);
  lines.push(`--- formsBefore ---\n${e.formsBefore || "(none)"}`);
  lines.push(`--- previewsAfter3s ---\n${e.previewsAfter3000ms || "(none)"}`);
  lines.push(`--- previewsAfter6s ---\n${e.previewsAfter6000ms || "(none)"}`);
  return lines.join("\n");
}

export function formatFullActionLog(input: {
  events: FlicaActionRecorderEvent[];
  navigationLog: FlicaNavigationLogEntry[];
  pairingLinks: CapturedFlicaPairingLink[];
}): string {
  const lines: string[] = [];
  lines.push("=== FLICA ACTION RECORDER LOG ===");
  lines.push(`events=${input.events.length} nav=${input.navigationLog.length} pairingLinks=${input.pairingLinks.length}`);
  lines.push("");
  if (input.navigationLog.length) {
    lines.push("--- NAVIGATION ---");
    for (const n of input.navigationLog.slice(-40)) {
      lines.push(`[${n.phase}] ${n.timestamp} ${n.url}${n.title ? ` | ${n.title}` : ""}`);
    }
    lines.push("");
  }
  if (input.pairingLinks.length) {
    lines.push("--- PAIRING LINKS ---");
    for (const p of input.pairingLinks) {
      lines.push(`${p.source} ${p.pairingId} ${p.dateText ?? ""} -> ${p.absoluteUrl}`);
    }
    lines.push("");
  }
  for (const e of input.events) {
    lines.push(formatFlicaActionEventDebugReport(e));
    lines.push("");
  }
  return lines.join("\n");
}

export function formatReplayDryRunText(payload: FlicaReplayDryRunPayload): string {
  const lines: string[] = [];
  lines.push("[FLICA_REPLAY_DRY_RUN]");
  lines.push(`method=${payload.method}`);
  lines.push(`url=${payload.url}`);
  lines.push(`referer=${payload.referer}`);
  lines.push(`classification=${payload.classification}`);
  lines.push(`willSend=${payload.willSend}`);
  if (payload.warning) lines.push(`warning=${payload.warning}`);
  lines.push("headers:");
  for (const [k, v] of Object.entries(payload.headers)) {
    if (k.toLowerCase() === "cookie") {
      lines.push(`  ${k}=[REDACTED]`);
    } else {
      lines.push(`  ${k}=${v}`);
    }
  }
  if (payload.body) {
    lines.push(`body=${payload.body.slice(0, 4000)}`);
  }
  return lines.join("\n");
}

export function emptyRecorderExtra(
  partial: Partial<FlicaActionRecorderExtra> = {},
): FlicaActionRecorderExtra {
  return {
    eventType: "click",
    safetyClassification: "SAFE_READ",
    pageLabel: "",
    nearestFormAction: "",
    formMethod: "GET",
    formTarget: "",
    formEnctype: "",
    formName: "",
    formId: "",
    formFieldCount: 0,
    hiddenFieldCount: 0,
    frameCount: 0,
    anchorCount: 0,
    buttonCount: 0,
    tableCount: 0,
    htmlLength: 0,
    bodyPreview: "",
    selectsSnapshot: "",
    hiddenFieldsSnapshot: "",
    frameUrlsBefore: [],
    frameUrlsAfterNav: null,
    pairingLinks: [],
    tradeboardRows: [],
    openTimeRows: [],
    replayGetUrl: "",
    replayTargetReason: "",
    popupAbsoluteUrl: "",
    replayReferer: "",
    replayPostBody: null,
    replayWarning: null,
    ...partial,
  };
}

function buildUrlEncodedFromFrames(frames: CapturedFrame[]): string | null {
  const pairs: string[] = [];
  for (const f of frames) {
    for (const form of f.forms) {
      for (const inp of form.inputs) {
        if (!inp.name) continue;
        if (inp.type === "password") continue;
        pairs.push(
          `${encodeURIComponent(inp.name)}=${encodeURIComponent(inp.value ?? "")}`,
        );
      }
    }
  }
  return pairs.length ? pairs.join("&") : null;
}

export function buildRecorderExtraFromFrames(input: {
  frames: CapturedFrame[];
  topUrl: string;
  detectedPageType: string;
  actionKind: FlicaClickActionKind;
  clickedText: string;
  href: string;
  onclick: string;
  formMethod?: string;
  eventType: FlicaActionEventType;
  isSubmit?: boolean;
  nearestForm?: {
    action?: string;
    method?: string;
    target?: string;
    enctype?: string;
    name?: string;
    id?: string;
  };
  capturedAt: string;
  popupAbsoluteUrl?: string;
  destinationUrl?: string;
}): FlicaActionRecorderExtra {
  const metrics = aggregateFrameMetrics(input.frames);
  const pairingLinks = extractPairingLinksFromFrames(
    input.frames,
    input.topUrl,
    input.capturedAt,
  );
  const safety = classifyFlicaActionSafety({
    actionKind: input.actionKind,
    clickedText: input.clickedText,
    href: input.href,
    onclick: input.onclick,
    formMethod: input.formMethod ?? input.nearestForm?.method,
    eventType: input.eventType,
    isSubmit: input.isSubmit,
  });
  const replayFields = applyReplayTargetFields({
    popupAbsoluteUrl: input.popupAbsoluteUrl,
    pairingLinks,
    clickedText: input.clickedText,
    onclick: input.onclick,
    href: input.href,
    destinationUrl: input.destinationUrl,
    currentUrl: input.topUrl,
  });
  const method = (input.formMethod ?? input.nearestForm?.method ?? "GET").toUpperCase();
  const replayPostBody = method === "POST" ? buildUrlEncodedFromFrames(input.frames) : null;

  return emptyRecorderExtra({
    eventType: input.eventType,
    safetyClassification: safety,
    pageLabel: pageLabelFromDetected(input.detectedPageType, input.topUrl),
    nearestFormAction: input.nearestForm?.action ?? "",
    formMethod: method,
    formTarget: input.nearestForm?.target ?? "",
    formEnctype: input.nearestForm?.enctype ?? "",
    formName: input.nearestForm?.name ?? "",
    formId: input.nearestForm?.id ?? "",
    formFieldCount: metrics.formFieldCount,
    hiddenFieldCount: metrics.hiddenFieldCount,
    frameCount: input.frames.length,
    anchorCount: metrics.anchorCount,
    buttonCount: metrics.buttonCount,
    tableCount: metrics.tableCount,
    htmlLength: metrics.htmlLength,
    bodyPreview: metrics.bodyPreview,
    selectsSnapshot: aggregateSelectsSnapshot(input.frames),
    hiddenFieldsSnapshot: aggregateHiddenFieldsSnapshot(input.frames),
    frameUrlsBefore: input.frames.map((f) => f.locationHref),
    pairingLinks,
    tradeboardRows: extractTradeboardRowsFromFrames(input.frames, input.capturedAt),
    openTimeRows: extractOpenTimeRowsFromFrames(input.frames, input.capturedAt),
    ...replayFields,
    replayReferer: input.topUrl,
    replayPostBody,
    replayWarning: mayMutateWarning(safety),
  });
}
