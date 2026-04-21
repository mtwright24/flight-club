/**
 * TEMP PoC — FLICA: WebView login → cookies → in-WebView navigates to scheduledetail → postMessage HTML → review.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { LogBox, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import CookieManager from '@react-native-community/cookies';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

import { JETBLUE_FLICA_ENTRY_URL } from '../src/dev/flicaPoCConfig';
import {
  clearFlicaCookiesFromSecureStore,
  flicaStoredCookiesFromNativeJar,
  loadFlicaCookiesFromSecureStore,
  saveFlicaCookiesToSecureStore,
  saveFlicaLastMainmenuUrl,
} from '../src/dev/flicaPoCCookieStore';
import { computeScheduleKeywordHints } from '../src/dev/flicaPoCScheduleHttp';
import { setFlicaPoCScratch } from '../src/dev/flicaPoCScratch';
import { FLICA_POC_INJECT_BEFORE_CONTENT } from '../src/dev/flicaPoCWebFontShim';
import { colors, radius, spacing } from '../src/styles/theme';

const FLICA_COOKIE_URL = 'https://jetblue.flica.net';

const SCHEDULE_DETAIL_WV_URL =
  'https://jetblue.flica.net/full/scheduledetail.cgi?GO=1&BlockDate=0426';

/** Navigate inside WebView session (cookies + auth already in place). */
const INJECT_NAV_TO_SCHEDULE = `
(function(){
  window.location.href = '${SCHEDULE_DETAIL_WV_URL}';
})();
true;
`;

/** Runs in page: builds payload with outerHTML and posts to RN (stringify happens in WebView). */
const INJECT_POST_SCHEDULE_HTML = `
(function(){
  try {
    var payload = {
      type: 'schedule_html',
      html: document.documentElement.outerHTML,
      url: window.location.href
    };
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'schedule_html', error: String(e) }));
  }
})();
true;
`;

type ScheduleHtmlMsg = {
  type: string;
  html?: string;
  url?: string;
  error?: string;
};

