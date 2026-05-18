/**
 * Hidden WebView DOM capture for TB_EditRequest.cgi (native fetch returns empty body).
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";

export type TbEditRequestHtmlCaptureMessage = {
  type: "tb_edit_request_html_capture";
  url: string;
  title: string;
  topOuterHtml: string;
  frameSrcs: string[];
  frameHtmlList: string[];
  ready: boolean;
};

export type TbEditRequestWebViewCaptureResult = {
  html: string;
  finalUrl: string;
  title: string;
  htmlLength: number;
  source: "webview";
  captureFrameCount: number;
  ready: boolean;
};

/** FLICA edit form markers — top doc or child frames. */
export function editRequestHtmlHasFormMarkers(html: string): boolean {
  const h = String(html ?? "");
  if (h.length < 400) return false;
  const low = h.toLowerCase();
  return (
    /name\s*=\s*["']editform["']/i.test(h) ||
    low.includes("commentfield") ||
    low.includes("presubmitcleanup") ||
    low.includes("update request info") ||
    low.includes("hdnpairingstring") ||
    low.includes("tb_editrequest")
  );
}

function scoreEditRequestHtmlCandidate(html: string): number {
  const h = String(html ?? "");
  if (!h.length) return 0;
  let score = Math.min(h.length / 200, 40);
  if (editRequestHtmlHasFormMarkers(h)) score += 120;
  if (/name\s*=\s*["']editform["']/i.test(h)) score += 80;
  if (h.toLowerCase().includes("commentfield")) score += 40;
  if (h.toLowerCase().includes("tradetype")) score += 30;
  return score;
}

export function pickBestEditRequestHtmlFromCapture(
  payload: TbEditRequestHtmlCaptureMessage,
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
  let bestScore = scoreEditRequestHtmlCandidate(best.html);
  for (const c of candidates) {
    const sc = scoreEditRequestHtmlCandidate(c.html);
    if (sc > bestScore) {
      best = c;
      bestScore = sc;
    }
  }

  return {
    html: best.html ?? "",
    finalUrl: best.url || payload.url,
    title: payload.title ?? "",
    ready:
      payload.ready &&
      (editRequestHtmlHasFormMarkers(best.html) || scoreEditRequestHtmlCandidate(best.html) > 80),
  };
}

const CAPTURE_POLL_MS = 500;
const CAPTURE_MAX_WAIT_MS = 12_000;

export function buildInjectTradeboardEditRequestHtmlCaptureScript(): string {
  return `(function(){
  function pageReady() {
    try {
      var html = document.documentElement ? document.documentElement.outerHTML : '';
      var low = html.toLowerCase();
      var hasForm = /name\\s*=\\s*["']editform["']/i.test(html);
      var hasComment = low.indexOf('commentfield') >= 0;
      var hasPreSubmit = low.indexOf('presubmitcleanup') >= 0;
      var hasUpdate = low.indexOf('update request info') >= 0;
      var hasPair = low.indexOf('hdnpairingstring') >= 0;
      var hasTb = low.indexOf('tb_editrequest') >= 0;
      return hasForm || hasComment || hasPreSubmit || hasUpdate || hasPair || hasTb;
    } catch (e) { return false; }
  }
  function captureNow(ready) {
    var frameUrl = (window.location && window.location.href) || '';
    var p = {
      type: 'tb_edit_request_html_capture',
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
  resolve: (r: TbEditRequestWebViewCaptureResult) => void;
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

export function subscribeTbEditRequestWebViewCapture(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTbEditRequestWebViewCapturePending(): Pick<
  PendingCapture,
  "targetUrl" | "frameWarmupUrl"
> | null {
  if (!pending) return null;
  return { targetUrl: pending.targetUrl, frameWarmupUrl: pending.frameWarmupUrl };
}

export function completeTbEditRequestWebViewCaptureSuccess(
  payload: TbEditRequestHtmlCaptureMessage,
): void {
  if (!pending) return;
  const picked = pickBestEditRequestHtmlFromCapture(payload);
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

export function failTbEditRequestWebViewCapture(message: string): void {
  if (!pending) return;
  clearTimeout(pending.timeoutId);
  const reject = pending.reject;
  pending = null;
  notify();
  reject(new Error(message));
}

export function requestTbEditRequestWebViewCapture(opts: {
  targetUrl: string;
  frameWarmupUrl: string;
  timeoutMs?: number;
}): Promise<TbEditRequestWebViewCaptureResult> {
  if (pending) {
    return Promise.reject(
      new Error("TradeBoard Edit Request WebView capture already in progress."),
    );
  }
  fcDevMirrorScheduleLogToFile("FC_TB_EDIT_REQUEST_WEBVIEW_CAPTURE_START", {
    targetUrl: opts.targetUrl,
    frameWarmupUrl: opts.frameWarmupUrl,
  });
  return new Promise((resolve, reject) => {
    const timeoutMs = opts.timeoutMs ?? 55_000;
    const timeoutId = setTimeout(() => {
      if (!pending) return;
      failTbEditRequestWebViewCapture(
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
