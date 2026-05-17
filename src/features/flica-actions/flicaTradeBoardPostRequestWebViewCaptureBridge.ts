/**
 * Promise bridge for hidden WebView DOM capture of TradeBoard Post Request form HTML.
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import type { TbPostRequestCapturedFormWire } from "./flicaTradeBoardPostRequestCapturedForm";

export type TbPostRequestHtmlCaptureMessage = {
  type: "tb_post_request_html_capture";
  url: string;
  title: string;
  topOuterHtml: string;
  frameSrcs: string[];
  frameHtmlList: string[];
  /** Best post-request form metadata from top document or child frames. */
  capturedForm: TbPostRequestCapturedFormWire | null;
};

export type TbPostWebViewCaptureResult = {
  html: string;
  finalUrl: string;
  title: string;
  htmlLength: number;
  source: "webview";
  captureFrameCount: number;
  capturedForm: TbPostRequestCapturedFormWire | null;
};

export function tradeboardPostRequestHtmlHasFormMarkers(html: string): boolean {
  const h = String(html ?? "");
  if (h.length < 500) return false;
  const l = h.toLowerCase();
  return (
    l.includes("tradetype") ||
    l.includes("commentfield") ||
    l.includes("tb_postrequest") ||
    l.includes("selbase") ||
    (l.includes("<form") && l.includes("postrequest"))
  );
}

export function pickBestPostRequestHtmlFromCapture(
  payload: TbPostRequestHtmlCaptureMessage,
): {
  html: string;
  finalUrl: string;
  title: string;
  capturedForm: TbPostRequestCapturedFormWire | null;
} {
  const candidates: {
    html: string;
    url: string;
    capturedForm: TbPostRequestCapturedFormWire | null;
  }[] = [
    {
      html: payload.topOuterHtml ?? "",
      url: payload.url ?? "",
      capturedForm: payload.capturedForm ?? null,
    },
  ];
  const frames = payload.frameHtmlList ?? [];
  const srcs = payload.frameSrcs ?? [];
  for (let i = 0; i < frames.length; i++) {
    candidates.push({ html: frames[i] ?? "", url: srcs[i] ?? "", capturedForm: null });
  }

  for (const c of candidates) {
    if (tradeboardPostRequestHtmlHasFormMarkers(c.html)) {
      return {
        html: c.html,
        finalUrl: c.url || payload.url,
        title: payload.title ?? "",
        capturedForm: c.capturedForm ?? payload.capturedForm ?? null,
      };
    }
  }

  let best = candidates[0] ?? { html: "", url: payload.url ?? "", capturedForm: null };
  for (const c of candidates) {
    if ((c.html?.length ?? 0) > (best.html?.length ?? 0)) best = c;
  }
  return {
    html: best.html ?? "",
    finalUrl: best.url || payload.url,
    title: payload.title ?? "",
    capturedForm: payload.capturedForm ?? best.capturedForm ?? null,
  };
}

const CAPTURE_DELAY_MS = 900;

