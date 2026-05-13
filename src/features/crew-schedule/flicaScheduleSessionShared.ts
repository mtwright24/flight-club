/**
 * Shared FLICA schedule-import WebView helpers (same strings/logic as import-flica-direct).
 * Used by schedule import screen and crew-hub pull refresh session runner.
 */

export function flicaTextHasTokenHint(s: string | undefined | null): boolean {
  if (s == null || !s.trim().length) return false;
  if (/scheduledetail\.cgi/i.test(s)) return true;
  if (s.includes("token=")) return true;
  if (/GO=1&token=/i.test(s)) return true;
  if (/BlockDate=/i.test(s)) return true;
  return false;
}

export type FlicaLoadscheduleDeepCapture = {
  type: "loadschedule_deep_capture";
  url: string;
  title: string;
  topOuterHtml: string;
  topBodyHtml: string;
  frameHtmlList: string[];
  iframeHtmlList: string[];
  frameSrcs: string[];
  iframeSrcs: string[];
  scriptSnippets: string[];
};

export function pickFirstFlicaTokenText(cap: FlicaLoadscheduleDeepCapture): { text: string; label: string } | null {
  const pairs: { text: string; label: string }[] = [
    { text: cap.topOuterHtml ?? "", label: "topOuterHtml" },
    { text: cap.topBodyHtml ?? "", label: "topBodyHtml" },
  ];
  (cap.frameHtmlList ?? []).forEach((h, i) => pairs.push({ text: h ?? "", label: `frame[${i}]` }));
  (cap.iframeHtmlList ?? []).forEach((h, i) => pairs.push({ text: h ?? "", label: `iframe[${i}]` }));
  (cap.scriptSnippets ?? []).forEach((h, i) => pairs.push({ text: h ?? "", label: `script[${i}]` }));
  for (const { text, label } of pairs) {
    if (flicaTextHasTokenHint(text)) return { text, label };
  }
  return null;
}

/** Step 3: one delay, then same-origin deep capture → `loadschedule_deep_capture`. */
export const FLICA_LOADSCHEDULE_POST_MS = 600;

export function buildInjectLoadScheduleDeepCaptureScript(): string {
  return `(function(){
  setTimeout(function(){
    try {
      var p = {
        type: 'loadschedule_deep_capture',
        url: (window.location && window.location.href) || '',
        title: (document && document.title) || '',
        topOuterHtml: document.documentElement ? document.documentElement.outerHTML : '',
        topBodyHtml: document.body ? document.body.innerHTML : '',
        frameSrcs: [],
        iframeSrcs: [],
        frameHtmlList: [],
        iframeHtmlList: [],
        scriptSnippets: []
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
            p.frameSrcs.push('(inaccessible window.frames[' + i + '])');
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
        p.iframeSrcs.push(String(src));
        try {
          fdoc = el.contentDocument;
          if (fdoc && fdoc.documentElement) {
            p.iframeHtmlList.push(String(fdoc.documentElement.outerHTML));
          } else {
            w = el.contentWindow;
            if (w && w.document && w.document.documentElement) {
              p.iframeHtmlList.push(String(w.document.documentElement.outerHTML));
            } else { p.iframeHtmlList.push(''); }
          }
        } catch (e) { p.iframeHtmlList.push(''); }
      }
      var sc = document.getElementsByTagName('script');
      for (i = 0; i < sc.length; i++) {
        var tx = (sc[i] && (sc[i].textContent || sc[i].innerText || sc[i].innerHTML)) || '';
        if (tx && /scheduledetail|token=|GO=1|BlockDate/i.test(tx)) p.scriptSnippets.push(String(tx));
      }
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(p));
      }
    } catch (e) {}
  }, ${FLICA_LOADSCHEDULE_POST_MS});
})(); true;`;
}

export const INJECT_POST_LOADSCHEDULE_HTML = buildInjectLoadScheduleDeepCaptureScript();

export const INJECT_FLICA_BRIDGE_PING = `(function(){
  try {
    var u = (typeof location !== 'undefined' && location.href) ? String(location.href) : '';
    var rec = 0;
    try {
      var ifr = document.querySelectorAll('iframe');
      for (var j = 0; j < ifr.length; j++) {
        var s = (ifr[j].src || (ifr[j].getAttribute && ifr[j].getAttribute('src')) || '').toLowerCase();
        if (s.indexOf('recaptcha') >= 0) rec += 1;
      }
    } catch (e2) {}
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'flica_bridge_ping', url: u, recaptchaFrameCount: rec }));
    }
  } catch (e) {}
})(); true;`;

