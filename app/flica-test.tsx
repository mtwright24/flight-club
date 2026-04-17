/**
 * TEMP PoC — JetBlue FLICA manual login + page text capture (read-only).
 * Remove when superseded by a real integration.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

import {
  FLICA_LOGIN_URL_HINT,
  JETBLUE_FLICA_ENTRY_URL,
} from '../src/dev/flicaPoCConfig';
import { countAuthKeywordHits } from '../src/dev/flicaPoCParse';
import { setFlicaPoCScratch } from '../src/dev/flicaPoCScratch';
import { colors, radius, spacing } from '../src/styles/theme';

type FlowStatus =
  | 'idle'
  | 'loading'
  | 'captcha'
  | 'authenticated'
  | 'parsing'
  | 'done'
  | 'error';

const INJECT_EXTRACT = `
(function() {
  function send() {
    var body = document.body;
    var text = body ? body.innerText : '';
    var href = (typeof location !== 'undefined' && location.href) ? location.href : '';
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'flicaPocBody',
        text: text,
        href: href
      }));
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'flicaPocBody',
        error: String(e)
      }));
    }
  }
  send();
  if (document.readyState === 'complete') send();
  else document.addEventListener('readystatechange', function() {
    if (document.readyState === 'complete') send();
  });
})();
true;
`;

export default function FlicaTestScreen() {
  const router = useRouter();
  const webRef = useRef<WebView | null>(null);
  const pendingReviewRef = useRef(false);
  const lastUrlRef = useRef(JETBLUE_FLICA_ENTRY_URL);

  const [showWeb, setShowWeb] = useState(false);
  const [status, setStatus] = useState<FlowStatus>('idle');
  const [lastUrl, setLastUrl] = useState<string>(JETBLUE_FLICA_ENTRY_URL);
  const [lastBodySnippet, setLastBodySnippet] = useState<string>('');
  const [lastError, setLastError] = useState<string | null>(null);
  const [bodyCharCount, setBodyCharCount] = useState(0);

  const statusLine = useMemo(() => {
    return `Status: ${status}\nLast URL:\n${lastUrl}`;
  }, [status, lastUrl]);

  const applyBodyMessage = useCallback((text: string, href: string) => {
    lastUrlRef.current = href;
    setLastUrl(href);
    setBodyCharCount(text.length);
    setLastBodySnippet(text.length > 800 ? `${text.slice(0, 800)}…` : text);
    setLastError(null);

    const lower = text.toLowerCase();
    if (/\bcaptcha\b|verify\s+you\s+are\s+human|recaptcha/i.test(text)) {
      setStatus('captcha');
      return;
    }
    const keywordHits = countAuthKeywordHits(lower);
    const urlLooksPastLogin = !FLICA_LOGIN_URL_HINT.test(href);
    const looksAuthed = keywordHits >= 2 || (keywordHits >= 1 && urlLooksPastLogin);
    if (looksAuthed) {
      setStatus('authenticated');
    } else {
      setStatus('idle');
    }
  }, []);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const raw = e.nativeEvent.data;
        const msg = JSON.parse(raw) as {
          type?: string;
          text?: string;
          href?: string;
          error?: string;
        };
        if (msg.type !== 'flicaPocBody') return;
        if (msg.error) {
          setLastError(msg.error);
          setStatus('error');
          return;
        }
        const text = msg.text ?? '';
        const href = msg.href ?? lastUrlRef.current;

        if (pendingReviewRef.current) {
          pendingReviewRef.current = false;
          setFlicaPoCScratch({
            rawText: text,
            lastUrl: href,
            capturedAt: Date.now(),
          });
          setStatus(text.length > 0 ? 'done' : 'error');
          if (text.length > 0) {
            router.push('/flica-review');
          } else {
            setLastError('Empty page text — wait for the page to render, then try again.');
          }
          return;
        }

        applyBodyMessage(text, href);
      } catch (err) {
        setLastError(err instanceof Error ? err.message : 'parse message failed');
        setStatus('error');
      }
    },
    [applyBodyMessage, router]
  );

  const openFlica = () => {
    setShowWeb(true);
    setStatus('loading');
    setLastError(null);
    setLastBodySnippet('');
    setBodyCharCount(0);
  };

  const closeFlow = () => {
    setShowWeb(false);
    setStatus('idle');
    router.back();
  };

  /** Always re-read full innerText in-page so we do not rely on truncated preview. */
  const parseAndReview = () => {
    if (!webRef.current) return;
    setStatus('parsing');
    pendingReviewRef.current = true;
    webRef.current.injectJavaScript(`
      (function(){
        var t = document.body ? document.body.innerText : '';
        var h = (typeof location !== 'undefined' && location.href) ? location.href : '';
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'flicaPocBody', text: t, href: h
        }));
      })(); true;
    `);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable onPress={closeFlow} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="close" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>FLICA Test (PoC)</Text>
        <View style={{ width: 40 }} />
      </View>

      {!showWeb ? (
        <ScrollView contentContainerStyle={styles.pad}>
          <Text style={styles.h1}>FLICA Test</Text>
          <Text style={styles.mono}>{statusLine}</Text>
          <Text style={styles.hint}>
            Proof-of-concept only. Log in manually; no automation. Read-only capture of visible page text.
          </Text>
          <Pressable style={styles.primary} onPress={openFlica}>
            <Text style={styles.primaryText}>Open FLICA Login</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <View style={styles.flex}>
          <View style={styles.strip}>
            <Text style={styles.stripText} numberOfLines={5}>
              {statusLine}
              {lastError ? `\nError: ${lastError}` : ''}
              {bodyCharCount > 0 ? `\nBody chars (preview): ${bodyCharCount}` : ''}
            </Text>
            <ScrollView style={styles.snippetBox} nestedScrollEnabled>
              <Text style={styles.snippet} selectable>
                {lastBodySnippet || '— no body text yet (wait for load) —'}
              </Text>
            </ScrollView>
            <View style={styles.row}>
              <Pressable style={styles.secondary} onPress={() => setShowWeb(false)}>
                <Text style={styles.secondaryText}>Hide WebView</Text>
              </Pressable>
              <Pressable style={styles.primary} onPress={parseAndReview}>
                <Text style={styles.primaryText}>Parse &amp; review (native)</Text>
              </Pressable>
            </View>
          </View>
          <WebView
            ref={webRef}
            source={{ uri: JETBLUE_FLICA_ENTRY_URL }}
            style={styles.web}
            onNavigationStateChange={(nav) => {
              const u = nav.url ?? '';
              lastUrlRef.current = u;
              setLastUrl(u);
              if (nav.loading) setStatus('loading');
            }}
            onLoadStart={() => setStatus('loading')}
            onLoadEnd={() => {
              webRef.current?.injectJavaScript(INJECT_EXTRACT);
            }}
            onMessage={onMessage}
            onError={(ev) => {
              setLastError(ev.nativeEvent.description ?? 'WebView error');
              setStatus('error');
            }}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            injectedJavaScript={INJECT_EXTRACT}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  iconBtn: { padding: 4 },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  pad: { padding: spacing.lg, gap: spacing.md },
  h1: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  mono: { fontFamily: 'Menlo', fontSize: 12, color: colors.textSecondary },
  hint: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  primary: {
    backgroundColor: colors.textPrimary,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  primaryText: { color: colors.background, fontWeight: '800', fontSize: 15 },
  secondary: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.textPrimary, fontWeight: '700' },
  strip: {
    maxHeight: '42%',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  stripText: { fontSize: 11, fontFamily: 'Menlo', color: colors.textSecondary },
  snippetBox: { maxHeight: 120, backgroundColor: colors.cardBg, borderRadius: radius.sm },
  snippet: { fontSize: 10, fontFamily: 'Menlo', color: colors.textPrimary, padding: 8 },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' },
  web: { flex: 1 },
});
