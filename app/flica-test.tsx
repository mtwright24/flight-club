/**
 * Airline Schedule Sync (FLICA): credentials in SecureStore; hidden WebView auto-login
 * + optional CAPTCHA sheet; then CookieManager + two-token multi-month schedule fetch. Backup = full WebView.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LogBox,
  Modal,
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
import { Stack, useRouter } from 'expo-router';
import WebView, { type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

import {
  type FlicaStoredCookies,
  FLICA_LAST_MAINMENU_URL_KEY,
  clearFlicaCookiesFromSecureStore,
  flicaSessionFromNativeCookieManagerMerged,
  mergeFlicaStoredCookiesPreferRight,
  saveFlicaLastMainmenuUrl,
} from '../src/dev/flicaPoCCookieStore';
import {
  clearFlicaSession,
  extractToken1FromHtml,
  FLICA_CONSTANTS,
  FLICA_URLS,
  loadFlicaCookies,
  loadFlicaCredentials,
  saveFlicaCookies,
  saveFlicaCredentials,
} from '../src/services/flicaScheduleService';
import {
  extractScheduleTokenFromMainmenuHtml,
  type FlicaFcvHttpResult,
  runFlicaFcvHttpScheduleWithCookies,
  runFlicaFcvHttpScheduledetailOnly,
} from '../src/dev/flicaPoCScheduleHttp';
import { supabase } from '../src/lib/supabaseClient';
import { persistFlicaMultiMonthToCrewSchedule } from '../src/services/crewScheduleFlicaImport';
import { FLICA_POC_INJECT_BEFORE_CONTENT } from '../src/dev/flicaPoCWebFontShim';
import { colors, radius, spacing } from '../src/styles/theme';

const INJECT_NAV_TO_LOAD_SCHEDULE = `(function(){
  window.location.href = ${JSON.stringify(FLICA_URLS.MAINMENU_LOADSCHEDULE)};
})(); true;`;

const INJECT_POST_SCHEDULE_PAGE_HTML = `(function(){
  var p = {
    type: 'schedule_page_html',
    html: document.documentElement.outerHTML,
    url: (window.location && window.location.href) || ''
  };
  if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
    window.ReactNativeWebView.postMessage(JSON.stringify(p));
  }
})(); true;`;

/** FCV Charles sequence step 11 — message type must be `loadschedule_html` for the auto WebView path. */
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

/** Minimal inject to verify RN ↔ WebView messaging (runs even if login script fails). */
const INJECT_FLICA_BRIDGE_PING = `(function(){
  try {
    var u = (typeof location !== 'undefined' && location.href) ? String(location.href) : '';
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'flica_bridge_ping', url: u }));
    }
  } catch (e) {}
})(); true;`;

/**
 * FCV UI login: fill + 500ms + submit. Broad selectors for SPA / MUI; native value setter for React controlled inputs.
 * IMPORTANT: Do not set __flicaUiLoginDidSubmit until after click — setting it early blocked all later injects while fields were still mounting.
 */
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

const mergeSession = mergeFlicaStoredCookiesPreferRight;

function extractTokenFromWebViewHtml(html: string): string | null {
  const t = html ?? '';
  const t1 = extractToken1FromHtml(t);
  if (t1) return t1;
  return extractScheduleTokenFromMainmenuHtml(t);
}

/** Parse header from `loadFlicaCookies()` into PoC cookie shape for `flicaPoCScheduleHttp` helpers. */
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

async function loadFlicaStoredCookiesObject(): Promise<FlicaStoredCookies | null> {
  const h = await loadFlicaCookies();
  if (!h) return null;
  return parseFlicaCookieHeader(h);
}

function isMainOrSchedulePath(url: string): boolean {
  const u = (url ?? '').toLowerCase();
  return (
    u.includes('mainmenu.cgi') || u.includes('scheduledetail') || u.includes('leftmenu.cgi') || u.includes('online/leftmenu')
  );
}

/** Confirmed post-CAPTCHA main menu: `mainmenu.cgi` + `GOHM=1` (Charles sequence). */
function isFcvPostCaptchaMainmenuUrl(url: string): boolean {
  const u = (url ?? '').toLowerCase();
  return u.includes('mainmenu.cgi') && u.includes('gohm=1');
}

/**
 * Post-CAPTCHA import: GOHM=1 mainmenu as soon as it finishes loading, OR bare mainmenu only after the hidden
 * WebView session has been open >3s (CAPTCHA-skipped flows). `postCaptchaFiredRef` in the handler ensures a single run.
 */
function shouldTriggerPostCaptchaMainmenu(
  url: string,
  loading: boolean | undefined,
  sessionOpenedAtMs: number,
): boolean {
  const low = (url ?? '').toLowerCase();
  if (!low.includes('mainmenu.cgi')) return false;
  if (low.includes('loadschedule=true')) return false;
  if (loading !== false) return false;
  if (url.includes('LoadSchedule')) return false;

  const hasGohm = low.includes('gohm=1');
  if (hasGohm) return true;

  const elapsedOk = Date.now() - sessionOpenedAtMs > 3000;
  return elapsedOk;
}

/** Post-logon FLICA pages (not the public logon form). Keeps Metro/old bundles from crashing if this name is still referenced. */
function shouldRevealAutoWebView(url: string): boolean {
  const u = (url ?? '').toLowerCase();
  if (!u || !u.includes('flica.net')) return false;
  if (u.includes('/ui/public/login')) return true;
  if (isMainOrSchedulePath(u)) return true;
  if (!u.includes('flicalogon.cgi')) return true;
  return false;
}

type FcvAutoPhase = 'idle' | 'ui_login' | 'await_loadschedule_page' | 'await_token_from_webview';

type WebNav = { loadScheduleInjected: boolean; htmlAttempt: number };

type FlowRefs = {
  navByRef: React.MutableRefObject<{ auto: WebNav; backup: WebNav }>;
  scheduleExtractTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  completing: React.MutableRefObject<boolean>;
};

