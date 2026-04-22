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
import { Stack, useRouter, type Href } from 'expo-router';
import WebView, { type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

import {
  type FlicaStoredCookies,
  flicaAfterFlushGetCookieStringsForPageUrl,
  flicaSessionFromNativeCookieManagerMerged,
  flicaStoredCookiesFromNativeJar,
  mergeFlicaStoredCookiesPreferRight,
  saveFlicaLastMainmenuUrl,
} from '../../src/dev/flicaPoCCookieStore';
import {
  buildFlicaUrls,
  extractToken1FromHtml,
  FLICA_CONSTANTS,
  loadFlicaAirlineSubdomain,
  loadFlicaCookies,
  loadFlicaCredentials,
  saveFlicaAirlineSubdomain,
  saveFlicaCookies,
  saveFlicaCredentials,
} from '../../src/services/flicaScheduleService';
import {
  extractScheduleTokenFromMainmenuHtml,
  runFlicaFcvHttpScheduledetailOnly,
} from '../../src/dev/flicaPoCScheduleHttp';
import { FLICA_POC_INJECT_BEFORE_CONTENT } from '../../src/dev/flicaPoCWebFontShim';
import { supabase } from '../../src/lib/supabaseClient';
import { persistFlicaDirectImport } from '../../src/features/crew-schedule/persistFlicaDirectImport';
import { scheduleTheme as T } from '../../src/features/crew-schedule/scheduleTheme';
import CrewScheduleHeader from '../../src/features/crew-schedule/components/CrewScheduleHeader';

function flicaPathLooksSignedIn(url: string): boolean {
  const low = (url ?? '').toLowerCase();
  if (!low.includes('flica.net')) return false;
  if (low.includes('login')) return false;
  return (
    low.includes('home') ||
    low.includes('schedules') ||
    low.includes('/full/') ||
    low.includes('mainmenu') ||
    low.includes('leftmenu') ||
    low.includes('scheduledetail') ||
    /flica\.net\/ui\/#/.test(low)
  );
}

function flicaMonthHtmlLooksValid(html: string): boolean {
  const t = (html ?? '').toUpperCase();
  return t.includes('FLTNO') || t.includes('DPS-ARS') || t.includes('SCHEDULEDETAIL');
}

const INJECT_POST_LOADSCHEDULE_HTML = `(function(){
  var p = {
    type: 'loadschedule_html',
    html: document.documentElement.outerHTML,
    url: (window.location && window.location.href) || ''
  };
  if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
    window.ReactNativeWebView.postMessage(JSON.stringify(p));
  }
})(); true;`;

const INJECT_FLICA_BRIDGE_PING = `(function(){
  try {
    var u = (typeof location !== 'undefined' && location.href) ? String(location.href) : '';
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'flica_bridge_ping', url: u }));
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
    var uidEl = pickUserEl();
    var pwdEl = pickPassEl();
    postJson({
      type: 'flica_diag',
      url: String((typeof location !== 'undefined' && location.href) || ''),
      ready: (typeof document !== 'undefined' && document.readyState) || '',
      hasUser: !!uidEl,
      hasPass: !!pwdEl,
    });
    if (window.__flicaUiLoginDidSubmit) { return; }
    if (!uidEl || !pwdEl) {
      postJson({ type: 'flica_no_login_form' });
      return;
    }
    setInputVal(uidEl, ${u});
    setInputVal(pwdEl, ${p});
    setTimeout(function(){
      var btn = pickSubmitEl();
      if (btn) {
        try { btn.click(); } catch (e3) {}
        window.__flicaUiLoginDidSubmit = true;
        postJson({ type: 'flica_login_submitted' });
      } else {
        postJson({ type: 'flica_no_login_form' });
      }
    }, 500);
  })(); true;`;
}

const mergeSession = mergeFlicaStoredCookiesPreferRight;

function parseFlicaCookieHeader(header: string): FlicaStoredCookies {
  const out: FlicaStoredCookies = {};
  for (const segment of header.split(';')) {
    const part = segment.trim();
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name === 'FLiCASession') out.FLiCASession = value;
    else if (name === 'FLiCAService') out.FLiCAService = value;
    else if (name === 'AWSALB') out.AWSALB = value;
    else if (name === 'AWSALBCORS') out.AWSALBCORS = value;
  }
  return out;
}

async function mergedFlicaSessionForHttp(): Promise<FlicaStoredCookies> {
  const h = await loadFlicaCookies();
  let session: FlicaStoredCookies = h ? parseFlicaCookieHeader(h) : {};
  const jar = await flicaSessionFromNativeCookieManagerMerged();
  session = mergeSession(session, jar);
  return session;
}

function extractTokenFromWebViewHtml(html: string): string | null {
  const t1 = extractToken1FromHtml(html);
  if (t1) return t1;
  return extractScheduleTokenFromMainmenuHtml(html);
}

type FlowNav = { loadScheduleInjected: boolean; htmlAttempt: number };

