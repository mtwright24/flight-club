import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createImportBatch,
  invokeImportScheduleOcr,
} from '../../src/features/crew-schedule/scheduleApi';
import { scheduleTheme as T } from '../../src/features/crew-schedule/scheduleTheme';
import { loadLastMonthCursor, saveLastMonthCursor } from '../../src/features/crew-schedule/scheduleViewStorage';
import CrewScheduleHeader from '../../src/features/crew-schedule/components/CrewScheduleHeader';
import { supabase } from '../../src/lib/supabaseClient';

type Source = 'photo' | 'pdf' | null;

const L = '[schedule-import]';

/** Physical devices + tunnel often do not stream JS logs to the Metro terminal; we mirror to the screen in dev. */
let appendImportScheduleScreenLog: ((line: string) => void) | null = null;

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

function formatDbgArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return a.message;
      if (typeof a === 'object' && a !== null) {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(' ');
}

/** Log to Metro (both levels — some setups only show log or only warn) + optional on-screen buffer. */
function dbg(...args: unknown[]) {
  const line = `${L} ${formatDbgArgs(args)}`;
  console.log(line);
  console.warn(line);
  appendImportScheduleScreenLog?.(line);
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'upload';
}

/** Strips data-URL prefix / whitespace; pads for `atob`. Returns empty array if decode fails. */
function bytesFromBase64(base64: string): Uint8Array {
  const cleaned = base64
    .replace(/^data:.*;base64,/i, '')
    .replace(/\s/g, '');
  if (!cleaned.length) return new Uint8Array(0);
  let padded = cleaned;
  while (padded.length % 4 !== 0) padded += '=';
  try {
    const binary = globalThis.atob(padded);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return new Uint8Array(0);
  }
}

/** Fallback when ImagePicker did not return inline base64 (e.g. some Android paths). */
async function readLocalUriAsBytes(uri: string, mimeType: string | undefined): Promise<Uint8Array> {
  const uriHint = uri.slice(0, 48) + (uri.length > 48 ? '…' : '');
  try {
    dbg('readLocalUriAsBytes: FileSystem.readAsStringAsync base64', { uriHint });
    const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
    dbg('readLocalUriAsBytes: readAsStringAsync length', base64?.length ?? 0);
    if (!base64?.length) throw new Error('empty base64');
    const decoded = bytesFromBase64(base64);
    if (decoded.length === 0) throw new Error('empty base64 decode');
    return decoded;
  } catch (firstErr) {
    dbg('readLocalUriAsBytes: FileSystem failed, fetch(uri).arrayBuffer()', firstErr);
    const res = await fetch(uri);
    dbg('readLocalUriAsBytes: fetch status', res.status);
    const ab = await res.arrayBuffer();
    const bytes = new Uint8Array(ab);
    dbg('readLocalUriAsBytes: arrayBuffer byteLength', bytes.length);
    if (bytes.length === 0) {
      throw new Error('Could not read file (empty). Try another photo or export as JPEG.');
    }
    return bytes;
  }
}

/** Logs `fallbackUsed` + `fallbackBytesLength` for Metro diagnosis of 0-byte Storage uploads. */
async function readLocalUriAsBytesWithDiag(uri: string, mime: string | undefined): Promise<Uint8Array> {
  dbg('fallbackUsed', { uriPrefix: uri.slice(0, 32) });
  const bytes = await readLocalUriAsBytes(uri, mime);
  dbg('fallbackBytesLength', { len: bytes.length });
  return bytes;
}

/** Prefer ImagePicker `base64: true` — upload **Uint8Array** (RN Blob often serializes to 0 bytes in Storage). */
async function buildUploadBytes(
  uri: string,
  mime: string | undefined,
  jpegBase64: string | null | undefined
): Promise<Uint8Array> {
  const hasInline = !!(jpegBase64 && jpegBase64.length > 0);
  dbg('buildUploadBytes', {
    hasInlineBase64: hasInline,
    inlineBase64Length: jpegBase64?.length ?? 0,
    mime: mime ?? '(none)',
    uriPrefix: uri.slice(0, 24),
  });
  if (hasInline) {
    const bytes = bytesFromBase64(jpegBase64!);
    dbg('inlineDecodedLength', { jpegBase64DecodedBytes: bytes.length });
    if (bytes.length > 0) return bytes;
    dbg('buildUploadBytes: inline base64 decoded to 0 bytes — readLocalUriAsBytes fallback');
    return readLocalUriAsBytesWithDiag(uri, mime);
  }
  dbg('buildUploadBytes: no inline base64 — readLocalUriAsBytes');
  return readLocalUriAsBytesWithDiag(uri, mime);
}

