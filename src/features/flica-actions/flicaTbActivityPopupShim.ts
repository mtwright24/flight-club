/**
 * FLICA TradeBoard / ottrade popup shim for React Native WebView.
 * Intercepts window.open / popup() and navigates named frames in-place instead of blocking.
 */

export type FlicaPopupShimMode = "recorder" | "tb_capture";

function buildPopupShimInject(mode: FlicaPopupShimMode): string {
  const captureMode = mode === "recorder" ? "recorder" : "tb_capture";
  return `
(function() {
  var FLAG = '__flicaTbPopupShimV2';
  var MODE = '${captureMode}';
  if (window[FLAG]) return;
  window[FLAG] = true;

  var KNOWN_FRAME_NAMES = ['TB_body', 'tb_body', 'tbAction', 'TBAction', 'pairWin', 'PairWin', 'main', 'menu'];

  function resolveAbs(raw, base) {
    try {
      return new URL(String(raw || ''), base || document.location.href).href;
    } catch (e) {
      return String(raw || '');
    }
  }

  function postMsg(payload) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (e) {}
  }

  function collectFrameUrls(win, depth, acc) {
    if (!win || depth > 14) return;
    try {
      acc.push({ name: '', href: win.location.href });
    } catch (e0) {}
    var n = 0;
    try { n = win.frames ? win.frames.length : 0; } catch (e1) { n = 0; }
    for (var i = 0; i < n; i++) {
      try {
        var fw = win.frames[i];
        var nm = '';
        try {
          if (fw.frameElement) nm = fw.frameElement.name || fw.frameElement.id || ('frame' + i);
        } catch (e2) {}
        try { acc.push({ name: nm, href: fw.location.href }); } catch (e3) {
          acc.push({ name: nm, href: '' });
        }
        collectFrameUrls(fw, depth + 1, acc);
      } catch (e4) {}
    }
  }

  function fnSource(fn, maxLen) {
    if (typeof fn !== 'function') return '';
    try {
      var s = String(fn);
      return s.length > (maxLen || 2400) ? s.substring(0, maxLen || 2400) : s;
    } catch (e) {
      return '';
    }
  }

  function collectHandlerSources(win) {
    var out = {
      tradeTask: '',
      goNext: '',
      cancelFn: '',
      popupFn: '',
      windowOpenFn: '',
      frameNames: [],
      frameUrls: []
    };
    var chain = [];
    var w = win;
    while (w) {
      chain.push(w);
      if (!w.parent || w.parent === w) break;
      w = w.parent;
    }
    try { if (win.top && chain.indexOf(win.top) < 0) chain.push(win.top); } catch (e0) {}
    for (var i = 0; i < chain.length; i++) {
      try {
        if (typeof chain[i].TradeTask === 'function' && !out.tradeTask) {
          out.tradeTask = fnSource(chain[i].TradeTask, 2000);
        }
        if (typeof chain[i].goNext === 'function' && !out.goNext) {
          out.goNext = fnSource(chain[i].goNext, 2000);
        }
        if (typeof chain[i].cancel === 'function' && !out.cancelFn) {
          out.cancelFn = fnSource(chain[i].cancel, 2000);
        }
        if (typeof chain[i].Cancel === 'function' && !out.cancelFn) {
          out.cancelFn = fnSource(chain[i].Cancel, 2000);
        }
        if (typeof chain[i].popup === 'function' && !out.popupFn) {
          out.popupFn = fnSource(chain[i].popup, 2000);
        }
        if (typeof chain[i].open === 'function' && chain[i] === chain[i].window && !out.windowOpenFn) {
          out.windowOpenFn = fnSource(chain[i].open, 1200);
        }
      } catch (e1) {}
    }
    var urls = [];
    try { collectFrameUrls(win.top || win, 0, urls); } catch (e2) { urls = []; }
    out.frameUrls = urls;
    for (var u = 0; u < urls.length; u++) {
      if (urls[u].name) out.frameNames.push(urls[u].name);
    }
    for (var k = 0; k < KNOWN_FRAME_NAMES.length; k++) {
      if (out.frameNames.indexOf(KNOWN_FRAME_NAMES[k]) < 0) out.frameNames.push(KNOWN_FRAME_NAMES[k]);
    }
    return out;
  }

  function findNamedFrame(win, targetName) {
    var name = String(targetName || '').trim();
    if (!name || name === '_blank' || name === '_self' || name === '_parent' || name === '_top') {
      return { win: null, strategy: name || '' };
    }
    var topW = win;
    try { topW = win.top || win; } catch (e0) { topW = win; }
    try {
      if (topW.frames && topW.frames[name] && topW.frames[name].location) {
        return { win: topW.frames[name], strategy: 'frames[' + name + ']' };
      }
    } catch (e1) {}
    var stack = [topW];
    var seen = [];
    while (stack.length) {
      var cur = stack.pop();
      if (seen.indexOf(cur) >= 0) continue;
      seen.push(cur);
      var n = 0;
      try { n = cur.frames ? cur.frames.length : 0; } catch (e2) { n = 0; }
      for (var i = 0; i < n; i++) {
        try {
          var fw = cur.frames[i];
          var nm = '';
          try {
            if (fw.frameElement) nm = fw.frameElement.name || fw.frameElement.id || '';
          } catch (e3) {}
          if (nm && nm.toLowerCase() === name.toLowerCase()) {
            return { win: fw, strategy: 'frameElement:' + nm };
          }
          stack.push(fw);
        } catch (e4) {}
      }
    }
    return { win: null, strategy: 'not_found:' + name };
  }

  function navigateInPlace(absUrl, target, openerWin, via) {
    var urlsBefore = [];
    try { collectFrameUrls(openerWin.top || openerWin, 0, urlsBefore); } catch (e0) { urlsBefore = []; }
    var t = String(target || '').trim();
    var navigated = false;
    var strategy = via || 'unknown';
    try {
      if (!t || t === '_self') {
        openerWin.location.href = absUrl;
        navigated = true;
        strategy = 'self';
      } else if (t === '_parent' && openerWin.parent && openerWin.parent !== openerWin) {
        openerWin.parent.location.href = absUrl;
        navigated = true;
        strategy = 'parent';
      } else if (t === '_top') {
        (openerWin.top || openerWin).location.href = absUrl;
        navigated = true;
        strategy = 'top';
      } else {
        var found = findNamedFrame(openerWin, t);
        if (found.win) {
          found.win.location.href = absUrl;
          navigated = true;
          strategy = found.strategy;
        }
      }
    } catch (e1) {}
    if (!navigated) {
      try {
        (openerWin.top || openerWin).location.href = absUrl;
        navigated = true;
        strategy = 'top_fallback';
      } catch (e2) {}
    }
    postMsg({
      type: 'flica_window_open',
      absoluteUrl: absUrl,
      target: t,
      strategy: strategy,
      navigatedInPlace: navigated,
      shimMode: MODE,
      frameUrlsBefore: urlsBefore.map(function(f) { return f.href; }),
      timestamp: new Date().toISOString()
    });
    setTimeout(function() {
      var urlsAfter = [];
      try { collectFrameUrls(openerWin.top || openerWin, 0, urlsAfter); } catch (eA) { urlsAfter = []; }
      postMsg({
        type: 'flica_window_open_after',
        absoluteUrl: absUrl,
        target: t,
        strategy: strategy,
        frameUrlsAfter: urlsAfter.map(function(f) { return f.href; }),
        shimMode: MODE
      });
    }, 400);
    return navigated;
  }

  function makeFakeWindow(absUrl, target, openerWin) {
    var closed = false;
    var locHref = absUrl || 'about:blank';
    var loc = {
      href: locHref,
      assign: function(u) { locHref = resolveAbs(u, locHref); navigateInPlace(locHref, target, openerWin, 'fake.assign'); },
      replace: function(u) { locHref = resolveAbs(u, locHref); navigateInPlace(locHref, target, openerWin, 'fake.replace'); },
      toString: function() { return locHref; }
    };
    try {
      Object.defineProperty(loc, 'href', {
        get: function() { return locHref; },
        set: function(u) {
          locHref = resolveAbs(u, locHref);
          navigateInPlace(locHref, target, openerWin, 'fake.href_set');
        },
        configurable: true
      });
    } catch (eProp) {}
    var stubDoc = {
      location: loc,
      write: function() {},
      writeln: function() {},
      close: function() {},
      open: function() { return stubDoc; }
    };
    var fakeWin = {
      closed: false,
      opener: openerWin,
      parent: openerWin.parent || openerWin,
      top: openerWin.top || openerWin,
      name: String(target || ''),
      location: loc,
      document: stubDoc,
      focus: function() { return fakeWin; },
      close: function() { closed = true; fakeWin.closed = true; },
      blur: function() {},
      postMessage: function() {},
      frames: openerWin.frames || [],
      self: null
    };
    fakeWin.self = fakeWin;
    return fakeWin;
  }

  function handleOpen(rawUrl, target, features, width, height, via) {
    var base = document.location.href;
    var absUrl = resolveAbs(rawUrl, base);
    var t = String(target || '');
    var feat = String(features || '');
    if (width) feat += (feat ? ',' : '') + 'width=' + width;
    if (height) feat += (feat ? ',' : '') + 'height=' + height;
    navigateInPlace(absUrl, t, window, via || 'open');
    return makeFakeWindow(absUrl, t, window);
  }

  function patchWindow(win) {
    if (!win || win.__flicaTbPopupPatched) return;
    win.__flicaTbPopupPatched = true;
    try {
      win.open = function(url, target, features) {
        return handleOpen.call(win, url, target, features, null, null, 'window.open');
      };
    } catch (e0) {}
    function hookPopup() {
      try {
        if (typeof win.popup !== 'function') return;
        if (win.popup.__flicaTbPopupHooked) return;
        var orig = win.popup;
        win.popup = function(url, name, features, w, h) {
          return handleOpen.call(win, url, name, features, w, h, 'popup');
        };
        win.popup.__flicaTbPopupHooked = true;
        win.popup.__flicaOrigSource = fnSource(orig, 2000);
      } catch (e1) {}
    }
    hookPopup();
    try {
      var nativeAlert = win.alert;
      win.alert = function(msg) {
        var text = String(msg || '');
        var low = text.toLowerCase();
        if (low.indexOf('popup') >= 0 && (low.indexOf('block') >= 0 || low.indexOf('blocked') >= 0)) {
          var sources = collectHandlerSources(win);
          postMsg({
            type: 'flica_popup_blocked',
            message: text,
            shimMode: MODE,
            sources: sources,
            frameUrlsBefore: sources.frameUrls.map(function(f) { return f.href; }),
            timestamp: new Date().toISOString()
          });
          return;
        }
        try { return nativeAlert.apply(win, arguments); } catch (eA) {}
      };
    } catch (e2) {}
    try {
      var n = win.frames ? win.frames.length : 0;
      for (var i = 0; i < n; i++) {
        try { patchWindow(win.frames[i]); } catch (e3) {}
      }
    } catch (e4) {}
  }

  try {
    window.__flicaCollectHandlerSources = function() {
      return collectHandlerSources(window);
    };
  } catch (eExpose) {}

  patchWindow(window);
  try {
    document.addEventListener('DOMContentLoaded', function() {
      patchWindow(window);
      var els = document.querySelectorAll('iframe,frame');
      for (var i = 0; i < els.length; i++) {
        try {
          var cw = els[i].contentWindow;
          if (cw) patchWindow(cw);
        } catch (e5) {}
      }
    });
  } catch (e6) {}
  var tries = 0;
  var iv = setInterval(function() {
    patchWindow(window);
    try {
      var topW = window.top || window;
      patchWindow(topW);
    } catch (e7) {}
    if (++tries > 40) clearInterval(iv);
  }, 350);
})();
true;
`;
}

/** Full popup/frame shim for hidden TB activity capture WebView. */
export const INJECT_FLICA_TB_ACTIVITY_POPUP_SHIM = buildPopupShimInject("tb_capture");

/** Same shim for Settings FLICA Action Recorder (in-place navigation + diagnostics). */
export const INJECT_FLICA_RECORDER_POPUP_SHIM = buildPopupShimInject("recorder");
