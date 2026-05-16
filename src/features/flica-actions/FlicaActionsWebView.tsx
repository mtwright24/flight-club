import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import WebView, {
  type WebViewNavigation,
} from "react-native-webview";
import CookieManager from "@react-native-community/cookies";

import {
  saveFlicaCookiesToSecureStore,
  type FlicaStoredCookies,
} from "../../dev/flicaPoCCookieStore";
import { FLICA_WEBVIEW_USER_AGENT } from "../../dev/flicaPoCConfig";
import { FLICA_POC_INJECT_BEFORE_CONTENT } from "../../dev/flicaPoCWebFontShim";
import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import { fetchFlicaHtmlUsingWebViewSession } from "./flicaActionsHttp";
import { markFlicaActionsWebViewSessionReady } from "./flicaActionsWebViewSession";
import { INJECT_FLICA_POPUP_INTERCEPT } from "./flicaPopupInterceptInject";
import {
  formatPairingDetailParseProbe,
  parseReplayHtmlAsPairingDetail,
  type FlicaParsedReplayPairingResult,
} from "./flicaPairingDetailDetect";
import {
  applyReplayTargetFields,
  classifyPopupNavigationSafety,
} from "./flicaReplayTarget";
import {
  FLICA_TRADEBOARD_FRAME_URL,
  findLatestOpenTimeFrameUrl,
  isFlicaJetblueUrl,
} from "./flicaWrapperNav";
import {
  buildRecorderExtraFromFrames,
  formatFullActionLog,
  formatFlicaActionEventDebugReport,
  formatReplayDryRunText,
  type FlicaActionRecorderEvent,
} from "./flicaActionRecorderFormat";
import { extractPairingLinksFromFrames } from "./flicaActionRecorderExtract";
import {
  buildReplayDryRunPayload,
  replayCapturedGet,
  replayCapturedPostDryRun,
} from "./flicaActionRecorderReplay";
import {
  buildReplayInspectSnapshot,
  formatReplayParseProbe,
  type FlicaReplayInspectSnapshot,
} from "./flicaActionRecorderReplayInspect";
import type { CapturedFlicaPairingLink, FlicaNavigationLogEntry } from "./flicaActionRecorderTypes";
import { colors, radius, spacing } from "../../styles/theme";

export type { CapturedFlicaPairingLink } from "./flicaActionRecorderTypes";

const FLICA_ORIGIN = "https://jetblue.flica.net";

const FLICA_ACTIONS_BEFORE_CONTENT = `${FLICA_POC_INJECT_BEFORE_CONTENT}\n${INJECT_FLICA_POPUP_INTERCEPT}`;

type SessionState =
  | "idle"
  | "loading"
  | "captcha"
  | "error"
  | "ready";

type DetectedPageType =
  | "main_menu"
  | "tradeboard_my_requests"
  | "tradeboard_all_requests"
  | "tradeboard_favorites"
  | "tradeboard_my_responses"
  | "tradeboard_post_request"
  | "tradeboard_my_schedule"
  | "tradeboard_pairing_selection"
  | "opentime_pot"
  | "opentime_requests"
  | "opentime_add"
  | "opentime_drop"
  | "opentime_swap"
  | "opentime_view_print_pairings"
  | "opentime_reserve_grid"
  | "confirmation"
  | "schedule_popup"
  | "unknown";

type FormFieldRow = {
  tag: string;
  type: string;
  name: string;
  value: string;
};

type CapturedForm = {
  action: string;
  method: string;
  inputs: FormFieldRow[];
};

type CapturedButton = {
  tag: string;
  type: string;
  name: string;
  value: string;
  text: string;
};

type CapturedClickable = {
  tag: string;
  text: string;
  href: string;
  onclickSnippet: string;
};

export type CapturedFieldControl = {
  tag: string;
  type: string;
  name: string;
  id: string;
  value: string;
};

export type CapturedFrame = {
  frameName: string;
  frameIndex: number;
  frameSrc: string;
  locationHref: string;
  title: string;
  htmlLength: number;
  bodyPreview: string;
  links: Array<{ text: string; href: string }>;
  forms: CapturedForm[];
  buttons: CapturedButton[];
  clickables: CapturedClickable[];
  /** First N tables' visible text (trimmed) for action rows / labels. */
  tableSnippets?: string[];
  /** input/select/textarea with name or id (includes fields inside forms). */
  fieldControls?: CapturedFieldControl[];
  /** Text from elements with role button/tab/link. */
  roleActionTexts?: string[];
};

export type AvailableActionKind =
  | "link"
  | "form"
  | "form_input"
  | "button"
  | "onclick"
  | "table"
  | "field"
  | "role_control";

export type AvailableActionItem = {
  kind: AvailableActionKind;
  frameLabel: string;
  text: string;
  detail: string;
};

type LastInteraction =
  | {
      kind: "click";
      topUrlAtEvent: string;
      frameLocationHref: string;
      tag: string;
      text: string;
      href: string;
      formAction: string;
      inputName: string;
      inputValue: string;
      onclickSnippet: string;
    }
  | {
      kind: "submit";
      topUrlAtEvent: string;
      frameLocationHref: string;
      formAction: string;
      formMethod: string;
      fields: FormFieldRow[];
    };

export type CapturedPageSnapshot = {
  timestamp: string;
  topUrl: string;
  topTitle: string;
  detectedPageType: DetectedPageType;
  frames: CapturedFrame[];
  /** Page-level inventory of actionable UI derived from captured frames (no click required). */
  availableActions: AvailableActionItem[];
  lastInteraction: LastInteraction | null;
  captureReason: string;
  visitCount: number;
  lastSeenAt: string;
};

export type FlicaClickActionKind =
  | "opentime_add"
  | "opentime_drop"
  | "opentime_swap"
  | "trade_create"
  | "tradeboard_all_requests"
  | "tradeboard_my_requests"
  | "tradeboard_favorites"
  | "tradeboard_my_responses"
  | "tradeboard_post_request"
  | "tradeboard_pickup"
  | "tradeboard_propose_trade"
  | "tradeboard_add_favorite"
  | "tradeboard_edit"
  | "tradeboard_delete"
  | "tradeboard_filter"
  | "tab_navigation"
  | "unknown_click";

export type CapturedFlicaActionEvent = {
  eventId: string;
  timestamp: string;
  actionLabel: string;
  actionKind: FlicaClickActionKind;
  clickedText: string;
  clickedTag: string;
  clickedType: string;
  clickedName: string;
  clickedValue: string;
  clickedRole: string;
  onclick: string;
  href: string;
  destinationUrl: string;
  frameName: string;
  frameUrlBefore: string;
  topUrlBefore: string;
  pageTitleBefore: string;
  detectedPageTypeBefore: DetectedPageType;
  formsBefore: string;
  buttonsBefore: string;
  linksBefore: string;
  frameUrlsAfter500ms: string[] | null;
  frameUrlsAfter1500ms: string[] | null;
  frameUrlsAfter3000ms: string[] | null;
  formsAfter3000ms: string;
  buttonsAfter3000ms: string;
  linksAfter3000ms: string;
  previewsAfter3000ms: string;
};

function aggregateFormsLines(frames: CapturedFrame[], maxFormsPerFrame = 10): string {
  const lines: string[] = [];
  for (const f of frames) {
    const head = `[${f.frameName || "?"}] ${f.locationHref}`;
    for (const form of f.forms.slice(0, maxFormsPerFrame)) {
      const names = form.inputs
        .map((i) => i.name)
        .filter(Boolean)
        .slice(0, 30)
        .join(",");
      lines.push(`${head} | ${form.method} ${form.action} | n=${form.inputs.length} | ${names}`);
    }
  }
  return lines.join("\n").slice(0, 14_000);
}

function aggregateButtonsLines(frames: CapturedFrame[], maxPerFrame = 35): string {
  const lines: string[] = [];
  for (const f of frames) {
    const head = `[${f.frameName || "?"}]`;
    for (const b of f.buttons.slice(0, maxPerFrame)) {
      lines.push(
        `${head} <${b.tag} type=${b.type}> name=${b.name} text=${b.text} value=${b.value}`,
      );
    }
  }
  return lines.join("\n").slice(0, 14_000);
}

function aggregateLinksLines(frames: CapturedFrame[], maxPerFrame = 30): string {
  const lines: string[] = [];
  for (const f of frames) {
    const head = `[${f.frameName || "?"}]`;
    for (const l of f.links.slice(0, maxPerFrame)) {
      lines.push(`${head} "${l.text}" -> ${l.href}`);
    }
  }
  return lines.join("\n").slice(0, 14_000);
}

function aggregatePreviewsLines(frames: CapturedFrame[], maxLen = 600): string {
  return frames
    .map((f) => `[${f.frameName || "?"}] ${f.locationHref}\n${f.bodyPreview.slice(0, maxLen)}`)
    .join("\n---\n")
    .slice(0, 12_000);
}

const AVAILABLE_ACTIONS_MAX = 800;

function deriveAvailableActionsInventory(frames: CapturedFrame[]): AvailableActionItem[] {
  const items: AvailableActionItem[] = [];
  const push = (row: AvailableActionItem) => {
    if (items.length >= AVAILABLE_ACTIONS_MAX) return false;
    items.push(row);
    return true;
  };

  for (const f of frames) {
    const fl =
      [f.frameName, f.locationHref].filter(Boolean).join(" | ").slice(0, 240) || "(frame)";

    for (const l of f.links) {
      if (
        !push({
          kind: "link",
          frameLabel: fl,
          text: (l.text || "").slice(0, 160),
          detail: (l.href || "").slice(0, 2500),
        })
      )
        return items;
    }

    for (const form of f.forms) {
      if (
        !push({
          kind: "form",
          frameLabel: fl,
          text: `${form.method} ${(form.action || "").slice(0, 400)}`.slice(0, 220),
          detail: `inputs=${form.inputs.length}`,
        })
      )
        return items;
      for (const inp of form.inputs) {
        if (
          !push({
            kind: "form_input",
            frameLabel: fl,
            text: [inp.tag, inp.type, inp.name].filter(Boolean).join(" ").slice(0, 120),
            detail: `value=${(inp.value || "").slice(0, 120)}`,
          })
        )
          return items;
      }
    }

    for (const b of f.buttons) {
      if (
        !push({
          kind: "button",
          frameLabel: fl,
          text: [b.text, b.name, b.tag, b.type].filter(Boolean).join(" | ").slice(0, 160),
          detail: (b.value || "").slice(0, 200),
        })
      )
        return items;
    }

    for (const c of f.clickables) {
      if (
        !push({
          kind: "onclick",
          frameLabel: fl,
          text: [c.tag, c.text].filter(Boolean).join(" ").slice(0, 120),
          detail: (c.onclickSnippet || "").slice(0, 500),
        })
      )
        return items;
    }

    const tables = f.tableSnippets ?? [];
    for (let ti = 0; ti < tables.length; ti++) {
      const sn = tables[ti] || "";
      if (!sn.trim()) continue;
      if (
        !push({
          kind: "table",
          frameLabel: fl,
          text: `table#${ti + 1}`,
          detail: sn.replace(/\s+/g, " ").trim().slice(0, 900),
        })
      )
        return items;
    }

    const fields = f.fieldControls ?? [];
    for (const fc of fields) {
      if (
        !push({
          kind: "field",
          frameLabel: fl,
          text: [fc.tag, fc.type, fc.name || fc.id].filter(Boolean).join(" ").slice(0, 140),
          detail: `id=${fc.id} value=${(fc.value || "").slice(0, 120)}`,
        })
      )
        return items;
    }

    const roles = f.roleActionTexts ?? [];
    for (const rt of roles) {
      const t = (rt || "").replace(/\s+/g, " ").trim();
      if (!t) continue;
      if (!push({ kind: "role_control", frameLabel: fl, text: t.slice(0, 160), detail: "" }))
        return items;
    }
  }

  return items;
}

