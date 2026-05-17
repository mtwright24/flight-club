/**
 * TradeBoard Post Request — Add Activity selector (ottrade.cgi) WebView automation.
 * Uses same-page JS (goNext / TradeTask / Next button), not navigated URLs.
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";

export const TB_ACTIVITY_LOG = {
  selectClicked: "FC_TB_ACTIVITY_SELECT_CLICKED",
  undoVisible: "FC_TB_ACTIVITY_UNDO_VISIBLE",
  nextClicked: "FC_TB_ACTIVITY_NEXT_CLICKED",
  returnedToPostForm: "FC_TB_ACTIVITY_RETURNED_TO_POST_FORM",
  nextFailed: "FC_TB_ACTIVITY_NEXT_FAILED",
} as const;

export type TbActivityFlowDiagnostics = {
  topUrl: string;
  frameUrls: string[];
  buttonCatalog: Array<{ frame: string; text: string; name: string; value: string; type: string }>;
  forms: Array<{ frame: string; action: string; method: string; inputCount: number }>;
  selectedRowText: string;
  undoVisible: boolean;
  pageTextPreview: string;
};

export type TbActivityInjectResult = {
  ok: boolean;
  step: string;
  undoVisible?: boolean;
  postFormReturned?: boolean;
  selectedRowText?: string;
  frameUrl?: string;
  topUrl?: string;
  diagnostics?: TbActivityFlowDiagnostics;
  message?: string;
};

/** True when HTML/text looks like populated Post Request form (not empty selector). */
export function htmlIndicatesPostRequestFormPopulated(html: string): boolean {
  const h = String(html ?? "");
  if (h.length < 400) return false;
  const l = h.toLowerCase();
  const hasStep1 = l.includes("step 1") && l.includes("general request information");
  const hasStep2 = l.includes("step 2") && l.includes("pairing information");
  const noActivityBlank =
    l.includes("no activity currently selected") || l.includes("no activity selected");
  if (!hasStep1 || !hasStep2) return false;
  if (noActivityBlank) return false;
  return true;
}

export function htmlIndicatesOtTradeSelector(html: string): boolean {
  const l = String(html ?? "").toLowerCase();
  return l.includes("ottrade.cgi") || (l.includes("tradetask") && l.includes("verifydates"));
}

export function logTbActivity(tag: string, payload: Record<string, unknown>): void {
  fcDevMirrorScheduleLogToFile(tag, payload);
  if (__DEV__) {
    console.log(`[${tag}]`, JSON.stringify(payload));
  }
}

