/**
 * TEMP PoC — inject into FLICA WebView: Main Menu DOM probe + ordered auto-navigation to schedule.
 * Serialized IIFEs; keep quotes minimal; postMessage JSON to React Native.
 */

/** Collect anchors, forms, body sample, captcha hint; type: flicaPocMainMenuProbe */
export const FLICA_POC_MAINMENU_PROBE_SCRIPT = `
(function(){
  function safe(fn, fb){ try { return fn(); } catch(e){ return fb; } }
  function resolveHref(h){ return safe(function(){ return new URL(h, location.href).href; }, ''); }
  var anchors = [];
  var seen = {};
  function addA(text, href, scope){
    if (!href || typeof href !== 'string') return;
    var h = href.trim();
    if (/^javascript:/i.test(h)) return;
    var full = resolveHref(h);
    if (!full || !/^https?:/i.test(full)) return;
    var key = full + '|' + (text || '').slice(0, 80);
    if (seen[key]) return;
    seen[key] = 1;
    anchors.push({ text: (text || '').replace(/\\s+/g, ' ').trim().slice(0, 200), href: full, scope: scope || 'top' });
  }
  try {
    var al = document.querySelectorAll('a[href]');
    var i;
    for (i = 0; i < al.length && i < 400; i++) {
      addA(al[i].innerText || al[i].textContent || '', al[i].getAttribute('href'), 'a');
    }
  } catch(e) {}
  try {
    var ar = document.querySelectorAll('area[href]');
    for (i = 0; i < ar.length && i < 50; i++) {
      addA(ar[i].getAttribute('alt') || '', ar[i].getAttribute('href'), 'area');
    }
  } catch(e) {}
  var forms = [];
  try {
    var fl = document.querySelectorAll('form[action]');
    for (i = 0; i < fl.length && i < 40; i++) {
      var fa = fl[i].getAttribute('action') || '';
      forms.push({
        action: resolveHref(fa) || fa,
        method: (fl[i].getAttribute('method') || 'get').toLowerCase()
      });
    }
  } catch(e) {}
  var iframeHints = [];
  try {
    var ifs = document.querySelectorAll('iframe');
    for (i = 0; i < ifs.length && i < 25; i++) {
      try {
        var idoc = ifs[i].contentDocument;
        var iu = idoc && idoc.location ? String(idoc.location.href) : '';
        if (iu && /^https?:/i.test(iu)) iframeHints.push({ index: i, locationHref: iu });
        if (idoc) {
          var ial = idoc.querySelectorAll('a[href]');
          var j;
          for (j = 0; j < ial.length && j < 120; j++) {
            addA(ial[j].innerText || '', ial[j].getAttribute('href'), 'iframe[' + i + ']');
          }
        }
      } catch(e2) {
        iframeHints.push({ index: i, locationHref: '(cross-origin)' });
      }
    }
  } catch(e) {}
  var title = safe(function(){ return document.title || ''; }, '');
  var href = safe(function(){ return location.href || ''; }, '');
  var bodySample = safe(function(){ return document.body ? String(document.body.innerText || '').slice(0, 2800) : ''; }, '');
  var captcha = /captcha|recaptcha|hcaptcha|verify\\s+your\\s+identity|robot/i.test(href + ' ' + title + ' ' + bodySample.slice(0, 900));

  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'flicaPocMainMenuProbe',
      href: href,
      title: title,
      bodySample: bodySample,
      anchors: anchors,
      forms: forms,
      iframeHints: iframeHints,
      captcha: captcha
    }));
  } catch(e3) {}
})();
true;
`;

/** Score links and navigate: anchor click -> form submit -> location.assign; type: flicaPocNavAttempt */
export const FLICA_POC_MAINMENU_NAVIGATE_SCRIPT = `
(function(){
  function safe(fn, fb){ try { return fn(); } catch(e){ return fb; } }
  function resolveHref(h){ return safe(function(){ return new URL(h, location.href).href; }, ''); }
  function score(text, href){
    var s = (text + ' ' + href).toLowerCase();
    var n = 0;
    if (/schedule|pairing|calendar|month|line\\s*view|lineview|my\\s*schedule|crew\\s*line|bid|roster|duty|trip|pbs|\\bclsv\\b|fcv|flight\\s*crew/i.test(s)) n += 22;
    if (/\\bfcv\\b|flights\\s*crew|crew\\s*access/i.test(s)) n += 8;
    if (/main\\s*menu|logout|log\\s*out|change\\s*password|contact\\s*us|help\\s*desk/i.test(s)) n -= 14;
    if (/preferences/i.test(s) && !/schedule/i.test(s)) n -= 8;
    if (/\\bmenu\\b(?!.*schedule)/i.test(s) && !/schedule/i.test(s)) n -= 4;
    return n;
  }
  function post(msg){
    try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch(e) {}
  }
  var candidates = [];
  function consider(el, text, href, scope){
    if (!href) return;
    var full = resolveHref(href);
    if (!full || !/^https?:/i.test(full)) return;
    if (/^javascript:/i.test(href)) return;
    var sc = score(text, full);
    candidates.push({ el: el, text: text, href: full, sc: sc, scope: scope });
  }
  try {
    var al = document.querySelectorAll('a[href]');
    var i;
    for (i = 0; i < al.length && i < 400; i++) {
      var a = al[i];
      consider(a, (a.innerText || a.textContent || '').trim(), a.getAttribute('href'), 'top.a');
    }
    var ifs = document.querySelectorAll('iframe');
    for (i = 0; i < ifs.length && i < 20; i++) {
      try {
        var idoc = ifs[i].contentDocument;
        if (!idoc) continue;
        var ial = idoc.querySelectorAll('a[href]');
        var j;
        for (j = 0; j < ial.length && j < 200; j++) {
          var ia = ial[j];
          consider(ia, (ia.innerText || ia.textContent || '').trim(), ia.getAttribute('href'), 'iframe[' + i + '].a');
        }
      } catch(e) {}
    }
  } catch(e) {}
  candidates.sort(function(a,b){ return b.sc - a.sc; });
  var best = candidates[0];
  if (best && best.sc >= 6 && best.el) {
    try {
      best.el.click();
      post({ type: 'flicaPocNavAttempt', strategy: 'anchor_click', detail: (best.text || '').slice(0, 120), candidateHref: best.href, score: best.sc, scope: best.scope });
      return;
    } catch(e2) {}
    try {
      location.assign(best.href);
      post({ type: 'flicaPocNavAttempt', strategy: 'location', detail: 'assign after click fail', candidateHref: best.href, score: best.sc, scope: best.scope });
      return;
    } catch(e3) {}
  }
  try {
    var fl = document.querySelectorAll('form[action]');
    for (i = 0; i < fl.length && i < 35; i++) {
      var f = fl[i];
      var act = resolveHref(f.getAttribute('action') || '') || '';
      if (act && score('', act) >= 10) {
        f.submit();
        post({ type: 'flicaPocNavAttempt', strategy: 'form_submit', detail: f.getAttribute('method') || 'get', candidateHref: act, score: score('', act) });
        return;
      }
    }
  } catch(e) {}
  if (best && best.href) {
    try {
      location.assign(best.href);
      post({ type: 'flicaPocNavAttempt', strategy: 'location', detail: 'fallback best href', candidateHref: best.href, score: best.sc });
      return;
    } catch(e4) {}
  }
  post({ type: 'flicaPocNavAttempt', strategy: 'none', detail: 'no suitable target', candidateHref: '', score: best ? best.sc : -999 });
})();
true;
`;
