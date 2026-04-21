/**
 * TEMP PoC — FLICA bundles FontFaceObserver; WKWebView often hits "6000ms timeout exceeded".
 * LogBox still reports unhandled rejections even with preventDefault, so we patch the source:
 * intercept window.FontFaceObserver assignment, wrap prototype.load, and harden document.fonts.load.
 */
function buildShim(pollMax: number): string {
  return `
(function(){
  var TAG = '__flicaPocFont';
  function isTimeoutErr(err) {
    if (err == null) return false;
    var m = typeof err === 'string' ? err : (err.message || String(err));
    return /\\d*ms?\\s*timeout\\s+exceeded/i.test(m) || /timeout\\s+exceeded/i.test(m);
  }
  function wrapLoadFn(orig) {
    return function() {
      var p = orig.apply(this, arguments);
      if (!p || typeof p.then !== 'function') return p;
      return p.catch(function(err) {
        if (isTimeoutErr(err)) return undefined;
        return Promise.reject(err);
      });
    };
  }
  function patchFontFaceObserverCtor(F) {
    try {
      if (typeof F !== 'function' || !F.prototype) return F;
      var ol = F.prototype.load;
      if (typeof ol !== 'function' || ol[TAG]) return F;
      F.prototype.load = wrapLoadFn(ol);
      F.prototype.load[TAG] = 1;
    } catch (_) {}
    return F;
  }
  function patchDocumentFonts() {
    try {
      var fonts = document.fonts;
      if (!fonts || typeof fonts.load !== 'function' || fonts.load[TAG]) return;
      var ol = fonts.load.bind(fonts);
      fonts.load = function() {
        var p = ol.apply(fonts, arguments);
        if (!p || typeof p.then !== 'function') return p;
        return p.catch(function() { return []; });
      };
      fonts.load[TAG] = 1;
    } catch (_) {}
  }
  function tryPatchAll() {
    if (typeof window.FontFaceObserver === 'function') {
      patchFontFaceObserverCtor(window.FontFaceObserver);
    }
    patchDocumentFonts();
  }
  try {
    var had = Object.prototype.hasOwnProperty.call(window, 'FontFaceObserver');
    var existing = had ? window.FontFaceObserver : undefined;
    var desc = had ? Object.getOwnPropertyDescriptor(window, 'FontFaceObserver') : undefined;
    var canRedefine = !had || !desc || desc.configurable !== false;
    if (canRedefine && !window[TAG + 'Def']) {
      window[TAG + 'Def'] = 1;
      var inner = patchFontFaceObserverCtor(existing);
      Object.defineProperty(window, 'FontFaceObserver', {
        configurable: true,
        enumerable: true,
        get: function() { return inner; },
        set: function(v) { inner = patchFontFaceObserverCtor(v); }
      });
    } else if (existing) {
      patchFontFaceObserverCtor(existing);
    }
  } catch (_) {
    tryPatchAll();
  }
  tryPatchAll();
  if (!window[TAG + 'Poll']) {
    window[TAG + 'Poll'] = 1;
    var n = 0;
    var id = setInterval(function() {
      n++;
      tryPatchAll();
      if (n >= ${pollMax}) clearInterval(id);
    }, 25);
  }
  if (!window[TAG]) {
    window[TAG] = 1;
    window.addEventListener('unhandledrejection', function(e) {
      try {
        if (isTimeoutErr(e.reason)) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        }
      } catch (_) {}
    }, true);
    window.addEventListener('error', function(e) {
      try {
        if (e && isTimeoutErr(e.message)) {
          e.preventDefault();
          return false;
        }
      } catch (_) {}
    }, true);
  }
})();
true;
`;
}

/** Earliest injection (before document scripts). */
export const FLICA_POC_INJECT_BEFORE_CONTENT = buildShim(180);

/** After document load — catches late assignment + document.fonts. */
export const FLICA_POC_INJECT_AFTER_LOAD = buildShim(120);
