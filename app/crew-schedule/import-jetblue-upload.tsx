import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import {
  createScheduleImport,
  createScheduleImportIssue,
  insertScheduleImportImage,
  updateScheduleImport,
} from '../../src/features/crew-schedule/jetblueFlicaImport';
import { scoreJetBlueFlicaTemplateMatch } from '../../src/features/crew-schedule/jetblueFlicaTemplate';
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
      if (c) {
        setYear(c.year);
        setMonth(c.month);
      }
    });
  }, []);

  const monthKey = `${year}-${pad2(month)}`;

  const goPrevMonth = useCallback(() => {
    if (month === 1) {
      setYear((y) => {
        const ny = y - 1;
        void saveLastMonthCursor(ny, 12);
        return ny;
      });
      setMonth(12);
    } else {
      const nm = month - 1;
      setMonth(nm);
      void saveLastMonthCursor(year, nm);
    }
  }, [year, month]);

  const goNextMonth = useCallback(() => {
    if (month === 12) {
      setYear((y) => {
        const ny = y + 1;
        void saveLastMonthCursor(ny, 1);
        return ny;
      });
      setMonth(1);
    } else {
      const nm = month + 1;
      setMonth(nm);
      void saveLastMonthCursor(year, nm);
    }
  }, [year, month]);

  const onUploadScreenshots = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.92,
      base64: true,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result.canceled || !result.assets?.length) return;

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      Alert.alert('Sign in required', 'Please sign in.');
      return;
    }
    const uid = userData.user.id;

    setBusy(true);
    const rawChunks: string[] = [];
    const scores: number[] = [];
    let sid = importId;
    try {
      if (!sid) {
        sid = await createScheduleImport({ importMonth: month, importYear: year });
        setImportId(sid);
      }
      await updateScheduleImport(sid, { status: 'processing', needs_review: false });

      let order = 0;
      for (const asset of result.assets) {
        order += 1;
        setLogLine(`Processing image ${order} of ${result.assets.length}…`);
        const baseName = asset.fileName ?? `shot-${order}.jpg`;
        const safe = safeFileName(baseName);
        const path = `${uid}/jetblue/${sid}/${Date.now()}-${order}-${safe}`;

        let bytes: Uint8Array;
        try {
          bytes = await buildScheduleUploadBytes(asset.uri, asset.mimeType ?? 'image/jpeg', asset.base64);
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
            message: `Image ${order} was empty after decode.`,
            severity: 'medium',
          });
          continue;
        }

        const { error: upErr } = await supabase.storage.from('schedule-imports').upload(path, bytes, {
          contentType: asset.mimeType ?? 'image/jpeg',
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
            sourceType: 'screenshot',
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
          width: asset.width ?? null,
          height: asset.height ?? null,
        });
      }

      const combined = rawChunks.filter(Boolean).join('\n\n---\n\n');
      const avg =
        scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null;
      const low = scores.some((s) => s < 0.6);

      await updateScheduleImport(sid, {
        status: rawChunks.length > 0 ? 'review' : 'partial',
        raw_ocr_text: combined.slice(0, 100000),
        overall_confidence: avg,
        needs_review: low || rawChunks.length === 0,
      });

      if (rawChunks.length === 0) {
        Alert.alert(
          'Nothing parsed yet',
          'No images completed OCR. You can retry from Manage, or pick different screenshots. Your import session is saved as partial.'
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
  }, [importId, month, monthKey, router, year]);

  return (
    <View style={styles.shell}>
      <CrewScheduleHeader title="Upload screenshots" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.h1}>Month & images</Text>
        <Text style={styles.meta}>
          Import month: <Text style={styles.metaStrong}>{monthKey}</Text>
        </Text>
        <View style={styles.monthRow}>
          <Pressable onPress={goPrevMonth} style={styles.arrow}>
            <Text style={styles.arrowText}>‹</Text>
          </Pressable>
          <Text style={styles.monthLabel}>
            {MONTH_NAMES[month - 1]} {year}
          </Text>
          <Pressable onPress={goNextMonth} style={styles.arrow}>
            <Text style={styles.arrowText}>›</Text>
          </Pressable>
        </View>

        <Text style={styles.lead}>
          Pick 1–4 clear screenshots of your FLICA monthly detailed list. Use good light; include the full pairing blocks.
          We never delete prior OCR when you add more — each image gets its own parse batch.
        </Text>

        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={T.accent} size="large" />
            <Text style={styles.muted}>{logLine || 'Working…'}</Text>
          </View>
        ) : (
          <Pressable style={styles.btn} onPress={() => void onUploadScreenshots()}>
            <Text style={styles.btnText}>Choose screenshots (1–4)</Text>
          </Pressable>
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
  monthLabel: { fontSize: 17, fontWeight: '800', color: T.text },
  lead: { fontSize: 14, color: T.textSecondary, lineHeight: 21, marginBottom: 20 },
  busy: { alignItems: 'center', gap: 12, marginVertical: 20 },
  muted: { fontSize: 13, color: T.textSecondary },
  btn: {
    backgroundColor: T.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  ghost: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  ghostText: { color: T.textSecondary, fontWeight: '700', fontSize: 15 },
});
