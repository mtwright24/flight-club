/**
 * TEMP PoC — injected into FLICA WebView to extract text with strategy metadata.
 * Serialized as a single IIFE; keep quotes/backslashes minimal inside.
 */

/** PostMessage JSON shape: type, href, title, text, textLength, strategy, mergedFrom, errors */
export const FLICA_POC_EXTRACT_SCRIPT = `
(function(){
  var ERR = [];
  function pushErr(m){ try { ERR.push(String(m)); } catch(e){} }
  function bestOf(a, b) { return (a && a.length >= (b && b.length || 0)) ? a : (b || ''); }
  var parts = [];
  var primary = { text: '', strategy: 'none' };

  function consider(label, text) {
    if (!text || typeof text !== 'string') return;
    var t = text.replace(/^\\s+|\\s+$/g, '');
    if (!t.length) return;
    parts.push({ label: label, text: t, len: t.length });
    if (t.length > primary.text.length) {
      primary = { text: t, strategy: label };
    }
  }

  try { consider('document.body.innerText', document.body ? document.body.innerText : ''); } catch(e) { pushErr('body:' + e); }
  try {
    var de = document.documentElement;
    consider('document.documentElement.innerText', de ? de.innerText : '');
  } catch(e) { pushErr('docEl:' + e); }

  var iframes = document.querySelectorAll('iframe');
  var i, d, tx;
  for (i = 0; i < iframes.length && i < 20; i++) {
    try {
      d = iframes[i].contentDocument;
      tx = d && d.body ? d.body.innerText : '';
      consider('iframe[' + i + '].body.innerText', tx || '');
    } catch(e) {
      pushErr('iframe[' + i + ']:cross-origin');
    }
  }

  try {
    for (i = 0; i < window.frames.length && i < 15; i++) {
      try {
        d = window.frames[i].document;
        tx = d && d.body ? d.body.innerText : '';
        consider('frame[' + i + '].body.innerText', tx || '');
      } catch(e2) {
        pushErr('frame[' + i + ']');
      }
    }
  } catch(e) { pushErr('frames:' + e); }

  try {
    var emb = document.querySelectorAll('embed, object');
    for (i = 0; i < emb.length && i < 12; i++) {
      var el = emb[i];
      var et = (el.textContent || el.getAttribute('title') || el.getAttribute('name') || '').trim();
      if (et) consider('embed/object[' + i + '].textContent/attrs', et);
    }
  } catch(e) { pushErr('embed:' + e); }

  var merged = '';
  parts.sort(function(a,b){ return b.len - a.len; });
  var seen = {};
  for (i = 0; i < parts.length && i < 8; i++) {
    var p = parts[i];
    var key = p.text.slice(0, 80);
    if (seen[key]) continue;
    seen[key] = 1;
    merged += (merged ? '\\n\\n----- FLICA_POC_PART -----\\n\\n' : '') + '/* ' + p.label + ' */\\n' + p.text;
  }

  var title = '';
  try { title = document.title || ''; } catch(e) {}

  var href = '';
  try { href = (typeof location !== 'undefined' && location.href) ? location.href : ''; } catch(e) {}

  var outText = merged.length > primary.text.length ? merged : primary.text;
  var outStrategy = merged.length > primary.text.length ? 'merged:' + parts.slice(0,5).map(function(x){return x.label;}).join('+') : primary.strategy;

  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'flicaPocExtract',
      href: href,
      title: title,
      text: outText,
      textLength: outText.length,
      strategy: outStrategy,
      primaryStrategy: primary.strategy,
      mergedFrom: parts.map(function(x){ return x.label + ':' + x.len; }).join('|'),
      errors: ERR.slice(0, 12)
    }));
  } catch(e) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'flicaPocExtract',
        error: String(e),
        href: href,
        title: title
      }));
    } catch(e2) {}
  }
})();
true;
`;