export default function FlicaTestScreen() {
  const router = useRouter();
  const webRef = useRef<WebView | null>(null);
  const mainMenuCaptureStartedRef = useRef(false);
  const captureDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMainmenuUrlRef = useRef('');
  /** After cookies saved we navigate WebView to scheduledetail; only then capture DOM. */
  const awaitingSchedulePageRef = useRef(false);
  const scheduleDomCaptureScheduledRef = useRef(false);
  const postHtmlDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showWeb, setShowWeb] = useState(false);
  /** Keep WebView mounted but invisible while loading schedule page. */
  const [webviewHidden, setWebviewHidden] = useState(false);
  const [lastUrl, setLastUrl] = useState('');
  const [statusLine, setStatusLine] = useState('idle');
  const [storedKeysLine, setStoredKeysLine] = useState('—');
  const [lastError, setLastError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    LogBox.ignoreLogs([/\d+\s*ms\s+timeout\s+exceeded/i]);
  }, []);

  useEffect(
    () => () => {
      if (captureDelayRef.current) clearTimeout(captureDelayRef.current);
      if (postHtmlDelayRef.current) clearTimeout(postHtmlDelayRef.current);
    },
    []
  );

  const refreshStoredSummary = useCallback(async () => {
    const c = await loadFlicaCookiesFromSecureStore();
    const keys = ['FLiCASession', 'FLiCAService', 'AWSALB', 'AWSALBCORS'].filter(
      (k) => c[k as keyof typeof c] != null && String(c[k as keyof typeof c]).length > 0
    );
    setStoredKeysLine(keys.length ? keys.join(', ') : 'none');
  }, []);

  useEffect(() => {
    refreshStoredSummary();
  }, [refreshStoredSummary]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data) as ScheduleHtmlMsg;
        if (msg.type !== 'schedule_html') return;
        if (msg.error) {
          const m = msg.error;
          setLastError(m);
          setCaptureError(m);
          setStatusLine('schedule_html_post_failed');
          return;
        }
        const html = msg.html ?? '';
        const url = msg.url ?? SCHEDULE_DETAIL_WV_URL;
        const hints = computeScheduleKeywordHints(html);
        setFlicaPoCScratch({
          rawText: html,
          lastUrl: url,
          capturedAt: Date.now(),
          documentTitle: 'scheduledetail.cgi (WebView DOM)',
          textLength: html.length,
          extractionStrategy: 'webview_outerhtml',
          pageKind: 'fetch_schedule',
          scheduleKeywordHints: hints,
          extractionErrors: ['document.documentElement.outerHTML via ReactNativeWebView.postMessage'],
        });
        setStatusLine('schedule_html → review');
        setCaptureError(null);
        awaitingSchedulePageRef.current = false;
        router.push('/flica-review');
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        setLastError(m);
        setCaptureError(m);
      }
    },
    [router]
  );

  const injectNavigateToSchedule = useCallback(() => {
    awaitingSchedulePageRef.current = true;
    scheduleDomCaptureScheduledRef.current = false;
    setWebviewHidden(true);
    setStatusLine('navigating WebView to scheduledetail…');
    setTimeout(() => {
      webRef.current?.injectJavaScript(INJECT_NAV_TO_SCHEDULE);
    }, 50);
  }, []);

  const runNativeCookieCapture = useCallback(async () => {
    try {
      const rawCookies = await CookieManager.get(FLICA_COOKIE_URL, true);
      const merged = flicaStoredCookiesFromNativeJar(rawCookies);
      await saveFlicaCookiesToSecureStore(merged);
      await saveFlicaLastMainmenuUrl(lastMainmenuUrlRef.current);
      await refreshStoredSummary();

      console.log('[flica-test] Native CookieManager capture:', {
        mainmenuUrl: lastMainmenuUrlRef.current,
        jarKeys: Object.keys(rawCookies ?? {}),
      });

      setLastError(null);
      setCaptureError(null);
      setStatusLine('cookies_stored → WebView schedule page…');
      injectNavigateToSchedule();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[flica-test] cookie capture failed:', err);
      setLastError(msg);
      setCaptureError(msg);
      setStatusLine('cookie_capture_failed');
      mainMenuCaptureStartedRef.current = false;
    }
  }, [injectNavigateToSchedule, refreshStoredSummary]);

  const onNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      const u = nav.url ?? '';
      setLastUrl(u);

      if (u.includes('mainmenu.cgi') && nav.loading === false) {
        lastMainmenuUrlRef.current = u;
        void saveFlicaLastMainmenuUrl(u);
        if (!mainMenuCaptureStartedRef.current) {
          mainMenuCaptureStartedRef.current = true;
          if (captureDelayRef.current) clearTimeout(captureDelayRef.current);
          captureDelayRef.current = setTimeout(() => {
            captureDelayRef.current = null;
            void runNativeCookieCapture();
          }, 2000);
        }
      }

      if (
        awaitingSchedulePageRef.current &&
        u.includes('scheduledetail.cgi') &&
        nav.loading === false &&
        !scheduleDomCaptureScheduledRef.current
      ) {
        scheduleDomCaptureScheduledRef.current = true;
        if (postHtmlDelayRef.current) clearTimeout(postHtmlDelayRef.current);
        setStatusLine('scheduledetail loaded → posting HTML in 1s…');
        postHtmlDelayRef.current = setTimeout(() => {
          postHtmlDelayRef.current = null;
          webRef.current?.injectJavaScript(INJECT_POST_SCHEDULE_HTML);
        }, 1000);
      }
    },
    [runNativeCookieCapture]
  );

  const openWebView = () => {
    setLastError(null);
    setCaptureError(null);
    mainMenuCaptureStartedRef.current = false;
    awaitingSchedulePageRef.current = false;
    scheduleDomCaptureScheduledRef.current = false;
    setWebviewHidden(false);
    setStatusLine('webview_open');
    setShowWeb(true);
  };

  const refreshSession = async () => {
    setLastError(null);
    setCaptureError(null);
    await clearFlicaCookiesFromSecureStore();
    lastMainmenuUrlRef.current = '';
    awaitingSchedulePageRef.current = false;
    scheduleDomCaptureScheduledRef.current = false;
    mainMenuCaptureStartedRef.current = false;
    setWebviewHidden(false);
    await refreshStoredSummary();
    setStatusLine('cleared — log in again');
    setShowWeb(true);
  };

  /** Re-inject navigation to scheduledetail (same WebView session). */
  const retryScheduleWebView = () => {
    setLastError(null);
    setCaptureError(null);
    scheduleDomCaptureScheduledRef.current = false;
    injectNavigateToSchedule();
  };

  const close = () => {
    setShowWeb(false);
    setWebviewHidden(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>FLICA Test (PoC)</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled" style={styles.scrollTop}>
          <Text style={styles.mono}>Status: {statusLine}</Text>
          <Text style={styles.mono}>Last URL: {lastUrl || '—'}</Text>
          <Text style={styles.mono}>Stored cookie keys: {storedKeysLine}</Text>
          {lastError ? <Text style={styles.err}>Error: {lastError}</Text> : null}

          <Text style={styles.hint}>
            Log in until mainmenu.cgi. We wait 2s, save cookies, then load scheduledetail inside the same WebView
            (hidden). When that page finishes, we pull outerHTML and open review — no HTTP fetch or tokens.
          </Text>

          {!showWeb ? (
            <Pressable style={styles.primary} onPress={openWebView}>
              <Text style={styles.primaryText}>Open FLICA (login)</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.secondary} onPress={close}>
              <Text style={styles.secondaryText}>Hide WebView</Text>
            </Pressable>
          )}

          <Pressable style={styles.secondary} onPress={refreshSession}>
            <Text style={styles.secondaryText}>Refresh Session</Text>
          </Pressable>
          <Text style={styles.hintSmall}>Clears SecureStore and resets WebView flow.</Text>

          <Pressable style={styles.secondary} onPress={retryScheduleWebView} disabled={!showWeb}>
            <Text style={styles.secondaryText}>Retry WebView schedule load</Text>
          </Pressable>
          <Text style={styles.hintSmall}>Re-navigates to scheduledetail.cgi in the current session (if already logged in).</Text>

          {captureError ? (
            <View style={styles.fetchErrBanner} accessibilityRole="alert">
              <Text style={styles.fetchErrBannerTitle}>Schedule capture</Text>
              <Text style={styles.err}>{captureError}</Text>
            </View>
          ) : null}
        </ScrollView>

        {showWeb ? (
          <View style={[styles.webBox, webviewHidden && styles.webBoxHidden]} pointerEvents={webviewHidden ? 'none' : 'auto'}>
            <WebView
              ref={webRef}
              source={{ uri: JETBLUE_FLICA_ENTRY_URL }}
              style={styles.web}
              injectedJavaScriptBeforeContentLoaded={FLICA_POC_INJECT_BEFORE_CONTENT}
              onNavigationStateChange={onNavigationStateChange}
              onMessage={onMessage}
              onError={(ev) => setLastError(ev.nativeEvent.description ?? 'WebView error')}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  scrollTop: { flexGrow: 0 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  iconBtn: { padding: 4 },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  pad: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  mono: { fontFamily: 'Menlo', fontSize: 11, color: colors.textSecondary },
  err: { fontSize: 13, color: colors.dangerRed, lineHeight: 20 },
  fetchErrBanner: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerRed,
    backgroundColor: 'rgba(181, 22, 30, 0.08)',
    gap: spacing.xs,
  },
  fetchErrBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.dangerRed,
  },
  hint: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  hintSmall: { fontSize: 11, color: colors.textSecondary, lineHeight: 16 },
  primary: {
    backgroundColor: colors.textPrimary,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  primaryText: { color: colors.background, fontWeight: '800', fontSize: 15 },
  secondary: {
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  secondaryText: { color: colors.textPrimary, fontWeight: '700' },
  webBox: { flex: 1, minHeight: 360, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  /** Keeps WebView in tree & rendering while user only sees controls above. */
  webBoxHidden: { opacity: 0 },
  web: { flex: 1 },
});