export default function ImportScheduleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Source>(null);
  const [busy, setBusy] = useState(false);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [importDebugLines, setImportDebugLines] = useState<string[]>([]);

  useEffect(() => {
    if (!__DEV__) return;
    appendImportScheduleScreenLog = (line) => {
      const stamp = new Date().toISOString().slice(11, 23);
      setImportDebugLines((prev) => [...prev.slice(-48), `${stamp} ${line}`]);
    };
    return () => {
      appendImportScheduleScreenLog = null;
    };
  }, []);

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
      const ny = year - 1;
      const nm = 12;
      setYear(ny);
      setMonth(nm);
      void saveLastMonthCursor(ny, nm);
    } else {
      const nm = month - 1;
      setMonth(nm);
      void saveLastMonthCursor(year, nm);
    }
  }, [year, month]);

  const goNextMonth = useCallback(() => {
    if (month === 12) {
      const ny = year + 1;
      const nm = 1;
      setYear(ny);
      setMonth(nm);
      void saveLastMonthCursor(ny, nm);
    } else {
      const nm = month + 1;
      setMonth(nm);
      void saveLastMonthCursor(year, nm);
    }
  }, [year, month]);

  const uploadAndProcess = useCallback(
    async (
      uri: string,
      mime: string | undefined,
      baseName: string,
      sourceType: 'screenshot' | 'photo' | 'pdf',
      opts?: { jpegBase64?: string | null }
    ) => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        Alert.alert('Sign in required', 'Please sign in to import your schedule.');
        return;
      }
      const uid = userData.user.id;
      const ts = Date.now();
      const safe = safeFileName(baseName);
      const path = `${uid}/${monthKey}/${ts}-${safe}`;

      setBusy(true);
      try {
        dbg('uploadAndProcess start', { sourceType, path, baseName });
        dbg('inlineUsed', { hasInline: !!opts?.jpegBase64 });
        const bytes = await buildUploadBytes(uri, mime, opts?.jpegBase64);
        dbg('uploadAndProcess byteLength before upload', bytes.length);
        if (bytes.length === 0) {
          throw new Error('Image is empty; pick another photo.');
        }

        const { error: upErr, data: upData } = await supabase.storage.from('schedule-imports').upload(path, bytes, {
          contentType: mime || 'application/octet-stream',
          upsert: false,
        });
        if (upErr) {
          dbg('storage upload error', upErr);
          const em = (upErr as { message?: string }).message ?? String(upErr);
          if (/bucket|not found|404/i.test(em)) {
            throw new Error(
              'Storage bucket "schedule-imports" is missing. In Supabase: run SQL from supabase/schedule-import-bucket.sql (or apply migrations), then retry.'
            );
          }
          throw upErr;
        }
        dbg('storage upload ok', { path, upData });

        const batchId = await createImportBatch({
          monthKey,
          sourceType,
          sourceFilePath: path,
        });

        dbg('calling invokeImportScheduleOcr', { batchId });
        await invokeImportScheduleOcr(batchId);
        dbg('invokeImportScheduleOcr done');

        router.replace({
          pathname: '/crew-schedule/import-review/[batchId]',
          params: { batchId },
        });
      } catch (e) {
        dbg('uploadAndProcess FAILED', e);
        let msg = e instanceof Error ? e.message : String(e);
        const isInvalidJwt = /Invalid JWT/i.test(msg);
        if (isInvalidJwt) {
          msg +=
            '\n\nThis is a Supabase session token issue (not your Google Vision keys). Try: sign out and sign in again, or confirm EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY match this Supabase project.';
        } else if (/Edge Function|FunctionsHttpError|Failed to send|non-2xx/i.test(msg)) {
          msg +=
            '\n\nIf the error mentions Vision/OCR extraction (not 401 JWT), check Edge secrets: GOOGLE_CLOUD_API_KEY or GOOGLE_CLOUD_CLIENT_EMAIL + GOOGLE_CLOUD_PRIVATE_KEY.';
        }
        Alert.alert('Import failed', msg);
      } finally {
        setBusy(false);
      }
    },
    [monthKey, router]
  );

  const pickPhotoLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to import a screenshot.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.92,
      base64: true,
      // iOS: prefer JPEG-compatible export instead of HEIC when possible (Vision API does not support HEIC).
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    dbg('pickPhotoLibrary asset', {
      uriPrefix: asset.uri.slice(0, 32),
      mimeType: asset.mimeType,
      fileName: asset.fileName,
      hasBase64: !!asset.base64,
      base64Length: asset.base64?.length ?? 0,
      width: asset.width,
      height: asset.height,
      fileSize: (asset as { fileSize?: number }).fileSize,
    });
    await uploadAndProcess(asset.uri, asset.mimeType ?? 'image/jpeg', asset.fileName ?? 'photo.jpg', 'screenshot', {
      jpegBase64: asset.base64,
    });
  }, [uploadAndProcess]);

  const pickCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera access to capture your schedule.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.92,
      base64: true,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    dbg('pickCamera asset', {
      hasBase64: !!asset.base64,
      base64Length: asset.base64?.length ?? 0,
      mimeType: asset.mimeType,
    });
    await uploadAndProcess(asset.uri, asset.mimeType ?? 'image/jpeg', 'camera.jpg', 'photo', { jpegBase64: asset.base64 });
  }, [uploadAndProcess]);

  const onChoosePhoto = useCallback(() => {
    Alert.alert('Photo or screenshot', 'Choose a source', [
      { text: 'Photo library', onPress: () => void pickPhotoLibrary() },
      { text: 'Camera', onPress: () => void pickCamera() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [pickCamera, pickPhotoLibrary]);

  const pickPdf = useCallback(async () => {
    try {
      const DocumentPicker = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      await uploadAndProcess(asset.uri, asset.mimeType ?? 'application/pdf', asset.name ?? 'schedule.pdf', 'pdf');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(
        'PDF picker unavailable',
        'Install dependencies (npm install), use a dev build with expo-document-picker, or try a photo/screenshot instead.\n\n' +
          msg
      );
    }
  }, [uploadAndProcess]);

  const continueFlow = useCallback(() => {
    if (selected === 'photo') void onChoosePhoto();
    else if (selected === 'pdf') void pickPdf();
  }, [onChoosePhoto, pickPdf, selected]);

  return (
    <View style={styles.shell}>
      <CrewScheduleHeader title="Import schedule" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.monthRow}>
          <Pressable onPress={goPrevMonth} style={styles.monthArrow} accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={22} color={T.accent} />
          </Pressable>
          <Text style={styles.monthLabel}>
            {MONTH_NAMES[month - 1]} {year}
          </Text>
          <Pressable onPress={goNextMonth} style={styles.monthArrow} accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={22} color={T.accent} />
          </Pressable>
        </View>
        <Text style={styles.meta}>
          Import bucket <Text style={styles.metaStrong}>{monthKey}</Text> — rows save under this month. OCR also detects the month from your image when possible.
        </Text>
        <Text style={styles.lead}>Upload a roster screenshot, photo, or PDF. Text is extracted server-side; you review before anything is saved.</Text>

        <Text style={styles.h2}>JetBlue FLICA (recommended)</Text>
        <Pressable
          style={styles.promo}
          onPress={() => router.push('/crew-schedule/import-jetblue-source')}
        >
          <Text style={styles.promoTitle}>Flight Attendant · template import</Text>
          <Text style={styles.promoSub}>
            Monthly detailed list screenshots · detection, OCR, confidence, 1–4 images, review before save — not generic
            OCR-only.
          </Text>
        </Pressable>

        <Text style={styles.h2}>Other sources</Text>
        <View style={styles.options}>
          {(
            [
              { id: 'photo' as const, label: 'Screenshot / Photo', sub: 'Generic OCR + line review' },
              { id: 'pdf' as const, label: 'PDF', sub: 'Text extract + review' },
            ] as const
          ).map((opt) => {
            const active = selected === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSelected(opt.id)}
                style={[styles.opt, active && styles.optActive]}
              >
                <Text style={styles.optText}>{opt.label}</Text>
                <Text style={styles.optSub}>{opt.sub}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.options}>
          <Pressable
            style={styles.opt}
            onPress={() =>
              Alert.alert(
                'Calendar sync',
                'Connecting an external calendar is on the roadmap. Use JetBlue FLICA import or generic screenshot for now.'
              )
            }
          >
            <Text style={styles.optText}>Calendar</Text>
            <Text style={styles.optSub}>Coming soon</Text>
          </Pressable>
          <Pressable
            style={styles.opt}
            onPress={() =>
              Alert.alert(
                'Manual entry',
                'Full manual day-by-day entry is coming soon. Use Edit before save after a partial import, or Manage → Edit Day.'
              )
            }
          >
            <Text style={styles.optText}>Manual</Text>
            <Text style={styles.optSub}>Coming soon</Text>
          </Pressable>
        </View>

        {busy ? (
          <View style={styles.loading}>
            <ActivityIndicator color={T.accent} size="large" />
            <Text style={styles.loadingText}>Uploading and extracting text…</Text>
          </View>
        ) : (
          <Pressable
            style={[styles.continue, !selected && styles.continueDisabled]}
            onPress={continueFlow}
            disabled={!selected}
          >
            <Text style={styles.continueText}>Continue</Text>
          </Pressable>
        )}

        {__DEV__ ? (
          <View style={styles.debugPanel}>
            <Text style={styles.debugTitle}>Import debug (on-device — scroll here if Metro shows nothing)</Text>
            <ScrollView style={styles.debugScroll} nestedScrollEnabled>
              {importDebugLines.length === 0 ? (
                <Text style={styles.debugLineMuted}>Pick a photo; lines appear here with byte lengths.</Text>
              ) : (
                importDebugLines.map((line, i) => (
                  <Text key={`${i}-${line.slice(0, 24)}`} style={styles.debugLine} selectable>
                    {line}
                  </Text>
                ))
              )}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16 },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
  },
  monthArrow: { padding: 8 },
  monthLabel: { fontSize: 17, fontWeight: '800', color: T.text, minWidth: 200, textAlign: 'center' },
  meta: { fontSize: 12, color: T.textSecondary, marginBottom: 10, lineHeight: 17 },
  metaStrong: { fontWeight: '700', color: T.text },
  lead: { fontSize: 15, color: T.text, lineHeight: 22, marginBottom: 16 },
  promo: {
    marginBottom: 20,
    padding: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: T.accent,
    backgroundColor: '#FFF5F5',
  },
  promoTitle: { fontSize: 15, fontWeight: '800', color: T.text },
  promoSub: { fontSize: 12, color: T.textSecondary, marginTop: 6, lineHeight: 17 },
  h2: { fontSize: 13, fontWeight: '800', color: T.textSecondary, marginBottom: 10, textTransform: 'uppercase' },
  comingSoon: { fontSize: 12, color: T.textSecondary, marginTop: 12, fontStyle: 'italic' },
  options: { gap: 10 },
  opt: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
  },
  optActive: { borderColor: T.accent, backgroundColor: '#FEF2F2' },
  optText: { fontSize: 15, fontWeight: '700', color: T.text },
  optSub: { fontSize: 12, color: T.textSecondary, marginTop: 4 },
  loading: { alignItems: 'center', marginTop: 28, gap: 12 },
  loadingText: { fontSize: 14, color: T.textSecondary, textAlign: 'center' },
  continue: {
    marginTop: 28,
    backgroundColor: T.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  continueDisabled: { opacity: 0.45 },
  continueText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  debugPanel: {
    marginTop: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
  },
  debugTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#a3e635',
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
  },
  debugScroll: { maxHeight: 220, paddingHorizontal: 10, paddingBottom: 10 },
  debugLine: { fontSize: 10, fontFamily: 'monospace', color: '#e5e5e5', marginBottom: 6 },
  debugLineMuted: { fontSize: 10, color: '#737373', fontStyle: 'italic' },
});