export function buildFlicaUiLoginInjectScript(username: string, password: string): string {
  const u = JSON.stringify(username);
  const p = JSON.stringify(password);
  return `(function(){
    function postJson(o){
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {}
      }
    }
    function pickUserEl() {
      var d = document;
      if (!d || !d.querySelector) return null;
      return d.querySelector('#UserId') || d.querySelector('#userId') || d.querySelector('input[name="UserId"]') ||
        d.querySelector('input[name="userId"]') || d.querySelector('input[name="username"]') ||
        d.querySelector('input[autocomplete="username"]') || d.querySelector('input[type="email"]') ||
        d.querySelector('input[placeholder*="User" i]') || d.querySelector('input[placeholder*="ID" i]') ||
        d.querySelector('input[id*="UserId" i]') || d.querySelector('input[id*="userId" i]') ||
        d.querySelector('input[id*="username" i]');
    }
    function pickPassEl() {
      var d = document;
      if (!d || !d.querySelector) return null;
      return d.querySelector('#Password') || d.querySelector('#password') || d.querySelector('input[name="Password"]') ||
        d.querySelector('input[name="password"]') || d.querySelector('input[type="password"]') ||
        d.querySelector('input[autocomplete="current-password"]');
    }
    function pickSubmitEl() {
      var d = document;
      if (!d) return null;
      var b = d.querySelector('button[type="submit"]') || d.querySelector('input[type="submit"]') || d.querySelector('[type="submit"]');
      if (b) return b;
      var buttons = d.querySelectorAll('button');
      for (var i = 0; i < buttons.length; i++) {
        var t = (buttons[i].innerText || buttons[i].textContent || '').trim();
        if (/sign\\s*in|log\\s*in|continue|submit/i.test(t)) return buttons[i];
      }
      return null;
    }
    function setInputVal(el, val) {
      if (!el) return;
      try {
        var proto = el.constructor === window.HTMLInputElement ? HTMLInputElement.prototype : (el.constructor && el.constructor.prototype);
        if (proto && Object.getOwnPropertyDescriptor(proto, 'value')) {
          var desc = Object.getOwnPropertyDescriptor(proto, 'value');
          if (desc && desc.set) desc.set.call(el, val); else el.value = val;
        } else { el.value = val; }
      } catch (x) { el.value = val; }
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (y) {}
      try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (z) {}
    }
    if (window.__flicaUiLoginDidSubmit) { return; }
    setTimeout(function(){
      if (window.__flicaUiLoginDidSubmit) { return; }
      var uidEl = pickUserEl();
      var pwdEl = pickPassEl();
      postJson({
        type: 'flica_diag',
        url: String((typeof location !== 'undefined' && location.href) || ''),
        ready: (typeof document !== 'undefined' && document.readyState) || '',
        hasUser: !!uidEl,
        hasPass: !!pwdEl,
      });
      if (!uidEl || !pwdEl) {
        postJson({ type: 'flica_no_login_form' });
        return;
      }
      setInputVal(uidEl, ${u});
      setInputVal(pwdEl, ${p});
      setTimeout(function(){
        if (window.__flicaUiLoginDidSubmit) { return; }
        var btn = pickSubmitEl();
        if (btn) {
          try { btn.click(); } catch (e3) {}
          window.__flicaUiLoginDidSubmit = true;
          postJson({ type: 'flica_login_submitted' });
        } else {
          postJson({ type: 'flica_no_login_form' });
        }
      }, 500);
    }, 2000);
  })(); true;`;
}

export type FlowNav = { loadScheduleInjected: boolean };

export function resetFlowNav(refs: { current: FlowNav }): void {
  refs.current = { loadScheduleInjected: false };
}

export function isMainmenuAwaitingCaptcha(url: string): boolean {
  const u = (url ?? "").toLowerCase();
  if (!u.includes("mainmenu.cgi")) return false;
  if (u.includes("gohm=1")) return false;
  if (u.includes("loadschedule=true")) return false;
  return true;
}

/**
 * True when the WebView has reached FLICA content the user may need to interact with (CAPTCHA, login, menu),
 * as opposed to an intermediate home/redirect before the login UI.
 */
export function flicaUserInteractionSurfaceLikely(url: string, recaptchaFrameCount?: number): boolean {
  if (recaptchaFrameCount != null && recaptchaFrameCount > 0) return true;
  const u = (url ?? "").trim();
  if (!u) return false;
  const low = u.toLowerCase();
  if (low.includes("captcha")) return true;
  if (low.includes("mainmenu.cgi") || low.includes("leftmenu.cgi")) return true;
  if (low.includes("scheduledetail")) return true;
  if (low.includes("loadschedule") && low.includes("flica")) return true;
  if (low.includes("/ui/login") || low.includes("login/index") || /[?&/]login(?:\.html)?(?:\?|$)/i.test(low)) {
    return true;
  }
  if (/flica\.net/i.test(u) && /login|sign-?in|signin|userid|password/i.test(low)) {
    return true;
  }
  return false;
}