export function buildInjectTradeboardPostRequestHtmlCaptureScript(): string {
  return `(function(){
  function resolveUrl(raw, base) {
    try { return new URL(String(raw || ''), String(base || '')).href; } catch (e) { return String(raw || ''); }
  }
  function readSubmitControl(el) {
    if (!el) return null;
    var tag = (el.tagName || '').toLowerCase();
    var type = (el.getAttribute('type') || (tag === 'button' ? 'submit' : 'submit')).toLowerCase();
  return {
      name: el.getAttribute('name') || '',
      value: el.value != null ? String(el.value) : String(el.textContent || '').trim(),
      type: type
    };
  }
  function scorePostForm(f) {
    var score = 0;
    var action = (f.getAttribute('action') || '').toLowerCase();
    var html = (f.innerHTML || '').toLowerCase();
    if (action.indexOf('postrequest') >= 0 || action.indexOf('tb_post') >= 0) score += 150;
    if (html.indexOf('tradetype') >= 0) score += 80;
    if (html.indexOf('commentfield') >= 0) score += 60;
    if (html.indexOf('selbase') >= 0) score += 40;
    if (html.indexOf('cbmessages') >= 0 || html.indexOf('rflica') >= 0) score += 30;
    if (html.indexOf('rempairindex') >= 0 || html.indexOf('pairdate') >= 0) score += 25;
    var submits = f.querySelectorAll('input[type="submit"], button[type="submit"], input[type="image"], button');
    for (var si = 0; si < submits.length; si++) {
      var el = submits[si];
      var nm = (el.getAttribute('name') || '').toLowerCase();
      var val = (el.value != null ? String(el.value) : String(el.textContent || '')).toLowerCase();
      if (nm.indexOf('postrequest') >= 0 || val.indexOf('post request') >= 0) score += 120;
    }
    return score;
  }
  function extractCapturedForm(doc, frameUrl) {
    if (!doc) return null;
    var forms = doc.querySelectorAll('form');
    var best = null, bestScore = -1;
    for (var fi = 0; fi < forms.length; fi++) {
      var sc = scorePostForm(forms[fi]);
      if (sc > bestScore) { best = forms[fi]; bestScore = sc; }
    }
    if (!best || bestScore < 30) return null;
    var actionRaw = best.getAttribute('action') || '';
    var method = (best.getAttribute('method') || 'POST').toUpperCase();
    var submitControls = [];
    var submitButton = null;
    var submits = best.querySelectorAll('input[type="submit"], button[type="submit"], input[type="image"], button');
    for (var sj = 0; sj < submits.length; sj++) {
      var ctrl = readSubmitControl(submits[sj]);
      if (!ctrl) continue;
      submitControls.push(ctrl);
      if (!submitButton) submitButton = ctrl;
      var nm = (ctrl.name || '').toLowerCase();
      var val = (ctrl.value || '').toLowerCase();
      if (nm.indexOf('postrequest') >= 0 || val.indexOf('post request') >= 0) submitButton = ctrl;
    }
    var hiddenFields = [];
    var hiddens = best.querySelectorAll('input[type="hidden"]');
    for (var hi = 0; hi < hiddens.length; hi++) {
      var h = hiddens[hi];
      var hn = h.getAttribute('name');
      if (!hn) continue;
      hiddenFields.push({ name: hn, value: h.value != null ? String(h.value) : '' });
    }
    return {
      actionRaw: actionRaw,
      actionResolved: resolveUrl(actionRaw, frameUrl),
      frameUrl: frameUrl,
      method: method,
      submitButton: submitButton,
      submitControls: submitControls,
      hiddenFields: hiddenFields
    };
  }
  function pickBestCaptured(list) {
    var best = null, bestScore = -1;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c) continue;
      var sc = 0;
      var a = (c.actionRaw || '').toLowerCase();
      if (a.indexOf('postrequest') >= 0 || a.indexOf('tb_post') >= 0) sc += 150;
      if (c.hiddenFields && c.hiddenFields.length > 5) sc += 40;
      if (c.submitButton && c.submitButton.name) sc += 30;
      if (sc > bestScore) { best = c; bestScore = sc; }
    }
    return best;
  }
  setTimeout(function(){
    try {
      var frameUrl = (window.location && window.location.href) || '';
      var capturedCandidates = [];
      var topCap = extractCapturedForm(document, frameUrl);
      if (topCap) capturedCandidates.push(topCap);
      var p = {
        type: 'tb_post_request_html_capture',
        url: frameUrl,
        title: (document && document.title) || '',
        topOuterHtml: document.documentElement ? document.documentElement.outerHTML : '',
        frameSrcs: [],
        frameHtmlList: [],
        capturedForm: null
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
              var fcW = extractCapturedForm(w.document, src || frameUrl);
              if (fcW) capturedCandidates.push(fcW);
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
          if (fdoc && fdoc.documentElement) {
            p.frameHtmlList.push(String(fdoc.documentElement.outerHTML));
            var fc2 = extractCapturedForm(fdoc, src || frameUrl);
            if (fc2) capturedCandidates.push(fc2);
          } else p.frameHtmlList.push('');
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
            var fc3 = extractCapturedForm(fdoc, src || frameUrl);
            if (fc3) capturedCandidates.push(fc3);
          } else {
            w = el.contentWindow;
            if (w && w.document && w.document.documentElement) {
              p.frameHtmlList.push(String(w.document.documentElement.outerHTML));
              var fc4 = extractCapturedForm(w.document, src || frameUrl);
              if (fc4) capturedCandidates.push(fc4);
            } else { p.frameHtmlList.push(''); }
          }
        } catch (e) { p.frameHtmlList.push(''); }
      }
      p.capturedForm = pickBestCaptured(capturedCandidates);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(p));
      }
    } catch (e) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'tb_post_request_html_capture_error',
          message: e && e.message ? String(e.message) : 'capture_failed'
        }));
      }
    }
  }, ${CAPTURE_DELAY_MS});
})(); true;`;
}

