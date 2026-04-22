/**
 * TEMP PoC — FLICA schedule text review (HTTP fetch or legacy WebView handoff).
 */
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { parseFlicaPoCPageText } from '../src/dev/flicaPoCParse';
import type { FlicaStoredCookies } from '../src/dev/flicaPoCCookieStore';
import { loadFlicaCookiesFromSecureStore } from '../src/dev/flicaPoCCookieStore';
import { consumeFlicaPoCScratch } from '../src/dev/flicaPoCScratch';
import { colors, radius, spacing } from '../src/styles/theme';

const RAW_PREVIEW_LEN = 3000;

export default function FlicaReviewScreen() {
  const router = useRouter();
  /** Consume handoff once per mount — calling consume() every render clears scratch on 2nd render. */
  const [scratch] = useState(() => consumeFlicaPoCScratch());
  const [secureCookies, setSecureCookies] = useState<FlicaStoredCookies | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadFlicaCookiesFromSecureStore().then((c) => {
        if (alive) setSecureCookies(c);
      });
      return () => {
        alive = false;
      };
    }, [])
  );

  const parsed =
    scratch && scratch.rawText.length > 0 && scratch.pageKind !== 'fetch_schedule'
      ? parseFlicaPoCPageText(scratch.rawText)
      : null;

  const rawPreview =
    scratch && scratch.rawText.length > 0
      ? scratch.rawText.length > RAW_PREVIEW_LEN
        ? `${scratch.rawText.slice(0, RAW_PREVIEW_LEN)}…`
        : scratch.rawText
      : '';

  const isFetch = scratch?.pageKind === 'fetch_schedule';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>FLICA review (PoC)</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={styles.section}>SecureStore cookies (verify capture)</Text>
        <Text style={styles.mono} selectable>
          FLiCASession: {secureCookies?.FLiCASession ?? '—'}
          {'\n'}
          FLiCAService: {secureCookies?.FLiCAService ?? '—'}
          {'\n'}
          AWSALB: {secureCookies?.AWSALB ?? '—'}
          {'\n'}
          AWSALBCORS: {secureCookies?.AWSALBCORS ?? '—'}
        </Text>

        {!scratch ? (
          <Text style={styles.warn}>
            No capture in handoff. Go back to FLICA Test, log in (mainmenu) or run &quot;Test Fetch Schedule&quot;.
          </Text>
        ) : (
          <>
            {scratch.screenshotFallbackUri ? (
              <>
                <Text style={styles.fallbackBanner}>
                  Fallback: screenshot capture (OCR / pipeline testing — not DOM text).
                </Text>
                {scratch.screenshotFallbackLabel ? (
                  <Text style={styles.muted}>{scratch.screenshotFallbackLabel}</Text>
                ) : null}
                <Image
                  source={{ uri: scratch.screenshotFallbackUri }}
                  style={styles.fallbackImage}
                  contentFit="contain"
                />
              </>
            ) : null}

            <Text style={styles.section}>Capture metadata</Text>
            <Text style={styles.mono}>
              Source URL: {scratch.lastUrl}
              {'\n'}
              document.title: {scratch.documentTitle || '—'}
              {'\n'}
              Page kind: {scratch.pageKind}
              {'\n'}
              Extraction strategy: {scratch.extractionStrategy}
              {scratch.primaryStrategy ? `\nPrimary strategy: ${scratch.primaryStrategy}` : ''}
              {scratch.mergedFrom ? `\nMerged from: ${scratch.mergedFrom}` : ''}
              {'\n'}
              Raw length: {scratch.textLength} chars
              {'\n'}
              Captured: {new Date(scratch.capturedAt).toISOString()}
              {scratch.responseFinalUrl && scratch.pageKind !== 'fetch_schedule'
                ? `\nResponse URL (after redirects): ${scratch.responseFinalUrl}`
                : ''}
            </Text>

            {isFetch && scratch.httpStatus !== undefined ? (
              <>
                <Text style={styles.section}>HTTP</Text>
                <Text style={styles.mono} selectable>
                  Status code: {scratch.httpStatus}
                  {'\n'}
                  Final URL: {scratch.responseFinalUrl ?? scratch.lastUrl}
                </Text>
              </>
            ) : null}

            {isFetch && scratch.scheduleKeywordHints ? (
              <>
                <Text style={styles.section}>Schedule text hints</Text>
                <Text style={styles.mono} selectable>
                  Contains PAIRING: {scratch.scheduleKeywordHints.PAIRING ? 'yes' : 'no'}
                  {'\n'}
                  Contains REPORT: {scratch.scheduleKeywordHints.REPORT ? 'yes' : 'no'}
                  {'\n'}
                  Contains JFK: {scratch.scheduleKeywordHints.JFK ? 'yes' : 'no'}
                  {'\n'}
                  Contains LHR: {scratch.scheduleKeywordHints.LHR ? 'yes' : 'no'}
                </Text>
              </>
            ) : null}

            {isFetch && scratch.multiMonthSchedule && scratch.multiMonthSchedule.length > 0 ? (
              <>
                <Text style={styles.section}>GO=1 multi-month (Mar / Apr / May)</Text>
                {scratch.multiMonthSchedule.map((row) => (
                  <View key={row.blockDate} style={styles.mmRow}>
                    <Text style={styles.mono} selectable>
                      {row.monthLabel} BlockDate={row.blockDate} — HTTP {row.httpStatus}
                      {'\n'}
                      PAIRING: {row.hints.PAIRING ? 'yes' : 'no'} · REPORT: {row.hints.REPORT ? 'yes' : 'no'} · JFK:{' '}
                      {row.hints.JFK ? 'yes' : 'no'} · LHR: {row.hints.LHR ? 'yes' : 'no'}
                      {'\n'}
                      {row.finalUrl}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}

            {isFetch && scratch.aprilPreview3000 && scratch.aprilPreview3000.length > 0 ? (
              <>
                <Text style={styles.section}>April (0426) — first 3000 chars of schedule HTML</Text>
                <Text style={styles.raw} selectable>
                  {scratch.aprilPreview3000.length >= RAW_PREVIEW_LEN
                    ? `${scratch.aprilPreview3000.slice(0, RAW_PREVIEW_LEN)}…`
                    : scratch.aprilPreview3000}
                </Text>
              </>
            ) : null}

            {scratch.extractionErrors && scratch.extractionErrors.length > 0 ? (
              <>
                <Text style={styles.section}>Notes</Text>
                <Text style={styles.monoSmall}>{scratch.extractionErrors.join('\n')}</Text>
              </>
            ) : null}

            {scratch.pageKind === 'native_cookie_capture' ? (
              <Text style={styles.muted}>
                Native cookie-only handoff — values above should be populated. Use &quot;Test Fetch Schedule&quot; on FLICA
                Test to pull schedule HTML next.
              </Text>
            ) : null}

            {scratch.rawText.length > 0 ? (
              <>
                {!isFetch ? (
                  <>
                    <Text style={styles.section}>Metrics (heuristic)</Text>
                    {parsed && parsed.metrics.length > 0 ? (
                      parsed.metrics.map((m) => (
                        <Text key={m.label} style={styles.line}>
                          {m.label}: {m.value}
                        </Text>
                      ))
                    ) : (
                      <Text style={styles.muted}>No BLOCK/CREDIT/TAFB/YTD/DAYS OFF lines matched.</Text>
                    )}

                    <Text style={styles.section}>Pairing IDs (regex)</Text>
                    <Text style={styles.monoSmall} selectable>
                      {parsed?.pairingIds.length ? parsed.pairingIds.join(', ') : '— none —'}
                    </Text>

                    <Text style={styles.section}>Report times (HH:MM)</Text>
                    <Text style={styles.monoSmall} selectable>
                      {parsed?.reportTimes.length ? parsed.reportTimes.join(', ') : '— none —'}
                    </Text>

                    <Text style={styles.section}>City / station tokens (noisy)</Text>
                    <Text style={styles.monoSmall} selectable>
                      {parsed?.cityCodes.length ? parsed.cityCodes.join(', ') : '— none —'}
                    </Text>

                    <Text style={styles.section}>D-END / layover / CONT lines</Text>
                    {parsed?.dEndOrLayoverHints.length ? (
                      parsed.dEndOrLayoverHints.map((line, i) => (
                        <Text key={i} style={styles.line} selectable>
                          {line}
                        </Text>
                      ))
                    ) : (
                      <Text style={styles.muted}>— none —</Text>
                    )}
                  </>
                ) : null}

                <Text style={styles.section}>
                  Raw response (first {RAW_PREVIEW_LEN} chars){isFetch ? ' — HTML as returned' : ''}
                </Text>
                <Text style={styles.raw} selectable>
                  {rawPreview}
                </Text>
              </>
            ) : scratch.screenshotFallbackUri ? (
              <Text style={styles.muted}>
                DOM text was not saved for this capture — only the screenshot above is available for OCR testing.
              </Text>
            ) : scratch.pageKind === 'native_cookie_capture' ? null : (
              <Text style={styles.warn}>Empty raw text with no screenshot — capture again or use screenshot fallback.</Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
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
  section: {
    marginTop: spacing.md,
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  line: { fontSize: 13, color: colors.textPrimary, marginBottom: 4 },
  mmRow: { marginTop: spacing.xs },
  mono: { fontFamily: 'Menlo', fontSize: 11, color: colors.textSecondary },
  monoSmall: { fontFamily: 'Menlo', fontSize: 11, color: colors.textPrimary },
  muted: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic' },
  warn: { fontSize: 14, color: colors.dangerRed, lineHeight: 20 },
  fallbackBanner: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.dangerRed,
    marginBottom: spacing.xs,
  },
  fallbackImage: {
    width: '100%',
    minHeight: 220,
    maxHeight: 480,
    backgroundColor: colors.cardBg,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  raw: {
    fontFamily: 'Menlo',
    fontSize: 10,
    color: colors.textPrimary,
    backgroundColor: colors.cardBg,
    padding: 10,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
});
