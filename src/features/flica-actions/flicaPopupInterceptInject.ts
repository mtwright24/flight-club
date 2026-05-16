/**
 * Injected before FLICA scripts run — intercept window.open / FLICA popup()
 * so React Native can load SAFE_READ URLs in the same WebView.
 */
export const INJECT_FLICA_POPUP_INTERCEPT = `
(function() {
  var FLAG = '__flicaPopupInterceptV1';
  if (window[FLAG]) return;
  window[FLAG] = true;

  function resolveAbs(raw, base) {
    try {
      return new URL(String(raw || ''), base || document.location.href).href;
    } catch (e) {
      return String(raw || '');
    }
  }

  function postOpen(payload) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (e) {}
  }

  function emitWindowOpen(rawUrl, target, features, width, height) {
    var base = document.location.href;
    var absoluteUrl = resolveAbs(rawUrl, base);
    var feat = String(features || '');
    if (width) feat += (feat ? ',' : '') + 'width=' + width;
    if (height) feat += (feat ? ',' : '') + 'height=' + height;
    postOpen({
      type: 'flica_window_open',
      absoluteUrl: absoluteUrl,
      rawUrl: String(rawUrl || ''),
      target: String(target || ''),
      features: feat,
      sourcePageUrl: base,
      sourceTitle: document.title || '',
      timestamp: new Date().toISOString()
    });
    return null;
  }

  var nativeOpen = window.open;
  window.open = function(url, target, features) {
    emitWindowOpen(url, target, features);
    return null;
  };

  function hookFlicaPopup() {
    try {
      if (typeof window.popup !== 'function') return;
      if (window.popup.__flicaPopupHooked) return;
      var orig = window.popup;
      window.popup = function(url, name, features, w, h) {
        emitWindowOpen(url, name, features, w, h);
        return null;
      };
      window.popup.__flicaPopupHooked = true;
    } catch (e) {}
  }

  hookFlicaPopup();
  try {
    document.addEventListener('DOMContentLoaded', hookFlicaPopup);
  } catch (e2) {}
  var tries = 0;
  var iv = setInterval(function() {
    hookFlicaPopup();
    if (++tries > 24) clearInterval(iv);
  }, 400);
})();
true;
`;