function classifyFlicaClickAction(input: {
  clickedText: string;
  onclick: string;
  href: string;
  destinationUrl: string;
  clickedName: string;
  clickedTag: string;
  clickedType: string;
  clickedRole: string;
}): FlicaClickActionKind {
  const t = (input.clickedText || "").toLowerCase().replace(/\s+/g, " ").trim();
  const oc = (input.onclick || "").toLowerCase();
  const h = `${input.href} ${input.destinationUrl || ""}`.toLowerCase();
  const n = (input.clickedName || "").toLowerCase();
  const role = (input.clickedRole || "").toLowerCase();
  const tag = (input.clickedTag || "").toUpperCase();
  const typ = (input.clickedType || "").toLowerCase();
  const blob = `${t} ${oc} ${h} ${n} ${role}`;

  if (role === "tab" || /\btab\b/i.test(oc) || (tag === "TD" && oc.includes("tab")))
    return "tab_navigation";
  if (h.includes("tb_otherrequests") || t.includes("all requests") || h.includes("allrequests"))
    return "tradeboard_all_requests";
  if (h.includes("tb_myrequests") || t.includes("my requests") || h.includes("tb_myrequests"))
    return "tradeboard_my_requests";
  if (t.includes("add to favorite") || t.includes("add favorite")) return "tradeboard_add_favorite";
  if (h.includes("tb_myfavorites") || t.includes("favorites")) return "tradeboard_favorites";
  if (h.includes("tb_myresponses") || t.includes("my responses")) return "tradeboard_my_responses";
  if (h.includes("tb_postrequest") || t.includes("post a request")) return "tradeboard_post_request";
  if (t.includes("pickup") || n.includes("hdnpickup") || oc.includes("pickup")) return "tradeboard_pickup";
  if (
    t.includes("propose trade") ||
    oc.includes("restrade") ||
    h.includes("treq=restrade") ||
    h.includes("restrade")
  )
    return "tradeboard_propose_trade";
  if (t.includes("delete") || oc.includes("delete")) return "tradeboard_delete";
  if (t.includes("edit") || oc.includes("edit")) return "tradeboard_edit";
  if (t.includes("filter") || n.includes("filter") || oc.includes("filter")) return "tradeboard_filter";
  if (oc.includes("createreq(1)") || ((t === "add" || /^add\b/i.test(t)) && (h.includes("ot") || oc.includes("opentime") || h.includes("opentime"))))
    return "opentime_add";
  if (oc.includes("createreq(2)") || (t.includes("drop") && (h.includes("ot") || oc.includes("opentime") || blob.includes("opentime"))))
    return "opentime_drop";
  if (oc.includes("createreq(3)")) return "trade_create";
  if (
    oc.includes("createreq(4)") ||
    h.includes("otswap") ||
    (t.includes("swap") && (h.includes("ot") || oc.includes("opentime") || blob.includes("opentime")))
  )
    return "opentime_swap";
  if ((t.includes("trade") || h.includes("tradeboard")) && (typ === "submit" || typ === "button" || tag === "BUTTON"))
    return "trade_create";
  return "unknown_click";
}

function buildActionLabel(kind: FlicaClickActionKind, clickedText: string): string {
  const c = (clickedText || "").replace(/\s+/g, " ").trim().slice(0, 80);
  return c ? `${kind}: ${c}` : kind;
}

function formatCapturedActionEventSummary(e: CapturedFlicaActionEvent): string {
  const r = redactForExport(e);
  const lines: string[] = [];
  lines.push(`ACTION: ${r.actionKind}`);
  lines.push(`Label: ${r.actionLabel}`);
  lines.push(`Clicked: ${r.clickedText || "(empty)"}`);
  lines.push(`On page/frame: ${r.frameName} | ${r.pageTitleBefore}`);
  lines.push(`Detected (before): ${r.detectedPageTypeBefore}`);
  lines.push(`Before URL (frame): ${r.frameUrlBefore}`);
  lines.push(`Top URL: ${r.topUrlBefore}`);
  lines.push(`Destination/href: ${r.destinationUrl || r.href || "(none)"}`);
  lines.push(`onclick: ${r.onclick || "(none)"}`);
  lines.push(`After URLs (500ms): ${(r.frameUrlsAfter500ms ?? []).join(" | ") || "(none)"}`);
  lines.push(`After URLs (1500ms): ${(r.frameUrlsAfter1500ms ?? []).join(" | ") || "(none)"}`);
  lines.push(`After URLs (3000ms): ${(r.frameUrlsAfter3000ms ?? []).join(" | ") || "(none)"}`);
  lines.push(`Generated forms (3s):\n${r.formsAfter3000ms || "(none)"}`);
  lines.push(`Generated buttons (3s):\n${r.buttonsAfter3000ms || "(none)"}`);
  lines.push(`Generated links (3s):\n${r.linksAfter3000ms || "(none)"}`);
  lines.push(`Preview (3s):\n${r.previewsAfter3000ms || "(none)"}`);
  lines.push(`--- before snapshot ---`);
  lines.push(`formsBefore:\n${r.formsBefore || "(none)"}`);
  lines.push(`buttonsBefore:\n${r.buttonsBefore || "(none)"}`);
  lines.push(`linksBefore:\n${r.linksBefore || "(none)"}`);
  return lines.join("\n");
}

function detectPageType(url: string, body: string): DetectedPageType {
  const u = url.toLowerCase();
  const b = body.toLowerCase();
  if (u.includes("mainmenu.cgi") || (b.includes("sign out") && b.includes("recent updates")))
    return "main_menu";
  if (
    u.includes("popup") ||
    b.includes("window.close") ||
    (b.includes("schedule") && (b.includes("edit") || b.includes("delete")) && b.length < 2500)
  )
    return "schedule_popup";
  if (
    b.includes("pickup trip") ||
    b.includes("pickup pairing") ||
    b.includes("propose trade") ||
    u.includes("tb_pickup") ||
    u.includes("pickup") ||
    (b.includes("select") && b.includes("pairing") && b.includes("tradeboard"))
  )
    return "tradeboard_pairing_selection";
  if (u.includes("tb_postrequest") || b.includes("post a request"))
    return "tradeboard_post_request";
  if (u.includes("tb_myfavorites")) return "tradeboard_favorites";
  if (u.includes("tb_myresponses")) return "tradeboard_my_responses";
  if (u.includes("tb_otherrequests") || u.includes("allrequests") || (b.includes("all requests") && b.includes("tradeboard")))
    return "tradeboard_all_requests";
  if (u.includes("tb_myrequests") || (u.includes("tb_") && b.includes("my requests")))
    return "tradeboard_my_requests";
  if (u.includes("tb_frame") && (b.includes("my requests") || b.includes("tradeboard")))
    return "tradeboard_my_requests";
  if (u.includes("tb_") && b.includes("my schedule")) return "tradeboard_my_schedule";
  if (u.includes("otopentimepot") || b.includes("opentime pot")) return "opentime_pot";
  if (
    u.includes("otrequest") ||
    (b.includes("opentime") && (b.includes("my requests") || b.includes("submit") || b.includes("view requests")))
  )
    return "opentime_requests";
  if (u.includes("otdrop") || (b.includes("drop") && b.includes("opentime"))) return "opentime_drop";
  if (u.includes("otswap") || (b.includes("swap") && b.includes("opentime"))) return "opentime_swap";
  if (u.includes("otadd") || (b.includes("add") && b.includes("opentime") && !b.includes("pot")))
    return "opentime_add";
  if (b.includes("view or print pairings") || b.includes("view/print pairings"))
    return "opentime_view_print_pairings";
  if (b.includes("reserve grid") || b.includes("reservegrid")) return "opentime_reserve_grid";
  if (
    b.includes("confirmation") ||
    b.includes("successfully submitted") ||
    b.includes("request submitted") ||
    b.includes("has been submitted")
  )
    return "confirmation";
  if (u.includes("otframe") || u.includes("opentime")) return "opentime_pot";
  return "unknown";
}

function detectPageTypeFromSnapshot(topUrl: string, frames: CapturedFrame[]): DetectedPageType {
  const blob = [topUrl, ...frames.map((f) => `${f.locationHref}\n${f.bodyPreview}`)].join("\n");
  return detectPageType(topUrl, blob);
}

function snapshotDedupeKey(
  topUrl: string,
  pageType: DetectedPageType,
  frames: CapturedFrame[],
): string {
  const sig = frames
    .map((f) => `${f.locationHref}#${f.htmlLength}`)
    .sort()
    .join("|");
  return `${topUrl}|${pageType}|${sig}`;
}

