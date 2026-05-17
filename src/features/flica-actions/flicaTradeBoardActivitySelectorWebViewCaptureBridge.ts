/**
 * Promise bridge: hidden WebView DOM capture for TradeBoard Add Activity selector (ottrade.cgi).
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";

export type TbActivitySelectorHtmlCaptureMessage = {
  type: "tb_activity_selector_html_capture";
  url: string;
  title: string;
  topOuterHtml: string;
  frameSrcs: string[];
  frameHtmlList: string[];
  waitedMs: number;
  markersSeen: boolean;
};

export type TbActivitySelectorWebViewCaptureResult = {
  html: string;
  finalUrl: string;
  title: string;
  htmlLength: number;
  source: "webview";
  captureFrameCount: number;
  containsTradeTask: boolean;
  containsDropTask: boolean;
  containsScheduleTable: boolean;
};

export function activitySelectorHtmlMarkers(html: string): {
  htmlLength: number;
  containsTradeTask: boolean;
  containsDropTask: boolean;
  containsTaryTask: boolean;
  containsScheduleTable: boolean;
} {
  const h = String(html ?? "");
  const l = h.toLowerCase();
  return {
    htmlLength: h.length,
    containsTradeTask: l.includes("tradetask("),
    containsDropTask: l.includes("droptask("),
    containsTaryTask:
      /\btary\s*\[\s*(?:\d+|tary\.length)\s*\]\s*=\s*new\s+task\s*\(/i.test(h) ||
      (l.includes("tary") && l.includes("new task(")),
    containsScheduleTable:
      (l.includes("pairing") && (l.includes("blk hrs") || l.includes("blk"))) ||
      (l.includes("schedule") && l.includes("pairing")) ||
      (l.includes("wright") && l.includes("schedule")),
  };
}

export function activitySelectorHtmlUsable(html: string): boolean {
  const m = activitySelectorHtmlMarkers(html);
  return (
    m.containsTradeTask ||
    m.containsDropTask ||
    m.containsTaryTask ||
    m.containsScheduleTable
  );
}

export function pickBestActivitySelectorHtmlFromCapture(
  payload: TbActivitySelectorHtmlCaptureMessage,
): { html: string; finalUrl: string; title: string } {
  const candidates: { html: string; url: string }[] = [
    { html: payload.topOuterHtml ?? "", url: payload.url ?? "" },
  ];
  const frames = payload.frameHtmlList ?? [];
  const srcs = payload.frameSrcs ?? [];
  for (let i = 0; i < frames.length; i++) {
    candidates.push({ html: frames[i] ?? "", url: srcs[i] ?? "" });
  }

  for (const c of candidates) {
    if (activitySelectorHtmlUsable(c.html)) {
      return { html: c.html, finalUrl: c.url || payload.url, title: payload.title ?? "" };
    }
  }

  let best = candidates[0] ?? { html: "", url: payload.url ?? "" };
  for (const c of candidates) {
    if ((c.html?.length ?? 0) > (best.html?.length ?? 0)) best = c;
  }
  return { html: best.html ?? "", finalUrl: best.url || payload.url, title: payload.title ?? "" };
}

const POLL_MS = 300;
const MAX_WAIT_MS = 40_000;

export function buildInjectTradeboardActivitySelectorHtmlCaptureScript(): string {
  return `(function(){
  var POLL_MS = ${POLL_MS};
  var MAX_WAIT_MS = ${MAX_WAIT_MS};
  var started = Date.now();

  function docHtml(doc) {
    try {
      return doc && doc.documentElement ? String(doc.documentElement.outerHTML) : '';
    } catch (e) { return ''; }
  }

  function hasMarkers(html) {
    var l = String(html || '').toLowerCase();
    return (
      l.indexOf('tradetask(') >= 0 ||
      l.indexOf('droptask(') >= 0 ||
      /value\\s*=\\s*["']trade["']/i.test(html) ||
      /value\\s*=\\s*["']drop["']/i.test(html) ||
      (l.indexOf('tary') >= 0 && l.indexOf('new task(') >= 0) ||
      (l.indexOf('pairing') >= 0 && l.indexOf('blk') >= 0) ||
      (l.indexOf('schedule') >= 0 && l.indexOf('pairing') >= 0)
    );
  }

  function anyDocHasMarkers() {
    try {
      if (hasMarkers(docHtml(document))) return true;
    } catch (e) {}
    var i, el, fdoc, w;
    if (typeof window.length === 'number') {
      for (i = 0; i < window.length; i++) {
        try {
          w = window.frames[i];
          if (w && w.document && hasMarkers(docHtml(w.document))) return true;
        } catch (e) {}
      }
    }
    var n = document.getElementsByTagName('frame');
    for (i = 0; i < n.length; i++) {
      try {
        fdoc = n[i].contentDocument;
        if (fdoc && hasMarkers(docHtml(fdoc))) return true;
      } catch (e) {}
    }
    n = document.querySelectorAll('iframe');
    for (i = 0; i < n.length; i++) {
      try {
        fdoc = n[i].contentDocument;
        if (fdoc && hasMarkers(docHtml(fdoc))) return true;
        w = n[i].contentWindow;
        if (w && w.document && hasMarkers(docHtml(w.document))) return true;
      } catch (e) {}
    }
    return false;
  }

  function captureNow(markersSeen) {
    try {
      var frameUrl = (window.location && window.location.href) || '';
      var p = {
        type: 'tb_activity_selector_html_capture',
        url: frameUrl,
        title: (document && document.title) || '',
        topOuterHtml: docHtml(document),
        frameSrcs: [],
        frameHtmlList: [],
        waitedMs: Date.now() - started,
        markersSeen: !!markersSeen
      };
      var i, el, fdoc, src, w;
      if (typeof window.length === 'number') {
        for (i = 0; i < window.length; i++) {
          try {
            w = window.frames[i];
            src = w && w.location && w.location.href ? String(w.location.href) : '';
            p.frameSrcs.push(src);
            p.frameHtmlList.push(w && w.document ? docHtml(w.document) : '');
          } catch (e) {
            p.frameSrcs.push('(inaccessible)');
            p.frameHtmlList.push('');
          }
        }
      }
      var n = document.getElementsByTagName('frame');
      for (i = 0; i < n.length; i++) {
        el = n[i];
        src = el.src || el.getAttribute('src') || '';
        p.frameSrcs.push('htmlframe:' + String(src));
        try {
          fdoc = el.contentDocument;
          p.frameHtmlList.push(fdoc ? docHtml(fdoc) : '');
        } catch (e) { p.frameHtmlList.push(''); }
      }
      n = document.querySelectorAll('iframe');
      for (i = 0; i < n.length; i++) {
        el = n[i];
        src = el.src || el.getAttribute('src') || '';
        p.frameSrcs.push(String(src));
        try {
          fdoc = el.contentDocument;
          if (fdoc) {
            p.frameHtmlList.push(docHtml(fdoc));
          } else {
            w = el.contentWindow;
            p.frameHtmlList.push(w && w.document ? docHtml(w.document) : '');
          }
        } catch (e) { p.frameHtmlList.push(''); }
      }
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(p));
      }
    } catch (e) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'tb_activity_selector_html_capture_error',
          message: e && e.message ? String(e.message) : 'capture_failed'
        }));
      }
    }
  }

  function poll() {
    if (anyDocHasMarkers()) {
      setTimeout(function() { captureNow(true); }, 400);
      return;
    }
    if (Date.now() - started >= MAX_WAIT_MS) {
      captureNow(false);
      return;
    }
    setTimeout(poll, POLL_MS);
  }

  poll();
})(); true;`;
}

type PendingCapture = {
  targetUrl: string;
  frameWarmupUrl: string;
  resolve: (r: TbActivitySelectorWebViewCaptureResult) => void;
  reject: (e: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

let pending: PendingCapture | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeTbActivitySelectorWebViewCapture(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTbActivitySelectorWebViewCapturePending(): Pick<
  PendingCapture,
  "targetUrl" | "frameWarmupUrl"
> | null {
  if (!pending) return null;
  return { targetUrl: pending.targetUrl, frameWarmupUrl: pending.frameWarmupUrl };
}

export function completeTbActivitySelectorWebViewCaptureSuccess(
  payload: TbActivitySelectorHtmlCaptureMessage,
): void {
  if (!pending) return;
  const picked = pickBestActivitySelectorHtmlFromCapture(payload);
  const markers = activitySelectorHtmlMarkers(picked.html);
  clearTimeout(pending.timeoutId);
  const resolve = pending.resolve;
  pending = null;
  notify();

  resolve({
    html: picked.html,
    finalUrl: picked.finalUrl,
    title: picked.title,
    htmlLength: picked.html.length,
    source: "webview",
    captureFrameCount: 1 + (payload.frameHtmlList?.length ?? 0),
    containsTradeTask: markers.containsTradeTask,
    containsDropTask: markers.containsDropTask,
    containsScheduleTable: markers.containsScheduleTable,
  });
}

export function failTbActivitySelectorWebViewCapture(message: string): void {
  if (!pending) return;
  clearTimeout(pending.timeoutId);
  const reject = pending.reject;
  pending = null;
  notify();
  reject(new Error(message));
}

export function requestTbActivitySelectorWebViewCapture(opts: {
  targetUrl: string;
  frameWarmupUrl: string;
  timeoutMs?: number;
}): Promise<TbActivitySelectorWebViewCaptureResult> {
  if (pending) {
    return Promise.reject(new Error("TradeBoard activity selector WebView capture already in progress."));
  }

  fcDevMirrorScheduleLogToFile("FC_TB_ACTIVITY_SELECTOR_WEBVIEW_CAPTURE_START", {
    targetUrl: opts.targetUrl,
    frameWarmupUrl: opts.frameWarmupUrl,
  });

  return new Promise((resolve, reject) => {
    const timeoutMs = opts.timeoutMs ?? 55_000;
    const timeoutId = setTimeout(() => {
      if (!pending) return;
      failTbActivitySelectorWebViewCapture(
        `WebView activity selector capture timed out after ${Math.round(timeoutMs / 1000)}s. Refresh FLICA first.`,
      );
    }, timeoutMs);

    pending = {
      targetUrl: opts.targetUrl,
      frameWarmupUrl: opts.frameWarmupUrl,
      resolve,
      reject,
      timeoutId,
    };
    notify();
  });
}