/** Shared DOM helpers embedded in WebView inject strings. */
const DOM_HELPERS = `
function __tbTrim(s, n) {
  s = String(s || '').replace(/\\s+/g, ' ').trim();
  return s.length > (n || 160) ? s.substring(0, n || 160) : s;
}
function __tbTopHref() {
  try { return window.top.location.href; } catch (e) { return window.location.href; }
}
function __tbWalkFrames(win, depth, acc) {
  if (depth > 12) return;
  try {
    acc.push({ win: win, href: win.location.href, name: '' });
  } catch (e) {}
  var els = [];
  try { els = win.document.querySelectorAll('iframe,frame'); } catch (e2) { return; }
  for (var i = 0; i < els.length; i++) {
    try {
      var cw = els[i].contentWindow;
      if (cw && cw.document) __tbWalkFrames(cw, depth + 1, acc);
    } catch (e3) {}
  }
}
function __tbAllFrameContexts() {
  var out = [];
  try { __tbWalkFrames(window.top || window, 0, out); } catch (e) {}
  return out;
}
function __tbDocText(doc) {
  try { return (doc.body && doc.body.innerText) ? doc.body.innerText : ''; } catch (e) { return ''; }
}
function __tbFireClick(el) {
  if (!el) return false;
  try { el.focus(); } catch (e0) {}
  try { el.click(); } catch (e1) {}
  try {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  } catch (e2) {}
  try {
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true }));
  } catch (e3) {}
  return true;
}
function __tbPostFormCheckInDoc(doc) {
  var t = __tbDocText(doc).toLowerCase();
  if (t.indexOf('step 1') < 0 || t.indexOf('general request information') < 0) return false;
  if (t.indexOf('step 2') < 0 || t.indexOf('pairing information') < 0) return false;
  if (t.indexOf('no activity currently selected') >= 0) return false;
  if (t.indexOf('no activity selected') >= 0) return false;
  return true;
}
function __tbOtTradeInDoc(doc) {
  var h = '';
  try { h = doc.location.href; } catch (e) { h = ''; }
  var t = __tbDocText(doc).toLowerCase();
  return h.toLowerCase().indexOf('ottrade.cgi') >= 0 || t.indexOf('tradetask') >= 0;
}
function __tbFrameHasUndo(doc) {
  var btns = doc.querySelectorAll('input[type="button"], button');
  for (var b = 0; b < btns.length; b++) {
    var tx = __tbTrim(btns[b].value || btns[b].innerText, 40).toLowerCase();
    if (tx === 'undo' || tx.indexOf('undo') >= 0) return true;
  }
  var ocs = doc.querySelectorAll('[onclick]');
  for (var u = 0; u < ocs.length; u++) {
    var oc = (ocs[u].getAttribute('onclick') || '').toLowerCase();
    if (oc.indexOf('undo') >= 0) return true;
  }
  return false;
}
function __tbInvokeGoNext(win, href) {
  var chain = [];
  var w = win;
  while (w) {
    chain.push(w);
    if (!w.parent || w.parent === w) break;
    w = w.parent;
  }
  try {
    if (win.top && chain.indexOf(win.top) < 0) chain.push(win.top);
  } catch (e0) {}
  for (var i = 0; i < chain.length; i++) {
    try {
      if (typeof chain[i].goNext === 'function') {
        chain[i].goNext();
        return 'goNext@' + (href || '');
      }
    } catch (e1) {}
  }
  return '';
}
function __tbInvokeOnclickHandler(el) {
  if (!el) return false;
  try {
    if (typeof el.onclick === 'function') {
      el.onclick();
      return true;
    }
  } catch (e0) {}
  var oc = '';
  try { oc = el.getAttribute ? (el.getAttribute('onclick') || '') : ''; } catch (e1) { oc = ''; }
  if (!oc) return false;
  try {
    (new Function(oc)).call(el);
    return true;
  } catch (e2) {}
  return false;
}
function __tbClickNextInDoc(doc) {
  var candidates = doc.querySelectorAll('input[type="button"], input[type="submit"], input[type="image"], button, a');
  for (var i = 0; i < candidates.length; i++) {
    var el = candidates[i];
    var tx = __tbTrim(el.value || el.innerText || el.textContent || el.alt, 80).toLowerCase();
    if (tx.indexOf('next') < 0) continue;
    __tbFireClick(el);
    if (__tbInvokeOnclickHandler(el)) return 'button+onclick:' + tx;
    return 'button:' + tx;
  }
  var ocs = doc.querySelectorAll('[onclick]');
  for (var j = 0; j < ocs.length; j++) {
    var oc = (ocs[j].getAttribute('onclick') || '').toLowerCase();
    var tx2 = __tbTrim(ocs[j].value || ocs[j].innerText, 80).toLowerCase();
    if (oc.indexOf('gonext') >= 0 || tx2.indexOf('next') >= 0) {
      __tbFireClick(ocs[j]);
      if (__tbInvokeOnclickHandler(ocs[j])) return 'onclickFn:' + (oc || tx2);
      return 'onclick:' + (oc || tx2);
    }
  }
  return '';
}
function __tbReturnToPostForm(postUrl) {
  var contexts = __tbAllFrameContexts();
  for (var ci = 0; ci < contexts.length; ci++) {
    var nm = '';
    try {
      var fe = contexts[ci].win.frameElement;
      nm = fe ? (fe.name || fe.id || '') : '';
    } catch (eN) { nm = ''; }
    if (nm.toLowerCase() === 'tb_body') {
      try {
        contexts[ci].win.location.href = postUrl;
        return 'tb_body';
      } catch (e0) {}
    }
  }
  try {
    if (window.top && window.top.frames && window.top.frames['TB_body']) {
      window.top.frames['TB_body'].location.href = postUrl;
      return 'frames_TB_body';
    }
  } catch (e1) {}
  try {
    window.location.href = postUrl;
    return 'top';
  } catch (e2) {}
  return '';
}
`;