function resetFlowNav(refs: { current: FlowNav }): void {
  refs.current = { loadScheduleInjected: false, htmlAttempt: 0 };
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
  const flowNavRef = useRef<FlowNav>({ loadScheduleInjected: false, htmlAttempt: 0 });
  const completingRef = useRef(false);
  const postCaptchaFiredRef = useRef(false);
  const fcvPhaseRef = useRef<'idle' | 'await_loadschedule_page' | 'await_token'>('idle');
  const scheduleExtractTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webLoadPassRef = useRef(0);
  const lastNavUrlRef = useRef('');
  const pageLoadCountRef = useRef(0);
  const pageFinishDedupeKeyRef = useRef('');
  const pageFinishDedupeAtRef = useRef(0);
  const capturedCookieHeaderRef = useRef<string | null>(null);

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

  const injectNavToLoadSchedule = useMemo(() => {
    if (!flicaUrls) return '';
    return `(function(){ window.location.href = ${JSON.stringify(flicaUrls.MAINMENU_LOADSCHEDULE)}; })(); true;`;
  }, [flicaUrls]);

  const hasCredentials = !!storedUser?.trim();
  const hasAirline = !!storedAirlineSub?.trim();
  const canSync = hasAirline && hasCredentials;

  useEffect(() => {
    LogBox.ignoreLogs([/\d+\s*ms\s*timeout\s*exceeded/i]);
  }, []);

  useEffect(() => {
    if (!syncActive) return;
    const id = setInterval(() => {
      if (completingRef.current) return;
      void (async () => {
        const creds = await loadFlicaCredentials();
        if (!creds) return;
        const script = buildFlicaUiLoginInjectScript(creds.username.trim(), creds.password);
        webViewRef.current?.injectJavaScript(script);
      })();
    }, 1500);
    return () => clearInterval(id);
  }, [syncActive, webViewKey]);

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
    postCaptchaFiredRef.current = false;
    fcvPhaseRef.current = 'idle';
    pageLoadCountRef.current = 0;
    pageFinishDedupeKeyRef.current = '';
    capturedCookieHeaderRef.current = null;
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

  const schedulePostLoadscheduleHtml = useCallback(() => {
    if (completingRef.current) return;
    if (scheduleExtractTimerRef.current) clearTimeout(scheduleExtractTimerRef.current);
    flowNavRef.current.htmlAttempt = 0;
    scheduleExtractTimerRef.current = setTimeout(() => {
      scheduleExtractTimerRef.current = null;
      if (completingRef.current) return;
      webViewRef.current?.injectJavaScript(INJECT_POST_LOADSCHEDULE_HTML);
    }, 2000);
  }, []);

  const runPostCaptchaCookieCaptureAndNavigate = useCallback(
    async (pageUrl: string) => {
      if (postCaptchaFiredRef.current || !flicaUrls || !injectNavToLoadSchedule) return;
      postCaptchaFiredRef.current = true;
      setPostCaptchaFired(true);
      setHideWebForSync(true);
      setCaptchaWebVisible(false);
      setOverlayMessage('Downloading schedule…');
      setStatusLine('Downloading schedule…');
      if (pageUrl) {
        try {
          await saveFlicaLastMainmenuUrl(pageUrl);
        } catch {
          /* non-fatal */
        }
      }
      try {
        await new Promise((r) => setTimeout(r, 400));
        const effectiveUrl = pageUrl || lastNavUrlRef.current;
        let header = '';
        if (Platform.OS !== 'web' && effectiveUrl.startsWith('http')) {
          const pair = await flicaAfterFlushGetCookieStringsForPageUrl(effectiveUrl);
          header = pair.forPage || pair.forBase;
          capturedCookieHeaderRef.current = header.length > 0 ? header : null;
          await saveFlicaCookies(flicaStoredCookiesFromNativeJar(pair.jarMerged));
        }
        if (!header?.trim()) {
          const extra = [flicaUrls.ORIGIN + '/', flicaUrls.MAINMENU];
          const session = await flicaSessionFromNativeCookieManagerMerged({ extraGetBases: extra });
          await saveFlicaCookies(session);
          const h = await loadFlicaCookies();
          if (h?.trim()) {
            header = h;
            capturedCookieHeaderRef.current = h;
          }
        }
        if (!header?.trim()) {
          setLastError('No FLICA cookies after sign-in. Try again.');
          stopSync();
          return;
        }
        fcvPhaseRef.current = 'await_loadschedule_page';
        flowNavRef.current.loadScheduleInjected = true;
        webViewRef.current?.injectJavaScript(injectNavToLoadSchedule);
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
        stopSync();
      }
    },
    [flicaUrls, injectNavToLoadSchedule, stopSync],
  );

  const runHttpImport = useCallback(
    async (token: string, mainmenuPageUrl: string) => {
      if (completingRef.current || !flicaUrls) return;
      completingRef.current = true;
      setHttpImporting(true);
      setPostCaptchaFired(true);
      setOverlayMessage('Syncing schedule…');
      setLastError(null);
      try {
        const session = await mergedFlicaSessionForHttp();
        const cookieOverride = capturedCookieHeaderRef.current?.trim();
        if (!cookieOverride && !session.FLiCASession && !session.FLiCAService) {
          setLastError('Missing FLICA session for HTTP import.');
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) {
          setLastError('Sign in to Flight Club to save your schedule.');
          stopSync();
          return;
        }
        const result = await runFlicaFcvHttpScheduledetailOnly(session, token, {
          refererUrl: flicaUrls.HOME,
          flicaBaseOrigin: flicaUrls.ORIGIN,
          cookieHeaderOverride: cookieOverride || undefined,
          onProgress: (msg) => {
            const raw = (msg ?? '').replace(/^Downloading /, 'Syncing ');
            const t = raw.endsWith('...') ? raw : raw.replace(/\.$/, '...');
            setOverlayMessage(t);
            setStatusLine(t);
          },
        });
        if (!result.ok) {
          setLastError(result.error);
          stopSync();
          return;
        }
        const m = result.multiMonthSchedule?.find((x) => x.blockDate === '0326')?.html ?? '';
        const a = result.multiMonthSchedule?.find((x) => x.blockDate === '0426')?.html ?? '';
        const y = result.multiMonthSchedule?.find((x) => x.blockDate === '0526')?.html ?? '';
        if (!m || !a || !y) {
          setLastError('FLICA returned incomplete months (expected March, April, May).');
          stopSync();
          return;
        }
        if (!flicaMonthHtmlLooksValid(m) || !flicaMonthHtmlLooksValid(a) || !flicaMonthHtmlLooksValid(y)) {
          setLastError('FLICA schedule response did not look like a valid schedule page.');
          stopSync();
          return;
        }
        setOverlayMessage('Saving schedule…');
        await persistFlicaDirectImport(m, a, y);
        if (Platform.OS === 'android') {
          ToastAndroid.show('Schedule synced ✓', ToastAndroid.LONG);
        } else {
          Alert.alert('', 'Schedule synced ✓');
        }
        stopSync();
        router.replace('/crew-schedule/(tabs)' as Href);
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
        stopSync();
      } finally {
        setHttpImporting(false);
        completingRef.current = false;
        resetFlowNav(flowNavRef);
        fcvPhaseRef.current = 'idle';
      }
    },
    [flicaUrls, router, stopSync]
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      if (completingRef.current) return;
      let data: { type?: string; html?: string; url?: string };
      try {
        data = JSON.parse(event.nativeEvent.data) as { type?: string; html?: string; url?: string };
      } catch {
        return;
      }
      if (data.type === 'flica_bridge_ping') {
        const u = (data as { url?: string }).url ?? '';
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
      if (data.type !== 'loadschedule_html' || data.html == null) return;
      const token = extractToken1FromHtml(data.html);
      const pageUrl = (data.url ?? '').trim();
      if (token) {
        void runHttpImport(token, pageUrl);
        return;
      }
      const n = flowNavRef.current.htmlAttempt;
      if (n < 1) {
        flowNavRef.current.htmlAttempt = n + 1;
        setTimeout(() => {
          if (completingRef.current) return;
          webViewRef.current?.injectJavaScript(INJECT_POST_LOADSCHEDULE_HTML);
        }, 2000);
        return;
      }
      setLastError('Could not find a schedule token on the Load Schedule page. Try again.');
      stopSync();
    },
    [runHttpImport, stopSync]
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
        void (async () => {
          if (Platform.OS === 'web') return;
          const pair = await flicaAfterFlushGetCookieStringsForPageUrl(url);
          const h = (pair.forPage || pair.forBase).trim();
          const onLogin = low.includes('login');
          if (!onLogin && pageLoadCountRef.current > 3 && !h) {
            setLastError('No FLICA cookies after sign-in. Try again.');
            stopSync();
            return;
          }
          if (!postCaptchaFiredRef.current && flicaPathLooksSignedIn(url) && h.length > 0) {
            void runPostCaptchaCookieCaptureAndNavigate(url);
          }
        })();
      }
      if (low.includes('mainmenu.cgi') && low.includes('loadschedule=true') && nav.loading === false) {
        if (fcvPhaseRef.current === 'await_loadschedule_page') {
          fcvPhaseRef.current = 'await_token';
        }
        if (flowNavRef.current.loadScheduleInjected) {
          schedulePostLoadscheduleHtml();
        }
      }
    },
    [runPostCaptchaCookieCaptureAndNavigate, schedulePostLoadscheduleHtml, stopSync]
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
  }, [runLoginInject]);

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
    setLastError(null);
    completingRef.current = false;
    postCaptchaFiredRef.current = false;
    fcvPhaseRef.current = 'idle';
    pageLoadCountRef.current = 0;
    pageFinishDedupeKeyRef.current = '';
    pageFinishDedupeAtRef.current = 0;
    capturedCookieHeaderRef.current = null;
    resetFlowNav(flowNavRef);
    setCaptchaWebVisible(false);
    setPostCaptchaFired(false);
    setHideWebForSync(false);
    setHttpImporting(false);
    setOverlayMessage('');
    setWebViewKey((k) => k + 1);
    setSyncActive(true);
    setStatusLine('Starting sync…');
  }, []);

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
              source={{ uri: flicaUrls.LOGIN }}
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