function redactSensitiveString(s: string): string {
  let out = s;
  out = out.replace(/g-recaptcha-response=[^&\s"']+/gi, "g-recaptcha-response=[REDACTED]");
  out = out.replace(/["']?g-recaptcha-response["']?\s*:\s*["'][^"']+["']/gi, '"g-recaptcha-response":"[REDACTED]"');
  out = out.replace(/\bFLiCASession=[^;&\s]+/gi, "FLiCASession=[REDACTED]");
  out = out.replace(/\bFLiCAService=[^;&\s]+/gi, "FLiCAService=[REDACTED]");
  out = out.replace(/\bAWSALB[^=]*=[^;&\s]+/gi, "AWSALB=[REDACTED]");
  out = out.replace(/\bAWSALBCORS[^=]*=[^;&\s]+/gi, "AWSALBCORS=[REDACTED]");
  out = out.replace(/([?&])(token|session|sessionid|sess|csrf|authenticity_token|__VIEWSTATE|g-recaptcha-response|recaptcha|nonce)=([^&\s]+)/gi, "$1$2=[REDACTED]");
  out = out.replace(/\bpassword\s*=\s*[^\s&]+/gi, "password=[REDACTED]");
  return out;
}

function redactForExport<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (v == null) return v;
    if (typeof v === "string") return redactSensitiveString(v);
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      for (const k of Object.keys(o)) {
        const keyLower = k.toLowerCase();
        if (
          keyLower.includes("password") ||
          keyLower === "flicasession" ||
          keyLower === "flicaservice" ||
          keyLower.includes("cookie") ||
          keyLower === "__viewstate" ||
          keyLower.includes("viewstate") ||
          keyLower.includes("csrf") ||
          keyLower.includes("recaptcha")
        ) {
          next[k] = "[REDACTED]";
          continue;
        }
        if (keyLower === "value" && typeof o[k] === "string") {
          const nm = String(o.name ?? "").toLowerCase();
          if (
            nm.includes("viewstate") ||
            nm.includes("csrf") ||
            nm.includes("recaptcha") ||
            nm.includes("token")
          ) {
            next[k] = "[REDACTED]";
            continue;
          }
          const parentTag = String(o.tag ?? "").toLowerCase();
          const parentType = String(o.type ?? "").toLowerCase();
          if (parentType === "password" || parentTag === "password") {
            next[k] = "[REDACTED]";
            continue;
          }
        }
        next[k] = walk(o[k]);
      }
      return next;
    }
    return v;
  };
  return walk(value) as T;
}

const READY_URL_MARKERS = [
  "mainmenu.cgi",
  "leftmenu.cgi",
  "gohm=1",
];

const READY_BODY_MARKERS = [
  "sign out",
  "recent updates",
  "crewmember",
  "bidding",
  "tradeboard",
  "opentime",
  "schedule",
];

const INJECT_CHECK_STATE = `
(function() {
  try {
    var body = document.body ? document.body.innerText : '';
    var title = document.title || '';
    var html = document.documentElement ? document.documentElement.innerHTML : '';
    var lower = (body + ' ' + html).toLowerCase();
    var links = [];
    var anchors = document.querySelectorAll('a[href]');
    for (var i = 0; i < Math.min(anchors.length, 30); i++) {
      links.push(anchors[i].textContent.trim().substring(0,60) + ' -> ' + anchors[i].getAttribute('href'));
    }
    var forms = [];
    var formEls = document.querySelectorAll('form');
    for (var f = 0; f < formEls.length; f++) {
      forms.push((formEls[f].getAttribute('action') || '') + ' [' + (formEls[f].getAttribute('method') || 'get') + ']');
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'flica_actions_page_state',
      title: title,
      bodyLength: body.length,
      htmlLength: html.length,
      url: window.location.href,
      hasRecaptcha: lower.indexOf('g-recaptcha') >= 0 && lower.indexOf('mainmenu') < 0,
      hasError: lower.indexOf('application error') >= 0 || lower.indexOf('initializesessiondata') >= 0 || lower.indexOf('page request failed') >= 0,
      hasLogin: lower.indexOf('userid') >= 0 && lower.indexOf('password') >= 0 && lower.indexOf('mainmenu') < 0 && lower.indexOf('sign out') < 0,
      isReady: lower.indexOf('sign out') >= 0 || lower.indexOf('recent updates') >= 0 || (lower.indexOf('crewmember') >= 0 && lower.indexOf('bidding') >= 0),
      snippet: body.substring(0, 500),
      links: links,
      forms: forms,
    }));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'flica_actions_page_state',error:e.message}));
  }
})(); true;
`;

/** Deep frame capture + click/submit listeners (same-origin frames only). */
const INJECT_LINK_CAPTURE_BRIDGE = `
(function() {
  var FLAG = '__flicaActionsLinkCaptureV3';
  var topWin = window.top || window;

  var MAX_LINKS = 250;
  var MAX_FORMS = 40;
  var MAX_FORM_EL = 80;
  var MAX_BTNS = 120;
  var MAX_ONCLICK = 80;
  var ONCLICK_LEN = 180;

  function topHref() {
    try { return window.top.location.href; } catch (e) { return window.location.href; }
  }
  function topTitle() {
    try { return window.top.document.title || ''; } catch (e) { return document.title || ''; }
  }

  function trimStr(s, n) {
    s = (s || '').replace(/\\s+/g, ' ').trim();
    return s.length > n ? s.substring(0, n) : s;
  }

  function collectFormFields(form) {
    var inputs = [];
    var els = form.elements;
    for (var e = 0; e < Math.min(els.length, MAX_FORM_EL); e++) {
      var el = els[e];
      var tag = (el.tagName || '').toUpperCase();
      var typ = (el.type || '').toLowerCase();
      var nm = el.name || '';
      var val = (el.value != null ? String(el.value) : '');
      if (typ === 'password') val = '[REDACTED]';
      val = val.substring(0, 120);
      inputs.push({ tag: tag, type: typ, name: nm, value: val });
    }
    return inputs;
  }

  function extractDoc(win, frameMeta) {
    var doc = win.document;
    var body = doc.body ? doc.body.innerText : '';
    var html = doc.documentElement ? doc.documentElement.innerHTML : '';
    var links = [];
    var aels = doc.querySelectorAll('a[href]');
    for (var i = 0; i < Math.min(aels.length, MAX_LINKS); i++) {
      links.push({
        text: trimStr(aels[i].innerText, 100),
        href: aels[i].href || aels[i].getAttribute('href') || ''
      });
    }
    var forms = [];
    var formEls = doc.querySelectorAll('form');
    for (var f = 0; f < Math.min(formEls.length, MAX_FORMS); f++) {
      forms.push({
        action: formEls[f].action || '',
        method: (formEls[f].method || 'get').toUpperCase(),
        inputs: collectFormFields(formEls[f])
      });
    }
    var buttons = [];
    var btnSel = doc.querySelectorAll('button, input[type="button"], input[type="submit"], input[type="reset"], input[type="image"]');
    for (var b = 0; b < Math.min(btnSel.length, MAX_BTNS); b++) {
      var el = btnSel[b];
      var tag = (el.tagName || '').toUpperCase();
      var typ = (el.type || '').toLowerCase();
      var tx = trimStr(el.innerText || el.value || el.alt || '', 80);
      var val = (el.value != null ? String(el.value) : '');
      if (typ === 'password') val = '[REDACTED]';
      buttons.push({
        tag: tag,
        type: typ,
        name: el.name || '',
        value: val.substring(0, 120),
        text: tx
      });
    }
    var clickables = [];
    var ocs = doc.querySelectorAll('[onclick]');
    for (var c = 0; c < Math.min(ocs.length, MAX_ONCLICK); c++) {
      var el = ocs[c];
      var oc = el.getAttribute('onclick') || '';
      clickables.push({
        tag: (el.tagName || '').toUpperCase(),
        text: trimStr(el.innerText, 80),
        href: el.href || '',
        onclickSnippet: trimStr(oc, ONCLICK_LEN)
      });
    }
    var tableSnippets = [];
    var tbls = doc.querySelectorAll('table');
    for (var ti = 0; ti < Math.min(tbls.length, 22); ti++) {
      var tsn = trimStr(tbls[ti].innerText || '', 520);
      if (tsn) tableSnippets.push(tsn);
    }
    var fieldControls = [];
    var fels = doc.querySelectorAll('input, select, textarea');
    for (var fi = 0; fi < Math.min(fels.length, 120); fi++) {
      var fe = fels[fi];
      var tgn = (fe.tagName || '').toUpperCase();
      var tpe = (fe.type || '').toLowerCase();
      var fnm = fe.name || '';
      var fid = fe.id || '';
      if (!fnm && !fid) continue;
      var fv = '';
      try {
        fv = fe.value != null ? String(fe.value).substring(0, 120) : '';
      } catch (eF0) {}
      if (tpe === 'password') fv = '[REDACTED]';
      fieldControls.push({ tag: tgn, type: tpe, name: fnm, id: fid, value: fv });
    }
    var roleActionTexts = [];
    var rEls = doc.querySelectorAll('[role="button"], [role="tab"], [role="link"]');
    for (var ri = 0; ri < Math.min(rEls.length, 45); ri++) {
      var rtx = trimStr(rEls[ri].innerText || '', 120);
      if (rtx) roleActionTexts.push(rtx);
    }
    var href = '';
    try { href = win.location.href; } catch (e2) { href = ''; }
    return {
      frameName: frameMeta.name || '',
      frameIndex: frameMeta.index,
      frameSrc: frameMeta.src || '',
      locationHref: href,
      title: doc.title || '',
      htmlLength: html.length,
      bodyPreview: body.substring(0, 1000),
      links: links,
      forms: forms,
      buttons: buttons,
      clickables: clickables,
      tableSnippets: tableSnippets,
      fieldControls: fieldControls,
      roleActionTexts: roleActionTexts
    };
  }

  function walkFrames(win, depth, acc, meta) {
    if (depth > 10) return;
    try {
      acc.push(extractDoc(win, meta));
    } catch (e) {
      return;
    }
    var els = [];
    try {
      els = win.document.querySelectorAll('iframe,frame');
    } catch (e3) {
      return;
    }
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var nm = el.name || el.id || '';
      var src = el.getAttribute('src') || '';
      try {
        var cw = el.contentWindow;
        if (cw && cw.document) {
          walkFrames(cw, depth + 1, acc, { name: nm, index: i, src: src });
        }
      } catch (e4) {}
    }
  }

  function runDeepCapture(reason, lastInteraction) {
    var frames = [];
    try {
      walkFrames(topWin, 0, frames, { name: '(top)', index: -1, src: '' });
    } catch (e) {
      frames = [];
    }
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'flica_actions_link_capture',
        captureReason: reason || 'scan',
        topUrl: topHref(),
        topTitle: topTitle(),
        frames: frames,
        lastInteraction: lastInteraction || null
      }));
    } catch (e5) {}
    try { attachListenersToTree(topWin); } catch (e6) {}
  }

  function scheduleDeepCapture(reason, lastInteraction) {
    runDeepCapture(reason || 'immediate', lastInteraction);
    setTimeout(function() { runDeepCapture((reason || 'immediate') + '_500ms', lastInteraction); }, 500);
    setTimeout(function() { runDeepCapture((reason || 'immediate') + '_1500ms', lastInteraction); }, 1500);
  }

  var __flicaClickSeq = 0;
  function makeClickEventId() {
    return 'e' + Date.now() + '_' + (++__flicaClickSeq) + '_' + Math.floor(Math.random() * 1e6);
  }
  function truncateFramesLite(frames) {
    var out = [];
    for (var i = 0; i < Math.min(frames.length, 12); i++) {
      var f = frames[i];
      out.push({
        frameName: f.frameName,
        frameIndex: f.frameIndex,
        frameSrc: f.frameSrc,
        locationHref: f.locationHref,
        title: f.title,
        htmlLength: f.htmlLength,
        bodyPreview: (f.bodyPreview || '').substring(0, 700),
        links: (f.links || []).slice(0, 28),
        forms: (f.forms || []).slice(0, 8).map(function(fm) {
          return {
            action: fm.action,
            method: fm.method,
            inputs: (fm.inputs || []).slice(0, 40)
          };
        }),
        buttons: (f.buttons || []).slice(0, 35),
        clickables: (f.clickables || []).slice(0, 20),
        tableSnippets: (f.tableSnippets || []).slice(0, 16).map(function(s) {
          return (s || '').substring(0, 520);
        }),
        fieldControls: (f.fieldControls || []).slice(0, 70),
        roleActionTexts: (f.roleActionTexts || []).slice(0, 40).map(function(s) {
          return (s || '').substring(0, 140);
        })
      });
    }
    return out;
  }
  function collectAllFrameUrls(win, acc, depth) {
    if (depth > 10) return;
    try {
      acc.push(win.location.href);
    } catch (e0) {}
    var els = [];
    try {
      els = win.document.querySelectorAll('iframe,frame');
    } catch (e1) {
      return;
    }
    for (var j = 0; j < els.length; j++) {
      try {
        var cw = els[j].contentWindow;
        if (cw) collectAllFrameUrls(cw, acc, depth + 1);
      } catch (e2) {}
    }
  }
  function resolveActionable(el) {
    var cur = el;
    for (var d = 0; d < 10 && cur; d++) {
      var tg = (cur.tagName || '').toUpperCase();
      var typ = (cur.type || '').toLowerCase();
      if (tg === 'A' && cur.getAttribute('href')) return cur;
      if (tg === 'BUTTON') return cur;
      if (tg === 'AREA' && cur.getAttribute('href')) return cur;
      if (tg === 'INPUT' && (typ === 'button' || typ === 'submit' || typ === 'image' || typ === 'reset'))
        return cur;
      if ((tg === 'TD' || tg === 'LABEL' || tg === 'SPAN' || tg === 'DIV') && cur.getAttribute && cur.getAttribute('onclick'))
        return cur;
      try {
        if (cur.getAttribute && cur.getAttribute('onclick')) return cur;
      } catch (e3) {}
      try {
        if (cur.getAttribute && String(cur.getAttribute('role') || '').toLowerCase() === 'tab') return cur;
      } catch (e4) {}
      cur = cur.parentElement;
    }
    if (el && el.tagName && el.tagName.toUpperCase() === 'IMG' && el.closest) {
      try {
        var hit = el.closest('a[href],button,[onclick]');
        if (hit) return hit;
      } catch (e5) {}
    }
    return null;
  }
  function emitClickActionStart(ev, w) {
    var act = resolveActionable(ev.target);
    if (!act) return;
    var eventId = makeClickEventId();
    var beforeFull = [];
    try {
      walkFrames(topWin, 0, beforeFull, { name: '(top)', index: -1, src: '' });
    } catch (e6) {
      beforeFull = [];
    }
    var beforeFrames = truncateFramesLite(beforeFull);
    var tag = (act.tagName || '').toUpperCase();
    var typ = (act.type || '').toLowerCase();
    var nm = act.name || '';
    var val = '';
    try {
      val = act.value != null ? String(act.value).substring(0, 160) : '';
      if (typ === 'password') val = '[REDACTED]';
    } catch (e7) {}
    var txt = trimStr(act.innerText || act.textContent || act.value || act.alt || '', 160);
    var href = '';
    try {
      if (act.closest) {
        var aa = act.closest('a[href]');
        if (aa) href = aa.href || '';
      }
    } catch (e8) {}
    if (!href && act.href) href = act.href;
    var oc = '';
    try {
      if (act.getAttribute) oc = trimStr(act.getAttribute('onclick') || '', ONCLICK_LEN);
    } catch (e9) {}
    var role = '';
    try {
      if (act.getAttribute) role = String(act.getAttribute('role') || '');
    } catch (eA) {}
    var fh = '';
    try {
      fh = w.location.href;
    } catch (eB) {
      fh = '';
    }
    var fn = '';
    try {
      if (w !== topWin && w.frameElement) {
        fn = w.frameElement.name || w.frameElement.id || '';
      } else fn = '(top)';
    } catch (eC) {
      fn = '(top)';
    }
    var dest = href || '';
    try {
      if (act.tagName && act.tagName.toUpperCase() === 'A') dest = act.href || dest;
    } catch (eD) {}
    var nearestForm = null;
    try {
      var nf = act.closest ? act.closest('form') : null;
      if (nf) {
        nearestForm = {
          action: nf.action || '',
          method: (nf.method || 'get').toUpperCase(),
          target: nf.target || '',
          enctype: nf.enctype || '',
          name: nf.name || '',
          id: nf.id || ''
        };
      }
    } catch (eNF) {}
    try {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: 'flica_actions_click_action',
          phase: 'start',
          eventId: eventId,
          clickedTag: tag,
          clickedType: typ,
          clickedName: nm,
          clickedValue: val,
          clickedRole: role,
          clickedText: txt,
          onclick: oc,
          href: href,
          destinationUrl: dest,
          frameName: fn,
          frameUrlBefore: fh,
          topUrlBefore: topHref(),
          pageTitleBefore: topTitle(),
          beforeFrames: beforeFrames,
          nearestForm: nearestForm
        })
      );
    } catch (eE) {}
    function postPhase(phase, ms) {
      setTimeout(function() {
        var urls = [];
        try {
          collectAllFrameUrls(topWin, urls, 0);
        } catch (eF) {
          urls = [];
        }
        var payload = {
          type: 'flica_actions_click_action',
          phase: phase,
          eventId: eventId,
          frameUrls: urls
        };
        if (phase === 'after3000') {
          var af = [];
          try {
            walkFrames(topWin, 0, af, { name: '(top)', index: -1, src: '' });
          } catch (eG) {
            af = [];
          }
          payload.afterFrames = truncateFramesLite(af);
        }
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        } catch (eH) {}
      }, ms);
    }
    postPhase('after500', 500);
    postPhase('after1500', 1500);
    postPhase('after3000', 3000);
  }

  var DOC_FLAG = '__flicaCaptureDocListeners';

  function attachListenersToTree(win) {
    var stack = [win];
    while (stack.length) {
      var w = stack.pop();
      var doc = null;
      try { doc = w.document; } catch (e) { continue; }
      if (!doc || doc[DOC_FLAG]) continue;
      doc[DOC_FLAG] = true;
      doc.addEventListener('click', function(ev) {
        try {
          emitClickActionStart(ev, w);
        } catch (eZ) {}
        var t = ev.target;
        var tag = (t && t.tagName) ? t.tagName.toUpperCase() : '';
        var txt = trimStr(t && (t.innerText || t.textContent || t.value || ''), 120);
        var href = '';
        try {
          if (t && t.closest) {
            var a = t.closest('a[href]');
            if (a) href = a.href || '';
          }
        } catch (eA) {}
        if (!href && t && t.href) href = t.href;
        var fa = '';
        var inm = '';
        var iv = '';
        try {
          if (t && t.form) {
            fa = t.form.action || '';
            if (t.name) inm = t.name;
            if (t.value != null) iv = String(t.value).substring(0, 80);
            if ((t.type || '').toLowerCase() === 'password') iv = '[REDACTED]';
          }
        } catch (e0) {}
        var oc = '';
        try { if (t && t.getAttribute) oc = trimStr(t.getAttribute('onclick') || '', ONCLICK_LEN); } catch (e1) {}
        var fh = '';
        try { fh = w.location.href; } catch (e2) { fh = ''; }
        var li = {
          kind: 'click',
          topUrlAtEvent: topHref(),
          frameLocationHref: fh,
          tag: tag,
          text: txt,
          href: href,
          formAction: fa,
          inputName: inm,
          inputValue: iv,
          onclickSnippet: oc
        };
        scheduleDeepCapture('post_click', li);
      }, true);

      doc.addEventListener('change', function(ev) {
        try {
          var t = ev.target;
          if (!t || !t.tagName) return;
          var tag = (t.tagName || '').toUpperCase();
          if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'TEXTAREA') return;
          var eventId = makeClickEventId();
          var beforeFull = [];
          try {
            walkFrames(topWin, 0, beforeFull, { name: '(top)', index: -1, src: '' });
          } catch (eCh0) { beforeFull = []; }
          var typ = (t.type || '').toLowerCase();
          var val = '';
          var selIdx = -1;
          var selLabel = '';
          try {
            if (tag === 'SELECT') {
              selIdx = t.selectedIndex;
              selLabel = t.options && t.options[selIdx] ? trimStr(t.options[selIdx].text, 120) : '';
              val = t.value != null ? String(t.value) : '';
            } else {
              val = t.value != null ? String(t.value).substring(0, 160) : '';
              if (typ === 'password') val = '[REDACTED]';
            }
          } catch (eCh1) {}
          var nearestForm = null;
          try {
            var nf = t.closest ? t.closest('form') : (t.form || null);
            if (nf) {
              nearestForm = {
                action: nf.action || '',
                method: (nf.method || 'get').toUpperCase(),
                target: nf.target || '',
                enctype: nf.enctype || '',
                name: nf.name || '',
                id: nf.id || ''
              };
            }
          } catch (eCh2) {}
          var fh = '';
          try { fh = w.location.href; } catch (eCh3) { fh = ''; }
          var fn = '';
          try {
            if (w !== topWin && w.frameElement) fn = w.frameElement.name || w.frameElement.id || '';
            else fn = '(top)';
          } catch (eCh4) { fn = '(top)'; }
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'flica_actions_change',
            eventId: eventId,
            changedTag: tag,
            changedType: typ,
            changedName: t.name || '',
            changedId: t.id || '',
            changedValue: val,
            selectedIndex: selIdx,
            selectedLabel: selLabel,
            frameName: fn,
            frameUrlBefore: fh,
            topUrlBefore: topHref(),
            pageTitleBefore: topTitle(),
            beforeFrames: truncateFramesLite(beforeFull),
            nearestForm: nearestForm
          }));
          setTimeout(function() {
            scheduleDeepCapture('post_change', {
              kind: 'change',
              topUrlAtEvent: topHref(),
              frameLocationHref: fh,
              tag: tag,
              text: selLabel || val,
              inputName: t.name || '',
              inputValue: val
            });
          }, 400);
        } catch (eChZ) {}
      }, true);

      doc.addEventListener('submit', function(ev) {
        var targ = ev.target;
        var form = targ;
        try {
          if (!form || !form.tagName || String(form.tagName).toUpperCase() !== 'FORM') {
            if (targ && targ.form) form = targ.form;
            else if (targ && targ.closest) form = targ.closest('form');
          }
        } catch (eF) { form = null; }
        if (!form || String(form.tagName).toUpperCase() !== 'FORM') return;
        var fa = '';
        var fm = 'GET';
        var fields = [];
        try {
          fa = form.action || '';
          fm = (form.method || 'get').toUpperCase();
          fields = collectFormFields(form);
        } catch (e4) {}
        var fh = '';
        try { fh = w.location.href; } catch (e5) { fh = ''; }
        var nearestForm = {
          action: fa,
          method: fm,
          target: form.target || '',
          enctype: form.enctype || '',
          name: form.name || '',
          id: form.id || ''
        };
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'flica_actions_submit',
            eventId: makeClickEventId(),
            formAction: fa,
            formMethod: fm,
            frameUrlBefore: fh,
            topUrlBefore: topHref(),
            pageTitleBefore: topTitle(),
            nearestForm: nearestForm,
            fields: fields
          }));
        } catch (eSubMsg) {}
        var li = {
          kind: 'submit',
          topUrlAtEvent: topHref(),
          frameLocationHref: fh,
          formAction: fa,
          formMethod: fm,
          fields: fields
        };
        scheduleDeepCapture('post_submit', li);
      }, true);

      var ifr;
      try {
        ifr = doc.querySelectorAll('iframe,frame');
      } catch (e7) {
        ifr = [];
      }
      for (var i = 0; i < ifr.length; i++) {
        try {
          var cw = ifr[i].contentWindow;
          if (cw) stack.push(cw);
        } catch (e8) {}
      }
    }
  }

  attachListenersToTree(topWin);
  scheduleDeepCapture('bootstrap', null);
  window[FLAG] = true;
})(); true;
`;

const INJECT_RUN_DEEP_CAPTURE_ONLY = `
(function() {
  try {
    if (!window.__flicaActionsLinkCaptureV3) return;
  } catch (e) { return; }
  (function() {
    var MAX_LINKS = 250;
    var MAX_FORMS = 40;
    var MAX_FORM_EL = 80;
    var MAX_BTNS = 120;
    var MAX_ONCLICK = 80;
    var ONCLICK_LEN = 180;
    function topHref() {
      try { return window.top.location.href; } catch (e) { return window.location.href; }
    }
    function topTitle() {
      try { return window.top.document.title || ''; } catch (e) { return document.title || ''; }
    }
    function trimStr(s, n) {
      s = (s || '').replace(/\\s+/g, ' ').trim();
      return s.length > n ? s.substring(0, n) : s;
    }
    function collectFormFields(form) {
      var inputs = [];
      var els = form.elements;
      for (var e = 0; e < Math.min(els.length, MAX_FORM_EL); e++) {
        var el = els[e];
        var tag = (el.tagName || '').toUpperCase();
        var typ = (el.type || '').toLowerCase();
        var nm = el.name || '';
        var val = (el.value != null ? String(el.value) : '');
        if (typ === 'password') val = '[REDACTED]';
        val = val.substring(0, 120);
        inputs.push({ tag: tag, type: typ, name: nm, value: val });
      }
      return inputs;
    }
    function extractDoc(win, frameMeta) {
      var doc = win.document;
      var body = doc.body ? doc.body.innerText : '';
      var html = doc.documentElement ? doc.documentElement.innerHTML : '';
      var links = [];
      var aels = doc.querySelectorAll('a[href]');
      for (var i = 0; i < Math.min(aels.length, MAX_LINKS); i++) {
        links.push({
          text: trimStr(aels[i].innerText, 100),
          href: aels[i].href || aels[i].getAttribute('href') || ''
        });
      }
      var forms = [];
      var formEls = doc.querySelectorAll('form');
      for (var f = 0; f < Math.min(formEls.length, MAX_FORMS); f++) {
        forms.push({
          action: formEls[f].action || '',
          method: (formEls[f].method || 'get').toUpperCase(),
          inputs: collectFormFields(formEls[f])
        });
      }
      var buttons = [];
      var btnSel = doc.querySelectorAll('button, input[type="button"], input[type="submit"], input[type="reset"], input[type="image"]');
      for (var b = 0; b < Math.min(btnSel.length, MAX_BTNS); b++) {
        var el = btnSel[b];
        var tag = (el.tagName || '').toUpperCase();
        var typ = (el.type || '').toLowerCase();
        var tx = trimStr(el.innerText || el.value || el.alt || '', 80);
        var val = (el.value != null ? String(el.value) : '');
        if (typ === 'password') val = '[REDACTED]';
        buttons.push({
          tag: tag,
          type: typ,
          name: el.name || '',
          value: val.substring(0, 120),
          text: tx
        });
      }
      var clickables = [];
      var ocs = doc.querySelectorAll('[onclick]');
      for (var c = 0; c < Math.min(ocs.length, MAX_ONCLICK); c++) {
        var el = ocs[c];
        var oc = el.getAttribute('onclick') || '';
        clickables.push({
          tag: (el.tagName || '').toUpperCase(),
          text: trimStr(el.innerText, 80),
          href: el.href || '',
          onclickSnippet: trimStr(oc, ONCLICK_LEN)
        });
      }
      var tableSnippets = [];
      var tbls = doc.querySelectorAll('table');
      for (var ti = 0; ti < Math.min(tbls.length, 22); ti++) {
        var tsn = trimStr(tbls[ti].innerText || '', 520);
        if (tsn) tableSnippets.push(tsn);
      }
      var fieldControls = [];
      var fels = doc.querySelectorAll('input, select, textarea');
      for (var fi = 0; fi < Math.min(fels.length, 120); fi++) {
        var fe = fels[fi];
        var tgn = (fe.tagName || '').toUpperCase();
        var tpe = (fe.type || '').toLowerCase();
        var fnm = fe.name || '';
        var fid = fe.id || '';
        if (!fnm && !fid) continue;
        var fv = '';
        try {
          fv = fe.value != null ? String(fe.value).substring(0, 120) : '';
        } catch (eF0) {}
        if (tpe === 'password') fv = '[REDACTED]';
        fieldControls.push({ tag: tgn, type: tpe, name: fnm, id: fid, value: fv });
      }
      var roleActionTexts = [];
      var rEls = doc.querySelectorAll('[role="button"], [role="tab"], [role="link"]');
      for (var ri = 0; ri < Math.min(rEls.length, 45); ri++) {
        var rtx = trimStr(rEls[ri].innerText || '', 120);
        if (rtx) roleActionTexts.push(rtx);
      }
      var href = '';
      try { href = win.location.href; } catch (e2) { href = ''; }
      return {
        frameName: frameMeta.name || '',
        frameIndex: frameMeta.index,
        frameSrc: frameMeta.src || '',
        locationHref: href,
        title: doc.title || '',
        htmlLength: html.length,
        bodyPreview: body.substring(0, 1000),
        links: links,
        forms: forms,
        buttons: buttons,
        clickables: clickables,
        tableSnippets: tableSnippets,
        fieldControls: fieldControls,
        roleActionTexts: roleActionTexts
      };
    }
    function walkFrames(win, depth, acc, meta) {
      if (depth > 10) return;
      try {
        acc.push(extractDoc(win, meta));
      } catch (e) {
        return;
      }
      var els = [];
      try {
        els = win.document.querySelectorAll('iframe,frame');
      } catch (e3) {
        return;
      }
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var nm = el.name || el.id || '';
        var src = el.getAttribute('src') || '';
        try {
          var cw = el.contentWindow;
          if (cw && cw.document) {
            walkFrames(cw, depth + 1, acc, { name: nm, index: i, src: src });
          }
        } catch (e4) {}
      }
    }
    var frames = [];
    walkFrames(window.top || window, 0, frames, { name: '(top)', index: -1, src: '' });
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'flica_actions_link_capture',
      captureReason: 'injected_rescan',
      topUrl: topHref(),
      topTitle: topTitle(),
      frames: frames,
      lastInteraction: null
    }));
  })();
})(); true;
`;

export type FlicaActionsWebViewProps = {
  onSessionReady?: () => void;
  /** First load URL (must be jetblue.flica.net). Default: main origin. */
  initialUri?: string;
  /** Hide dev capture controls; auto-open WebView (e.g. crew-schedule stack routes). */
  variant?: "default" | "embedded";
  /** Embedded only: hide status row / spinner so the WebView fills the host (e.g. mini captcha sheet). */
  hideEmbeddedChrome?: boolean;
};

function formatSnapshotSummary(p: CapturedPageSnapshot): string {
  const lines: string[] = [];
  const red = redactForExport(p);
  lines.push(`[${red.detectedPageType}] ${red.topTitle}`);
  lines.push(`Top URL: ${red.topUrl}`);
  lines.push(`Capture: ${red.captureReason} | visits: ${red.visitCount}`);
  if (red.lastInteraction) {
    if (red.lastInteraction.kind === "click") {
      lines.push(
        `Clicked: <${red.lastInteraction.tag}> ${red.lastInteraction.text} | href=${red.lastInteraction.href} | formAction=${red.lastInteraction.formAction} | input=${red.lastInteraction.inputName}=${red.lastInteraction.inputValue}`,
      );
      if (red.lastInteraction.onclickSnippet)
        lines.push(`onclick: ${red.lastInteraction.onclickSnippet}`);
    } else {
      lines.push(
        `Submit: ${red.lastInteraction.formMethod} ${red.lastInteraction.formAction} | fields: ${red.lastInteraction.fields.length}`,
      );
    }
  }
  const inv = red.availableActions ?? [];
  lines.push(`Available actions (page inventory): ${inv.length} items`);
  const invLimit = 220;
  for (let i = 0; i < Math.min(inv.length, invLimit); i++) {
    const a = inv[i];
    lines.push(`  [${a.kind}] ${a.frameLabel} | ${a.text} — ${a.detail}`);
  }
  if (inv.length > invLimit) {
    lines.push(`  … (${inv.length - invLimit} more lines omitted from summary)`);
  }
  for (const f of red.frames) {
    lines.push("---");
    lines.push(`Frame: ${f.frameName || "(unnamed)"} [${f.frameIndex}]`);
    lines.push(`Frame src: ${f.frameSrc}`);
    lines.push(`Frame URL: ${f.locationHref}`);
    lines.push(`Title: ${f.title}`);
    const linkSample = f.links
      .slice(0, 12)
      .map((l) => `${trimExport(l.text, 40)} -> ${l.href}`)
      .join("; ");
    lines.push(
      `Links (${f.links.length}): ${linkSample || "(none)"}`,
    );
    const formSample = f.forms
      .slice(0, 4)
      .map((fm) => `${fm.method} ${fm.action} (${fm.inputs.length} fields)`)
      .join(" | ");
    lines.push(`Forms (${f.forms.length}): ${formSample || "(none)"}`);
    const btnSample = f.buttons
      .slice(0, 10)
      .map((b) => `<${b.tag} ${b.type}> ${b.text || b.name || b.value}`)
      .join("; ");
    lines.push(`Buttons (${f.buttons.length}): ${btnSample || "(none)"}`);
    lines.push(`Preview: ${trimExport(f.bodyPreview, 200)}`);
    const ts = f.tableSnippets?.length ?? 0;
    const fc = f.fieldControls?.length ?? 0;
    if (ts > 0 || fc > 0) {
      lines.push(`Extra scan: tables=${ts} named fields=${fc}`);
    }
  }
  return lines.join("\n");
}

function trimExport(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function sanitizeFlicaInitialUri(raw: string | undefined): string {
  const fallback = FLICA_ORIGIN;
  if (!raw || !String(raw).trim()) return fallback;
  try {
    const u = new URL(String(raw).trim());
    if (u.hostname !== "jetblue.flica.net") return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

export default function FlicaActionsWebView({
  onSessionReady,
  initialUri,
  variant = "default",
  hideEmbeddedChrome = false,
}: FlicaActionsWebViewProps) {
  const loadUri = sanitizeFlicaInitialUri(initialUri);
  const embedded = variant === "embedded";
  const compactEmbedded = embedded && hideEmbeddedChrome;
  const webViewRef = useRef<WebView>(null);
  const [state, setState] = useState<SessionState>("idle");
  const [statusText, setStatusText] = useState("Tap to authenticate FLICA session");
  const [showWebView, setShowWebView] = useState(embedded);
  const [currentUrl, setCurrentUrl] = useState("");
  const cookiesCapturedRef = useRef(false);

  const [recorderActive, setRecorderActive] = useState(false);
  const [capturedPages, setCapturedPages] = useState<CapturedPageSnapshot[]>([]);
  const [lastCapture, setLastCapture] = useState<{ title: string; url: string } | null>(null);
  const [capturedActionEvents, setCapturedActionEvents] = useState<FlicaActionRecorderEvent[]>([]);
  const [lastActionLabel, setLastActionLabel] = useState<string | null>(null);
  const [navigationLog, setNavigationLog] = useState<FlicaNavigationLogEntry[]>([]);
  const [catalogPairingLinks, setCatalogPairingLinks] = useState<CapturedFlicaPairingLink[]>([]);
  const [replayStatus, setReplayStatus] = useState<string | null>(null);
  const [replayInspect, setReplayInspect] = useState<FlicaReplayInspectSnapshot | null>(null);
  const [capturedPopupUrl, setCapturedPopupUrl] = useState<string | null>(null);
  const [parsedReplayPairing, setParsedReplayPairing] =
    useState<FlicaParsedReplayPairingResult | null>(null);

  const wrapperHistoryRef = useRef<string[]>([]);
  const currentUrlRef = useRef("");

  const captureMode = recorderActive;
  const setCaptureMode = setRecorderActive;

  const injectCaptureBridge = useCallback(() => {
    webViewRef.current?.injectJavaScript(INJECT_LINK_CAPTURE_BRIDGE);
  }, []);

  const injectDeepCaptureOnly = useCallback((reason?: string) => {
    if (reason) {
      webViewRef.current?.injectJavaScript(
        INJECT_RUN_DEEP_CAPTURE_ONLY.replace(
          "captureReason: 'injected_rescan'",
          `captureReason: ${JSON.stringify(reason)}`,
        ),
      );
    } else {
      webViewRef.current?.injectJavaScript(INJECT_RUN_DEEP_CAPTURE_ONLY);
    }
  }, []);

  const appendNavigationLog = useCallback(
    (entry: Omit<FlicaNavigationLogEntry, "timestamp">) => {
      const row: FlicaNavigationLogEntry = {
        ...entry,
        timestamp: new Date().toISOString(),
      };
      setNavigationLog((prev) => [...prev, row].slice(-120));
      fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_WEBVIEW_NAV", row);
    },
    [],
  );

  const mergePairingCatalog = useCallback((links: CapturedFlicaPairingLink[]) => {
    if (!links.length) return;
    setCatalogPairingLinks((prev) => {
      const map = new Map(prev.map((p) => [`${p.pairingId}|${p.absoluteUrl}`, p]));
      for (const p of links) map.set(`${p.pairingId}|${p.absoluteUrl}`, p);
      return [...map.values()];
    });
  }, []);

  const recordManualDomSnapshot = useCallback(() => {
    injectDeepCaptureOnly("manual_dom_snapshot");
    setLastActionLabel("manual: DOM snapshot requested");
  }, [injectDeepCaptureOnly]);

  const recordFramesFormsSnapshot = useCallback(() => {
    injectDeepCaptureOnly("manual_frames_forms_snapshot");
    setLastActionLabel("manual: frames/forms snapshot requested");
  }, [injectDeepCaptureOnly]);

  const latestEvent = capturedActionEvents[capturedActionEvents.length - 1] ?? null;

  const navigateWebViewTo = useCallback((url: string, options?: { pushHistory?: boolean }) => {
    if (!url || !isFlicaJetblueUrl(url)) return;
    if (options?.pushHistory !== false) {
      const cur = currentUrlRef.current;
      if (cur && cur !== url) {
        const stack = wrapperHistoryRef.current;
        if (stack[stack.length - 1] !== cur) stack.push(cur);
        if (stack.length > 30) wrapperHistoryRef.current = stack.slice(-30);
      }
    }
    webViewRef.current?.injectJavaScript(
      `(function(){ try { window.location.href = ${JSON.stringify(url)}; } catch(e) {} })(); true;`,
    );
  }, []);

  const patchLatestEventWithPopup = useCallback((popupUrl: string) => {
    setCapturedActionEvents((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      const fields = applyReplayTargetFields({
        popupAbsoluteUrl: popupUrl,
        pairingLinks: last.pairingLinks,
        clickedText: last.clickedText,
        onclick: last.onclick,
        href: last.href,
        destinationUrl: last.destinationUrl,
        currentUrl: last.topUrlBefore,
      });
      return [...prev.slice(0, -1), { ...last, ...fields }];
    });
  }, []);

  const handleFlicaWindowOpen = useCallback(
    (data: Record<string, unknown>) => {
      const absoluteUrl = String(data.absoluteUrl ?? "").trim();
      if (!absoluteUrl) return;
      setCapturedPopupUrl(absoluteUrl);
      patchLatestEventWithPopup(absoluteUrl);
      const safety = classifyPopupNavigationSafety(absoluteUrl);
      fcDevMirrorScheduleLogToFile("FC_FLICA_WINDOW_OPEN", {
        absoluteUrl,
        rawUrl: data.rawUrl,
        target: data.target,
        safety,
        sourcePageUrl: data.sourcePageUrl,
      });
      if (safety === "SAFE_READ" && isFlicaJetblueUrl(absoluteUrl)) {
        navigateWebViewTo(absoluteUrl);
        setLastActionLabel(`popup loaded: ${absoluteUrl.split("/").pop() ?? "page"}`);
      } else {
        setLastActionLabel(
          `popup captured (${safety}) — use Open Captured Popup if needed`,
        );
      }
    },
    [navigateWebViewTo, patchLatestEventWithPopup],
  );

  useEffect(() => {
    if (captureMode && showWebView && !embedded) {
      injectCaptureBridge();
    }
  }, [captureMode, showWebView, embedded, injectCaptureBridge]);

  useEffect(() => {
    if (!embedded) return;
    cookiesCapturedRef.current = false;
    setState("loading");
    setStatusText("Loading FLICA…");
  }, [embedded]);

  const addCapturedSnapshot = useCallback(
    (payload: {
      topUrl: string;
      topTitle: string;
      frames: CapturedFrame[];
      lastInteraction: LastInteraction | null;
      captureReason: string;
    }) => {
      const pageType = detectPageTypeFromSnapshot(payload.topUrl, payload.frames);
      const availableActions = deriveAvailableActionsInventory(payload.frames);
      const now = new Date().toISOString();
      const key = snapshotDedupeKey(payload.topUrl, pageType, payload.frames);

      setCapturedPages((prev) => {
        const existing = prev.find(
          (p) => snapshotDedupeKey(p.topUrl, p.detectedPageType, p.frames) === key,
        );
        if (existing) {
          return prev.map((p) =>
            snapshotDedupeKey(p.topUrl, p.detectedPageType, p.frames) === key
              ? {
                  ...p,
                  visitCount: p.visitCount + 1,
                  lastSeenAt: now,
                  captureReason: payload.captureReason,
                  lastInteraction: payload.lastInteraction ?? p.lastInteraction,
                  frames: payload.frames,
                  availableActions,
                }
              : p
          );
        }
        return [
          ...prev,
          {
            timestamp: now,
            topUrl: payload.topUrl,
            topTitle: payload.topTitle,
            detectedPageType: pageType,
            frames: payload.frames,
            availableActions,
            lastInteraction: payload.lastInteraction,
            captureReason: payload.captureReason,
            visitCount: 1,
            lastSeenAt: now,
          },
        ];
      });

      setLastCapture({ title: payload.topTitle, url: payload.topUrl });

      const logPayload = redactForExport({
        topUrl: payload.topUrl,
        topTitle: payload.topTitle,
        captureReason: payload.captureReason,
        detectedPageType: pageType,
        frameCount: payload.frames.length,
        frames: payload.frames.map((f) => ({
          frameName: f.frameName,
          frameIndex: f.frameIndex,
          frameSrc: redactSensitiveString(f.frameSrc),
          locationHref: redactSensitiveString(f.locationHref),
          title: f.title,
          htmlLength: f.htmlLength,
          linkCount: f.links.length,
          formCount: f.forms.length,
          buttonCount: f.buttons.length,
          links: f.links.slice(0, 15).map((l) => ({
            text: l.text,
            href: redactSensitiveString(l.href),
          })),
          forms: f.forms.slice(0, 5),
          bodyPreview: redactSensitiveString(f.bodyPreview.slice(0, 400)),
        })),
        lastInteraction: payload.lastInteraction,
        availableActionsCount: availableActions.length,
      });
      fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_LINK_CAPTURE", logPayload);
    },
    [],
  );

  const captureCookiesAndFinalize = useCallback(async () => {
    if (cookiesCapturedRef.current) return;
    cookiesCapturedRef.current = true;

    try {
      const cm = CookieManager as unknown as { flush?: () => Promise<void> };
      if (typeof cm.flush === "function") {
        await cm.flush();
      }
      await new Promise((r) => setTimeout(r, 500));

      const jar1 = await CookieManager.get(FLICA_ORIGIN);
      const jar2 = await CookieManager.get(`${FLICA_ORIGIN}/online/`);

      const pick = (
        j: Record<string, { value?: string }>,
      ): FlicaStoredCookies => ({
        FLiCASession: j.FLiCASession?.value || undefined,
        FLiCAService: j.FLiCAService?.value || undefined,
        AWSALB: j.AWSALB?.value || undefined,
        AWSALBCORS: j.AWSALBCORS?.value || undefined,
      });

      const merged: FlicaStoredCookies = {
        ...pick(jar1 as Record<string, { value?: string }>),
        ...pick(jar2 as Record<string, { value?: string }>),
      };

      const hasSession = !!(merged.FLiCASession || merged.FLiCAService);
      if (hasSession) {
        await saveFlicaCookiesToSecureStore(merged);
        await markFlicaActionsWebViewSessionReady(merged);
        setState("ready");
        setStatusText("FLICA Actions session ready. Native fetch enabled.");
        fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_WEBVIEW_INIT", {
          ok: true,
          hasFLiCASession: !!merged.FLiCASession,
          hasFLiCAService: !!merged.FLiCAService,
          hasAWSALB: !!merged.AWSALB,
        });
        onSessionReady?.();
      } else {
        cookiesCapturedRef.current = false;
        setState("error");
        setStatusText("Cookie capture found no FLICA session. Try again.");
        fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_WEBVIEW_INIT", {
          ok: false,
          reason: "no_session_cookies_captured",
        });
      }
    } catch (e) {
      cookiesCapturedRef.current = false;
      setState("error");
      setStatusText(`Cookie capture error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [onSessionReady]);

  const onNavigation = useCallback(
    (nav: WebViewNavigation) => {
      const url = nav.url ?? "";
      setCurrentUrl(url);
      currentUrlRef.current = url;

      if (recorderActive) {
        appendNavigationLog({
          phase: nav.loading ? "load_start" : "navigation",
          url,
          title: nav.title,
          loading: nav.loading,
          canGoBack: nav.canGoBack,
          canGoForward: nav.canGoForward,
        });
      }

      if (nav.loading) return;

      fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_WEBVIEW_NAV", {
        url,
        title: nav.title,
        loading: nav.loading,
      });

      const lower = url.toLowerCase();
      const isReadyUrl = READY_URL_MARKERS.some((m) => lower.includes(m));
      if (isReadyUrl || lower.includes("flica.net")) {
        webViewRef.current?.injectJavaScript(INJECT_CHECK_STATE);
      }
    },
    [appendNavigationLog, recorderActive],
  );

  const onLoadStart = useCallback(() => {
    if (!recorderActive) return;
    appendNavigationLog({
      phase: "load_start",
      url: currentUrl,
      loading: true,
    });
  }, [appendNavigationLog, currentUrl, recorderActive]);

  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === "flica_window_open") {
          handleFlicaWindowOpen(data as Record<string, unknown>);
          return;
        }

        if (data.type === "flica_actions_change" && captureMode) {
          const beforeFrames = Array.isArray(data.beforeFrames)
            ? (data.beforeFrames as CapturedFrame[])
            : [];
          const topUrlBefore = String(data.topUrlBefore ?? "");
          const changedText =
            String(data.selectedLabel ?? "") || String(data.changedValue ?? "");
          const nearestForm = data.nearestForm as
            | {
                action?: string;
                method?: string;
                target?: string;
                enctype?: string;
                name?: string;
                id?: string;
              }
            | undefined;
          const now = new Date().toISOString();
          const kind = classifyFlicaClickAction({
            clickedText: changedText,
            onclick: "",
            href: "",
            destinationUrl: "",
            clickedName: String(data.changedName ?? ""),
            clickedTag: String(data.changedTag ?? ""),
            clickedType: String(data.changedType ?? ""),
            clickedRole: "",
          });
          const detected = detectPageTypeFromSnapshot(topUrlBefore, beforeFrames);
          const extra = buildRecorderExtraFromFrames({
            frames: beforeFrames,
            topUrl: topUrlBefore,
            detectedPageType: detected,
            actionKind: kind,
            clickedText: changedText,
            href: "",
            onclick: "",
            formMethod: nearestForm?.method,
            eventType: "change",
            nearestForm,
            capturedAt: now,
          });
          const ev: FlicaActionRecorderEvent = {
            eventId: String(data.eventId ?? `chg-${Date.now()}`),
            timestamp: now,
            actionLabel: buildActionLabel(kind, `change: ${changedText}`),
            actionKind: kind,
            clickedText: changedText,
            clickedTag: String(data.changedTag ?? ""),
            clickedType: String(data.changedType ?? ""),
            clickedName: String(data.changedName ?? ""),
            clickedValue: String(data.changedValue ?? ""),
            clickedRole: "",
            onclick: "",
            href: "",
            destinationUrl: "",
            frameName: String(data.frameName ?? ""),
            frameUrlBefore: String(data.frameUrlBefore ?? ""),
            topUrlBefore,
            pageTitleBefore: String(data.pageTitleBefore ?? ""),
            detectedPageTypeBefore: detected,
            formsBefore: aggregateFormsLines(beforeFrames),
            buttonsBefore: aggregateButtonsLines(beforeFrames),
            linksBefore: aggregateLinksLines(beforeFrames),
            frameUrlsAfter500ms: null,
            frameUrlsAfter1500ms: null,
            frameUrlsAfter3000ms: null,
            formsAfter3000ms: "",
            buttonsAfter3000ms: "",
            linksAfter3000ms: "",
            previewsAfter3000ms: "",
            ...extra,
          };
          setCapturedActionEvents((p) => [...p, ev]);
          mergePairingCatalog(extra.pairingLinks);
          setLastActionLabel(ev.actionLabel);
          return;
        }

        if (data.type === "flica_actions_submit" && captureMode) {
          const nearestForm = data.nearestForm as
            | {
                action?: string;
                method?: string;
                target?: string;
                enctype?: string;
                name?: string;
                id?: string;
              }
            | undefined;
          const topUrlBefore = String(data.topUrlBefore ?? "");
          const now = new Date().toISOString();
          const extra = buildRecorderExtraFromFrames({
            frames: [],
            topUrl: topUrlBefore,
            detectedPageType: "unknown",
            actionKind: "tradeboard_post_request",
            clickedText: "form submit",
            href: nearestForm?.action ?? "",
            onclick: "",
            formMethod: nearestForm?.method ?? "POST",
            eventType: "submit",
            isSubmit: true,
            nearestForm,
            capturedAt: now,
          });
          const ev: FlicaActionRecorderEvent = {
            eventId: String(data.eventId ?? `sub-${Date.now()}`),
            timestamp: now,
            actionLabel: "submit: form",
            actionKind: "tradeboard_post_request",
            clickedText: "form submit",
            clickedTag: "FORM",
            clickedType: "submit",
            clickedName: nearestForm?.name ?? "",
            clickedValue: "",
            clickedRole: "",
            onclick: "",
            href: nearestForm?.action ?? "",
            destinationUrl: nearestForm?.action ?? "",
            frameName: "",
            frameUrlBefore: String(data.frameUrlBefore ?? ""),
            topUrlBefore,
            pageTitleBefore: String(data.pageTitleBefore ?? ""),
            detectedPageTypeBefore: "unknown",
            formsBefore: "",
            buttonsBefore: "",
            linksBefore: "",
            frameUrlsAfter500ms: null,
            frameUrlsAfter1500ms: null,
            frameUrlsAfter3000ms: null,
            formsAfter3000ms: "",
            buttonsAfter3000ms: "",
            linksAfter3000ms: "",
            previewsAfter3000ms: "",
            ...extra,
          };
          setCapturedActionEvents((p) => [...p, ev]);
          setLastActionLabel(ev.actionLabel);
          return;
        }

        if (data.type === "flica_actions_click_action" && captureMode) {
          const phase = String(data.phase ?? "");
          const eventId = String(data.eventId ?? "");
          if (phase === "start") {
            const beforeFrames = Array.isArray(data.beforeFrames)
              ? (data.beforeFrames as CapturedFrame[])
              : [];
            const topUrlBefore = String(data.topUrlBefore ?? "");
            const clickedText = String(data.clickedText ?? "");
            const nearestForm = data.nearestForm as
              | {
                  action?: string;
                  method?: string;
                  target?: string;
                  enctype?: string;
                  name?: string;
                  id?: string;
                }
              | undefined;
            const kind = classifyFlicaClickAction({
              clickedText,
              onclick: String(data.onclick ?? ""),
              href: String(data.href ?? ""),
              destinationUrl: String(data.destinationUrl ?? ""),
              clickedName: String(data.clickedName ?? ""),
              clickedTag: String(data.clickedTag ?? ""),
              clickedType: String(data.clickedType ?? ""),
              clickedRole: String(data.clickedRole ?? ""),
            });
            const label = buildActionLabel(kind, clickedText);
            const detected = detectPageTypeFromSnapshot(topUrlBefore, beforeFrames);
            const now = new Date().toISOString();
            const extra = buildRecorderExtraFromFrames({
              frames: beforeFrames,
              topUrl: topUrlBefore,
              detectedPageType: detected,
              actionKind: kind,
              clickedText,
              href: String(data.href ?? ""),
              onclick: String(data.onclick ?? ""),
              destinationUrl: String(data.destinationUrl ?? ""),
              formMethod: nearestForm?.method,
              eventType: "click",
              nearestForm,
              capturedAt: now,
            });
            const ev: FlicaActionRecorderEvent = {
              eventId,
              timestamp: now,
              actionLabel: label,
              actionKind: kind,
              clickedText,
              clickedTag: String(data.clickedTag ?? ""),
              clickedType: String(data.clickedType ?? ""),
              clickedName: String(data.clickedName ?? ""),
              clickedValue: String(data.clickedValue ?? ""),
              clickedRole: String(data.clickedRole ?? ""),
              onclick: String(data.onclick ?? ""),
              href: String(data.href ?? ""),
              destinationUrl: String(data.destinationUrl ?? ""),
              frameName: String(data.frameName ?? ""),
              frameUrlBefore: String(data.frameUrlBefore ?? ""),
              topUrlBefore,
              pageTitleBefore: String(data.pageTitleBefore ?? ""),
              detectedPageTypeBefore: detected,
              formsBefore: aggregateFormsLines(beforeFrames),
              buttonsBefore: aggregateButtonsLines(beforeFrames),
              linksBefore: aggregateLinksLines(beforeFrames),
              frameUrlsAfter500ms: null,
              frameUrlsAfter1500ms: null,
              frameUrlsAfter3000ms: null,
              formsAfter3000ms: "",
              buttonsAfter3000ms: "",
              linksAfter3000ms: "",
              previewsAfter3000ms: "",
              ...extra,
            };
            setCapturedActionEvents((p) => [...p, ev]);
            mergePairingCatalog(extra.pairingLinks);
            setLastActionLabel(label);
            fcDevMirrorScheduleLogToFile(
              "FC_FLICA_ACTIONS_CLICK_CAPTURE",
              redactForExport({
                phase: "start",
                eventId,
                actionKind: kind,
                actionLabel: label,
                topUrlBefore,
                clickedText,
                frameUrlBefore: ev.frameUrlBefore,
              }),
            );
            return;
          }
          if (phase === "after500" || phase === "after1500" || phase === "after3000") {
            setCapturedActionEvents((prev) => {
              const urls = Array.isArray(data.frameUrls) ? data.frameUrls.map(String) : [];
              const afterFrames = Array.isArray(data.afterFrames)
                ? (data.afterFrames as CapturedFrame[])
                : [];
              let finalized: FlicaActionRecorderEvent | null = null;
              const next = prev.map((e) => {
                if (e.eventId !== eventId) return e;
                if (phase === "after500")
                  return { ...e, frameUrlsAfter500ms: urls.length ? urls : null };
                if (phase === "after1500")
                  return { ...e, frameUrlsAfter1500ms: urls.length ? urls : null };
                finalized = {
                  ...e,
                  frameUrlsAfter3000ms: urls.length ? urls : null,
                  formsAfter3000ms: aggregateFormsLines(afterFrames),
                  buttonsAfter3000ms: aggregateButtonsLines(afterFrames),
                  linksAfter3000ms: aggregateLinksLines(afterFrames),
                  previewsAfter3000ms: aggregatePreviewsLines(afterFrames),
                };
                return finalized;
              });
              if (phase === "after3000" && finalized) {
                const snap = finalized;
                queueMicrotask(() =>
                  fcDevMirrorScheduleLogToFile(
                    "FC_FLICA_ACTIONS_CLICK_CAPTURE",
                    redactForExport(snap),
                  ),
                );
              }
              return next;
            });
          }
          return;
        }

        if (data.type === "flica_actions_link_capture" && captureMode) {
          const frames: CapturedFrame[] = Array.isArray(data.frames) ? data.frames : [];
          const topUrl = String(data.topUrl ?? "");
          const topTitle = String(data.topTitle ?? "");
          const captureReason = String(data.captureReason ?? "unknown");
          const lastInteraction = (data.lastInteraction ?? null) as LastInteraction | null;

          if (frames.length > 0) {
            addCapturedSnapshot({
              topUrl,
              topTitle,
              frames,
              lastInteraction,
              captureReason,
            });
            const at = new Date().toISOString();
            mergePairingCatalog(extractPairingLinksFromFrames(frames, topUrl, at));
          }

          return;
        }

        if (data.type !== "flica_actions_page_state") return;

        fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_WEBVIEW_NAV", {
          pageState: true,
          url: data.url,
          title: data.title,
          bodyLength: data.bodyLength,
          htmlLength: data.htmlLength,
          hasRecaptcha: data.hasRecaptcha,
          hasError: data.hasError,
          hasLogin: data.hasLogin,
          isReady: data.isReady,
          links: data.links?.slice(0, 15),
          forms: data.forms,
          snippet: data.snippet?.slice(0, 200),
        });

        if (compactEmbedded) {
          let crewPhase = "webview_page_state";
          if (data.hasRecaptcha) crewPhase = "captcha_detected";
          else if (data.hasLogin) crewPhase = "login_page_detected";
          else if (data.isReady) crewPhase = "mainmenu_session_ready_detected";
          fcDevMirrorScheduleLogToFile("FC_CREW_HUB_AUTH", {
            phase: crewPhase,
            webviewUrl: data.url,
            bodyLength: data.bodyLength,
            htmlLength: data.htmlLength,
            hasRecaptcha: !!data.hasRecaptcha,
            hasLogin: !!data.hasLogin,
            isReady: !!data.isReady,
          });
        }

        if (data.isReady && !cookiesCapturedRef.current) {
          setState("loading");
          setStatusText("Main menu detected — capturing cookies…");
          void captureCookiesAndFinalize();
          return;
        }

        const urlLower = (data.url ?? "").toLowerCase();
        const isMenuUrl = READY_URL_MARKERS.some((m) => urlLower.includes(m));
        if (isMenuUrl && data.bodyLength > 200 && !data.hasError && !data.hasLogin && !cookiesCapturedRef.current) {
          const snippetLower = (data.snippet ?? "").toLowerCase();
          const hasMenuContent = READY_BODY_MARKERS.some((m) => snippetLower.includes(m));
          if (hasMenuContent) {
            setState("loading");
            setStatusText("FLICA menu content detected — capturing cookies…");
            void captureCookiesAndFinalize();
            return;
          }
        }

        if (captureMode) {
          injectDeepCaptureOnly();
        }

        if (data.hasError) {
          setState("error");
          setStatusText(`FLICA error: ${data.snippet?.slice(0, 120) ?? ""}`);
          return;
        }

        if (data.hasRecaptcha) {
          setState("captcha");
          setStatusText("CAPTCHA required — complete it in the WebView below.");
          return;
        }

        if (data.hasLogin) {
          setState("loading");
          setStatusText("Login page detected — sign in below.");
          return;
        }
      } catch {
        /* ignore non-JSON messages */
      }
    },
    [
      captureCookiesAndFinalize,
      captureMode,
      addCapturedSnapshot,
      injectDeepCaptureOnly,
      compactEmbedded,
      mergePairingCatalog,
      handleFlicaWindowOpen,
    ],
  );

  const onLoadEnd = useCallback(() => {
    webViewRef.current?.injectJavaScript(INJECT_CHECK_STATE);
    if (recorderActive) {
      appendNavigationLog({
        phase: "load_end",
        url: currentUrl,
        loading: false,
      });
    }
    if (captureMode) {
      injectCaptureBridge();
      setTimeout(() => injectDeepCaptureOnly("post_navigation"), 400);
      setTimeout(() => injectDeepCaptureOnly("post_navigation_late"), 1200);
    }
  }, [
    captureMode,
    injectCaptureBridge,
    injectDeepCaptureOnly,
    recorderActive,
    appendNavigationLog,
    currentUrl,
  ]);

  const handleOpen = () => {
    cookiesCapturedRef.current = false;
    setShowWebView(true);
    setState("loading");
    setStatusText("Loading FLICA…");
  };

  const handleClose = () => {
    setShowWebView(false);
    if (state !== "ready") {
      setState("idle");
      setStatusText("Tap to authenticate FLICA session");
    }
  };

  const handleCopyUrl = () => {
    if (currentUrl) {
      void Share.share({ message: redactSensitiveString(currentUrl), title: "FLICA URL" });
    }
  };

  const handleCopyCapturedPopupUrl = () => {
    const url = capturedPopupUrl ?? latestEvent?.popupAbsoluteUrl;
    if (!url) return;
    void Share.share({ message: url, title: "FLICA Captured Popup URL" });
  };

  const handleNavBack = () => {
    const stack = wrapperHistoryRef.current;
    const prev = stack.pop();
    if (prev) navigateWebViewTo(prev, { pushHistory: false });
    else setLastActionLabel("nav: no previous URL in stack");
  };

  const handleClosePopupReturn = () => handleNavBack();

  const handleReturnTradeboard = () => {
    navigateWebViewTo(FLICA_TRADEBOARD_FRAME_URL);
    setLastActionLabel("nav: TradeBoard frame");
  };

  const handleReturnOpenTime = () => {
    const ot = findLatestOpenTimeFrameUrl(navigationLog);
    if (ot) {
      navigateWebViewTo(ot);
      setLastActionLabel("nav: Open Time frame");
    } else {
      setLastActionLabel("nav: no otframe URL in history yet");
    }
  };

  const handleOpenCapturedPopupInWebView = () => {
    const url = capturedPopupUrl ?? latestEvent?.popupAbsoluteUrl;
    if (!url) return;
    navigateWebViewTo(url);
    setLastActionLabel(`opened popup: ${url.split("/").pop() ?? "page"}`);
  };

  const buildReplayInspectFromFetch = useCallback(
    async (url: string, referer: string, hints: string[]) => {
      setReplayStatus("Replaying GET…");
      setReplayInspect(null);
      setParsedReplayPairing(null);
      try {
        const { status, html, url: finalUrl } = await fetchFlicaHtmlUsingWebViewSession(url, {
          referer,
        });
        const snap = buildReplayInspectSnapshot({
          requestedUrl: url,
          status,
          finalUrl: finalUrl || url,
          title: "",
          html,
          pairingIdHints: hints,
          error: status >= 200 && status < 400 && html.length > 0 ? undefined : `HTTP ${status}`,
        });
        if (snap.ok) setReplayInspect(snap);
        const msg = snap.ok
          ? `GET ok status=${status} htmlLen=${snap.htmlLen} pairingDetail=${snap.isPairingDetailHtml}`
          : `GET failed status=${status} htmlLen=${html.length}`;
        setReplayStatus(msg);
        return { snap, html };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setReplayStatus(`GET error: ${msg}`);
        return null;
      }
    },
    [],
  );

  const handleReplayCapturedPopupGet = async () => {
    const url = capturedPopupUrl ?? latestEvent?.popupAbsoluteUrl;
    if (!url) return;
    const hints = [
      ...catalogPairingLinks.map((p) => p.pairingId),
      latestEvent?.clickedText ?? "",
    ].filter(Boolean) as string[];
    await buildReplayInspectFromFetch(
      url,
      latestEvent?.replayReferer || latestEvent?.topUrlBefore || currentUrl,
      hints,
    );
  };

  const handleParseReplayAsPairingDetail = () => {
    if (!replayInspect?.html) return;
    const result = parseReplayHtmlAsPairingDetail(replayInspect.html, {
      pairingId: replayInspect.detectedPairingId ?? undefined,
    });
    setParsedReplayPairing(result);
    setReplayStatus(
      result.ok
        ? `Parsed ${result.summary?.pairingId ?? "pairing"} · legs=${result.summary?.legCount ?? 0}`
        : `Parse failed: ${result.error ?? "unknown"}`,
    );
  };

  const handleCopyParsedPairingJson = () => {
    if (!parsedReplayPairing?.pairing) return;
    void Share.share({
      message: JSON.stringify(parsedReplayPairing.pairing, null, 2),
      title: "FLICA Parsed Pairing JSON",
    });
  };

  const handleCopyPairingDetailParseProbe = () => {
    if (!parsedReplayPairing) return;
    void Share.share({
      message: formatPairingDetailParseProbe(parsedReplayPairing),
      title: "FLICA Pairing Detail Parse Probe",
    });
  };

  const handleCopyCapturedJson = () => {
    const json = JSON.stringify(redactForExport(capturedPages), null, 2);
    void Share.share({ message: json, title: "FLICA Captured Links JSON" });
  };

  const handleCopyCapturedSummary = () => {
    const body = capturedPages.map((p) => formatSnapshotSummary(p)).join("\n\n========\n\n");
    void Share.share({
      message: body,
      title: "FLICA Captured Links Summary",
    });
  };

  const handleCopyActionEventsJson = () => {
    const json = JSON.stringify(redactForExport(capturedActionEvents), null, 2);
    void Share.share({ message: json, title: "FLICA Action Events JSON" });
  };

  const handleCopyActionEventsSummary = () => {
    const body = capturedActionEvents.map((e) => formatCapturedActionEventSummary(e)).join("\n\n========\n\n");
    void Share.share({
      message: body,
      title: "FLICA Action Events Summary",
    });
  };

  const handleExportActionEvents = () => {
    const json = JSON.stringify(
      redactForExport({
        events: capturedActionEvents,
        navigationLog,
        pairingLinks: catalogPairingLinks,
        snapshots: capturedPages,
      }),
      null,
      2,
    );
    void Share.share({ message: json, title: "FLICA Action Recorder Export" });
  };

  const handleCopyFullDebugReport = () => {
    const body = formatFullActionLog({
      events: capturedActionEvents,
      navigationLog,
      pairingLinks: catalogPairingLinks,
    });
    void Share.share({ message: body, title: "FLICA Full Debug Report" });
  };

  const handleCopyLatestActionEvent = () => {
    if (!latestEvent) return;
    void Share.share({
      message: formatFlicaActionEventDebugReport(latestEvent),
      title: "FLICA Latest Action Event",
    });
  };

  const handleCopyReplayPayload = () => {
    if (!latestEvent) return;
    const payload = buildReplayDryRunPayload(latestEvent);
    void Share.share({
      message: formatReplayDryRunText(payload),
      title: "FLICA Replay Payload",
    });
  };

  const handleReplayCapturedGet = async () => {
    if (!latestEvent) return;
    setParsedReplayPairing(null);
    const result = await replayCapturedGet(latestEvent);
    const hints = [
      ...latestEvent.pairingLinks.map((p) => p.pairingId),
      latestEvent.clickedText,
    ].filter(Boolean) as string[];
    const snap = buildReplayInspectSnapshot({
      requestedUrl: result.requestedUrl ?? latestEvent.replayGetUrl,
      status: result.status,
      finalUrl: result.finalUrl ?? result.requestedUrl ?? latestEvent.replayGetUrl,
      title: result.title,
      html: result.html ?? "",
      pairingIdHints: hints,
      error: result.ok ? undefined : result.error,
    });
    if (result.ok || snap.isPairingDetailHtml) {
      setReplayInspect(snap);
    }
    const msg = result.ok
      ? `GET ok status=${result.status} htmlLen=${snap.htmlLen} pairingDetail=${snap.isPairingDetailHtml} reason=${latestEvent.replayTargetReason}`
      : `GET failed: ${result.error ?? "unknown"}`;
    setReplayStatus(msg);
    void Share.share({ message: msg, title: "FLICA Replay GET Result" });
  };

  const handleClearReplayResult = () => {
    setReplayInspect(null);
    setParsedReplayPairing(null);
    setReplayStatus(null);
  };

  const handleCopyReplayHtml = () => {
    if (!replayInspect?.html) return;
    void Share.share({ message: replayInspect.html, title: "FLICA Replay HTML" });
  };

  const handleCopyReplayTextPreview = () => {
    if (!replayInspect) return;
    void Share.share({
      message: replayInspect.bodyTextPreview || replayInspect.bodyText.slice(0, 3000),
      title: "FLICA Replay Text Preview",
    });
  };

  const handleCopyReplayParseProbe = () => {
    if (!replayInspect) return;
    void Share.share({
      message: formatReplayParseProbe(replayInspect),
      title: "FLICA Replay Parse Probe",
    });
  };

  const handleReplayPostDryRun = () => {
    if (!latestEvent) return;
    const payload = replayCapturedPostDryRun(latestEvent);
    setReplayStatus("POST dry run (not sent)");
    void Share.share({
      message: formatReplayDryRunText(payload),
      title: "FLICA Replay POST Dry Run",
    });
  };

  const webViewEl = (
    <WebView
      key={loadUri}
      ref={webViewRef}
      source={{ uri: showWebView ? loadUri : FLICA_ORIGIN }}
      style={embedded ? styles.webViewEmbedded : styles.webView}
      userAgent={FLICA_WEBVIEW_USER_AGENT}
      injectedJavaScriptBeforeContentLoaded={FLICA_ACTIONS_BEFORE_CONTENT}
      onNavigationStateChange={onNavigation}
      onLoadStart={onLoadStart}
      onLoadEnd={onLoadEnd}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      javaScriptCanOpenWindowsAutomatically
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      originWhitelist={["https://*", "http://*"]}
      setSupportMultipleWindows={false}
      {...(Platform.OS === "android"
        ? { mixedContentMode: "compatibility" as const }
        : {})}
      cacheEnabled={false}
    />
  );

  if (embedded) {
    return (
      <View style={styles.embeddedRoot}>
        {!compactEmbedded ? (
          <>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.dot,
                  state === "ready" && styles.dotReady,
                  state === "error" && styles.dotError,
                  state === "captcha" && styles.dotCaptcha,
                  state === "loading" && styles.dotLoading,
                ]}
              />
              <Text style={styles.statusText} numberOfLines={2}>
                {statusText}
              </Text>
            </View>
            {state === "loading" ? (
              <ActivityIndicator
                size="small"
                color={colors.accentBlue}
                style={{ marginVertical: spacing.xs }}
              />
            ) : null}
          </>
        ) : null}
        <View style={styles.webViewContainerEmbedded}>{webViewEl}</View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <View
          style={[
            styles.dot,
            state === "ready" && styles.dotReady,
            state === "error" && styles.dotError,
            state === "captcha" && styles.dotCaptcha,
            state === "loading" && styles.dotLoading,
          ]}
        />
        <Text style={styles.statusText} numberOfLines={3}>
          {statusText}
        </Text>
      </View>

      {!showWebView ? (
        <Pressable style={styles.openBtn} onPress={handleOpen}>
          <Text style={styles.openBtnText}>Authenticate FLICA Actions Session</Text>
        </Pressable>
      ) : (
        <>
          <View style={styles.toolRow}>
            <Pressable style={styles.closeBtn} onPress={handleClose}>
              <Text style={styles.closeBtnText}>Close WebView</Text>
            </Pressable>
            {currentUrl ? (
              <Pressable style={styles.copyUrlBtn} onPress={handleCopyUrl}>
                <Text style={styles.copyUrlBtnText}>Copy Current URL</Text>
              </Pressable>
            ) : null}
          </View>

          {showWebView ? (
            <View style={styles.navToolbar}>
              <Pressable style={styles.navBtn} onPress={handleNavBack}>
                <Text style={styles.navBtnText}>Back</Text>
              </Pressable>
              <Pressable style={styles.navBtn} onPress={handleClosePopupReturn}>
                <Text style={styles.navBtnText}>Close Popup</Text>
              </Pressable>
              <Pressable style={styles.navBtn} onPress={handleReturnTradeboard}>
                <Text style={styles.navBtnText}>TradeBoard</Text>
              </Pressable>
              <Pressable style={styles.navBtn} onPress={handleReturnOpenTime}>
                <Text style={styles.navBtnText}>Open Time</Text>
              </Pressable>
              <Pressable style={styles.navBtn} onPress={handleCopyCapturedPopupUrl}>
                <Text style={styles.navBtnText}>Copy Popup URL</Text>
              </Pressable>
              <Pressable style={styles.navBtn} onPress={handleOpenCapturedPopupInWebView}>
                <Text style={styles.navBtnText}>Open Popup</Text>
              </Pressable>
              <Pressable
                style={styles.navBtn}
                onPress={() => void handleReplayCapturedPopupGet()}
              >
                <Text style={styles.navBtnText}>Replay Popup GET</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.recorderHint}>
            Action Recorder: tap controls in the WebView manually. Nothing is auto-submitted.
          </Text>
          <View style={styles.captureRow}>
            {!recorderActive ? (
              <Pressable style={styles.captureBtn} onPress={() => setRecorderActive(true)}>
                <Text style={styles.captureBtnText}>Start FLICA Action Recorder</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.captureBtn, styles.captureBtnActive]}
                onPress={() => setRecorderActive(false)}
              >
                <Text style={[styles.captureBtnText, styles.captureBtnTextActive]}>
                  Stop FLICA Action Recorder
                </Text>
              </Pressable>
            )}
            <Pressable
              style={styles.actionCaptureBtn}
              onPress={() => {
                setCapturedActionEvents([]);
                setLastActionLabel(null);
                setReplayStatus(null);
              }}
            >
              <Text style={styles.actionCaptureBtnText}>Clear Action Events</Text>
            </Pressable>
            <Pressable style={styles.actionCaptureBtn} onPress={handleExportActionEvents}>
              <Text style={styles.actionCaptureBtnText}>Export Action Events</Text>
            </Pressable>
            <Pressable
              style={styles.captureBtn}
              onPress={() => {
                setCapturedPages([]);
                setLastCapture(null);
                setCatalogPairingLinks([]);
              }}
            >
              <Text style={styles.captureBtnText}>Clear Snapshots</Text>
            </Pressable>
            {recorderActive ? (
              <>
                <Pressable style={styles.captureBtn} onPress={recordManualDomSnapshot}>
                  <Text style={styles.captureBtnText}>Capture DOM Snapshot</Text>
                </Pressable>
                <Pressable style={styles.captureBtn} onPress={recordFramesFormsSnapshot}>
                  <Text style={styles.captureBtnText}>Capture Frames/Forms</Text>
                </Pressable>
              </>
            ) : null}
          </View>

          {recorderActive ? (
            <View style={styles.captureRow}>
              <Pressable
                style={styles.actionCaptureBtn}
                onPress={handleCopyLatestActionEvent}
                disabled={!latestEvent}
              >
                <Text style={styles.actionCaptureBtnText}>Copy Latest Action Event</Text>
              </Pressable>
              <Pressable style={styles.actionCaptureBtn} onPress={handleCopyFullDebugReport}>
                <Text style={styles.actionCaptureBtnText}>Copy Full Debug Report</Text>
              </Pressable>
              <Pressable style={styles.actionCaptureBtn} onPress={handleCopyActionEventsJson}>
                <Text style={styles.actionCaptureBtnText}>Copy Action Log JSON</Text>
              </Pressable>
              {capturedPages.length > 0 ? (
                <>
                  <Pressable style={styles.captureBtn} onPress={handleCopyCapturedJson}>
                    <Text style={styles.captureBtnText}>Link JSON</Text>
                  </Pressable>
                  <Pressable style={styles.captureBtn} onPress={handleCopyCapturedSummary}>
                    <Text style={styles.captureBtnText}>Link Summary</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}

          {recorderActive && latestEvent ? (
            <View style={styles.latestEventCard}>
              <Text style={styles.latestEventTitle}>Latest event</Text>
              <Text style={styles.latestEventLine}>
                {latestEvent.eventType} · {latestEvent.safetyClassification}
              </Text>
              <Text style={styles.latestEventLine} numberOfLines={2}>
                {latestEvent.pageLabel} · {latestEvent.topUrlBefore}
              </Text>
              <Text style={styles.latestEventLine} numberOfLines={2}>
                {latestEvent.clickedText || "(no label)"} → {latestEvent.href || latestEvent.nearestFormAction || "—"}
              </Text>
              <Text style={styles.latestEventLine}>
                {latestEvent.formMethod} · fields={latestEvent.formFieldCount} hidden=
                {latestEvent.hiddenFieldCount} frames={latestEvent.frameCount}
              </Text>
              <Text style={styles.latestEventLine} numberOfLines={3}>
                replay target ({latestEvent.replayTargetReason || "—"}):{" "}
                {latestEvent.replayGetUrl || "(none)"}
              </Text>
              {latestEvent.popupAbsoluteUrl ? (
                <Text style={styles.latestEventLine} numberOfLines={2}>
                  popup: {latestEvent.popupAbsoluteUrl}
                </Text>
              ) : null}
              {latestEvent.replayWarning ? (
                <Text style={styles.latestEventWarn}>{latestEvent.replayWarning}</Text>
              ) : null}
              <View style={styles.captureRow}>
                <Pressable style={styles.replayBtn} onPress={() => void handleReplayCapturedGet()}>
                  <Text style={styles.replayBtnText}>Replay Captured GET</Text>
                </Pressable>
                <Pressable style={styles.replayBtn} onPress={handleReplayPostDryRun}>
                  <Text style={styles.replayBtnText}>Replay POST Dry Run</Text>
                </Pressable>
                <Pressable style={styles.replayBtn} onPress={handleCopyReplayPayload}>
                  <Text style={styles.replayBtnText}>Copy Replay Payload</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {replayInspect ? (
            <View style={styles.replayResultCard}>
              <Text style={styles.replayResultTitle}>Replay result</Text>
              <Text style={styles.replayResultLine}>status={replayInspect.status} ok={String(replayInspect.ok)}</Text>
              <Text style={styles.replayResultLine} numberOfLines={2}>
                finalUrl={replayInspect.finalUrl}
              </Text>
              <Text style={styles.replayResultLine} numberOfLines={1}>
                title={replayInspect.title || "(empty)"}
              </Text>
              <Text style={styles.replayResultLine}>
                htmlLen={replayInspect.htmlLen} textLen={replayInspect.textLen}
              </Text>
              <Text style={styles.replayResultLine}>
                pairingId={replayInspect.detectedPairingId ?? "(none)"}
              </Text>
              <Text style={styles.replayResultLine}>
                pairingDetailHtml={String(replayInspect.isPairingDetailHtml)} markers=
                {replayInspect.pairingDetailHints.join(",") || "(none)"}
              </Text>
              {parsedReplayPairing?.summary ? (
                <Text style={styles.replayResultLine}>
                  parsed: {parsedReplayPairing.summary.pairingId} legs=
                  {parsedReplayPairing.summary.legCount} crew=
                  {parsedReplayPairing.summary.crewCount} hotels=
                  {parsedReplayPairing.summary.hotelCount} dEnd=
                  {parsedReplayPairing.summary.dEnd} tafb={parsedReplayPairing.summary.tafb}
                </Text>
              ) : null}
              <Text style={styles.replayResultPreview} selectable>
                {replayInspect.bodyTextPreview || "(empty body text)"}
              </Text>
              <View style={styles.captureRow}>
                <Pressable style={styles.replayBtn} onPress={handleCopyReplayHtml}>
                  <Text style={styles.replayBtnText}>Copy Replay HTML</Text>
                </Pressable>
                <Pressable style={styles.replayBtn} onPress={handleCopyReplayTextPreview}>
                  <Text style={styles.replayBtnText}>Copy Replay Text Preview</Text>
                </Pressable>
                <Pressable style={styles.replayBtn} onPress={handleCopyReplayParseProbe}>
                  <Text style={styles.replayBtnText}>Copy Replay Parse Probe</Text>
                </Pressable>
                <Pressable style={styles.replayBtn} onPress={handleParseReplayAsPairingDetail}>
                  <Text style={styles.replayBtnText}>Parse As Pairing Detail</Text>
                </Pressable>
                <Pressable style={styles.replayBtn} onPress={handleCopyParsedPairingJson}>
                  <Text style={styles.replayBtnText}>Copy Parsed JSON</Text>
                </Pressable>
                <Pressable style={styles.replayBtn} onPress={handleCopyPairingDetailParseProbe}>
                  <Text style={styles.replayBtnText}>Copy Pairing Parse Probe</Text>
                </Pressable>
                <Pressable style={styles.replayBtn} onPress={handleClearReplayResult}>
                  <Text style={styles.replayBtnText}>Clear Replay Result</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {recorderActive ? (
            <View style={styles.captureInfo}>
              <Text style={styles.captureInfoText}>
                Snapshots: {capturedPages.length} · Pairing links: {catalogPairingLinks.length} · Nav log:{" "}
                {navigationLog.length}
              </Text>
              <Text style={[styles.captureInfoText, { marginTop: 4 }]}>
                Action events: {capturedActionEvents.length}
                {lastActionLabel ? ` | Last: ${lastActionLabel}` : ""}
              </Text>
              {replayStatus ? (
                <Text style={[styles.captureInfoText, { marginTop: 4 }]}>{replayStatus}</Text>
              ) : null}
            </View>
          ) : null}

          {state === "loading" && (
            <ActivityIndicator
              size="small"
              color={colors.accentBlue}
              style={{ marginVertical: spacing.xs }}
            />
          )}
          <View style={styles.webViewContainer}>{webViewEl}</View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  embeddedRoot: { flex: 1, minHeight: 200 },
  webViewEmbedded: { flex: 1, backgroundColor: "#fff" },
  webViewContainerEmbedded: { flex: 1, minHeight: 120 },
  container: { marginBottom: spacing.sm },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.textSecondary,
  },
  dotReady: { backgroundColor: "#2e7d32" },
  dotError: { backgroundColor: colors.headerRed },
  dotCaptcha: { backgroundColor: "#f9a825" },
  dotLoading: { backgroundColor: colors.accentBlue },
  statusText: {
    flex: 1,
    fontSize: 11,
    color: colors.textPrimary,
  },
  openBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#f57c00",
    backgroundColor: colors.cardBg,
    alignItems: "center",
  },
  openBtnText: { fontSize: 13, fontWeight: "600", color: "#f57c00" },
  toolRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  closeBtn: {
    flex: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  closeBtnText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  copyUrlBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.accentBlue,
    alignItems: "center",
  },
  copyUrlBtnText: { fontSize: 12, fontWeight: "600", color: colors.accentBlue },
  navToolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  navBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#5d4037",
    backgroundColor: "#efebe9",
  },
  navBtnText: { fontSize: 10, fontWeight: "700", color: "#4e342e" },
  captureRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.xs,
    flexWrap: "wrap",
  },
  captureBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#7b1fa2",
    backgroundColor: colors.cardBg,
  },
  captureBtnActive: {
    backgroundColor: "#7b1fa2",
  },
  captureBtnText: { fontSize: 11, fontWeight: "600", color: "#7b1fa2" },
  captureBtnTextActive: { color: "#fff" },
  actionCaptureBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#00695c",
    backgroundColor: colors.cardBg,
  },
  actionCaptureBtnText: { fontSize: 11, fontWeight: "600", color: "#00695c" },
  captureInfo: {
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  captureInfoText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  recorderHint: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    lineHeight: 14,
  },
  latestEventCard: {
    marginBottom: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#00695c",
    backgroundColor: "#e0f2f1",
  },
  latestEventTitle: { fontSize: 11, fontWeight: "800", color: "#004d40", marginBottom: 4 },
  latestEventLine: {
    fontSize: 10,
    color: "#004d40",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    marginBottom: 2,
  },
  latestEventWarn: {
    fontSize: 10,
    color: "#b45309",
    fontWeight: "700",
    marginTop: 4,
    marginBottom: 4,
  },
  replayBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#1565c0",
    backgroundColor: "#e3f2fd",
  },
  replayBtnText: { fontSize: 10, fontWeight: "700", color: "#1565c0" },
  replayResultCard: {
    marginBottom: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#1565c0",
    backgroundColor: "#e8f4fc",
  },
  replayResultTitle: { fontSize: 11, fontWeight: "800", color: "#0d47a1", marginBottom: 4 },
  replayResultLine: {
    fontSize: 10,
    color: "#0d47a1",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    marginBottom: 2,
  },
  replayResultPreview: {
    marginTop: 6,
    marginBottom: 6,
    fontSize: 9,
    color: "#1e3a5f",
    lineHeight: 12,
    maxHeight: 200,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  webViewContainer: {
    height: 360,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  webView: { flex: 1 },
});