function escapeJsString(s: string): string {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

/** Click grey Trade / pairing select button for pairing id (e.g. J1010) on ottrade page. */
export function buildInjectTbActivitySelectPairingScript(
  pairingId: string,
  dateLabel?: string,
): string {
  const pid = escapeJsString(pairingId.trim().toUpperCase());
  const dl = escapeJsString(String(dateLabel ?? "").trim().toUpperCase());
  return `(function(){
${DOM_HELPERS}
try {
  var pairingId = '${pid}';
  var dateLabel = '${dl}';
  var clicked = false;
  var rowText = '';
  var contexts = __tbAllFrameContexts();
  for (var ci = 0; ci < contexts.length; ci++) {
    var doc = contexts[ci].win.document;
    var ocs = doc.querySelectorAll('[onclick]');
    for (var i = 0; i < ocs.length; i++) {
      var oc = (ocs[i].getAttribute('onclick') || '');
      var row = ocs[i].closest ? ocs[i].closest('tr') : null;
      var rowTxt = row ? __tbTrim(row.innerText, 300) : __tbTrim(ocs[i].innerText, 120);
      if (rowTxt.toUpperCase().indexOf(pairingId) < 0) continue;
      if (dateLabel && rowTxt.toUpperCase().indexOf(dateLabel) < 0) continue;
      if (oc.toLowerCase().indexOf('tradetask') < 0 && oc.toLowerCase().indexOf('undo') >= 0) continue;
      if (oc.toLowerCase().indexOf('tradetask') >= 0 || (ocs[i].type && String(ocs[i].type).toLowerCase() === 'button')) {
        __tbFireClick(ocs[i]);
        clicked = true;
        rowText = rowTxt;
        break;
      }
    }
    if (clicked) break;
    var btns = doc.querySelectorAll('input[type="button"], button');
    for (var b = 0; b < btns.length; b++) {
      var row2 = btns[b].closest ? btns[b].closest('tr') : null;
      if (!row2) continue;
      var rt = __tbTrim(row2.innerText, 300).toUpperCase();
      if (rt.indexOf(pairingId) < 0) continue;
      if (dateLabel && rt.indexOf(dateLabel) < 0) continue;
      var bv = __tbTrim(btns[b].value || btns[b].innerText, 40).toLowerCase();
      if (bv === 'undo') continue;
      __tbFireClick(btns[b]);
      clicked = true;
      rowText = __tbTrim(row2.innerText, 300);
      break;
    }
    if (clicked) break;
  }
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'tb_activity_flow_result',
    step: 'select_pairing',
    ok: clicked,
    selectedRowText: rowText,
    message: clicked ? 'select_clicked' : 'pairing_row_not_found'
  }));
} catch (e) {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'tb_activity_flow_result',
    step: 'select_pairing',
    ok: false,
    message: e && e.message ? String(e.message) : 'select_failed'
  }));
}
})(); true;`;
}

/** Verify at least one Undo button is visible after selection. */
export function buildInjectTbActivityVerifyUndoScript(): string {
  return `(function(){
${DOM_HELPERS}
try {
  var undoVisible = false;
  var contexts = __tbAllFrameContexts();
  for (var ci = 0; ci < contexts.length; ci++) {
    var doc = contexts[ci].win.document;
    var btns = doc.querySelectorAll('input[type="button"], button');
    for (var b = 0; b < btns.length; b++) {
      var tx = __tbTrim(btns[b].value || btns[b].innerText, 40).toLowerCase();
      if (tx === 'undo' || tx.indexOf('undo') >= 0) { undoVisible = true; break; }
    }
    if (!undoVisible) {
      var ocs = doc.querySelectorAll('[onclick]');
      for (var u = 0; u < ocs.length; u++) {
        var oc = (ocs[u].getAttribute('onclick') || '').toLowerCase();
        var tx2 = __tbTrim(ocs[u].value || ocs[u].innerText, 40).toLowerCase();
        if (oc.indexOf('undo') >= 0 || tx2 === 'undo') { undoVisible = true; break; }
      }
    }
    if (undoVisible) break;
  }
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'tb_activity_flow_result',
    step: 'verify_undo',
    ok: undoVisible,
    undoVisible: undoVisible,
    message: undoVisible ? 'undo_visible' : 'undo_not_visible'
  }));
} catch (e) {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'tb_activity_flow_result',
    step: 'verify_undo',
    ok: false,
    undoVisible: false,
    message: e && e.message ? String(e.message) : 'verify_undo_failed'
  }));
}
})(); true;`;
}

function buildClickNextInner(step: string): string {
  return `(function(){
${DOM_HELPERS}
try {
  var method = '';
  var clicked = false;
  var contexts = __tbAllFrameContexts();
  var undoOt = [];
  var otFrames = [];
  var otherFrames = [];
  for (var ci = 0; ci < contexts.length; ci++) {
    var doc0 = contexts[ci].win.document;
    if (__tbOtTradeInDoc(doc0)) {
      otFrames.push(contexts[ci]);
      if (__tbFrameHasUndo(doc0)) undoOt.push(contexts[ci]);
    } else {
      otherFrames.push(contexts[ci]);
    }
  }
  var ordered = undoOt.concat(otFrames).concat(otherFrames);
  var seen = {};
  var unique = [];
  for (var u = 0; u < ordered.length; u++) {
    var key = ordered[u].href + '|' + ordered[u].win;
    if (seen[key]) continue;
    seen[key] = true;
    unique.push(ordered[u]);
  }
  ordered = unique;
  for (var g = 0; g < ordered.length && !clicked; g++) {
    method = __tbInvokeGoNext(ordered[g].win, ordered[g].href);
    if (method) clicked = true;
  }
  if (!clicked) {
    for (var b = 0; b < ordered.length && !clicked; b++) {
      method = __tbClickNextInDoc(ordered[b].win.document);
      if (method) clicked = true;
    }
  }
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'tb_activity_flow_result',
    step: '${step}',
    ok: clicked,
    message: clicked ? method : 'next_control_not_found',
    topUrl: __tbTopHref()
  }));
} catch (e) {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'tb_activity_flow_result',
    step: '${step}',
    ok: false,
    message: e && e.message ? String(e.message) : 'click_next_failed'
  }));
}
})(); true;`;
}

/** Click “add activity” on post-request page (preserves TB_body frame context). */
export function buildInjectTbActivityNavigateToAddActivityScript(
  addActivityUrl: string,
): string {
  const url = escapeJsString(addActivityUrl.trim());
  return `(function(){
${DOM_HELPERS}
try {
  var target = '${url}';
  var targetLow = target.toLowerCase();
  var clicked = false;
  var contexts = __tbAllFrameContexts();
  for (var ci = 0; ci < contexts.length; ci++) {
    var doc = contexts[ci].win.document;
    var links = doc.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].href || links[i].getAttribute('href') || '';
      var hay = (href + ' ' + __tbTrim(links[i].innerText, 120)).toLowerCase();
      if (hay.indexOf('ottrade.cgi') < 0) continue;
      if (targetLow.indexOf('act=t') >= 0 && hay.indexOf('act=t') < 0 && hay.indexOf('act=d') >= 0) continue;
      if (targetLow && href && href.toLowerCase().indexOf('ottrade.cgi') < 0) continue;
      __tbFireClick(links[i]);
      clicked = true;
      break;
    }
    if (clicked) break;
    var ocs = doc.querySelectorAll('[onclick]');
    for (var j = 0; j < ocs.length; j++) {
      var rowTxt = __tbTrim(ocs[j].innerText, 120).toLowerCase();
      if (rowTxt.indexOf('add activity') < 0) continue;
      __tbFireClick(ocs[j]);
      clicked = true;
      break;
    }
    if (clicked) break;
  }
  if (!clicked && target) {
    try { window.location.href = target; clicked = true; } catch (eNav) {}
  }
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'tb_activity_flow_result',
    step: 'open_add_activity',
    ok: clicked,
    message: clicked ? 'add_activity_clicked' : 'add_activity_link_not_found',
    topUrl: __tbTopHref()
  }));
} catch (e) {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'tb_activity_flow_result',
    step: 'open_add_activity',
    ok: false,
    message: e && e.message ? String(e.message) : 'open_add_activity_failed'
  }));
}
})(); true;`;
}

/** Advance ottrade → post request via goNext() or Next control (correct frame context). */
export function buildInjectTbActivityClickNextScript(): string {
  return buildClickNextInner("click_next");
}

/** Force TB_body (or top) back to post-request after Next when frame navigation stalls. */
export function buildInjectTbActivityReturnToPostFormScript(postRequestUrl: string): string {
  const url = escapeJsString(postRequestUrl.trim());
  return `(function(){
${DOM_HELPERS}
try {
  var method = __tbReturnToPostForm('${url}');
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'tb_activity_flow_result',
    step: 'return_post_form',
    ok: Boolean(method),
    message: method || 'return_post_form_failed',
    topUrl: __tbTopHref()
  }));
} catch (e) {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'tb_activity_flow_result',
    step: 'return_post_form',
    ok: false,
    message: e && e.message ? String(e.message) : 'return_post_form_failed'
  }));
}
})(); true;`;
}

/** Poll all frames for populated Post Request form (TB_body or top). */
export function buildInjectTbActivityPollPostFormScript(): string {
  return `(function(){
${DOM_HELPERS}
try {
  var postFormReturned = false;
  var frameUrl = '';
  var contexts = __tbAllFrameContexts();
  for (var ci = 0; ci < contexts.length; ci++) {
    var doc = contexts[ci].win.document;
    if (__tbPostFormCheckInDoc(doc)) {
      postFormReturned = true;
      try { frameUrl = contexts[ci].href; } catch (e) { frameUrl = ''; }
      break;
    }
    if ((contexts[ci].name || '').toLowerCase() === 'tb_body' && __tbPostFormCheckInDoc(doc)) {
      postFormReturned = true;
      frameUrl = contexts[ci].href;
      break;
    }
  }
  if (!postFormReturned) {
    for (var c2 = 0; c2 < contexts.length; c2++) {
      var nm = '';
      try {
        var fe = contexts[c2].win.frameElement;
        nm = fe ? (fe.name || fe.id || '') : '';
      } catch (eN) {}
      if (nm.toLowerCase() === 'tb_body' && __tbPostFormCheckInDoc(contexts[c2].win.document)) {
        postFormReturned = true;
        frameUrl = contexts[c2].href;
        break;
      }
    }
  }
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'tb_activity_flow_result',
    step: 'poll_post_form',
    ok: postFormReturned,
    postFormReturned: postFormReturned,
    frameUrl: frameUrl,
    topUrl: __tbTopHref(),
    message: postFormReturned ? 'post_form_returned' : 'still_on_selector'
  }));
} catch (e) {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'tb_activity_flow_result',
    step: 'poll_post_form',
    ok: false,
    postFormReturned: false,
    message: e && e.message ? String(e.message) : 'poll_failed'
  }));
}
})(); true;`;
}

/** Failure diagnostics when Next does not return to post form. */
export function buildInjectTbActivityFailureDiagnosticsScript(): string {
  return `(function(){
${DOM_HELPERS}
try {
  var frameUrls = [];
  var buttonCatalog = [];
  var forms = [];
  var selectedRowText = '';
  var undoVisible = false;
  var contexts = __tbAllFrameContexts();
  for (var ci = 0; ci < contexts.length; ci++) {
    var doc = contexts[ci].win.document;
    var fh = '';
    try { fh = contexts[ci].href; } catch (e) { fh = ''; }
    frameUrls.push(fh);
    var fels = doc.querySelectorAll('form');
    for (var fi = 0; fi < Math.min(fels.length, 12); fi++) {
      forms.push({
        frame: fh,
        action: fels[fi].action || '',
        method: (fels[fi].method || 'get').toUpperCase(),
        inputCount: fels[fi].elements ? fels[fi].elements.length : 0
      });
    }
    var btns = doc.querySelectorAll('input[type="button"], input[type="submit"], button');
    for (var bi = 0; bi < Math.min(btns.length, 80); bi++) {
      var tx = __tbTrim(btns[bi].value || btns[bi].innerText, 80);
      if (!tx) continue;
      buttonCatalog.push({
        frame: fh,
        text: tx,
        name: btns[bi].name || '',
        value: __tbTrim(btns[bi].value, 80),
        type: (btns[bi].type || 'button').toLowerCase()
      });
      if (tx.toLowerCase() === 'undo') undoVisible = true;
    }
    var undoRows = doc.querySelectorAll('[onclick]');
    for (var ui = 0; ui < undoRows.length; ui++) {
      var oc = (undoRows[ui].getAttribute('onclick') || '').toLowerCase();
      if (oc.indexOf('undo') >= 0) {
        undoVisible = true;
        var row = undoRows[ui].closest ? undoRows[ui].closest('tr') : null;
        if (row) selectedRowText = __tbTrim(row.innerText, 300);
      }
    }
  }
  var pageText = '';
  try {
    var topDoc = (window.top || window).document;
    pageText = __tbTrim(__tbDocText(topDoc), 2000);
  } catch (e2) { pageText = ''; }
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'tb_activity_flow_result',
    step: 'diagnostics',
    ok: true,
    diagnostics: {
      topUrl: __tbTopHref(),
      frameUrls: frameUrls,
      buttonCatalog: buttonCatalog,
      forms: forms,
      selectedRowText: selectedRowText,
      undoVisible: undoVisible,
      pageTextPreview: pageText
    }
  }));
} catch (e) {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'tb_activity_flow_result',
    step: 'diagnostics',
    ok: false,
    message: e && e.message ? String(e.message) : 'diagnostics_failed'
  }));
}
})(); true;`;
}

/** Recorder helper: run Next click (same as click_next) when user taps Next >>. */
export function buildInjectTbActivityRecorderAssistNextScript(): string {
  return buildClickNextInner("recorder_assist_next");
}

export function evaluateFramesForPostForm(
  frames: Array<{ bodyPreview?: string; locationHref?: string }>,
): boolean {
  for (const f of frames) {
    if (htmlIndicatesPostRequestFormPopulated(String(f.bodyPreview ?? ""))) return true;
  }
  return false;
}

export function frameUrlsStillOnOtTrade(urls: string[]): boolean {
  return urls.some((u) => String(u).toLowerCase().includes("ottrade.cgi"));
}
