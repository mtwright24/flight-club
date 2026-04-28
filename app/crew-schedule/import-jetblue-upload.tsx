import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createImportBatch,
  fetchImportBatch,
  invokeImportScheduleOcr,
} from '../../src/features/crew-schedule/scheduleApi';
import { buildScheduleUploadBytes } from '../../src/features/crew-schedule/scheduleImportUploadBytes';
import { scanScheduleDocuments } from '../../src/features/crew-schedule/documentScanSchedule';
import {
  createScheduleImport,
  createScheduleImportIssue,
  insertScheduleImportImage,
  updateScheduleImport,
} from '../../src/features/crew-schedule/jetblueFlicaImport';
import {
  clearJetBlueCandidateRowsForImport,
  persistJetBlueFlicaStructuredParse,
} from '../../src/features/crew-schedule/persistJetBlueFlicaPairings';
import { scoreJetBlueFlicaTemplateMatch } from '../../src/features/crew-schedule/jetblueFlicaTemplate';
import {
  clampYearMonthToScheduleWindow,
  canGoToNextScheduleMonth,
  canGoToPreviousScheduleMonth,
  tryStepScheduleMonth,
} from '../../src/features/crew-schedule/scheduleMonthWindow';
import { loadLastMonthCursor, saveLastMonthCursor } from '../../src/features/crew-schedule/scheduleViewStorage';
import { scheduleTheme as T } from '../../src/features/crew-schedule/scheduleTheme';
import CrewScheduleHeader from '../../src/features/crew-schedule/components/CrewScheduleHeader';
import { supabase } from '../../src/lib/supabaseClient';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'upload';
}

/** One file to upload + OCR in the JetBlue guided import session (screens, PDF, or scanned pages). */
type JetBlueUploadItem = {
  uri: string;
  mime: string;
  baseName: string;
  sourceType: 'screenshot' | 'pdf' | 'document_scan';
  jpegBase64?: string | null;
  width?: number | null;
  height?: number | null;
};

