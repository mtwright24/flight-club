/**
 * FLICA direct HTTP import — WebView session + same token/HTTP path as flica-test, then persist to schedule pairings.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LogBox,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter, type Href } from 'expo-router';
import WebView, { type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

import {
  type FlicaStoredCookies,
  flicaSessionFromNativeCookieManagerMerged,
  mergeFlicaStoredCookiesPreferRight,
  saveFlicaLastMainmenuUrl,
} from '../../src/dev/flicaPoCCookieStore';
import {
  extractToken1FromHtml,
  FLICA_CONSTANTS,
  FLICA_URLS,
  loadFlicaCookies,
  loadFlicaCredentials,
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

const INJECT_NAV_TO_LOAD_SCHEDULE = `(function(){
  window.location.href = ${JSON.stringify(FLICA_URLS.MAINMENU_LOADSCHEDULE)};
})(); true;`;

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

function isFcvPostCaptchaMainmenuUrl(url: string): boolean {
  const u = (url ?? '').toLowerCase();
  return u.includes('mainmenu.cgi') && u.includes('gohm=1');
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

  const [credsLoading, setCredsLoading] = useState(true);
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

  const hasCredentials = !!storedUser?.trim();

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
      const c = await loadFlicaCredentials();
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

  const runPostCaptchaCookieCaptureAndNavigate = useCallback(async (fullMainmenuUrl: string) => {
    if (postCaptchaFiredRef.current) return;
    postCaptchaFiredRef.current = true;
    setPostCaptchaFired(true);
    setHideWebForSync(true);
    setCaptchaWebVisible(false);
    setOverlayMessage('Syncing schedule…');
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
        setLastError('No FLICA cookies after sign-in. Try again.');
        stopSync();
        return;
      }
      await saveFlicaCookies(session);
      fcvPhaseRef.current = 'await_loadschedule_page';
      flowNavRef.current.loadScheduleInjected = true;
      webViewRef.current?.injectJavaScript(INJECT_NAV_TO_LOAD_SCHEDULE);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      stopSync();
    }
  }, [stopSync]);

  const runHttpImport = useCallback(
    async (token: string, mainmenuPageUrl: string) => {
      if (completingRef.current) return;
      completingRef.current = true;
      setHttpImporting(true);
      setPostCaptchaFired(true);
      setOverlayMessage('Syncing schedule…');
      setLastError(null);
      try {
        const session = await mergedFlicaSessionForHttp();
        if (!session.FLiCASession && !session.FLiCAService) {
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
          refererUrl: mainmenuPageUrl,
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
        setOverlayMessage('Saving schedule…');
        await persistFlicaDirectImport(m, a, y);
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
    [router, stopSync]
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
      if (isMainmenuAwaitingCaptcha(url)) {
        setCaptchaWebVisible(true);
        setOverlayMessage('Sign in to FLICA');
        setHideWebForSync(false);
      }
      if (isFcvPostCaptchaMainmenuUrl(url) && nav.loading === false) {
        if (!postCaptchaFiredRef.current) {
          setOverlayMessage('Syncing schedule…');
          setCaptchaWebVisible(false);
        }
        void runPostCaptchaCookieCaptureAndNavigate(url);
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
    [runPostCaptchaCookieCaptureAndNavigate, schedulePostLoadscheduleHtml]
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

  const blockingOverlay = syncActive && (captchaWebVisible || postCaptchaFired || httpImporting);

  const overlayTitle = useMemo(() => {
    if (overlayMessage.trim().length) return overlayMessage;
    if (captchaWebVisible) return 'Sign in to FLICA';
    return 'Syncing schedule…';
  }, [captchaWebVisible, overlayMessage]);

  if (credsLoading) {
    return (
      <View style={styles.shell}>
        <Stack.Screen options={{ headerShown: false }} />
        <CrewScheduleHeader title="FLICA direct sync" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={T.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <Stack.Screen options={{ headerShown: false }} />
      <CrewScheduleHeader title="FLICA direct sync" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.h1}>Import from FLICA</Text>
        <Text style={styles.lead}>
          Your credentials stay on this device. We open FLICA in a private WebView, then download March–May 2026 in the
          background.
        </Text>

        {!hasCredentials ? (
          <>
            <Text style={styles.label}>FLICA username</Text>
            <TextInput
              value={formUser}
              onChangeText={setFormUser}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              placeholder="UserId"
              placeholderTextColor={T.textSecondary}
            />
            <Text style={styles.label}>FLICA password</Text>
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
                  {storedUser}/******
                </Text>
                <Pressable
                  style={[styles.primaryBtn, (syncActive || httpImporting) && styles.btnDisabled]}
                  onPress={startSync}
                  disabled={syncActive || httpImporting}
                >
                  <Text style={styles.primaryBtnText}>Sync Schedule</Text>
                </Pressable>
                <Pressable style={styles.link} onPress={() => setEditingCreds(true)} hitSlop={8}>
                  <Text style={styles.linkText}>Update credentials</Text>
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

      {syncActive ? (
        <View style={styles.wvHost} pointerEvents={blockingOverlay || captchaWebVisible ? 'auto' : 'box-none'}>
          <View
            style={[
              captchaWebVisible && !hideWebForSync
                ? StyleSheet.absoluteFill
                : { position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, bottom: 0, right: 0 },
            ]}
            pointerEvents={captchaWebVisible && !hideWebForSync ? 'auto' : 'none'}
          >
            <WebView
              key={webViewKey}
              ref={webViewRef}
              source={{ uri: FLICA_URLS.LOGIN }}
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
          {blockingOverlay ? (
            <SafeAreaView style={styles.syncOverlay} edges={['top', 'bottom']}>
              {captchaWebVisible && !postCaptchaFired ? (
                <View style={styles.captchaTopBar}>
                  <Pressable onPress={stopSync} hitSlop={12} style={styles.closeBtn}>
                    <Ionicons name="close" size={26} color={T.text} />
                  </Pressable>
                </View>
              ) : null}
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
