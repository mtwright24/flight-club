/**
 * TEMP PoC — native debug view for FLICA page text parse results.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { parseFlicaPoCPageText } from '../src/dev/flicaPoCParse';
import { consumeFlicaPoCScratch } from '../src/dev/flicaPoCScratch';
import { colors, radius, spacing } from '../src/styles/theme';

const RAW_PREVIEW_LEN = 2000;

export default function FlicaReviewScreen() {
  const router = useRouter();
  const scratch = consumeFlicaPoCScratch();
  const parsed = scratch && scratch.rawText.length > 0 ? parseFlicaPoCPageText(scratch.rawText) : null;

  const rawPreview =
    scratch && scratch.rawText.length > 0
      ? scratch.rawText.length > RAW_PREVIEW_LEN
        ? `${scratch.rawText.slice(0, RAW_PREVIEW_LEN)}…`
        : scratch.rawText
      : '';

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
        {!scratch ? (
          <Text style={styles.warn}>
            No capture in handoff. Go back to FLICA Test, load the schedule, then tap &quot;Capture current visible
            schedule&quot; (or screenshot fallback for PDF/embed).
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
              Page kind (heuristic): {scratch.pageKind}
              {'\n'}
              Extraction strategy: {scratch.extractionStrategy}
              {scratch.primaryStrategy ? `\nPrimary strategy: ${scratch.primaryStrategy}` : ''}
              {scratch.mergedFrom ? `\nMerged from: ${scratch.mergedFrom}` : ''}
              {'\n'}
              Raw length: {scratch.textLength} chars
              {'\n'}
              Captured: {new Date(scratch.capturedAt).toISOString()}
            </Text>
            {scratch.extractionErrors && scratch.extractionErrors.length > 0 ? (
              <>
                <Text style={styles.section}>Extraction notes</Text>
                <Text style={styles.monoSmall}>{scratch.extractionErrors.join('\n')}</Text>
              </>
            ) : null}

            {scratch.rawText.length > 0 ? (
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

                <Text style={styles.section}>Raw text (first {RAW_PREVIEW_LEN} chars)</Text>
                <Text style={styles.raw} selectable>
                  {rawPreview}
                </Text>
              </>
            ) : scratch.screenshotFallbackUri ? (
              <Text style={styles.muted}>
                DOM text was not saved for this capture — only the screenshot above is available for OCR testing.
              </Text>
            ) : (
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