export default function ImportJetBlueUploadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [busy, setBusy] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const [logLine, setLogLine] = useState<string>('');

  useEffect(() => {
    void loadLastMonthCursor().then((c) => {
      const anchor = new Date();
      if (c) {
        const cl = clampYearMonthToScheduleWindow(c.year, c.month, anchor);
        setYear(cl.year);
        setMonth(cl.month);
        if (cl.year !== c.year || cl.month !== c.month) void saveLastMonthCursor(cl.year, cl.month);
      }
    });
  }, []);

  const monthKey = `${year}-${pad2(month)}`;

  const goPrevMonth = useCallback(() => {
    const anchor = new Date();
    const n = tryStepScheduleMonth(year, month, -1, anchor);
    if (!n) return;
    setYear(n.year);
    setMonth(n.month);
    void saveLastMonthCursor(n.year, n.month);
  }, [year, month]);

  const goNextMonth = useCallback(() => {
    const anchor = new Date();
    const n = tryStepScheduleMonth(year, month, 1, anchor);
    if (!n) return;
    setYear(n.year);
    setMonth(n.month);
    void saveLastMonthCursor(n.year, n.month);
  }, [year, month]);

  const canPrevJbMonth = useMemo(
    () => canGoToPreviousScheduleMonth(year, month),
    [year, month],
  );
  const canNextJbMonth = useMemo(
    () => canGoToNextScheduleMonth(year, month),
    [year, month],
  );

  const runJetBlueImportPipeline = useCallback(
    async (items: JetBlueUploadItem[]) => {
      if (!items.length) return;

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        Alert.alert('Sign in required', 'Please sign in.');
        return;
      }
      const uid = userData.user.id;

      setBusy(true);
      const rawChunks: string[] = [];
      const scores: number[] = [];
      let firstBatchId: string | null = null;
      let sid = importId;

      try {
        if (!sid) {
          sid = await createScheduleImport({ importMonth: month, importYear: year });
          setImportId(sid);
        }
        await updateScheduleImport(sid, { status: 'processing', needs_review: false });

        let order = 0;
        for (const it of items) {
          order += 1;
          setLogLine(`Processing file ${order} of ${items.length}…`);
          const safe = safeFileName(it.baseName);
          const path = `${uid}/jetblue/${sid}/${Date.now()}-${order}-${safe}`;

          let bytes: Uint8Array;
          try {
            bytes = await buildScheduleUploadBytes(it.uri, it.mime, it.jpegBase64);
          } catch (e) {
            await createScheduleImportIssue({
              importId: sid,
              issueType: 'read_error',
              message: e instanceof Error ? e.message : String(e),
              severity: 'high',
            });
            continue;
          }
          if (bytes.length === 0) {
            await createScheduleImportIssue({
              importId: sid,
              issueType: 'empty_file',
              message: `File ${order} was empty after decode.`,
              severity: 'medium',
            });
            continue;
          }

          const { error: upErr } = await supabase.storage.from('schedule-imports').upload(path, bytes, {
            contentType: it.mime,
            upsert: false,
          });
          if (upErr) {
            await createScheduleImportIssue({
              importId: sid,
              issueType: 'storage_error',
              message: upErr.message,
              severity: 'high',
            });
            continue;
          }

          let batchId: string;
          try {
            batchId = await createImportBatch({
              monthKey,
              sourceType: it.sourceType,
              sourceFilePath: path,
              scheduleImportId: sid,
            });
            await invokeImportScheduleOcr(batchId);
          } catch (e) {
            await createScheduleImportIssue({
              importId: sid,
              issueType: 'ocr_error',
              message: e instanceof Error ? e.message : String(e),
              severity: 'high',
            });
            continue;
          }

          if (!firstBatchId) firstBatchId = batchId;

          const batch = await fetchImportBatch(batchId);
          const ocr = batch?.raw_extracted_text ?? '';
          rawChunks.push(ocr);
          const imgScore = scoreJetBlueFlicaTemplateMatch(ocr);
          scores.push(imgScore);

          await insertScheduleImportImage({
            importId: sid,
            storagePath: path,
            imageOrder: order,
            legacyBatchId: batchId,
            ocrText: ocr.slice(0, 50000),
            templateDetected: imgScore >= 0.45,
            imageConfidence: imgScore,
            width: it.width ?? null,
            height: it.height ?? null,
          });
        }

        const combined = rawChunks.filter(Boolean).join('\n\n---\n\n');
        const avg =
          scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null;
        const low = scores.some((s) => s < 0.6);

        if (rawChunks.length > 0 && sid && firstBatchId) {
          try {
            await persistJetBlueFlicaStructuredParse({
              importId: sid,
              monthKey,
              ocrText: combined,
              primaryBatchId: firstBatchId,
            });
            await clearJetBlueCandidateRowsForImport(sid);
          } catch (e) {
            await createScheduleImportIssue({
              importId: sid,
              issueType: 'parse_error',
              message: e instanceof Error ? e.message : String(e),
              severity: 'high',
            });
          }
        }

        await updateScheduleImport(sid, {
          status: rawChunks.length > 0 ? 'review' : 'partial',
          raw_ocr_text: combined.slice(0, 100000),
          overall_confidence: avg,
          needs_review: low || rawChunks.length === 0,
        });

        if (rawChunks.length === 0) {
          Alert.alert(
            'Nothing parsed yet',
            'No files completed OCR. You can retry from Manage, or try screenshots / a different PDF. Your import session is saved as partial.'
          );
        } else {
          router.replace({
            pathname: '/crew-schedule/import-jetblue-review/[importId]',
            params: { importId: sid },
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (sid) {
          await updateScheduleImport(sid, { status: 'failed', needs_review: true }).catch(() => {});
        }
        Alert.alert('Import issue', msg + '\n\nPartial progress may still be saved — open review to continue.');
      } finally {
        setBusy(false);
        setLogLine('');
      }
    },
    [importId, month, monthKey, router, year]
  );

  const onUploadScreenshots = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 1,
      base64: true,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result.canceled || !result.assets?.length) return;

    const items: JetBlueUploadItem[] = result.assets.map((asset, i) => ({
      uri: asset.uri,
      mime: asset.mimeType ?? 'image/jpeg',
      baseName: asset.fileName ?? `shot-${i + 1}.jpg`,
      sourceType: 'screenshot' as const,
      jpegBase64: asset.base64,
      width: asset.width ?? null,
      height: asset.height ?? null,
    }));

    await runJetBlueImportPipeline(items);
  }, [runJetBlueImportPipeline]);

  const onUploadPdf = useCallback(async () => {
    try {
      const DocumentPicker = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      await runJetBlueImportPipeline([
        {
          uri: asset.uri,
          mime: asset.mimeType ?? 'application/pdf',
          baseName: asset.name ?? 'schedule.pdf',
          sourceType: 'pdf',
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(
        'PDF picker failed',
        'Could not open the file picker. On a dev build, ensure expo-document-picker is installed.\n\n' + msg
      );
    }
  }, [runJetBlueImportPipeline]);

  const onScanDocuments = useCallback(async () => {
    try {
      const r = await scanScheduleDocuments();
      if (r.kind === 'cancel') return;
      if (r.kind === 'unavailable') {
        Alert.alert(
          'Document scan not available',
          r.reason === 'module'
            ? 'Expo Go does not include the native document scanner. Use screenshots or PDF here, or build a development build with react-native-document-scanner-plugin. You can also use Crew schedule → Import schedule → Screenshot for the generic flow.'
            : 'Could not open the scanner. Try screenshots or PDF.',
          [
            { text: 'OK', style: 'cancel' },
            { text: 'Choose screenshots', onPress: () => void onUploadScreenshots() },
          ]
        );
        return;
      }
      const items: JetBlueUploadItem[] = r.filePaths.map((uri, i) => ({
        uri,
        mime: 'image/jpeg',
        baseName: `scan-page-${i + 1}.jpg`,
        sourceType: 'document_scan' as const,
      }));
      await runJetBlueImportPipeline(items);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Scan failed', msg);
    }
  }, [onUploadScreenshots, runJetBlueImportPipeline]);

  return (
    <View style={styles.shell}>
      <CrewScheduleHeader title="Import FLICA schedule" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.h1}>Month & source files</Text>
        <Text style={styles.meta}>
          Import month: <Text style={styles.metaStrong}>{monthKey}</Text>
        </Text>
        <View style={styles.monthRow}>
          <Pressable
            onPress={goPrevMonth}
            style={styles.arrow}
            disabled={!canPrevJbMonth}
            accessibilityLabel="Previous month"
            accessibilityState={{ disabled: !canPrevJbMonth }}
          >
            <Text style={[styles.arrowText, !canPrevJbMonth && styles.arrowTextDisabled]}>‹</Text>
          </Pressable>
          <Text style={styles.monthLabel}>
            {MONTH_NAMES[month - 1]} {year}
          </Text>
          <Pressable
            onPress={goNextMonth}
            style={styles.arrow}
            disabled={!canNextJbMonth}
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: !canNextJbMonth }}
          >
            <Text style={[styles.arrowText, !canNextJbMonth && styles.arrowTextDisabled]}>›</Text>
          </Pressable>
        </View>

        <Text style={styles.lead}>
          Upload screenshots (1–4), a PDF export, or scanned pages. The server extracts text (OCR for images, text layer +
          optional embedded images for PDFs) and runs the same JetBlue FLICA pairing pass as the generic Import schedule
          flow.
        </Text>

        <Text style={styles.note}>
          <Text style={styles.noteStrong}>Expo Go:</Text> screenshots and PDF work. The live edge-detection scanner needs a
          development build with the document-scanner native module.
        </Text>

        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={T.accent} size="large" />
            <Text style={styles.muted}>{logLine || 'Working…'}</Text>
          </View>
        ) : (
          <View style={styles.btnCol}>
            <Pressable style={styles.btn} onPress={() => void onUploadScreenshots()}>
              <Ionicons name="images-outline" size={20} color="#fff" style={styles.btnIcon} />
              <Text style={styles.btnText}>Choose screenshots (1–4)</Text>
            </Pressable>
            <Pressable style={styles.btnSecondary} onPress={() => void onUploadPdf()}>
              <Ionicons name="document-text-outline" size={20} color={T.accent} style={styles.btnIcon} />
              <Text style={styles.btnSecondaryText}>Upload PDF</Text>
            </Pressable>
            <Pressable style={styles.btnSecondary} onPress={() => void onScanDocuments()}>
              <Ionicons name="scan-outline" size={20} color={T.accent} style={styles.btnIcon} />
              <Text style={styles.btnSecondaryText}>Scan documents</Text>
            </Pressable>
          </View>
        )}

        <Pressable style={styles.ghost} onPress={() => router.back()}>
          <Text style={styles.ghostText}>Back</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16 },
  h1: { fontSize: 18, fontWeight: '800', color: T.text, marginBottom: 8 },
  meta: { fontSize: 13, color: T.textSecondary, marginBottom: 8 },
  metaStrong: { fontWeight: '800', color: T.text },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 16,
  },
  arrow: { padding: 8 },
  arrowText: { fontSize: 28, color: T.accent, fontWeight: '300' },
  arrowTextDisabled: { color: T.line },
  monthLabel: { fontSize: 17, fontWeight: '800', color: T.text },
  lead: { fontSize: 14, color: T.textSecondary, lineHeight: 21, marginBottom: 12 },
  note: { fontSize: 12, color: T.textSecondary, lineHeight: 18, marginBottom: 20 },
  noteStrong: { fontWeight: '800', color: T.text },
  busy: { alignItems: 'center', gap: 12, marginVertical: 20 },
  muted: { fontSize: 13, color: T.textSecondary },
  btnCol: { gap: 10 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: T.accent,
    paddingVertical: 14,
    borderRadius: 10,
  },
  btnIcon: { marginRight: 0 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: T.surface,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
  },
  btnSecondaryText: { color: T.accent, fontWeight: '800', fontSize: 16 },
  ghost: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  ghostText: { color: T.textSecondary, fontWeight: '700', fontSize: 15 },
});