function resetFlicaWebFlowRefs(refs: FlowRefs, kind?: 'auto' | 'backup'): void {
  if (kind) {
    refs.navByRef.current[kind] = { loadScheduleInjected: false, htmlAttempt: 0 };
  } else {
    refs.navByRef.current.auto = { loadScheduleInjected: false, htmlAttempt: 0 };
    refs.navByRef.current.backup = { loadScheduleInjected: false, htmlAttempt: 0 };
  }
  if (refs.scheduleExtractTimer.current) {
    clearTimeout(refs.scheduleExtractTimer.current);
    refs.scheduleExtractTimer.current = null;
  }
  refs.completing.current = false;
}

const AUTO_REFRESH_STALL_MS = 35000;

export default function FlicaTestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const autoWebViewRef = useRef<InstanceType<typeof WebView> | null>(null);
  const backupWebViewRef = useRef<InstanceType<typeof WebView> | null>(null);

  const [storedUser, setStoredUser] = useState<string | null>(null);
  const [hasLoadedCreds, setHasLoadedCreds] = useState(false);

  const [formUser, setFormUser] = useState('');
  const [formPass, setFormPass] = useState('');
  const [editingCreds, setEditingCreds] = useState(false);
  const [editUser, setEditUser] = useState('');
  const [editPass, setEditPass] = useState('');

  const [statusLine, setStatusLine] = useState('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [autoRefreshKey, setAutoRefreshKey] = useState(0);
  const [autoRefreshActive, setAutoRefreshActive] = useState(false);
  const autoLoginSuccessRef = useRef(false);
  const autoRefreshActiveRef = useRef(false);
  /** Keep in sync with `autoRefreshActive` immediately — WebView can fire onLoadEnd before the useEffect that copies state into the ref. */
  const setAutoRefreshOpen = useCallback((open: boolean) => {
    autoRefreshActiveRef.current = open;
    setAutoRefreshActive(open);
  }, []);
  const [captchaLayerVisible, setCaptchaLayerVisible] = useState(false);
  /** Hide "Authenticating…" once main/schedule loads (session may skip login form + no postMessage). */
  const [autoAuthOverlayDismissed, setAutoAuthOverlayDismissed] = useState(false);
  const autoRefreshStallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoWebViewLoadPassRef = useRef(0);
  /** After GOHM=1: hide WebView visually but keep it mounted for LoadSchedule inject + postMessage. */
  const [autoImportHideWebView, setAutoImportHideWebView] = useState(false);
  const fcvAutoPhaseRef = useRef<FcvAutoPhase>('idle');
  /** Single-flight post-CAPTCHA cookie + LoadSchedule; reset only on refresh / session clear (see `resetPostCaptchaFiredForNewSession`). */
  const postCaptchaFiredRef = useRef(false);
  /** `startAutoRefresh` — used so bare mainmenu does not fire before the WebView has been open 3s. */
  const autoFlicaWebViewOpenedAtRef = useRef(0);

  const [backupMode, setBackupMode] = useState(false);
  const [isImportingSchedule, setIsImportingSchedule] = useState(false);

  const navByRef = useRef({
    auto: { loadScheduleInjected: false, htmlAttempt: 0 },
    backup: { loadScheduleInjected: false, htmlAttempt: 0 },
  });
  const schedulePageExtractTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completingWebImportRef = useRef(false);

  const flowRefs: FlowRefs = useMemo(
    () => ({
      navByRef,
      scheduleExtractTimer: schedulePageExtractTimeoutRef,
      completing: completingWebImportRef,
    }),
    [],
  );

  useEffect(() => {
    LogBox.ignoreLogs([/\d+\s*ms\s+timeout\s+exceeded/i]);
  }, []);

  useEffect(() => {
    autoRefreshActiveRef.current = autoRefreshActive;
  }, [autoRefreshActive]);

  const clearAutoRefreshStallTimer = useCallback(() => {
    if (autoRefreshStallTimerRef.current) {
      clearTimeout(autoRefreshStallTimerRef.current);
      autoRefreshStallTimerRef.current = null;
    }
  }, []);

  const armAutoRefreshStallTimer = useCallback(() => {
    clearAutoRefreshStallTimer();
    autoRefreshStallTimerRef.current = setTimeout(() => {
      autoRefreshStallTimerRef.current = null;
      if (!autoRefreshActiveRef.current) return;
      if (autoLoginSuccessRef.current) return;
      setLastError(
        'FLICA did not finish loading in time (hidden browser may be blocked). Try Backup refresh, or check network / VPN.',
      );
      setStatusLine('stalled');
    }, AUTO_REFRESH_STALL_MS);
  }, [clearAutoRefreshStallTimer]);

  const showScheduleImportedToast = useCallback(() => {
    const msg = 'Schedule imported successfully';
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.LONG);
    } else {
      Alert.alert('Imported', msg);
    }
  }, []);

  const finalizeFlicaImportSuccess = useCallback(
    async (result: Extract<FlicaFcvHttpResult, { ok: true }>): Promise<boolean> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setLastError('Sign in to save your schedule to Flight Club.');
        setStatusLine('import_failed');
        return false;
      }
      if (result.multiMonthSchedule?.length) {
        const { error } = await persistFlicaMultiMonthToCrewSchedule(
          supabase,
          user.id,
          result.multiMonthSchedule
        );
        if (error) {
          setLastError(error.message);
          setStatusLine('import_failed');
          return false;
        }
      }
      showScheduleImportedToast();
      setAutoRefreshOpen(false);
      setAutoImportHideWebView(false);
      setIsImportingSchedule(false);
      setCaptchaLayerVisible(false);
      fcvAutoPhaseRef.current = 'idle';
      router.replace('/crew-schedule/(tabs)');
      return true;
    },
    [router, showScheduleImportedToast, setAutoRefreshOpen],
  );

  const loadCreds = useCallback(async () => {
    const c = await loadFlicaCredentials();
    if (!c) {
      setStoredUser(null);
      setFormUser('');
      setFormPass('');
      setEditUser('');
      setEditPass('');
      setHasLoadedCreds(true);
      return;
    }
    setStoredUser(c.username);
    setFormUser(c.username);
    setFormPass(c.password);
    setEditUser(c.username);
    setEditPass(c.password);
    setHasLoadedCreds(true);
  }, []);

  useEffect(() => {
    void loadCreds();
  }, [loadCreds]);

  const hasCredentials = !!(storedUser && storedUser.length > 0);

  const prefillScriptBackup = useMemo(() => {
    const uStr = (editingCreds ? editUser : formUser).trim();
    const pStr = editingCreds ? editPass : formPass;
    const u = JSON.stringify(uStr);
    const p = JSON.stringify(pStr);
    return `(function(){
      var uu=${u};
      var pp=${p};
      function f(){
        var a=document.querySelector('input[name="UserId"]');
        var b=document.querySelector('input[name="Password"]');
        if (a) a.value=uu;
        if (b) b.value=pp;
      }
      f();
      setTimeout(f, 400);
      setTimeout(f, 1200);
    })(); true;`;
  }, [editUser, editPass, editingCreds, formPass, formUser]);

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
      setEditingCreds(false);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }, [formPass, formUser]);

  const onSaveEditCreds = useCallback(async () => {
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
      setStatusLine('Credentials updated');
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }, [editPass, editUser]);

  const resetPostCaptchaFiredForNewSession = useCallback(() => {
    postCaptchaFiredRef.current = false;
  }, []);

  const onRemoveFlica = useCallback(async () => {
    setLastError(null);
    clearAutoRefreshStallTimer();
    resetFlicaWebFlowRefs(flowRefs);
    setAutoRefreshOpen(false);
    setBackupMode(false);
    setCaptchaLayerVisible(false);
    setIsImportingSchedule(false);
    setAutoImportHideWebView(false);
    setAutoAuthOverlayDismissed(false);
    autoLoginSuccessRef.current = false;
    resetPostCaptchaFiredForNewSession();
    fcvAutoPhaseRef.current = 'idle';
    try {
      await clearFlicaSession();
      await SecureStore.deleteItemAsync(FLICA_LAST_MAINMENU_URL_KEY).catch(() => {});
      setStoredUser(null);
      setFormUser('');
      setFormPass('');
      setEditUser('');
      setEditPass('');
      setStatusLine('Flica login removed from this device');
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }, [clearAutoRefreshStallTimer, flowRefs, resetPostCaptchaFiredForNewSession, setAutoRefreshOpen]);

  const stopAutoRefresh = useCallback(() => {
    clearAutoRefreshStallTimer();
    setAutoRefreshOpen(false);
    setCaptchaLayerVisible(false);
    setAutoAuthOverlayDismissed(false);
    setAutoImportHideWebView(false);
    autoLoginSuccessRef.current = false;
    fcvAutoPhaseRef.current = 'idle';
    setAutoRefreshKey((k) => k + 1);
    resetFlicaWebFlowRefs(flowRefs);
    setStatusLine('Refresh cancelled');
  }, [clearAutoRefreshStallTimer, flowRefs, setAutoRefreshOpen]);

  const completeScheduleImportWithToken = useCallback(
    async (token: string, mainmenuPageUrl: string, fromRef: 'auto' | 'backup') => {
      if (completingWebImportRef.current) return;
      completingWebImportRef.current = true;
      setLastError(null);
      let skipFullImportTeardown = false;
      let importSucceeded = false;
      try {
        let session: FlicaStoredCookies;
        if (fromRef === 'auto') {
          session = (await loadFlicaStoredCookiesObject()) ?? {};
          if (!session.FLiCASession && !session.FLiCAService) {
            const jar = await flicaSessionFromNativeCookieManagerMerged();
            session = mergeSession(session, jar);
          }
          if (!session.FLiCASession && !session.FLiCAService) {
            setLastError(
              'No FLICA session in secure storage. After CAPTCHA, cookies should have been saved — try Backup refresh or Refresh again.',
            );
            setStatusLine('import_failed');
            return;
          }
        } else {
          const stored = (await loadFlicaStoredCookiesObject()) ?? {};
          let jarSession = await flicaSessionFromNativeCookieManagerMerged();
          session = mergeSession(stored, jarSession);
          if (!session.FLiCASession && !session.FLiCAService) {
            await new Promise((r) => setTimeout(r, 450));
            jarSession = await flicaSessionFromNativeCookieManagerMerged();
            session = mergeSession(stored, jarSession);
          }
          if (!session.FLiCASession && !session.FLiCAService) {
            setLastError(
              'No FLiCASession/FLiCAService after main menu. Tap Refresh schedule again or use Backup refresh.',
            );
            setStatusLine('import_failed');
            return;
          }
          await saveFlicaCookies(session);
          if (mainmenuPageUrl) await saveFlicaLastMainmenuUrl(mainmenuPageUrl);
          setAutoRefreshOpen(false);
          setBackupMode(false);
          setCaptchaLayerVisible(false);
          console.log('[FLICA IMPORTING OVERLAY SET]', true);
          setIsImportingSchedule(true);
        }

        setStatusLine('Importing schedule…');
        const result = await runFlicaFcvHttpScheduledetailOnly(session, token, {
          refererUrl: mainmenuPageUrl,
          onProgress: fromRef === 'auto' ? (msg) => setStatusLine(msg) : undefined,
        });
        if (result.ok) {
          setStatusLine('Saving schedule…');
          const saved = await finalizeFlicaImportSuccess(result);
          if (saved) {
            importSucceeded = true;
          }
          return;
        }
        if (result.captchaRequired) {
          setLastError(result.error);
          if (fromRef === 'auto') {
            skipFullImportTeardown = true;
            setAutoRefreshOpen(true);
            setCaptchaLayerVisible(true);
            setAutoImportHideWebView(false);
            setIsImportingSchedule(false);
            fcvAutoPhaseRef.current = 'ui_login';
          } else {
            setBackupMode(true);
          }
          return;
        }
        setLastError(result.error);
        setStatusLine('import_failed');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log('[FLICA ERROR]', msg);
        setLastError(msg);
        setStatusLine('import_failed');
      } finally {
        clearAutoRefreshStallTimer();
        completingWebImportRef.current = false;
        resetFlicaWebFlowRefs(flowRefs);
        if (importSucceeded) {
          return;
        }
        if (!skipFullImportTeardown) {
          setIsImportingSchedule(false);
          setAutoImportHideWebView(false);
          setAutoRefreshOpen(false);
          fcvAutoPhaseRef.current = 'idle';
        }
      }
    },
    [clearAutoRefreshStallTimer, finalizeFlicaImportSuccess, flowRefs, setAutoRefreshOpen],
  );

  /** After main menu (GOHM=1 or CAPTCHA skipped): overlay → 1500ms → CookieManager.get once → LoadSchedule inject. */
  const runPostCaptchaCookieCaptureAndNavigate = useCallback(
    async (fullMainmenuUrl: string) => {
      if (postCaptchaFiredRef.current) {
        console.log('[FLICA] handler already fired, skipping');
        return;
      }
      postCaptchaFiredRef.current = true;
      console.log('[FLICA POST-CAPTCHA TRIGGERED]', fullMainmenuUrl);
      console.log('[FLICA IMPORTING OVERLAY SET]', true);
      setIsImportingSchedule(true);
      setAutoImportHideWebView(true);
      setCaptchaLayerVisible(false);
      setAutoAuthOverlayDismissed(true);
      setStatusLine('Importing schedule…');
      if (fullMainmenuUrl) {
        try {
          await saveFlicaLastMainmenuUrl(fullMainmenuUrl);
        } catch {
          /* non-fatal */
        }
      }
      try {
        await new Promise((r) => setTimeout(r, 1500));
        let session = await flicaSessionFromNativeCookieManagerMerged();
        if (!session.FLiCASession && !session.FLiCAService) {
          await new Promise((r) => setTimeout(r, 450));
          session = await flicaSessionFromNativeCookieManagerMerged();
        }
        if (!session.FLiCASession && !session.FLiCAService) {
          setLastError(
            'No FLICA cookies after CAPTCHA (http+https jar read). Try Backup refresh or wait for redirect to https.',
          );
          setStatusLine('import_failed');
          setIsImportingSchedule(false);
          setAutoImportHideWebView(false);
          fcvAutoPhaseRef.current = 'ui_login';
          return;
        }
        await saveFlicaCookies(session);
        fcvAutoPhaseRef.current = 'await_loadschedule_page';
        navByRef.current.auto.loadScheduleInjected = true;
        autoWebViewRef.current?.injectJavaScript(INJECT_NAV_TO_LOAD_SCHEDULE);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLastError(msg);
        setStatusLine('import_failed');
        setIsImportingSchedule(false);
        setAutoImportHideWebView(false);
        fcvAutoPhaseRef.current = 'ui_login';
      }
    },
    [],
  );

  const schedulePostLoadscheduleHtmlAuto = useCallback(() => {
    if (completingWebImportRef.current) return;
    if (schedulePageExtractTimeoutRef.current) {
      clearTimeout(schedulePageExtractTimeoutRef.current);
    }
    navByRef.current.auto.htmlAttempt = 0;
    schedulePageExtractTimeoutRef.current = setTimeout(() => {
      schedulePageExtractTimeoutRef.current = null;
      if (completingWebImportRef.current) return;
      autoWebViewRef.current?.injectJavaScript(INJECT_POST_LOADSCHEDULE_HTML);
      console.log('[FLICA] postMessage injected for loadschedule_html');
    }, 2000);
  }, []);

  const schedulePostHtmlExtraction = useCallback((refKind: 'auto' | 'backup') => {
    if (refKind === 'auto') return;
    if (completingWebImportRef.current) return;
    if (schedulePageExtractTimeoutRef.current) {
      clearTimeout(schedulePageExtractTimeoutRef.current);
    }
    navByRef.current.backup.htmlAttempt = 0;
    schedulePageExtractTimeoutRef.current = setTimeout(() => {
      schedulePageExtractTimeoutRef.current = null;
      if (completingWebImportRef.current) return;
      backupWebViewRef.current?.injectJavaScript(INJECT_POST_SCHEDULE_PAGE_HTML);
    }, 1000);
  }, []);

  /** Overlay + CAPTCHA banner. Never treat bare mainmenu as “done” — only GOHM=1 post-CAPTCHA is the real main menu. */
  const syncAutoWebViewChromeFromUrl = useCallback(
    (url: string) => {
      const uRaw = url ?? '';
      if (!autoRefreshActiveRef.current || uRaw.length === 0) return;
      const low = uRaw.toLowerCase();
      if (isMainOrSchedulePath(uRaw)) {
        if (low.includes('mainmenu.cgi') && !isFcvPostCaptchaMainmenuUrl(uRaw)) {
          return;
        }
        clearAutoRefreshStallTimer();
        setCaptchaLayerVisible(false);
        setAutoAuthOverlayDismissed(true);
      } else if (autoLoginSuccessRef.current) {
        clearAutoRefreshStallTimer();
        setCaptchaLayerVisible(true);
        setAutoAuthOverlayDismissed(true);
      } else if (shouldRevealAutoWebView(uRaw)) {
        clearAutoRefreshStallTimer();
        setAutoAuthOverlayDismissed(true);
      } else if (/flica\.net/i.test(uRaw)) {
        clearAutoRefreshStallTimer();
        setAutoAuthOverlayDismissed(true);
      }
    },
    [clearAutoRefreshStallTimer],
  );

  /** `flica_diag` only syncs chrome — never inject LoadSchedule (GOHM handler does that after one cookie read). */
  const handleFlicaAutoDiagUrl = useCallback(
    (url: string) => {
      if (completingWebImportRef.current) return;
      syncAutoWebViewChromeFromUrl(url);
    },
    [syncAutoWebViewChromeFromUrl],
  );

  /** Auto: GOHM=1 mainmenu → cookie capture; LoadSchedule only after that. Backup: unchanged classic flow. */
  const advanceMainmenuFromUrl = useCallback(
    (url: string, refKind: 'auto' | 'backup') => {
      if (completingWebImportRef.current) return;
      const n = navByRef.current[refKind];
      const uRaw = url ?? '';
      const u = uRaw.toLowerCase();

      if (!u.includes('mainmenu.cgi')) return;

      if (!u.includes('loadschedule=true')) {
        if (refKind === 'backup') {
          if (!n.loadScheduleInjected) {
            n.loadScheduleInjected = true;
            backupWebViewRef.current?.injectJavaScript(INJECT_NAV_TO_LOAD_SCHEDULE);
          }
        }
        return;
      }

      if (refKind === 'auto') {
        if (fcvAutoPhaseRef.current !== 'await_loadschedule_page') return;
        fcvAutoPhaseRef.current = 'await_token_from_webview';
      }

      n.htmlAttempt = 0;
      if (refKind === 'auto') {
        console.log('[FLICA] LoadSchedule detected, waiting 2000ms then injecting postMessage');
        schedulePostLoadscheduleHtmlAuto();
      } else {
        schedulePostHtmlExtraction(refKind);
      }
    },
    [schedulePostHtmlExtraction, schedulePostLoadscheduleHtmlAuto],
  );

  const onWebViewNavigation = useCallback(
    (nav: WebViewNavigation, refKind: 'auto' | 'backup') => {
      const url = nav.url ?? '';
      const loading = nav.loading;
      console.log('[FLICA NAV]', url, 'loading:', loading);
      console.log(
        '[FLICA GOHM CHECK]',
        'hasMainmenu:',
        url.includes('mainmenu.cgi'),
        'hasGOHM:',
        url.includes('GOHM=1'),
        'hasLoadSchedule:',
        url.includes('LoadSchedule'),
      );
      if (completingWebImportRef.current) return;
      const low = url.toLowerCase();

      if (refKind === 'auto') {
        if (shouldTriggerPostCaptchaMainmenu(url, loading, autoFlicaWebViewOpenedAtRef.current)) {
          void runPostCaptchaCookieCaptureAndNavigate(url);
        }
        syncAutoWebViewChromeFromUrl(url);
        if (nav.loading !== false) return;
        advanceMainmenuFromUrl(url, refKind);
        return;
      }

      if (nav.loading !== false) return;
      advanceMainmenuFromUrl(url, refKind);
    },
    [advanceMainmenuFromUrl, runPostCaptchaCookieCaptureAndNavigate, syncAutoWebViewChromeFromUrl],
  );

  const onWebViewMessage = useCallback(
    (event: WebViewMessageEvent, refKind: 'auto' | 'backup') => {
      try {
        console.log('[FLICA onMessage]', JSON.parse(event.nativeEvent.data).type);
      } catch {
        /* ignore */
      }
      if (completingWebImportRef.current) return;
      const n = navByRef.current[refKind];
      let data: { type?: string; html?: string; url?: string };
      try {
        data = JSON.parse(event.nativeEvent.data) as { type?: string; html?: string; url?: string };
      } catch {
        return;
      }
      if (refKind === 'auto') {
        if (data.type === 'flica_bridge_ping') {
          const url = ((data as { url?: string }).url ?? '').trim();
          clearAutoRefreshStallTimer();
          if (url) {
            syncAutoWebViewChromeFromUrl(url);
            handleFlicaAutoDiagUrl(url);
          } else {
            setAutoAuthOverlayDismissed(true);
          }
          return;
        }
        if (data.type === 'flica_diag') {
          const diag = data as { type: string; url?: string; ready?: string; hasUser?: boolean; hasPass?: boolean };
          handleFlicaAutoDiagUrl(diag.url ?? '');
          return;
        }
        if (data.type === 'flica_no_login_form') {
          if (autoLoginSuccessRef.current) {
            clearAutoRefreshStallTimer();
            setAutoAuthOverlayDismissed(true);
          }
          return;
        }
        if (data.type === 'flica_login_submitted') {
          autoLoginSuccessRef.current = true;
          clearAutoRefreshStallTimer();
          setAutoAuthOverlayDismissed(true);
          setStatusLine('Check the box if asked, then Continue…');
          return;
        }
      }
      if (
        (data.type !== 'loadschedule_html' && data.type !== 'schedule_page_html') ||
        data.html == null
      ) {
        return;
      }
      const token =
        data.type === 'loadschedule_html'
          ? extractToken1FromHtml(data.html)
          : extractTokenFromWebViewHtml(data.html);
      console.log('[FLICA TOKEN1]', token ?? 'NOT FOUND');
      const pageUrl = (data.url ?? '').trim();
      if (token) {
        void completeScheduleImportWithToken(token, pageUrl, refKind);
        return;
      }
      const attempt = n.htmlAttempt;
      if (attempt < 1) {
        n.htmlAttempt = attempt + 1;
        setStatusLine('No token in page HTML, retrying in 2s…');
        setTimeout(() => {
          if (completingWebImportRef.current) return;
          const w = refKind === 'auto' ? autoWebViewRef : backupWebViewRef;
          const inj = refKind === 'auto' ? INJECT_POST_LOADSCHEDULE_HTML : INJECT_POST_SCHEDULE_PAGE_HTML;
          w.current?.injectJavaScript(inj);
        }, 2000);
        return;
      }
      setLastError('Could not find schedule token in mainmenu?LoadSchedule page HTML. Try again.');
      setStatusLine('import_failed');
      resetFlicaWebFlowRefs(flowRefs);
    },
    [
      clearAutoRefreshStallTimer,
      completeScheduleImportWithToken,
      flowRefs,
      handleFlicaAutoDiagUrl,
      syncAutoWebViewChromeFromUrl,
    ],
  );

  const runAutoWebViewLoginInject = useCallback(() => {
    if (!autoRefreshActiveRef.current) return;
    void (async () => {
      if (!autoRefreshActiveRef.current) return;
      const u = (storedUser ?? formUser).trim();
      if (!u) {
        setLastError('Missing FLICA username in SecureStore.');
        stopAutoRefresh();
        return;
      }
      const creds = await loadFlicaCredentials();
      if (!creds) {
        setLastError('Missing FLICA credentials. Update credentials in settings.');
        stopAutoRefresh();
        return;
      }
      const pw = creds.password ?? formPass;
      if (!pw) {
        setLastError('Missing FLICA password. Update credentials in settings.');
        stopAutoRefresh();
        return;
      }
      const un = creds.username.trim() || u;
      const script = buildFlicaUiLoginInjectScript(un, pw);
      const run = () => {
        if (!autoRefreshActiveRef.current) return;
        autoWebViewRef.current?.injectJavaScript(script);
      };
      setStatusLine('FLICA page ready — applying saved login…');
      run();
      setTimeout(run, 250);
      setTimeout(run, 600);
      setTimeout(run, 1200);
      setTimeout(run, 2200);
      setTimeout(run, 3800);
      setTimeout(run, 6000);
      setTimeout(run, 9000);
    })();
  }, [formPass, formUser, storedUser, stopAutoRefresh]);

  const onAutoWebViewLoadEnd = useCallback(() => {
    autoWebViewLoadPassRef.current += 1;
    if (autoRefreshActiveRef.current) {
      autoWebViewRef.current?.injectJavaScript(INJECT_FLICA_BRIDGE_PING);
    }
    runAutoWebViewLoginInject();
  }, [runAutoWebViewLoginInject]);

  const onAutoWebViewLoadProgress = useCallback(
    (e: { nativeEvent: { progress: number } }) => {
      if (e.nativeEvent.progress < 0.99) return;
      const p = autoWebViewLoadPassRef.current;
      setTimeout(() => {
        if (autoWebViewLoadPassRef.current === p) {
          runAutoWebViewLoginInject();
        }
      }, 250);
    },
    [runAutoWebViewLoginInject],
  );

  const startAutoRefresh = useCallback(() => {
    setLastError(null);
    setStatusLine('Loading FLICA (hidden)…');
    resetFlicaWebFlowRefs(flowRefs);
    autoLoginSuccessRef.current = false;
    resetPostCaptchaFiredForNewSession();
    autoFlicaWebViewOpenedAtRef.current = Date.now();
    fcvAutoPhaseRef.current = 'ui_login';
    setCaptchaLayerVisible(false);
    setAutoAuthOverlayDismissed(false);
    setAutoImportHideWebView(false);
    autoWebViewLoadPassRef.current = 0;
    setAutoRefreshKey((k) => k + 1);
    setAutoRefreshOpen(true);
    armAutoRefreshStallTimer();
  }, [armAutoRefreshStallTimer, flowRefs, resetPostCaptchaFiredForNewSession, setAutoRefreshOpen]);

  useEffect(() => {
    if (!autoRefreshActive) return;
    const id = setInterval(() => {
      if (!autoRefreshActiveRef.current || completingWebImportRef.current) return;
      void (async () => {
        const creds = await loadFlicaCredentials();
        if (!creds) return;
        const un = creds.username.trim();
        const pw = creds.password;
        if (!un || !pw) return;
        const script = buildFlicaUiLoginInjectScript(un, pw);
        autoWebViewRef.current?.injectJavaScript(script);
      })();
    }, 1500);
    return () => clearInterval(id);
  }, [autoRefreshActive, autoRefreshKey]);

  const startBackupRefresh = useCallback(() => {
    setLastError(null);
    setStatusLine('Use the WebView: sign in, solve CAPTCHA, then open main menu. Schedule loads automatically.');
    resetFlicaWebFlowRefs(flowRefs, 'backup');
    setBackupMode(true);
  }, [flowRefs]);

  const importScheduleWithStoredSession = useCallback(async () => {
    setLastError(null);
    setBusy(true);
    setStatusLine('importing with saved session…');
    try {
      const session = await loadFlicaStoredCookiesObject();
      if (!session || (!session.FLiCASession && !session.FLiCAService)) {
        setLastError('No saved session. Run a refresh to sign in, or use Backup refresh.');
        setStatusLine('no_session');
        return;
      }
      const result = await runFlicaFcvHttpScheduleWithCookies(session);
      if (result.ok) {
        setStatusLine('Saving schedule…');
        await finalizeFlicaImportSuccess(result);
        return;
      }
      if (result.captchaRequired) {
        setLastError(result.error);
        setStatusLine('run refresh to sign in');
        return;
      }
      setLastError(result.error);
      setStatusLine('import_failed');
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      setStatusLine('import_failed');
    } finally {
      setBusy(false);
    }
  }, [finalizeFlicaImportSuccess, router]);

  const onClearSessionOnly = useCallback(async () => {
    setLastError(null);
    resetFlicaWebFlowRefs(flowRefs);
    resetPostCaptchaFiredForNewSession();
    await clearFlicaCookiesFromSecureStore();
    setStatusLine('Session cookies cleared (FLICA username/password kept)');
  }, [flowRefs, resetPostCaptchaFiredForNewSession]);

  const onAutoWebViewLoadStart = useCallback(() => {
    setStatusLine('Loading FLICA page…');
  }, []);

  if (!hasLoadedCreds) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.title}>Airline Schedule Sync</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.textPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Airline Schedule Sync</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.mainFlex}>
        {isImportingSchedule && !autoRefreshActive ? (
          <View style={styles.importingScreen} accessibilityRole="progressbar" accessibilityLabel="Importing schedule">
            <ActivityIndicator size="large" color={colors.textPrimary} />
            <Text style={styles.importingTitle}>Importing schedule…</Text>
            <Text style={styles.importingSub}>Downloading your schedule with your FLICA session. This may take a few seconds.</Text>
          </View>
        ) : null}

        <Modal
          visible={autoRefreshActive}
          animationType="fade"
          presentationStyle="fullScreen"
          onRequestClose={stopAutoRefresh}
          statusBarTranslucent={Platform.OS === 'android'}
        >
          <SafeAreaView style={styles.modalSafe} edges={['bottom']}>
            <View style={[styles.modalColumn, { paddingTop: insets.top }]}>
              {captchaLayerVisible ? (
                <View style={[styles.fcvVerifyBanner, { paddingTop: spacing.md }]}>
                  <Text style={styles.fcvVerifyTitle}>Login to Flica ({(storedUser ?? '').toLowerCase()})</Text>
                  <Text style={styles.fcvVerifyStep}>1. Fill out the captcha.</Text>
                  <Text style={styles.fcvVerifyStep}>2. Tap the captcha&apos;s &quot;Continue&quot; button.</Text>
                  <Text style={styles.fcvVerifyStep}>
                    3. Wait for the Main Menu page to fully load. Do NOT tap &quot;Next&quot; unless it stalls or gets stuck.
                  </Text>
                  <Pressable style={styles.fcvExitBtn} onPress={stopAutoRefresh}>
                    <Text style={styles.fcvExitBtnText}>EXIT</Text>
                  </Pressable>
                </View>
              ) : null}
              <WebView
                key={`auto-${autoRefreshKey}`}
                ref={autoWebViewRef}
                source={{ uri: FLICA_URLS.LOGIN }}
                style={[
                  styles.modalWebFlex,
                  captchaLayerVisible && styles.modalWebWithCaptchaBanner,
                  autoImportHideWebView && styles.modalWebHidden,
                ]}
                userAgent={FLICA_CONSTANTS.USER_AGENT}
                onLoadStart={onAutoWebViewLoadStart}
                onLoadProgress={onAutoWebViewLoadProgress}
                onLoadEnd={onAutoWebViewLoadEnd}
                onNavigationStateChange={(nav) => onWebViewNavigation(nav, 'auto')}
                onContentProcessDidTerminate={() => {
                  autoWebViewRef.current?.reload();
                }}
                onMessage={(e) => onWebViewMessage(e, 'auto')}
                onError={(ev) => setLastError(ev.nativeEvent.description ?? 'WebView error')}
                onHttpError={(ev) => {
                  const st = ev.nativeEvent.statusCode;
                  setLastError(st ? `FLICA page HTTP ${st}` : 'FLICA page failed to load');
                }}
                javaScriptEnabled
                domStorageEnabled
                sharedCookiesEnabled
                thirdPartyCookiesEnabled
                originWhitelist={['https://*', 'http://*']}
                setSupportMultipleWindows={false}
                {...(Platform.OS === 'android' ? { mixedContentMode: 'compatibility' as const } : {})}
                cacheEnabled={false}
              />
              {!captchaLayerVisible && !autoAuthOverlayDismissed ? (
                <View style={styles.authBlockingOverlay} pointerEvents="box-none">
                  <View style={styles.authCenter} pointerEvents="none">
                    <ActivityIndicator size="large" color={colors.textPrimary} />
                    <Text style={styles.authTitle}>Authenticating…</Text>
                    <Text style={styles.authSub}>Signing in with your saved credentials</Text>
                  </View>
                  <Pressable style={styles.authCancelWrap} onPress={stopAutoRefresh} hitSlop={12}>
                    <Text style={styles.authCancelText}>Cancel</Text>
                  </Pressable>
                </View>
              ) : null}
              {isImportingSchedule && autoRefreshActive ? (
                <View
                  style={styles.autoImportOverlay}
                  accessibilityRole="progressbar"
                  accessibilityLabel="Importing schedule"
                >
                  <ActivityIndicator size="large" color={colors.textPrimary} />
                  <Text style={styles.importingTitle}>
                    {statusLine &&
                    statusLine !== 'idle' &&
                    (statusLine.startsWith('Importing') ||
                      statusLine.startsWith('Downloading') ||
                      statusLine.startsWith('Opening'))
                      ? statusLine
                      : 'Importing schedule…'}
                  </Text>
                  <Text style={styles.importingSub}>
                    {statusLine.startsWith('Downloading')
                      ? ' '
                      : 'Keep this screen open — the FLICA session stays active in the background.'}
                  </Text>
                </View>
              ) : null}
            </View>
          </SafeAreaView>
        </Modal>

        {backupMode && !isImportingSchedule ? (
        <View style={styles.webBoxFull}>
          <View style={styles.captchaBanner}>
            <Text style={styles.captchaBannerText}>
              Backup refresh: use this page to sign in. After the main menu loads the schedule, we will import. Close when done
              or if you want to return.
            </Text>
            <Pressable
              style={styles.primary}
              onPress={() => {
                setBackupMode(false);
                resetFlicaWebFlowRefs(flowRefs);
              }}
            >
              <Text style={styles.primaryText}>Close</Text>
            </Pressable>
          </View>
          <WebView
            ref={backupWebViewRef}
            source={{ uri: FLICA_URLS.LOGON_CGI }}
            style={styles.web}
            userAgent={FLICA_CONSTANTS.USER_AGENT}
            injectedJavaScriptBeforeContentLoaded={FLICA_POC_INJECT_BEFORE_CONTENT}
            injectedJavaScript={prefillScriptBackup}
            onNavigationStateChange={(nav) => onWebViewNavigation(nav, 'backup')}
            onMessage={(e) => onWebViewMessage(e, 'backup')}
            onError={(ev) => setLastError(ev.nativeEvent.description ?? 'WebView error')}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            {...(Platform.OS === 'android' ? { mixedContentMode: 'compatibility' as const } : {})}
          />
        </View>
      ) : !backupMode && !isImportingSchedule ? (
        <ScrollView
          style={styles.scrollOnTop}
          contentContainerStyle={styles.pad}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {!hasCredentials ? (
            <>
              <Text style={styles.hint}>
                Connect your FLICA account so the app can refresh your schedule. Your password is stored only on this device
                in the secure enclave.
              </Text>
              <Text style={styles.label}>FLICA Username</Text>
              <TextInput
                value={formUser}
                onChangeText={setFormUser}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                autoComplete="username"
                style={styles.input}
                placeholder="UserId"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={styles.label}>FLICA Password</Text>
              <TextInput
                value={formPass}
                onChangeText={setFormPass}
                secureTextEntry
                textContentType="password"
                autoComplete="password"
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={colors.textSecondary}
              />
              <Pressable style={styles.primary} onPress={() => void onSaveAndConnect()}>
                <Text style={styles.primaryText}>Save &amp; Connect</Text>
              </Pressable>
            </>
          ) : (
            <>
              {editingCreds ? (
                <>
                  <Text style={styles.label}>FLICA Username</Text>
                  <TextInput
                    value={editUser}
                    onChangeText={setEditUser}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Text style={styles.label}>FLICA Password</Text>
                  <TextInput
                    value={editPass}
                    onChangeText={setEditPass}
                    secureTextEntry
                    style={styles.input}
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Pressable style={styles.primary} onPress={() => void onSaveEditCreds()}>
                    <Text style={styles.primaryText}>Save</Text>
                  </Pressable>
                  <Pressable style={styles.tertiary} onPress={() => setEditingCreds(false)}>
                    <Text style={styles.tertiaryText}>Cancel</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={styles.credRow}
                  onPress={() => {
                    setEditingCreds(true);
                    setEditUser(storedUser ?? '');
                    setEditPass(formPass);
                    void loadFlicaCredentials().then((c) => {
                      if (!c) return;
                      setEditUser(c.username.trim());
                      setEditPass(c.password);
                    });
                  }}
                >
                  <Text style={styles.credRowText} selectable>
                    {storedUser}/****** — tap to update
                  </Text>
                </Pressable>
              )}

              {!editingCreds ? (
                <>
                  <Text style={styles.section}>Refresh</Text>
                  <Pressable
                    style={[styles.primary, (busy || isImportingSchedule) && styles.disabledBtn]}
                    onPress={() => void startAutoRefresh()}
                    disabled={busy || isImportingSchedule}
                  >
                    <Text style={styles.primaryText}>Refresh schedule</Text>
                  </Pressable>
                  <Text style={styles.hintSmall}>
                    The app will sign you in in the background, then ask you to complete verification (CAPTCHA) if needed, then
                    import your schedule.
                  </Text>

                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Backup refresh</Text>
                    <Text style={styles.cardBody}>
                      An alternative schedule refresh process. This will guide you through downloading and updating your
                      schedule.
                    </Text>
                    <Pressable
                      style={styles.secondary}
                      onPress={() => startBackupRefresh()}
                      disabled={isImportingSchedule}
                    >
                      <Text style={styles.secondaryText}>Open backup WebView</Text>
                    </Pressable>
                  </View>

                  <Pressable
                    style={[styles.secondary, busy && styles.disabledBtn]}
                    onPress={() => void importScheduleWithStoredSession()}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator color={colors.textPrimary} />
                    ) : (
                      <Text style={styles.secondaryText}>Quick import (saved session only)</Text>
                    )}
                  </Pressable>

                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Remove Flica login</Text>
                    <Text style={styles.cardBody}>
                      Removing your Flica login will remove your schedule from this device.
                    </Text>
                    <Pressable style={styles.dangerRow} onPress={() => void onRemoveFlica()}>
                      <Text style={styles.dangerText}>Remove Flica login</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.section}>Server session</Text>
                  <Pressable style={styles.tertiary} onPress={() => void onClearSessionOnly()}>
                    <Text style={styles.tertiaryText}>Clear session cookies only</Text>
                  </Pressable>
                  <Text style={styles.hintSmall}>
                    Keep username/password. Use when the server session expired but you don&apos;t want to remove the saved
                    login.
                  </Text>
                </>
              ) : null}
            </>
          )}

          <Text style={styles.mono}>Status: {statusLine}</Text>
          {lastError ? <Text style={styles.err}>Error: {lastError}</Text> : null}
        </ScrollView>
      ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  mainFlex: { flex: 1, position: 'relative' },
  scrollOnTop: { flex: 1, zIndex: 2 },
  modalSafe: { flex: 1, backgroundColor: '#ffffff' },
  /** Column: optional CAPTCHA banner (flex) then WebView (flex 1) so FLICA content is not drawn under the blue header. */
  modalColumn: { flex: 1, flexDirection: 'column', backgroundColor: '#ffffff' },
  modalWebFlex: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  /** Extra top inset inside WebView so reCAPTCHA / Continue sit clearly below the native banner. */
  modalWebWithCaptchaBanner: {
    marginTop: spacing.xl + spacing.lg,
  },
  modalWebHidden: {
    opacity: 0,
  },
  fcvVerifyBanner: {
    flexShrink: 0,
    backgroundColor: '#b8d4e8',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.15)',
  },
  autoImportOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
  },
  authBlockingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
    backgroundColor: 'rgba(232, 244, 252, 0.97)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  authCenter: { alignItems: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  authTitle: { fontSize: 20, fontWeight: '600', color: colors.textPrimary, marginTop: spacing.sm },
  authSub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  authCancelWrap: { position: 'absolute', bottom: 36, paddingVertical: 12, paddingHorizontal: 24 },
  authCancelText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  fcvVerifyTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: spacing.sm },
  fcvVerifyStep: { fontSize: 14, color: '#333333', marginBottom: 6, lineHeight: 20 },
  fcvExitBtn: {
    marginTop: spacing.md,
    alignSelf: 'center',
    backgroundColor: '#1e4d8b',
    paddingVertical: 11,
    paddingHorizontal: 40,
    borderRadius: 8,
  },
  fcvExitBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  iconBtn: { padding: 4 },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  pad: { padding: spacing.lg, paddingBottom: 40, gap: spacing.sm },
  section: { fontSize: 12, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.xs },
  hint: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  hintSmall: { fontSize: 11, color: colors.textSecondary, lineHeight: 16 },
  label: { fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.cardBg ?? colors.background,
  },
  primary: {
    backgroundColor: colors.textPrimary,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  primaryText: { color: colors.background, fontWeight: '800', fontSize: 15 },
  secondary: {
    marginTop: spacing.md,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  secondaryText: { color: colors.textPrimary, fontWeight: '700' },
  tertiary: { marginTop: spacing.md, paddingVertical: 12, alignItems: 'center' },
  tertiaryText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  disabledBtn: { opacity: 0.6 },
  mono: { fontFamily: 'Menlo', fontSize: 11, color: colors.textSecondary, marginTop: spacing.sm },
  err: { fontSize: 13, color: colors.dangerRed, lineHeight: 20, marginTop: spacing.xs },
  credRow: { paddingVertical: spacing.md, marginTop: spacing.sm },
  credRowText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, textDecorationLine: 'underline' },
  card: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    gap: spacing.sm,
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  cardBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  dangerRow: { paddingVertical: 10, alignItems: 'center' },
  dangerText: { color: colors.dangerRed, fontWeight: '700' },
  webBoxFull: { flex: 1 },
  web: { flex: 1, minHeight: 320, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  captchaBanner: { padding: spacing.md, gap: spacing.sm },
  captchaBannerText: { fontSize: 13, lineHeight: 20, color: colors.textPrimary },
  importingScreen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  importingTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  importingSub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
