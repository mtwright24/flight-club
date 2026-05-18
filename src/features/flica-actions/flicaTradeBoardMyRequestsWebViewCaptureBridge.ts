/**
 * Hidden WebView DOM capture for TB_MyRequests.cgi (Edit/Delete reqId in live DOM).
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";

export type TbMyRequestsHtmlCaptureMessage = {
  type: "tb_my_requests_html_capture";
  url: string;
  title: string;
  topOuterHtml: string;
  frameSrcs: string[];
  frameHtmlList: string[];
  ready: boolean;
};

export type TbMyRequestsWebViewCaptureResult = {
  html: string;
  finalUrl: string;
  title: string;
  htmlLength: number;
  source: "webview";
  captureFrameCount: number;
  ready: boolean;
};

export function myRequestsHtmlHasActionMarkers(html: string): boolean {
  const h = String(html ?? "");
  if (h.length < 400) return false;
  const low = h.toLowerCase();
  const hasPage =
    low.includes("my requests") ||
    low.includes("tb_myrequests") ||
    low.includes("tradeboard");
  const hasAction =
    low.includes("deleteme=") ||
    low.includes("tb_editrequest") ||
    /\bname\s*=\s*["']del\d+["']/i.test(h) ||
    /(?:^|[?&])reqid=\d+/i.test(h) ||
    /editrequest\s*\(\s*\d+\s*\)/i.test(h) ||
    /deleterequest\s*\(\s*\d+\s*,/i.test(h);
  return hasPage && hasAction;
}

export function myRequestsHtmlHasRowText(html: string): boolean {
  const h = String(html ?? "");
  return /\bJ[A-Z0-9]{3,5}\s*(?::|&#58;)?\s*\d{1,2}[A-Z]{3}\b/i.test(h);
}

function scoreMyRequestsHtmlCandidate(html: string): number {
  const h = String(html ?? "");
  if (!h.length) return 0;
  let score = Math.min(h.length / 200, 40);
  if (myRequestsHtmlHasActionMarkers(h)) score += 120;
  if (myRequestsHtmlHasRowText(h)) score += 40;
  if (h.toLowerCase().includes("edit") && h.toLowerCase().includes("delete")) score += 20;
  return score;
}

export function pickBestMyRequestsHtmlFromCapture(
  payload: TbMyRequestsHtmlCaptureMessage,
): { html: string; finalUrl: string; title: string; ready: boolean } {
  const candidates: { html: string; url: string }[] = [
    { html: payload.topOuterHtml ?? "", url: payload.url ?? "" },
  ];
  const frames = payload.frameHtmlList ?? [];
  const srcs = payload.frameSrcs ?? [];
  for (let i = 0; i < frames.length; i++) {
    candidates.push({ html: frames[i] ?? "", url: srcs[i] ?? "" });
  }

  let best = candidates[0] ?? { html: "", url: payload.url ?? "" };
  let bestScore = scoreMyRequestsHtmlCandidate(best.html);
  for (const c of candidates) {
    const sc = scoreMyRequestsHtmlCandidate(c.html);
    if (sc > bestScore) {
      best = c;
      bestScore = sc;
    }
  }

  return {
    html: best.html ?? "",
    finalUrl: best.url || payload.url,
    title: payload.title ?? "",
    ready: payload.ready && (myRequestsHtmlHasActionMarkers(best.html) || scoreMyRequestsHtmlCandidate(best.html) > 80),
  };
}

const CAPTURE_POLL_MS = 500;
const CAPTURE_MAX_WAIT_MS = 12_000;

export function buildInjectTradeboardMyRequestsHtmlCaptureScript(): string {
  return `(function(){
  function pageReady() {
    try {
      var html = document.documentElement ? document.documentElement.outerHTML : '';
      var low = html.toLowerCase();
      var hasTb = low.indexOf('tradeboard') >= 0 || low.indexOf('my requests') >= 0 || low.indexOf('tb_myrequests') >= 0;
      var hasAction = low.indexOf('deleteme=') >= 0 || low.indexOf('tb_editrequest') >= 0 || /name=["']del\\d+["']/i.test(html) || /reqid=\\d+/i.test(html);
      var hasPair = /\\bJ[A-Z0-9]{3,5}\\s*(?::|&#58;)?\\s*\\d{1,2}[A-Z]{3}\\b/i.test(html);
      return hasTb && hasPair && (hasAction || html.length > 2500);
    } catch (e) { return false; }
  }
  function captureNow(ready) {
    var frameUrl = (window.location && window.location.href) || '';
    var p = {
      type: 'tb_my_requests_html_capture',
      url: frameUrl,
      title: (document && document.title) || '',
      topOuterHtml: document.documentElement ? document.documentElement.outerHTML : '',
      frameSrcs: [],
      frameHtmlList: [],
      ready: !!ready
    };
    var i, el, fdoc, src, w;
    if (typeof window.length === 'number') {
      for (i = 0; i < window.length; i++) {
        try {
          w = window.frames[i];
          src = w && w.location && w.location.href ? String(w.location.href) : '';
          p.frameSrcs.push(src);
          if (w && w.document && w.document.documentElement) {
            p.frameHtmlList.push(String(w.document.documentElement.outerHTML));
          } else { p.frameHtmlList.push(''); }
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
        if (fdoc && fdoc.documentElement) p.frameHtmlList.push(String(fdoc.documentElement.outerHTML));
        else p.frameHtmlList.push('');
      } catch (e) { p.frameHtmlList.push(''); }
    }
    n = document.querySelectorAll('iframe');
    for (i = 0; i < n.length; i++) {
      el = n[i];
      src = el.src || el.getAttribute('src') || '';
      p.frameSrcs.push(String(src));
      try {
        fdoc = el.contentDocument;
        if (fdoc && fdoc.documentElement) {
          p.frameHtmlList.push(String(fdoc.documentElement.outerHTML));
        } else {
          w = el.contentWindow;
          if (w && w.document && w.document.documentElement) {
            p.frameHtmlList.push(String(w.document.documentElement.outerHTML));
          } else { p.frameHtmlList.push(''); }
        }
      } catch (e) { p.frameHtmlList.push(''); }
    }
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(p));
    }
  }
  var started = Date.now();
  function poll() {
    var ready = pageReady();
    if (ready || Date.now() - started >= ${CAPTURE_MAX_WAIT_MS}) {
      captureNow(ready);
      return;
    }
    setTimeout(poll, ${CAPTURE_POLL_MS});
  }
  poll();
})(); true;`;
}

type PendingCapture = {
  targetUrl: string;
  frameWarmupUrl: string;
  resolve: (r: TbMyRequestsWebViewCaptureResult) => void;
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

export function subscribeTbMyRequestsWebViewCapture(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTbMyRequestsWebViewCapturePending(): Pick<
  PendingCapture,
  "targetUrl" | "frameWarmupUrl"
> | null {
  if (!pending) return null;
  return { targetUrl: pending.targetUrl, frameWarmupUrl: pending.frameWarmupUrl };
}

export function completeTbMyRequestsWebViewCaptureSuccess(
  payload: TbMyRequestsHtmlCaptureMessage,
): void {
  if (!pending) return;
  const picked = pickBestMyRequestsHtmlFromCapture(payload);
  const frameCount = 1 + (payload.frameHtmlList?.length ?? 0);
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
    captureFrameCount: frameCount,
    ready: picked.ready,
  });
}

export function failTbMyRequestsWebViewCapture(message: string): void {
  if (!pending) return;
  clearTimeout(pending.timeoutId);
  const reject = pending.reject;
  pending = null;
  notify();
  reject(new Error(message));
}

export function requestTbMyRequestsWebViewCapture(opts: {
  targetUrl: string;
  frameWarmupUrl: string;
  timeoutMs?: number;
}): Promise<TbMyRequestsWebViewCaptureResult> {
  if (pending) {
    return Promise.reject(
      new Error("TradeBoard My Requests WebView capture already in progress."),
    );
  }
  return new Promise((resolve, reject) => {
    const timeoutMs = opts.timeoutMs ?? 55_000;
    const timeoutId = setTimeout(() => {
      if (!pending) return;
      failTbMyRequestsWebViewCapture(
        `WebView capture timed out after ${Math.round(timeoutMs / 1000)}s. Refresh FLICA first.`,
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
