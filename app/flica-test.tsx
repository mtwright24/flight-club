/**
 * TEMP PoC — JetBlue FLICA manual login + Main Menu auto-navigation toward schedule + explicit capture.
 * Login path unchanged; phase 2 auto-navigates from authenticated Main Menu when detected.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';

import { JETBLUE_FLICA_ENTRY_URL } from '../src/dev/flicaPoCConfig';
import {
  FLICA_POC_MAINMENU_NAVIGATE_SCRIPT,
  FLICA_POC_MAINMENU_PROBE_SCRIPT,
} from '../src/dev/flicaPoCMainMenuScripts';
import { FLICA_POC_EXTRACT_SCRIPT } from '../src/dev/flicaPoCInjectedExtract';
import {
  detectFlicaPoCPageKind,
  isLikelyCaptchaPage,
  toFlicaPocUiPageKind,
  type FlicaPoCPageKind,
} from '../src/dev/flicaPoCPageDetect';
import { setFlicaPoCScratch } from '../src/dev/flicaPoCScratch';
import { colors, radius, spacing } from '../src/styles/theme';

export type FlicaPocFlowStatus =
  | 'idle'
  | 'loading'
  | 'captcha'
  | 'authenticated'
  | 'main_menu'
  | 'navigating_to_schedule'
  | 'schedule_loaded'
  | 'parsing'
  | 'done'
  | 'error';

type ExtractMsg = {
  type: string;
  href?: string;
  title?: string;
  text?: string;
  textLength?: number;
  strategy?: string;
  primaryStrategy?: string;
  mergedFrom?: string;
  errors?: string[];
  error?: string;
};

type MainMenuProbeMsg = {
  type: 'flicaPocMainMenuProbe';
  href: string;
  title: string;
  bodySample: string;
  anchors: { text: string; href: string; scope?: string }[];
  forms: { action: string; method: string }[];
  iframeHints: { index: number; locationHref: string }[];
  captcha: boolean;
};

type NavAttemptMsg = {
  type: 'flicaPocNavAttempt';
  strategy: string;
  detail: string;
  candidateHref: string;
  score: number;
  scope?: string;
};

type PreviewState = {
  url: string;
  title: string;
  first500: string;
  fullText: string;
  strategy: string;
  primaryStrategy?: string;
  mergedFrom?: string;
  pageKind: FlicaPoCPageKind;
  textLength: number;
  errors?: string[];
};

const SCHEDULE_HREF_HINT = /schedule|pairing|calendar|month|line|bid|duty|trip|roster|pbs|fcv|crewline|cls?sv/i;

function scheduleCandidatesFromAnchors(anchors: MainMenuProbeMsg['anchors']): { text: string; href: string }[] {
  const out: { text: string; href: string }[] = [];
  const seen = new Set<string>();
  for (const a of anchors) {
    const blob = `${a.text} ${a.href}`;
    if (!SCHEDULE_HREF_HINT.test(blob)) continue;
    const k = a.href;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ text: a.text.slice(0, 120), href: a.href });
    if (out.length >= 24) break;
  }
  return out;
}

function computeFlowStatus(opts: {
  navLoading: boolean;
  extractBusy: boolean;
  captchaDetected: boolean;
  pageKind: FlicaPoCPageKind;
  lastUrl: string;
  navigatingToSchedule: boolean;
  flowDone: boolean;
  webViewFault: boolean;
}): FlicaPocFlowStatus {
  const { navLoading, extractBusy, captchaDetected, pageKind, lastUrl, navigatingToSchedule, flowDone, webViewFault } =
    opts;
  if (webViewFault) return 'error';
  if (extractBusy) return 'parsing';
  if (flowDone && !navLoading) return 'done';
  if (navigatingToSchedule) return 'navigating_to_schedule';
  if (navLoading) return 'loading';
  if (captchaDetected) return 'captcha';
  if (pageKind === 'schedule' || pageKind === 'pdf_or_embed') return 'schedule_loaded';
  if (pageKind === 'forwarding_or_menu') return 'main_menu';
  if (pageKind === 'login') return 'loading';
  if (/jetblue\.flica\.net/i.test(lastUrl)) return 'authenticated';
  return 'loading';
}

export default function FlicaTestScreen() {
  const router = useRouter();
  const webRef = useRef<WebView | null>(null);
  const webWrapRef = useRef<View | null>(null);
  const lastUrlRef = useRef(JETBLUE_FLICA_ENTRY_URL);
  const autoNavAttemptedRef = useRef(false);
  const postNavProbeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showWeb, setShowWeb] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const [navigatingToSchedule, setNavigatingToSchedule] = useState(false);
  const [lastUrl, setLastUrl] = useState(JETBLUE_FLICA_ENTRY_URL);
  const [documentTitle, setDocumentTitle] = useState('—');
  const [bodySample, setBodySample] = useState('');
  const [lastError, setLastError] = useState<string | null>(null);
  const [webViewFault, setWebViewFault] = useState(false);

  const [anchorDebug, setAnchorDebug] = useState<MainMenuProbeMsg['anchors']>([]);
  const [formsDebug, setFormsDebug] = useState<MainMenuProbeMsg['forms']>([]);
  const [iframeHintsDebug, setIframeHintsDebug] = useState<MainMenuProbeMsg['iframeHints']>([]);
  const [captchaDetected, setCaptchaDetected] = useState(false);

  const [autoNavSummary, setAutoNavSummary] = useState<string>('not attempted yet');
  const [lastNavAttempt, setLastNavAttempt] = useState<NavAttemptMsg | null>(null);

  const [extractBusy, setExtractBusy] = useState(false);
  const [flowDone, setFlowDone] = useState(false);
  const [manualScheduleOk, setManualScheduleOk] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const pageKind = useMemo(
    () => detectFlicaPoCPageKind(lastUrl, `${documentTitle}\n${bodySample}`),
    [lastUrl, bodySample, documentTitle]
  );
  const uiPageKind = useMemo(() => toFlicaPocUiPageKind(pageKind), [pageKind]);

  const scheduleCandidates = useMemo(() => scheduleCandidatesFromAnchors(anchorDebug), [anchorDebug]);

  const flowStatus = useMemo(
    () =>
      computeFlowStatus({
        navLoading,
        extractBusy,
        captchaDetected,
        pageKind,
        lastUrl,
        navigatingToSchedule,
        flowDone,
        webViewFault,
      }),
    [navLoading, extractBusy, captchaDetected, pageKind, lastUrl, navigatingToSchedule, flowDone, webViewFault]
  );

  const displayedFlowStatus: FlicaPocFlowStatus = showWeb ? flowStatus : 'idle';

  const canParseToReview = useMemo(() => {
    if (extractBusy) return false;
    return pageKind === 'schedule' || pageKind === 'pdf_or_embed' || manualScheduleOk;
  }, [extractBusy, pageKind, manualScheduleOk]);

  const injectProbe = useCallback(() => {
    if (!webRef.current) return;
    webRef.current.injectJavaScript(FLICA_POC_MAINMENU_PROBE_SCRIPT);
  }, []);

  const injectNavigateToSchedule = useCallback(() => {
    if (!webRef.current) return;
    setNavigatingToSchedule(true);
    setAutoNavSummary('running injected navigation…');
    webRef.current.injectJavaScript(FLICA_POC_MAINMENU_NAVIGATE_SCRIPT);
  }, []);

  const scheduleAutoNavIfNeeded = useCallback(
    (kind: FlicaPoCPageKind, captcha: boolean) => {
      if (captcha) return;
      if (kind !== 'forwarding_or_menu') return;
      if (autoNavAttemptedRef.current) return;
      autoNavAttemptedRef.current = true;
      setTimeout(() => {
        injectNavigateToSchedule();
      }, 120);
    },
    [injectNavigateToSchedule]
  );

  const handleProbeMessage = useCallback(
    (msg: MainMenuProbeMsg) => {
      const url = msg.href || lastUrlRef.current;
      lastUrlRef.current = url;
      setLastUrl(url);
      setDocumentTitle(msg.title || '—');
      const sample = msg.bodySample || '';
      setBodySample(sample);

      const cap =
        msg.captcha ||
        isLikelyCaptchaPage(url, msg.title || '', sample);
      setCaptchaDetected(cap);

      setAnchorDebug(msg.anchors || []);
      setFormsDebug(msg.forms || []);
      setIframeHintsDebug(msg.iframeHints || []);

      const kind = detectFlicaPoCPageKind(url, `${msg.title || ''}\n${sample}`);
      scheduleAutoNavIfNeeded(kind, cap);
    },
    [scheduleAutoNavIfNeeded]
  );

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const raw = e.nativeEvent.data;
        const msg = JSON.parse(raw) as ExtractMsg | MainMenuProbeMsg | NavAttemptMsg;

        if ((msg as NavAttemptMsg).type === 'flicaPocNavAttempt') {
          const n = msg as NavAttemptMsg;
          setLastNavAttempt(n);
          if (n.strategy === 'none') {
            setNavigatingToSchedule(false);
          }
          const summ =
            n.strategy === 'none'
              ? `attempted: none (best score ${n.score})`
              : `attempted: ${n.strategy} → ${(n.candidateHref || '').slice(0, 96)}${n.candidateHref.length > 96 ? '…' : ''}`;
          setAutoNavSummary(summ);
          if (postNavProbeTimerRef.current) clearTimeout(postNavProbeTimerRef.current);
          postNavProbeTimerRef.current = setTimeout(() => injectProbe(), 450);
          return;
        }

        if ((msg as MainMenuProbeMsg).type === 'flicaPocMainMenuProbe') {
          handleProbeMessage(msg as MainMenuProbeMsg);
          return;
        }

        const ex = msg as ExtractMsg;
        if (ex.type !== 'flicaPocExtract') return;

        setExtractBusy(false);

        if (ex.error) {
          setLastError(ex.error);
          setPreview(null);
          setPreviewOpen(false);
          return;
        }

        const text = ex.text ?? '';
        const href = ex.href ?? lastUrlRef.current;
        const title = ex.title ?? '';
        const strategy = ex.strategy ?? 'unknown';
        const pk = detectFlicaPoCPageKind(href, text);

        setDocumentTitle(title || '—');

        setPreview({
          url: href,
          title,
          first500: text.slice(0, 500),
          fullText: text,
          strategy,
          primaryStrategy: ex.primaryStrategy,
          mergedFrom: ex.mergedFrom,
          pageKind: pk,
          textLength: text.length,
          errors: ex.errors,
        });
        setPreviewOpen(true);
      } catch (err) {
        setExtractBusy(false);
        setLastError(err instanceof Error ? err.message : 'parse message failed');
      }
    },
    [handleProbeMessage, injectProbe]
  );

  const confirmReview = useCallback(() => {
    if (!preview) return;
    if (preview.fullText.length < 1) {
      setLastError('Empty text — use “Screenshot fallback”, wait for the page to finish rendering, or try again.');
      return;
    }
    setFlowDone(true);
    setFlicaPoCScratch({
      rawText: preview.fullText,
      lastUrl: preview.url,
      capturedAt: Date.now(),
      documentTitle: preview.title,
      textLength: preview.textLength,
      extractionStrategy: preview.strategy,
      primaryStrategy: preview.primaryStrategy,
      mergedFrom: preview.mergedFrom,
      pageKind: preview.pageKind,
      extractionErrors: preview.errors,
    });
    setPreviewOpen(false);
    setPreview(null);
    router.push('/flica-review');
  }, [preview, router]);

  const cancelPreview = useCallback(() => {
    setPreviewOpen(false);
    setPreview(null);
  }, []);

  const runInjectedExtract = useCallback(() => {
    if (!webRef.current) {
      setLastError('WebView not ready');
      return;
    }
    if (!canParseToReview) {
      setLastError('Wait for schedule_loaded (or confirm manual) before parse & review.');
      return;
    }
    setLastError(null);
    setExtractBusy(true);
    webRef.current.injectJavaScript(FLICA_POC_EXTRACT_SCRIPT);
  }, [canParseToReview]);

  const captureWebViewScreenshot = useCallback(async () => {
    if (!webWrapRef.current) {
      setLastError('View ref not ready — wait for layout');
      return;
    }
    try {
      setNavLoading(true);
      const uri = await captureRef(webWrapRef, {
        format: 'png',
        quality: 0.85,
        result: 'tmpfile',
      });
      const pageKindForShot = detectFlicaPoCPageKind(lastUrlRef.current, bodySample);
      setFlowDone(true);
      setFlicaPoCScratch({
        rawText: '',
        lastUrl: lastUrlRef.current,
        capturedAt: Date.now(),
        documentTitle: documentTitle || '—',
        textLength: 0,
        extractionStrategy: 'screenshot_fallback',
        pageKind: pageKindForShot,
        screenshotFallbackUri: uri,
        screenshotFallbackLabel:
          'PNG screenshot of WebView (PoC OCR pipeline testing). DOM text extraction failed or skipped.',
      });
      setPreviewOpen(false);
      setPreview(null);
      router.push('/flica-review');
      setNavLoading(false);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'Screenshot failed');
      setNavLoading(false);
    }
  }, [documentTitle, bodySample, router]);

  const retryAutoNavigation = useCallback(() => {
    autoNavAttemptedRef.current = false;
    setLastNavAttempt(null);
    setAutoNavSummary('retry requested…');
    injectNavigateToSchedule();
    autoNavAttemptedRef.current = true;
  }, [injectNavigateToSchedule]);

  const openFlica = () => {
    setShowWeb(true);
    setNavLoading(true);
    setLastError(null);
    setWebViewFault(false);
    setDocumentTitle('—');
    setBodySample('');
    setCaptchaDetected(false);
    setFlowDone(false);
    setManualScheduleOk(false);
    autoNavAttemptedRef.current = false;
    setAutoNavSummary('not attempted yet');
    setAnchorDebug([]);
  };

  const closeFlow = () => {
    if (postNavProbeTimerRef.current) clearTimeout(postNavProbeTimerRef.current);
    setShowWeb(false);
    setPreviewOpen(false);
    setPreview(null);
    setNavigatingToSchedule(false);
    router.back();
  };

  const debugBlock = useMemo(() => {
    const lines: string[] = [];
    lines.push(`flow: ${displayedFlowStatus}`);
    lines.push(`page kind (UI): ${uiPageKind}  (detect: ${pageKind})`);
    lines.push(`document.title: ${documentTitle}`);
    lines.push(`captcha (heuristic): ${captchaDetected ? 'yes' : 'no'}`);
    lines.push(`auto-nav: ${autoNavSummary}`);
    if (lastNavAttempt && lastNavAttempt.strategy !== 'none') {
      lines.push(`last target: ${lastNavAttempt.candidateHref}`);
    }
    lines.push(`schedule candidates (regex): ${scheduleCandidates.length}`);
    if (scheduleCandidates.length > 0) {
      scheduleCandidates.slice(0, 6).forEach((c, i) => {
        lines.push(`  ${i + 1}. ${c.href}`);
      });
    }
    if (formsDebug.length > 0) {
      lines.push(`forms (actions): ${formsDebug.length}`);
      formsDebug.slice(0, 4).forEach((f, i) => {
        lines.push(`  ${i + 1}. ${f.method} ${f.action}`);
      });
    }
    if (iframeHintsDebug.length > 0) {
      lines.push(
        `iframes: ${iframeHintsDebug.map((h) => `[${h.index}] ${h.locationHref}`).join('; ')}`.slice(0, 300)
      );
    }
    return lines.join('\n');
  }, [
    displayedFlowStatus,
    uiPageKind,
    pageKind,
    documentTitle,
    captchaDetected,
    autoNavSummary,
    lastNavAttempt,
    scheduleCandidates,
    formsDebug,
    iframeHintsDebug,
  ]);

  const statusStrip =
    `Status: ${displayedFlowStatus}\nURL: ${lastUrl}\n${debugBlock}` + (lastError ? `\nError: ${lastError}` : '');

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
          <Text style={styles.mono}>Status: {displayedFlowStatus}</Text>
          <Text style={styles.hint}>
            Phase 1: log in manually (unchanged). Phase 2: when the authenticated Main Menu loads, this PoC probes links and
            attempts one automatic navigation toward the schedule / month view. Then use Parse when you see the real
            schedule (or confirm manually).
          </Text>
          <Pressable style={styles.primary} onPress={openFlica}>
            <Text style={styles.primaryText}>Open FLICA</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <View style={styles.flex}>
          <ScrollView style={styles.strip} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            <Text style={styles.stripText} selectable>
              {statusStrip}
            </Text>

            <Text style={styles.subHdr}>Main Menu — anchors ({anchorDebug.length})</Text>
            <Text style={styles.hintSmall}>
              Schedule-like links (heuristic). Full list: every anchor&apos;s text + href from last probe.
            </Text>
            <View style={styles.debugBox}>
              <ScrollView style={styles.debugScroll} nestedScrollEnabled>
                {anchorDebug.length === 0 ? (
                  <Text style={styles.monoSmall}>No probe yet (loading…)</Text>
                ) : (
                  anchorDebug.slice(0, 120).map((a, idx) => (
                    <Text key={`${a.href}-${idx}`} style={styles.monoSmall} selectable>
                      {idx + 1}. [{a.scope ?? '—'}] {a.text ? `"${a.text}"` : '(no text)'}
                      {'\n'}
                      {a.href}
                    </Text>
                  ))
                )}
              </ScrollView>
            </View>

            <Pressable style={styles.secondary} onPress={() => setManualScheduleOk((v) => !v)}>
              <Text style={styles.secondaryText}>
                {manualScheduleOk
                  ? 'Manual confirm: ON (Parse enabled)'
                  : 'Manual confirm: OFF — tap if schedule is visible but page kind was mis-detected'}
              </Text>
            </Pressable>

            <View style={styles.row}>
              <Pressable style={styles.secondary} onPress={() => setShowWeb(false)}>
                <Text style={styles.secondaryText}>Hide WebView</Text>
              </Pressable>
              <Pressable
                style={[styles.primary, !canParseToReview && styles.btnDisabled]}
                disabled={!canParseToReview}
                onPress={runInjectedExtract}
              >
                <Text style={styles.primaryText}>Parse & review (native)</Text>
              </Pressable>
            </View>
            <Text style={styles.hintSmall}>
              Parse only after status shows schedule_loaded, or turn manual confirm ON when the schedule is visibly on
              screen.
            </Text>

            <Pressable style={styles.tertiary} onPress={retryAutoNavigation}>
              <Text style={styles.tertiaryText}>Retry schedule auto-navigation</Text>
            </Pressable>

            <Pressable style={styles.warnBtn} onPress={captureWebViewScreenshot}>
              <Text style={styles.warnBtnText}>Screenshot fallback (PDF / no text)</Text>
            </Pressable>
          </ScrollView>

          <View ref={webWrapRef} style={styles.webWrap} collapsable={false}>
            <WebView
              ref={webRef}
              source={{ uri: JETBLUE_FLICA_ENTRY_URL }}
              style={styles.web}
              onNavigationStateChange={(nav) => {
                const u = nav.url ?? '';
                lastUrlRef.current = u;
                setLastUrl(u);
                setNavLoading(!!nav.loading);
                if (!nav.loading) {
                  setNavigatingToSchedule(false);
                }
              }}
              onLoadStart={() => setNavLoading(true)}
              onLoadEnd={() => {
                setNavLoading(false);
                injectProbe();
              }}
              onMessage={onMessage}
              onError={(ev) => {
                setWebViewFault(true);
                setLastError(ev.nativeEvent.description ?? 'WebView error');
              }}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
            />
          </View>
        </View>
      )}

      <Modal visible={previewOpen} animationType="slide" transparent onRequestClose={cancelPreview}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Capture preview (confirm)</Text>
            {preview ? (
              <>
                <Text style={styles.modalLabel}>Page kind (heuristic)</Text>
                <Text style={styles.modalValue}>{preview.pageKind}</Text>
                <Text style={styles.modalLabel}>URL</Text>
                <Text style={styles.modalMono} selectable numberOfLines={4}>
                  {preview.url}
                </Text>
                <Text style={styles.modalLabel}>document.title</Text>
                <Text style={styles.modalMono} selectable numberOfLines={2}>
                  {preview.title || '—'}
                </Text>
                <Text style={styles.modalLabel}>Extraction strategy</Text>
                <Text style={styles.modalMono} selectable numberOfLines={3}>
                  {preview.strategy}
                </Text>
                <Text style={styles.modalLabel}>Text length</Text>
                <Text style={styles.modalValue}>{preview.textLength}</Text>
                <Text style={styles.modalLabel}>First 500 chars</Text>
                <ScrollView style={styles.modalScroll} nestedScrollEnabled>
                  <Text style={styles.modalMono} selectable>
                    {preview.first500 || '—'}
                    {preview.textLength > 500 ? '…' : ''}
                  </Text>
                </ScrollView>
                {preview.errors && preview.errors.length > 0 ? (
                  <>
                    <Text style={styles.modalLabel}>Frame / cross-origin notes</Text>
                    <Text style={styles.modalMonoSmall}>{preview.errors.join('\n')}</Text>
                  </>
                ) : null}
                <View style={styles.modalRow}>
                  <Pressable style={styles.secondary} onPress={cancelPreview}>
                    <Text style={styles.secondaryText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.primary} onPress={confirmReview}>
                    <Text style={styles.primaryText}>Continue to review</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
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
  hintSmall: { fontSize: 11, color: colors.textSecondary, lineHeight: 16, marginTop: 4 },
  subHdr: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  primary: {
    backgroundColor: colors.textPrimary,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  btnDisabled: { opacity: 0.45 },
  primaryText: { color: colors.background, fontWeight: '800', fontSize: 15 },
  secondary: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  secondaryText: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
  tertiary: {
    marginTop: spacing.xs,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  tertiaryText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  warnBtn: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerRed,
    alignItems: 'center',
  },
  warnBtnText: { color: colors.dangerRed, fontWeight: '700', fontSize: 14 },
  strip: {
    maxHeight: '46%',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  stripText: { fontSize: 10, fontFamily: 'Menlo', color: colors.textSecondary, marginBottom: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap', marginTop: spacing.sm },
  debugBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  debugScroll: { maxHeight: 140, padding: 8 },
  monoSmall: { fontFamily: 'Menlo', fontSize: 9, color: colors.textPrimary, marginBottom: 8 },
  webWrap: { flex: 1 },
  web: { flex: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  modalCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md,
    maxHeight: '88%',
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  modalLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 8 },
  modalValue: { fontSize: 14, color: colors.textPrimary },
  modalMono: { fontFamily: 'Menlo', fontSize: 11, color: colors.textPrimary },
  modalMonoSmall: { fontFamily: 'Menlo', fontSize: 10, color: colors.textSecondary, marginTop: 4 },
  modalScroll: { maxHeight: 160, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 8 },
  modalRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, justifyContent: 'flex-end' },
});