type PendingCapture = {
  targetUrl: string;
  frameWarmupUrl: string;
  resolve: (r: TbPostWebViewCaptureResult) => void;
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

export function subscribeTbPostWebViewCapture(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTbPostWebViewCapturePending(): Pick<
  PendingCapture,
  "targetUrl" | "frameWarmupUrl"
> | null {
  if (!pending) return null;
  return { targetUrl: pending.targetUrl, frameWarmupUrl: pending.frameWarmupUrl };
}

export function completeTbPostWebViewCaptureSuccess(payload: TbPostRequestHtmlCaptureMessage): void {
  if (!pending) return;
  const picked = pickBestPostRequestHtmlFromCapture(payload);
  const frameCount = 1 + (payload.frameHtmlList?.length ?? 0);
  clearTimeout(pending.timeoutId);
  const resolve = pending.resolve;
  pending = null;
  notify();
  fcDevMirrorScheduleLogToFile("FC_TB_POST_FORM_CAPTURED_SUBMIT", {
    hasCapturedForm: Boolean(payload.capturedForm?.actionResolved),
    actionRaw: payload.capturedForm?.actionRaw ?? "",
    actionResolved: payload.capturedForm?.actionResolved ?? "",
    frameUrl: payload.capturedForm?.frameUrl ?? "",
    method: payload.capturedForm?.method ?? "",
    submitButton: payload.capturedForm?.submitButton ?? null,
    submitControlCount: payload.capturedForm?.submitControls?.length ?? 0,
    hiddenFieldCount: payload.capturedForm?.hiddenFields?.length ?? 0,
  });

  resolve({
    html: picked.html,
    finalUrl: picked.finalUrl,
    title: picked.title,
    htmlLength: picked.html.length,
    source: "webview",
    captureFrameCount: frameCount,
    capturedForm: picked.capturedForm ?? payload.capturedForm ?? null,
  });
}

export function failTbPostWebViewCapture(message: string): void {
  if (!pending) return;
  clearTimeout(pending.timeoutId);
  const reject = pending.reject;
  pending = null;
  notify();
  reject(new Error(message));
}

export function requestTbPostWebViewCapture(opts: {
  targetUrl: string;
  frameWarmupUrl: string;
  timeoutMs?: number;
}): Promise<TbPostWebViewCaptureResult> {
  if (pending) {
    return Promise.reject(new Error("TradeBoard post-request WebView capture already in progress."));
  }
  return new Promise((resolve, reject) => {
    const timeoutMs = opts.timeoutMs ?? 50_000;
    const timeoutId = setTimeout(() => {
      if (!pending) return;
      fcDevMirrorScheduleLogToFile("FC_TB_POST_FORM_WEBVIEW_HTML_CAPTURE", {
        ok: false,
        error: "timeout",
        timeoutMs,
      });
      failTbPostWebViewCapture(
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
