/**
 * FLICA direct HTTP import — WebView session + same token/HTTP path as flica-test, then persist to schedule pairings.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LogBox,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import WebView, { type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import CookieManager from '@react-native-community/cookies';
import { Ionicons } from '@expo/vector-icons';

import { saveFlicaLastMainmenuUrl } from '../../src/dev/flicaPoCCookieStore';
import {
  buildFlicaUrls,
  extractToken1FromHtml,
  fetchFlicaScheduleAllMonths,
  FLICA_CONSTANTS,
  FLICA_URLS,
  loadFlicaAirlineSubdomain,
  loadFlicaCookies,
  loadFlicaCredentials,
  saveFlicaAirlineSubdomain,
  saveFlicaCookies,
  saveFlicaCredentials,
} from '../../src/services/flicaScheduleService';
import { parseFlicaScheduledetailHtml } from '../../src/services/flicaScheduleHtmlParser';
import { FLICA_POC_INJECT_BEFORE_CONTENT } from '../../src/dev/flicaPoCWebFontShim';
import { supabase } from '../../src/lib/supabaseClient';
import { persistFlicaDirectImport } from '../../src/features/crew-schedule/persistFlicaDirectImport';
import { scheduleTheme as T } from '../../src/features/crew-schedule/scheduleTheme';
import CrewScheduleHeader from '../../src/features/crew-schedule/components/CrewScheduleHeader';

function flicaMonthHtmlLooksValid(html: string): boolean {
  const t = (html ?? '').toUpperCase();
  return t.includes('FLTNO') || t.includes('DPS-ARS') || t.includes('SCHEDULEDETAIL');
}

function flicaTextHasTokenHint(s: string | undefined | null): boolean {
  if (s == null || !s.trim().length) return false;
  if (/scheduledetail\.cgi/i.test(s)) return true;
  if (s.includes('token=')) return true;
  if (/GO=1&token=/i.test(s)) return true;
  if (/BlockDate=/i.test(s)) return true;
  return false;
}

type FlicaLoadscheduleDeepCapture = {
  type: 'loadschedule_deep_capture';
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

function pickFirstFlicaTokenText(cap: FlicaLoadscheduleDeepCapture): { text: string; label: string } | null {
  const pairs: { text: string; label: string }[] = [
    { text: cap.topOuterHtml ?? '', label: 'topOuterHtml' },
    { text: cap.topBodyHtml ?? '', label: 'topBodyHtml' },
  ];
  (cap.frameHtmlList ?? []).forEach((h, i) => pairs.push({ text: h ?? '', label: `frame[${i}]` }));
  (cap.iframeHtmlList ?? []).forEach((h, i) => pairs.push({ text: h ?? '', label: `iframe[${i}]` }));
  (cap.scriptSnippets ?? []).forEach((h, i) => pairs.push({ text: h ?? '', label: `script[${i}]` }));
  for (const { text, label } of pairs) {
    if (flicaTextHasTokenHint(text)) return { text, label };
  }
  return null;
}

/** Step 3: one delay, then same-origin deep capture → `loadschedule_deep_capture`. */
const FLICA_LOADSCHEDULE_POST_MS = 600;
function buildInjectLoadScheduleDeepCaptureScript(): string {
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

const INJECT_POST_LOADSCHEDULE_HTML = buildInjectLoadScheduleDeepCaptureScript();

const INJECT_FLICA_BRIDGE_PING = `(function(){
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

function buildFlicaUiLoginInjectScript(username: string, password: string): string {
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

type FlowNav = { loadScheduleInjected: boolean };

function resetFlowNav(refs: { current: FlowNav }): void {
  refs.current = { loadScheduleInjected: false };
}

function isMainmenuAwaitingCaptcha(url: string): boolean {
  const u = (url ?? '').toLowerCase();
  if (!u.includes('mainmenu.cgi')) return false;
  if (u.includes('gohm=1')) return false;
  if (u.includes('loadschedule=true')) return false;
  return true;
}

export default function ImportFlicaDirectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<InstanceType<typeof WebView> | null>(null);
  const flowNavRef = useRef<FlowNav>({ loadScheduleInjected: false });
  const completingRef = useRef(false);
  /** Prevents double-firing the same mainmenu handoff (onLoadEnd + onNavigation) within one "Sync schedule" session. */
  const mainmenuHandoffStartedThisSyncRef = useRef(false);
  const mainmenuHandoffInFlightRef = useRef(false);
  const scheduleExtractTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webLoadPassRef = useRef(0);
  const lastNavUrlRef = useRef('');
  const pageLoadCountRef = useRef(0);
  const pageFinishDedupeKeyRef = useRef('');
  const pageFinishDedupeAtRef = useRef(0);
  const capturedCookieHeaderRef = useRef<string | null>(null);
  /** Set after Charles-order post-captcha signals (GOHM=1, leftmenu crew, or reCAPTCHA cleared on main menu). */
  const postCaptchaFinalizedRef = useRef(false);
  /** Avoid DOM-only finalize before a reCAPTCHA iframe has been observed on this session’s main menu. */
  const sawFlicaRecaptchaIframeOnMainmenuRef = useRef(false);

  const [credsLoading, setCredsLoading] = useState(true);
  const [storedAirlineSub, setStoredAirlineSub] = useState<string | null>(null);
  const [formSub, setFormSub] = useState('');
  const [storedUser, setStoredUser] = useState<string | null>(null);
  const [formUser, setFormUser] = useState('');
  const [formPass, setFormPass] = useState('');
  const [editingCreds, setEditingCreds] = useState(false);
  const [editUser, setEditUser] = useState('');
  const [editPass, setEditPass] = useState('');

  const [syncActive, setSyncActive] = useState(false);
  const [webViewKey, setWebViewKey] = useState(0);
  const [captchaWebVisible, setCaptchaWebVisible] = useState(false);
  const [postCaptchaFired, setPostCaptchaFired] = useState(false);
  const [hideWebForSync, setHideWebForSync] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState('idle');
  const [httpImporting, setHttpImporting] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState('');

  const flicaUrls = useMemo(
    () => (storedAirlineSub?.trim() ? buildFlicaUrls(storedAirlineSub) : null),
    [storedAirlineSub],
  );
  const searchParams = useLocalSearchParams<{ autoSync?: string }>();
  const autoSyncParam =
    searchParams?.autoSync === '1' ||
    String(searchParams?.autoSync ?? '').toLowerCase() === 'true';
  const autoSyncStartedRef = useRef(false);

  /** WebView must load this URL (not HTTP fetch) — same path as `FLICA_URLS.MAINMENU_LOADSCHEDULE` for the saved airline. */
  const injectNavToLoadSchedule = useMemo(() => {
    if (!flicaUrls) {
      return `(function(){ window.location.href = ${JSON.stringify(FLICA_URLS.MAINMENU_LOADSCHEDULE)}; })(); true;`;
    }
    return `(function(){ window.location.href = ${JSON.stringify(flicaUrls.MAINMENU_LOADSCHEDULE)}; })(); true;`;
  }, [flicaUrls]);

  const hasCredentials = !!storedUser?.trim();
  const hasAirline = !!storedAirlineSub?.trim();
  const canSync = hasAirline && hasCredentials;

  useEffect(() => {
    LogBox.ignoreLogs([/\d+\s*ms\s*timeout\s*exceeded/i]);
  }, []);

  const loadCreds = useCallback(async () => {
    setCredsLoading(true);
    try {
      const [sub, c] = await Promise.all([loadFlicaAirlineSubdomain(), loadFlicaCredentials()]);
      setStoredAirlineSub(sub);
      setFormSub(sub ?? '');
      if (!c) {
        setStoredUser(null);
        setFormUser('');
        setFormPass('');
        setEditUser('');
        setEditPass('');
        return;
      }
      setStoredUser(c.username);
      setFormUser(c.username);
      setFormPass(c.password);
      setEditUser(c.username);
      setEditPass(c.password);
    } finally {
      setCredsLoading(false);
    }
  }, []);

  const onSaveAirline = useCallback(async () => {
    setLastError(null);
    try {
      await saveFlicaAirlineSubdomain(formSub);
      const n = await loadFlicaAirlineSubdomain();
      setStoredAirlineSub(n);
      setStatusLine('Airline saved');
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }, [formSub]);

  useEffect(() => {
    void loadCreds();
  }, [loadCreds]);

  const markPostCaptchaFinalizedFromUrl = useCallback((rawUrl: string) => {
    if (postCaptchaFinalizedRef.current) return;
    const u = (rawUrl ?? '').toLowerCase();
    if (u.includes('gohm=1')) {
      postCaptchaFinalizedRef.current = true;
      console.log('[FLICA] post-captcha candidate url', rawUrl);
      console.log('[FLICA] GOHM detected', rawUrl);
      console.log('[FLICA] handoff allowed');
      return;
    }
    if (u.includes('leftmenu.cgi') && u.includes('whosepage=crewmember')) {
      postCaptchaFinalizedRef.current = true;
      console.log('[FLICA] post-captcha candidate url', rawUrl);
      console.log('[FLICA] leftmenu detected', rawUrl);
      console.log('[FLICA] handoff allowed');
      return;
    }
  }, []);

  const stopSync = useCallback(() => {
    if (scheduleExtractTimerRef.current) {
      clearTimeout(scheduleExtractTimerRef.current);
      scheduleExtractTimerRef.current = null;
    }
    setSyncActive(false);
    setCaptchaWebVisible(false);
    setPostCaptchaFired(false);
    setHideWebForSync(false);
    setHttpImporting(false);
    setStatusLine('idle');
    setOverlayMessage('');
    completingRef.current = false;
    mainmenuHandoffInFlightRef.current = false;
    pageLoadCountRef.current = 0;
    pageFinishDedupeKeyRef.current = '';
    pageFinishDedupeAtRef.current = 0;
    capturedCookieHeaderRef.current = null;
    mainmenuHandoffStartedThisSyncRef.current = false;
    postCaptchaFinalizedRef.current = false;
    sawFlicaRecaptchaIframeOnMainmenuRef.current = false;
    resetFlowNav(flowNavRef);
  }, []);

  const onSaveAndConnect = useCallback(async () => {
    setLastError(null);
    if (!formUser.trim()) {
      setLastError('Enter a FLICA username.');
      return;
    }
    try {
      await saveFlicaCredentials(formUser.trim(), formPass);
      setStoredUser(formUser.trim());
      setStatusLine('Credentials saved');
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }, [formPass, formUser]);

  const onSaveEdit = useCallback(async () => {
    setLastError(null);
    if (!editUser.trim()) {
      setLastError('Enter a FLICA username.');
      return;
    }
    try {
      await saveFlicaCredentials(editUser.trim(), editPass);
      setStoredUser(editUser.trim());
      setFormUser(editUser.trim());
      setFormPass(editPass);
      setEditingCreds(false);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }, [editPass, editUser]);

  const beginMainmenuHandoff = useCallback(
    async (pageUrl: string) => {
      if (completingRef.current || !flicaUrls) return;
      if (mainmenuHandoffInFlightRef.current) return;
      if (flowNavRef.current.loadScheduleInjected) return;
      const low = pageUrl.toLowerCase();
      if (!low.includes('mainmenu.cgi') || low.includes('loadschedule=true')) return;
      if (Platform.OS === 'web') return;
      if (mainmenuHandoffStartedThisSyncRef.current) return;
      if (!postCaptchaFinalizedRef.current) {
        console.log('[FLICA] handoff blocked: post-captcha not finalized', pageUrl);
        return;
      }

      mainmenuHandoffStartedThisSyncRef.current = true;
      console.log('[FLICA] mainmenu detected', pageUrl);
      mainmenuHandoffInFlightRef.current = true;
      try {
        try {
          if (pageUrl) {
            try {
              await saveFlicaLastMainmenuUrl(pageUrl);
            } catch {
              /* non-fatal */
            }
          }
          {
            const cm = CookieManager as unknown as { flush?: () => Promise<void> };
            if (typeof cm.flush === 'function') {
              await cm.flush();
            }
          }
          await new Promise((r) => setTimeout(r, 400));
          const baseOrigin = flicaUrls.ORIGIN;
          const mainmenuPath = `${flicaUrls.ORIGIN}/online/mainmenu.cgi`;
          const cookies = await CookieManager.get(baseOrigin);
          console.log('[FLICA] CookieManager.get result', JSON.stringify(cookies));
          const cookieParts = Object.entries(cookies ?? {})
            .map(([name, c]) => `${name}=${(c as { value: string }).value}`)
            .join('; ');
          console.log('[FLICA] cookie string', cookieParts);
          const cookies2 = await CookieManager.get(mainmenuPath);
          console.log('[FLICA] CookieManager mainmenu', JSON.stringify(cookies2));
          const pickFlica = (jar: Record<string, { value?: string } | undefined> | null | undefined) => {
            const o: { FLiCASession?: string; FLiCAService?: string; AWSALB?: string; AWSALBCORS?: string } = {};
            if (!jar) return o;
            for (const k of ['FLiCASession', 'FLiCAService', 'AWSALB', 'AWSALBCORS'] as const) {
              const row = jar[k];
              if (row && typeof row === 'object' && 'value' in row && String((row as { value: string }).value).length) {
                o[k] = (row as { value: string }).value;
              }
            }
            return o;
          };
          const jar1 = (cookies ?? {}) as Record<string, { value?: string }>;
          const jar2 = (cookies2 ?? {}) as Record<string, { value?: string }>;
          await saveFlicaCookies({ ...pickFlica(jar1), ...pickFlica(jar2) });
          const hAfterSave = await loadFlicaCookies();
          console.log('[FLICA] loadFlicaCookies result', hAfterSave);
          let cookieHeader = cookieParts;
          if (!cookieHeader?.trim() && hAfterSave?.trim()) {
            cookieHeader = hAfterSave;
          }
          capturedCookieHeaderRef.current = cookieHeader.length > 0 ? cookieHeader : null;
          if (!cookieHeader?.trim()) {
            mainmenuHandoffStartedThisSyncRef.current = false;
            if (pageLoadCountRef.current > 4) {
              setLastError('No FLICA cookies after sign-in. Try again.');
              stopSync();
            }
            return;
          }
          console.log('[FLICA] cookies captured', cookieHeader);
          flowNavRef.current.loadScheduleInjected = true;
          setHttpImporting(true);
          setLastError(null);
          setOverlayMessage('Loading schedule page…');
          setStatusLine('Loading schedule page…');
          const targetLoadScheduleUrl = flicaUrls.MAINMENU_LOADSCHEDULE;
          console.log('[FLICA] injecting loadschedule url', targetLoadScheduleUrl);
          if (injectNavToLoadSchedule.trim().length) {
            webViewRef.current?.injectJavaScript(injectNavToLoadSchedule);
          }
        } catch (e) {
          console.log('[FLICA] beginMainmenuHandoff ERROR', e);
          throw e;
        }
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
        flowNavRef.current.loadScheduleInjected = false;
        stopSync();
      } finally {
        mainmenuHandoffInFlightRef.current = false;
      }
    },
    [flicaUrls, injectNavToLoadSchedule, stopSync],
  );

  const runServiceScheduleImport = useCallback(
    async (loadSchedulePageHtml: string) => {
      if (completingRef.current || !flicaUrls) return;
      completingRef.current = true;
      setHttpImporting(true);
      setLastError(null);
      setOverlayMessage('Downloading schedule…');
      setStatusLine('Downloading schedule…');
      try {
        const token1 = extractToken1FromHtml(loadSchedulePageHtml);
        console.log('[FLICA] token1', token1);
        if (!token1) {
          setLastError('FLICA did not return schedule data from the WebView. Please try “Sync schedule” again.');
          stopSync();
          return;
        }
        const cookieHeader = (capturedCookieHeaderRef.current?.trim() || (await loadFlicaCookies())?.trim()) ?? '';
        if (!cookieHeader) {
          setLastError('No FLICA cookies for schedule download. Try again.');
          stopSync();
          return;
        }
        const { march, april, may } = await fetchFlicaScheduleAllMonths(cookieHeader, token1, {
          scheduleDetailBaseUrl: flicaUrls.SCHEDULE_DETAIL,
          refererUrl: flicaUrls.MAINMENU_LOADSCHEDULE,
        });
        console.log('[FLICA] march html length', march?.length);
        console.log('[FLICA] april html length', april?.length);
        console.log('[FLICA] may html length', may?.length);
        parseFlicaScheduledetailHtml(march, '2026-03');
        parseFlicaScheduledetailHtml(april, '2026-04');
        parseFlicaScheduledetailHtml(may, '2026-05');
        if (!flicaMonthHtmlLooksValid(march) || !flicaMonthHtmlLooksValid(april) || !flicaMonthHtmlLooksValid(may)) {
          setLastError('FLICA schedule response did not look like a valid schedule page.');
          stopSync();
          return;
        }
        const { data: u } = await supabase.auth.getUser();
        if (!u.user?.id) {
          setLastError('Sign in to Flight Club to save your schedule.');
          stopSync();
          return;
        }
        setOverlayMessage('Saving schedule…');
        await persistFlicaDirectImport(march, april, may);
        setPostCaptchaFired(true);
        setHideWebForSync(true);
        setCaptchaWebVisible(false);
        if (Platform.OS === 'android') {
          ToastAndroid.show('Schedule synced ✓', ToastAndroid.LONG);
        } else {
          Alert.alert('', 'Schedule synced ✓');
        }
        router.replace('/crew-schedule' as Href);
        stopSync();
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
        stopSync();
      } finally {
        setHttpImporting(false);
        completingRef.current = false;
        resetFlowNav(flowNavRef);
      }
    },
    [flicaUrls, router, stopSync],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      if (completingRef.current) return;
      const raw = event.nativeEvent.data ?? '';
      const payloadLen = raw.length;
      const payloadPreview = raw.slice(0, 300);
      let data: { type?: string; html?: string; url?: string };
      try {
        data = JSON.parse(raw) as { type?: string; html?: string; url?: string };
      } catch {
        console.log('[FLICA] onMessage parse error', { payloadLen, payloadPreview });
        return;
      }
      console.log('[FLICA] onMessage', { type: data.type, payloadLen, payloadPreview });
      if (data.type === 'flica_bridge_ping') {
        const u = (data as { url?: string; recaptchaFrameCount?: number }).url ?? '';
        const rec = (data as { recaptchaFrameCount?: number }).recaptchaFrameCount;
        if (u) {
          markPostCaptchaFinalizedFromUrl(u);
        }
        if (u && isMainmenuAwaitingCaptcha(u) && typeof rec === 'number') {
          if (rec > 0) {
            sawFlicaRecaptchaIframeOnMainmenuRef.current = true;
          } else if (sawFlicaRecaptchaIframeOnMainmenuRef.current) {
            if (!postCaptchaFinalizedRef.current) {
              postCaptchaFinalizedRef.current = true;
              console.log('[FLICA] post-captcha candidate url', u);
              console.log(
                '[FLICA] reCAPTCHA iframe no longer present on mainmenu (after challenge was shown)',
                u,
                { rec },
              );
              console.log('[FLICA] handoff allowed');
            }
          }
        }
        if (u && isMainmenuAwaitingCaptcha(u)) {
          setCaptchaWebVisible(true);
          setOverlayMessage('Sign in to FLICA');
        }
        return;
      }
      if (data.type === 'flica_login_submitted') {
        setOverlayMessage('Sign in to FLICA');
        return;
      }
      if (data.type === 'flica_diag' || data.type === 'flica_no_login_form') {
        return;
      }
      if (data.type !== 'loadschedule_deep_capture') {
        return;
      }
      if (!flowNavRef.current.loadScheduleInjected) {
        console.log('[FLICA] loadschedule_deep_capture ignored (loadScheduleInjected false)');
        return;
      }
      const cap = data as FlicaLoadscheduleDeepCapture;
      console.log('[FLICA] loadschedule deep capture received', {
        url: cap.url,
        title: cap.title,
        topOuterLen: cap.topOuterHtml?.length ?? 0,
        topBodyLen: cap.topBodyHtml?.length ?? 0,
        frameSrcs: cap.frameSrcs,
        iframeSrcs: cap.iframeSrcs,
        frameHtmlCount: cap.frameHtmlList?.length ?? 0,
        iframeHtmlCount: cap.iframeHtmlList?.length ?? 0,
        scriptSnippetCount: cap.scriptSnippets?.length ?? 0,
      });
      const picked = pickFirstFlicaTokenText(cap);
      if (!picked) {
        console.log('[FLICA] no token-bearing source found in deep capture');
        return;
      }
      const preview = picked.text.slice(0, 1500);
      console.log('[FLICA] loadschedule source used for token1:', picked.label);
      console.log('[FLICA] candidate preview', preview);
      void runServiceScheduleImport(picked.text);
    },
    [markPostCaptchaFinalizedFromUrl, runServiceScheduleImport]
  );

  const onNavigation = useCallback(
    (nav: WebViewNavigation) => {
      if (completingRef.current) return;
      const url = nav.url ?? '';
      const low = url.toLowerCase();
      lastNavUrlRef.current = url;
      if (low.includes('captcha')) {
        setCaptchaWebVisible(true);
        setOverlayMessage("Complete the verification, then we'll continue automatically.");
        setStatusLine("Complete the verification, then we'll continue automatically.");
        setHideWebForSync(false);
      }
      if (isMainmenuAwaitingCaptcha(url)) {
        setCaptchaWebVisible(true);
        setOverlayMessage('');
        setHideWebForSync(false);
      }
      if (nav.loading === false) {
        const now = Date.now();
        if (pageFinishDedupeKeyRef.current !== url || now - pageFinishDedupeAtRef.current > 600) {
          pageFinishDedupeKeyRef.current = url;
          pageFinishDedupeAtRef.current = now;
          pageLoadCountRef.current += 1;
        }
        markPostCaptchaFinalizedFromUrl(url);
        if (low.includes('mainmenu.cgi') && low.includes('nocache') && !postCaptchaFinalizedRef.current) {
          console.log(
            '[FLICA] mainmenu nocache: waiting for post-captcha (GOHM / leftmenu / reCAPTCHA cleared)',
            url,
          );
        }
        if (low.includes('mainmenu.cgi')) {
          if (low.includes('loadschedule')) {
            console.log('[FLICA] loadschedule nav detected', url);
          } else {
            console.log('[FLICA] mainmenu post-detect url (onNavigation)', url);
          }
        }
        if (low.includes('mainmenu.cgi') && low.includes('loadschedule=true') && flowNavRef.current.loadScheduleInjected) {
          if (scheduleExtractTimerRef.current) {
            clearTimeout(scheduleExtractTimerRef.current);
            scheduleExtractTimerRef.current = null;
          }
          scheduleExtractTimerRef.current = setTimeout(() => {
            scheduleExtractTimerRef.current = null;
            if (completingRef.current) return;
            console.log(
              '[FLICA] Step3: inject loadschedule deep capture (2s after nav) + in-page ' + String(FLICA_LOADSCHEDULE_POST_MS) + 'ms',
            );
            webViewRef.current?.injectJavaScript(INJECT_POST_LOADSCHEDULE_HTML);
          }, 2000);
        } else if (low.includes('mainmenu.cgi') && !low.includes('loadschedule=true')) {
          void beginMainmenuHandoff(url);
        }
      }
    },
    [beginMainmenuHandoff, markPostCaptchaFinalizedFromUrl]
  );

  const runLoginInject = useCallback(() => {
    if (!syncActive) return;
    void (async () => {
      const creds = await loadFlicaCredentials();
      if (!creds) return;
      const script = buildFlicaUiLoginInjectScript(creds.username.trim(), creds.password);
      const r = () => {
        if (!syncActive) return;
        webViewRef.current?.injectJavaScript(script);
      };
      r();
      setTimeout(r, 250);
      setTimeout(r, 600);
    })();
  }, [syncActive]);

  const onLoadEnd = useCallback(() => {
    webViewRef.current?.injectJavaScript(INJECT_FLICA_BRIDGE_PING);
    runLoginInject();
    const u = lastNavUrlRef.current;
    if (u) {
      markPostCaptchaFinalizedFromUrl(u);
    }
    const low = (u ?? '').toLowerCase();
    if (u && low.includes('mainmenu.cgi') && low.includes('nocache') && !postCaptchaFinalizedRef.current) {
      console.log('[FLICA] mainmenu nocache: waiting for post-captcha (GOHM / leftmenu / reCAPTCHA cleared)', u);
    }
    if (u && low.includes('mainmenu.cgi')) {
      if (low.includes('loadschedule')) {
        console.log('[FLICA] loadschedule nav detected', u);
      } else {
        console.log('[FLICA] mainmenu post-detect url (onLoadEnd)', u);
      }
    }
    if (u && low.includes('mainmenu.cgi') && !low.includes('loadschedule=true')) {
      void beginMainmenuHandoff(u);
    }
  }, [beginMainmenuHandoff, markPostCaptchaFinalizedFromUrl, runLoginInject]);

  const onLoadProgress = useCallback(
    (e: { nativeEvent: { progress: number } }) => {
      if (e.nativeEvent.progress < 0.99) return;
      const p = webLoadPassRef.current;
      setTimeout(() => {
        if (webLoadPassRef.current === p) runLoginInject();
      }, 250);
    },
    [runLoginInject]
  );

  const onLoadStart = useCallback(() => {
    /* WebView is hidden until CAPTCHA; no blocking overlay. */
  }, []);

  const startSync = useCallback(() => {
    const urlBeingLoaded = flicaUrls?.LOGIN;
    console.log('[FLICA URL]', urlBeingLoaded);
    void (async () => {
      const fromStore = await loadFlicaAirlineSubdomain();
      const subdomain = fromStore ?? '';
      console.log('[FLICA SUBDOMAIN from SecureStore]', JSON.stringify(fromStore), {
        hasLeadingOrTrailingSpace: fromStore != null && fromStore !== fromStore.trim(),
        hasQuotes: fromStore != null && /['"]/.test(fromStore),
        hasUppercase: fromStore != null && fromStore !== fromStore.toLowerCase(),
        hasSpaceOrWeird: fromStore != null && /[^a-z0-9-]/i.test(fromStore.replace(/[a-z0-9-]/g, '')),
      });
      console.log('[FLICA FULL URL]', `https://${subdomain}.flica.net/ui/login/index.html`);
    })();
    setLastError(null);
    completingRef.current = false;
    mainmenuHandoffInFlightRef.current = false;
    mainmenuHandoffStartedThisSyncRef.current = false;
    pageLoadCountRef.current = 0;
    pageFinishDedupeKeyRef.current = '';
    pageFinishDedupeAtRef.current = 0;
    capturedCookieHeaderRef.current = null;
    postCaptchaFinalizedRef.current = false;
    sawFlicaRecaptchaIframeOnMainmenuRef.current = false;
    resetFlowNav(flowNavRef);
    setCaptchaWebVisible(false);
    setPostCaptchaFired(false);
    setHideWebForSync(false);
    setHttpImporting(false);
    setOverlayMessage('');
    setWebViewKey((k) => k + 1);
    setSyncActive(true);
    setStatusLine('Starting sync…');
  }, [flicaUrls]);

  /** Schedule tab pull-to-refresh (FLICA months) opens this screen with `autoSync=1` — start the same flow as “Sync schedule”. */
  useEffect(() => {
    if (credsLoading) return;
    if (!autoSyncParam) return;
    if (autoSyncStartedRef.current) return;
    if (!canSync) return;
    autoSyncStartedRef.current = true;
    startSync();
  }, [autoSyncParam, canSync, credsLoading, startSync]);

  /** Full white overlay only after login handoff — never cover the WebView during CAPTCHA / manual sign-in. */
  const blockingOverlay = syncActive && (postCaptchaFired || httpImporting);

  const overlayTitle = useMemo(() => {
    if (overlayMessage.trim().length) return overlayMessage;
    if (captchaWebVisible) return 'Sign in to FLICA';
    return 'Syncing schedule…';
  }, [captchaWebVisible, overlayMessage]);

  if (credsLoading) {
    return (
      <View style={styles.shell}>
        <Stack.Screen options={{ headerShown: false }} />
        <CrewScheduleHeader title="FLICA Sync" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={T.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <Stack.Screen options={{ headerShown: false }} />
      <CrewScheduleHeader title="FLICA Sync" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.h1}>FLICA sync</Text>
        <Text style={styles.lead}>
          Direct browser sync from your airline&apos;s FLICA portal. Credentials stay on this device. We download
          March–May 2026 in the background after you sign in.
        </Text>

        {!hasAirline ? (
          <>
            <Text style={styles.label}>Airline FLICA host</Text>
            <Text style={styles.hint}>
              The subdomain only (e.g. <Text style={styles.hintMono}>jetblue</Text> for jetblue.flica.net)
            </Text>
            <TextInput
              value={formSub}
              onChangeText={setFormSub}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              placeholder="e.g. jetblue"
              placeholderTextColor={T.textSecondary}
            />
            <Pressable style={styles.primaryBtn} onPress={() => void onSaveAirline()}>
              <Text style={styles.primaryBtnText}>Save airline</Text>
            </Pressable>
          </>
        ) : !hasCredentials ? (
          <>
            <Text style={styles.label}>Employee ID (FLICA login)</Text>
            <TextInput
              value={formUser}
              onChangeText={setFormUser}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              placeholder="UserId"
              placeholderTextColor={T.textSecondary}
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              value={formPass}
              onChangeText={setFormPass}
              secureTextEntry
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={T.textSecondary}
            />
            <Pressable style={styles.primaryBtn} onPress={() => void onSaveAndConnect()}>
              <Text style={styles.primaryBtnText}>Save & Connect</Text>
            </Pressable>
          </>
        ) : (
          <>
            {editingCreds ? (
              <>
                <Text style={styles.label}>Airline host</Text>
                <Text style={styles.maskedCreds} selectable>
                  {storedAirlineSub}.flica.net
                </Text>
                <Text style={styles.label}>FLICA username</Text>
                <TextInput
                  value={editUser}
                  onChangeText={setEditUser}
                  autoCapitalize="none"
                  style={styles.input}
                  placeholderTextColor={T.textSecondary}
                />
                <Text style={styles.label}>FLICA password</Text>
                <TextInput
                  value={editPass}
                  onChangeText={setEditPass}
                  secureTextEntry
                  style={styles.input}
                  placeholderTextColor={T.textSecondary}
                />
                <Pressable style={styles.primaryBtn} onPress={() => void onSaveEdit()}>
                  <Text style={styles.primaryBtnText}>Save</Text>
                </Pressable>
                <Pressable style={styles.ghost} onPress={() => setEditingCreds(false)}>
                  <Text style={styles.ghostText}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.maskedCreds} selectable>
                  {storedAirlineSub}.flica.net · {storedUser}/******
                </Text>
                <Pressable
                  style={[styles.primaryBtn, (syncActive || httpImporting || !canSync) && styles.btnDisabled]}
                  onPress={startSync}
                  disabled={syncActive || httpImporting || !canSync}
                >
                  <Text style={styles.primaryBtnText}>Sync schedule</Text>
                </Pressable>
                <Pressable style={styles.link} onPress={() => setEditingCreds(true)} hitSlop={8}>
                  <Text style={styles.linkText}>Update airline or credentials</Text>
                </Pressable>
              </>
            )}
          </>
        )}

        {lastError ? <Text style={styles.err}>{lastError}</Text> : null}
        <Text style={styles.mono} numberOfLines={2}>
          {statusLine}
        </Text>
      </ScrollView>

      {syncActive && flicaUrls ? (
        <View style={styles.wvHost} pointerEvents="box-none">
          <View style={StyleSheet.absoluteFill} pointerEvents="auto">
            <WebView
              key={webViewKey}
              ref={webViewRef}
              source={{ uri: flicaUrls.ORIGIN }}
              style={styles.web}
              userAgent={FLICA_CONSTANTS.USER_AGENT}
              injectedJavaScriptBeforeContentLoaded={FLICA_POC_INJECT_BEFORE_CONTENT}
              onLoadStart={() => {
                webLoadPassRef.current += 1;
                onLoadStart();
              }}
              onLoadEnd={onLoadEnd}
              onLoadProgress={onLoadProgress}
              onNavigationStateChange={onNavigation}
              onMessage={onMessage}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              originWhitelist={['https://*', 'http://*']}
              setSupportMultipleWindows={false}
              {...(Platform.OS === 'android' ? { mixedContentMode: 'compatibility' as const } : {})}
              cacheEnabled={false}
            />
          </View>
          {!blockingOverlay ? (
            <View style={styles.captchaTopBar} pointerEvents="box-none">
              <Pressable onPress={stopSync} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close FLICA">
                <Ionicons name="close" size={26} color={T.text} />
              </Pressable>
            </View>
          ) : null}
          {blockingOverlay ? (
            <SafeAreaView style={styles.syncOverlay} edges={['top', 'bottom']}>
              <ActivityIndicator size="large" color={T.accent} />
              <Text style={styles.overlayTitle}>{overlayTitle}</Text>
            </SafeAreaView>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16, gap: 6 },
  h1: { fontSize: 20, fontWeight: '800', color: T.text, marginBottom: 8 },
  lead: { fontSize: 14, color: T.textSecondary, lineHeight: 21, marginBottom: 12 },
  hint: { fontSize: 13, color: T.textSecondary, marginBottom: 8, lineHeight: 19 },
  hintMono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, color: T.text },
  label: { fontSize: 12, fontWeight: '700', color: T.textSecondary, marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    color: T.text,
    backgroundColor: T.surface,
  },
  primaryBtn: {
    backgroundColor: T.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnDisabled: { opacity: 0.55 },
  ghost: { marginTop: 10, paddingVertical: 8, alignItems: 'center' },
  ghostText: { color: T.textSecondary, fontWeight: '600' },
  link: { marginTop: 8, paddingVertical: 6, alignItems: 'center' },
  linkText: { color: T.accent, fontWeight: '700', fontSize: 15 },
  maskedCreds: { fontSize: 16, color: T.text, fontWeight: '600' },
  err: { color: T.importReview.bad, marginTop: 12, fontSize: 14, lineHeight: 20 },
  mono: { fontSize: 11, color: T.textSecondary, marginTop: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  wvHost: { ...StyleSheet.absoluteFillObject, zIndex: 20, elevation: 20 },
  web: { flex: 1, backgroundColor: '#fff' },
  syncOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.96)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 10,
  },
  overlayTitle: { fontSize: 17, fontWeight: '700', color: T.text, textAlign: 'center' },
  captchaTopBar: { position: 'absolute', top: 0, right: 0, left: 0, paddingTop: 8, paddingRight: 8, zIndex: 2 },
  closeBtn: { alignSelf: 'flex-end', padding: 6 },
});
