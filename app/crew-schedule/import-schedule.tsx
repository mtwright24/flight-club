import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
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
  fetchImportBatch,
  invokeImportScheduleOcr,
} from '../../src/features/crew-schedule/scheduleApi';
import { looksLikeFlicaRawText, ocrLooksLikeJetBlueFlicaMonthly } from '../../src/features/schedule-import/parser/jetblueFlicaOcrDetect';
import { persistJetBlueFlicaStructuredParseForGenericBatch } from '../../src/features/crew-schedule/persistJetBlueFlicaPairings';
import { scheduleTheme as T } from '../../src/features/crew-schedule/scheduleTheme';
import { loadLastMonthCursor, saveLastMonthCursor } from '../../src/features/crew-schedule/scheduleViewStorage';
import CrewScheduleHeader from '../../src/features/crew-schedule/components/CrewScheduleHeader';
import { scanScheduleDocuments } from '../../src/features/crew-schedule/documentScanSchedule';
import { supabase } from '../../src/lib/supabaseClient';

type Source = 'photo' | 'scan' | 'pdf' | 'calendar' | 'manual' | null;

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

/** Schedule OCR import tracing (disabled to reduce Metro noise). */
function dbg(..._args: unknown[]) {}

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
  /** Default to screenshot/photo so Continue works immediately (matches primary option styling). */
  const [selected, setSelected] = useState<Source>('photo');
  const [busy, setBusy] = useState(false);
  const [busyHint, setBusyHint] = useState('Importing schedule…');
  const [photoSourceModalVisible, setPhotoSourceModalVisible] = useState(false);
  /** After closing the RN Modal, open picker on next effect — InteractionManager can stall and never run. */
  const pendingOpenLibraryRef = useRef(false);
  const pendingOpenCameraRef = useRef(false);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
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

  const handlePostOcr = useCallback(
    async (
      batchId: string,
      raw: string,
      ocrMeta: Awaited<ReturnType<typeof invokeImportScheduleOcr>>,
      batchRow: Awaited<ReturnType<typeof fetchImportBatch>>
    ) => {
      dbg('ocr_handoff_compare', {
        edge_raw_extracted_text_len: ocrMeta.raw_extracted_text_len,
        edge_storage_download_bytes: ocrMeta.storage_download_bytes,
        edge_ocr_handoff_reason_code: ocrMeta.ocr_handoff_reason_code,
        edge_batch_update_error: ocrMeta.batch_update_error,
        batch_update_used_core_fallback: ocrMeta.batch_update_used_core_fallback,
        batch_update_extended_skipped: ocrMeta.batch_update_extended_skipped,
        db_raw_extracted_text_len: raw.length,
        mismatch_edge_vs_db:
          ocrMeta.raw_extracted_text_len != null && raw.length !== ocrMeta.raw_extracted_text_len
            ? 'Edge reported raw length differs from fetchImportBatch — check RLS, replication lag, or batch id'
            : null,
      });
      const cls = batchRow?.classification_json as {
        jetblue_flica_skip_generic_candidates?: boolean;
        parser_key?: string;
        ocr_pipeline?: { weak_ocr?: boolean; merged_len?: number; ocr_issues?: string[] };
      } | undefined;
      const edgeSaysJetBlueFlica =
        ocrMeta.jetblue_flica_skip_generic_candidates === true ||
        ocrMeta.parser_key === 'jetblue_flica_structured_v1';
      const localSaysFlica =
        ocrLooksLikeJetBlueFlicaMonthly(raw) ||
        looksLikeFlicaRawText(raw) ||
        cls?.jetblue_flica_skip_generic_candidates === true ||
        cls?.parser_key === 'jetblue_flica_structured_v1';
      const fallbackStructuredParse =
        raw.length >= 200 &&
        /\bJ[A-Z0-9]{3,6}\s*[:/.]?\s*\d/i.test(raw) &&
        /\b(BSE\s*REPT|DPS[- ]?ARS|DEPL|FLTNO|D-END|Base\/Equip|Operates)\b/i.test(raw);
      const shouldPersistPairings = edgeSaysJetBlueFlica || localSaysFlica || fallbackStructuredParse;
      if (shouldPersistPairings) {
        try {
          const pr = await persistJetBlueFlicaStructuredParseForGenericBatch({
            batchId,
            monthKey,
            ocrText: raw,
          });
          dbg('JetBlue FLICA structured parse', { result: pr, rawLen: raw.length });
          if (pr === 'skipped_no_text') {
            Alert.alert(
              'No text from scan',
              'The OCR step returned almost no usable text from your full-resolution upload (the small preview on the next screen is not what gets scanned). The server converts HEIC, trims margins, crops the schedule body, upscales, and runs several Vision passes. If this still appears, take a brighter, tighter photo of just the pairing blocks with larger text on screen.'
            );
          } else if (pr === 'skipped_no_pairings') {
            const weakOcr = cls?.ocr_pipeline?.weak_ocr === true;
            Alert.alert(
              weakOcr ? 'Pairings not extracted' : 'Could not find pairings',
              weakOcr
                ? 'We detected a JetBlue FLICA schedule, but the screenshot text was too small or fragmented to match pairing headers reliably. Try a tighter crop of the pairing list with larger text, then import again.'
                : 'We saw FLICA-style text but could not match pairing headers (e.g. J1016 : 30MAR or J1016 04APR). If this keeps happening, use a sharper, more zoomed screenshot with less browser chrome.'
            );
          }
        } catch (pe) {
          dbg('persistJetBlueFlicaStructuredParseForGenericBatch failed', pe);
          Alert.alert('Could not save pairings', pe instanceof Error ? pe.message : String(pe));
        }
      }

      router.replace({
        pathname: '/crew-schedule/import-review/[batchId]',
        params: { batchId },
      });
    },
    [monthKey, router]
  );

  const uploadAndProcess = useCallback(
    async (
      uri: string,
      mime: string | undefined,
      baseName: string,
      sourceType: 'screenshot' | 'photo' | 'pdf' | 'document_scan',
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

      setBusyHint('Importing schedule…');
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
        const ocrMeta = await invokeImportScheduleOcr(batchId);
        dbg('invokeImportScheduleOcr done', ocrMeta);

        const batchRow = await fetchImportBatch(batchId);
        const raw = batchRow?.raw_extracted_text ?? '';
        await handlePostOcr(batchId, raw, ocrMeta, batchRow);
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
    [handlePostOcr, monthKey]
  );

  const uploadAndProcessManyImages = useCallback(
    async (assets: ImagePicker.ImagePickerAsset[], batchSource: 'screenshot' | 'document_scan' = 'screenshot') => {
      if (!assets.length) return;
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        Alert.alert('Sign in required', 'Please sign in to import your schedule.');
        return;
      }
      const uid = userData.user.id;
      setBusyHint('Importing schedule…');
      setBusy(true);
      try {
        const rawChunks: string[] = [];
        let firstBatchId: string | null = null;
        let lastOcrMeta: Awaited<ReturnType<typeof invokeImportScheduleOcr>> | null = null;
        for (let i = 0; i < assets.length; i++) {
          const asset = assets[i];
          const order = i + 1;
          dbg('uploadAndProcessManyImages', { order, total: assets.length });
          const baseName = asset.fileName ?? `photo-${order}.jpg`;
          const safe = safeFileName(baseName);
          const path = `${uid}/${monthKey}/${Date.now()}-${order}-${safe}`;
          const bytes = await buildUploadBytes(asset.uri, asset.mimeType ?? 'image/jpeg', asset.base64);
          if (bytes.length === 0) {
            dbg('skip empty asset', { order });
            continue;
          }
          const { error: upErr } = await supabase.storage.from('schedule-imports').upload(path, bytes, {
            contentType: asset.mimeType ?? 'image/jpeg',
            upsert: false,
          });
          if (upErr) {
            dbg('storage upload error multi', upErr);
            const em = (upErr as { message?: string }).message ?? String(upErr);
            if (/bucket|not found|404/i.test(em)) {
              throw new Error(
                'Storage bucket "schedule-imports" is missing. In Supabase: run SQL from supabase/schedule-import-bucket.sql (or apply migrations), then retry.'
              );
            }
            throw upErr;
          }
          const batchId = await createImportBatch({
            monthKey,
            sourceType: batchSource,
            sourceFilePath: path,
          });
          lastOcrMeta = await invokeImportScheduleOcr(batchId);
          const br = await fetchImportBatch(batchId);
          rawChunks.push((br?.raw_extracted_text ?? '').trim());
          if (!firstBatchId) firstBatchId = batchId;
        }
        if (!firstBatchId || !lastOcrMeta) {
          throw new Error('No images could be processed.');
        }
        const combined = rawChunks.filter(Boolean).join('\n\n---\n\n');
        const { error: mergeErr } = await supabase
          .from('schedule_import_batches')
          .update({ raw_extracted_text: combined, updated_at: new Date().toISOString() })
          .eq('id', firstBatchId);
        if (mergeErr) dbg('merge batch raw_extracted_text failed', mergeErr);
        const batchRow = await fetchImportBatch(firstBatchId);
        await handlePostOcr(firstBatchId, combined, lastOcrMeta, batchRow);
      } catch (e) {
        dbg('uploadAndProcessManyImages FAILED', e);
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
    [handlePostOcr, monthKey]
  );

  /** Multi-page document scan → one merged review batch (same pattern as multi-photo library). */
  const uploadDocumentScanPages = useCallback(
    async (filePaths: string[]) => {
      if (!filePaths.length) return;
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        Alert.alert('Sign in required', 'Please sign in to import your schedule.');
        return;
      }
      const uid = userData.user.id;
      setBusyHint('Importing schedule…');
      setBusy(true);
      try {
        const rawChunks: string[] = [];
        let firstBatchId: string | null = null;
        let lastOcrMeta: Awaited<ReturnType<typeof invokeImportScheduleOcr>> | null = null;
        for (let i = 0; i < filePaths.length; i++) {
          const uri = filePaths[i];
          const order = i + 1;
          dbg('uploadDocumentScanPages', { order, total: filePaths.length });
          const baseName = `scan-page-${order}.jpg`;
          const safe = safeFileName(baseName);
          const path = `${uid}/${monthKey}/${Date.now()}-${order}-docscan-${safe}`;
          const bytes = await readLocalUriAsBytesWithDiag(uri, 'image/jpeg');
          if (bytes.length === 0) {
            dbg('skip empty scan page', { order });
            continue;
          }
          const { error: upErr } = await supabase.storage.from('schedule-imports').upload(path, bytes, {
            contentType: 'image/jpeg',
            upsert: false,
          });
          if (upErr) {
            dbg('storage upload error doc scan', upErr);
            const em = (upErr as { message?: string }).message ?? String(upErr);
            if (/bucket|not found|404/i.test(em)) {
              throw new Error(
                'Storage bucket "schedule-imports" is missing. In Supabase: run SQL from supabase/schedule-import-bucket.sql (or apply migrations), then retry.'
              );
            }
            throw upErr;
          }
          const batchId = await createImportBatch({
            monthKey,
            sourceType: 'document_scan',
            sourceFilePath: path,
          });
          lastOcrMeta = await invokeImportScheduleOcr(batchId);
          const br = await fetchImportBatch(batchId);
          rawChunks.push((br?.raw_extracted_text ?? '').trim());
          if (!firstBatchId) firstBatchId = batchId;
        }
        if (!firstBatchId || !lastOcrMeta) {
          throw new Error('No scan pages could be processed.');
        }
        const combined = rawChunks.filter(Boolean).join('\n\n---\n\n');
        const { error: mergeErr } = await supabase
          .from('schedule_import_batches')
          .update({ raw_extracted_text: combined, updated_at: new Date().toISOString() })
          .eq('id', firstBatchId);
        if (mergeErr) dbg('merge batch raw_extracted_text failed (doc scan)', mergeErr);
        const batchRow = await fetchImportBatch(firstBatchId);
        await handlePostOcr(firstBatchId, combined, lastOcrMeta, batchRow);
      } catch (e) {
        dbg('uploadDocumentScanPages FAILED', e);
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
    [handlePostOcr, monthKey]
  );

  const pickPhotoLibrary = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to import a screenshot.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 4,
        /** Full resolution for server OCR — the review screen thumbnail is display-only. */
        quality: 1,
        base64: true,
        // iOS: prefer JPEG-compatible export instead of HEIC when possible (Vision API does not support HEIC).
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || !result.assets[0]) return;
      const assets = result.assets;
      dbg('pickPhotoLibrary assets', { count: assets.length });
      if (assets.length > 1) {
        await uploadAndProcessManyImages(assets);
        return;
      }
      const asset = assets[0];
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
    } catch (e) {
      dbg('pickPhotoLibrary error', e);
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Could not open photo library', msg);
    }
  }, [uploadAndProcess, uploadAndProcessManyImages]);

  const pickCamera = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow camera access to capture your schedule.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 1,
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
    } catch (e) {
      dbg('pickCamera error', e);
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Could not open camera', msg);
    }
  }, [uploadAndProcess]);

  useEffect(() => {
    if (photoSourceModalVisible) return;

    const openLibrary = pendingOpenLibraryRef.current;
    const openCamera = pendingOpenCameraRef.current;
    if (!openLibrary && !openCamera) return;

    pendingOpenLibraryRef.current = false;
    pendingOpenCameraRef.current = false;

    const delay = Platform.OS === 'ios' ? 550 : 120;
    const id = setTimeout(() => {
      if (openLibrary) void pickPhotoLibrary();
      else void pickCamera();
    }, delay);

    return () => clearTimeout(id);
  }, [photoSourceModalVisible, pickPhotoLibrary, pickCamera]);

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
    if (!selected) {
      Alert.alert('Choose an import method', 'Tap Screenshot / photo, Scan, or PDF above, then Continue.');
      return;
    }
    try {
      if (selected === 'calendar') {
        Alert.alert('Calendar', 'Coming soon.');
        return;
      }
      if (selected === 'manual') {
        Alert.alert('Manual entry', 'Coming soon.');
        return;
      }
      if (selected === 'scan') {
        void (async () => {
          try {
            const r = await scanScheduleDocuments();
            if (r.kind === 'cancel') return;
            if (r.kind === 'unavailable') {
              Alert.alert(
                'Document scan isn’t available',
                r.reason === 'module'
                  ? 'This build doesn’t include the native document scanner (Expo Go can’t load it). Install a development build, or use Choose screenshot / Photo — same review flow.'
                  : 'Couldn’t open the scanner. Try again, or use Choose screenshot / Photo.',
                [
                  { text: 'Choose photo', onPress: () => void pickPhotoLibrary() },
                  { text: 'OK', style: 'cancel' },
                ]
              );
              return;
            }
            await uploadDocumentScanPages(r.filePaths);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            Alert.alert('Scan failed', msg);
          }
        })();
        return;
      }
      if (selected === 'photo') {
        setPhotoSourceModalVisible(true);
        return;
      }
      if (selected === 'pdf') {
        void pickPdf();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Could not continue', msg);
    }
  }, [pickPdf, pickPhotoLibrary, selected, uploadDocumentScanPages]);

  return (
    <View style={styles.shell}>
      <CrewScheduleHeader title="Import schedule" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.monthCard}>
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
        </View>

        <Text style={styles.helper}>Choose how you want to import your schedule.</Text>

        <Pressable
          style={styles.jetblueFlicaCard}
          onPress={() => router.push('/crew-schedule/import-flica-direct')}
          accessibilityRole="button"
          accessibilityLabel="FLICA sync: open browser sign-in"
        >
          <View style={styles.jetblueFlicaRow}>
            <View style={styles.jetblueFlicaTextCol}>
              <Text style={styles.jetblueFlicaTitle}>FLICA Sync</Text>
              <Text style={styles.jetblueFlicaSub}>
                Direct browser sync from your airline&apos;s FLICA
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={T.accent} style={styles.jetblueFlicaChevron} />
          </View>
        </Pressable>

        <View style={styles.options}>
          {(
            [
              {
                id: 'photo' as const,
                label: 'Screenshot / photo',
                sub: 'Upload 1–4 screenshots or photos',
              },
              {
                id: 'scan' as const,
                label: 'Scan Documents',
                sub: 'Live edge detection and cropped scan',
              },
              {
                id: 'pdf' as const,
                label: 'PDF',
                sub: 'Upload a PDF for text extraction and review',
              },
              { id: 'calendar' as const, label: 'Calendar', sub: 'Coming soon' },
              { id: 'manual' as const, label: 'Manual', sub: 'Coming soon' },
            ] as const
          ).map((opt) => {
            const active = selected === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSelected(opt.id)}
                style={[styles.opt, active && styles.optSelected]}
                accessibilityState={{ selected: active }}
              >
                <View style={styles.optRow}>
                  <View style={styles.optTextCol}>
                    <Text style={[styles.optText, opt.id === 'photo' && styles.optTextPrimary]}>{opt.label}</Text>
                    <Text style={styles.optSub}>{opt.sub}</Text>
                  </View>
                  {active ? <Ionicons name="checkmark-circle" size={24} color={T.accent} style={styles.optCheck} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        {busy ? (
          <View style={styles.loading}>
            <ActivityIndicator color={T.accent} size="large" />
            <Text style={styles.loadingText}>{busyHint}</Text>
          </View>
        ) : (
          <Pressable
            style={[styles.continue, !selected && styles.continueDisabled]}
            onPress={continueFlow}
            disabled={!selected}
            accessibilityRole="button"
            accessibilityState={{ disabled: !selected }}
          >
            <Text style={styles.continueText}>Continue</Text>
          </Pressable>
        )}
      </ScrollView>

      <Modal
        visible={photoSourceModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoSourceModalVisible(false)}
      >
        <Pressable style={styles.photoModalBackdrop} onPress={() => setPhotoSourceModalVisible(false)}>
          <Pressable style={styles.photoModalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.photoModalTitle}>Add screenshots</Text>
            <Text style={styles.photoModalSub}>Pick up to 4 images from your library{Platform.OS === 'web' ? '' : ', or use the camera'}.</Text>
            <Pressable
              style={styles.photoModalBtn}
              onPress={() => {
                pendingOpenLibraryRef.current = true;
                pendingOpenCameraRef.current = false;
                setPhotoSourceModalVisible(false);
              }}
            >
              <Text style={styles.photoModalBtnTx}>Photo library</Text>
            </Pressable>
            {Platform.OS !== 'web' ? (
              <Pressable
                style={styles.photoModalBtn}
                onPress={() => {
                  pendingOpenCameraRef.current = true;
                  pendingOpenLibraryRef.current = false;
                  setPhotoSourceModalVisible(false);
                }}
              >
                <Text style={styles.photoModalBtnTx}>Camera</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.photoModalCancel} onPress={() => setPhotoSourceModalVisible(false)}>
              <Text style={styles.photoModalCancelTx}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16 },
  monthCard: {
    backgroundColor: T.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.line,
    paddingVertical: 4,
    marginBottom: 4,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  monthArrow: { padding: 8 },
  monthLabel: { fontSize: 18, fontWeight: '800', color: T.text, minWidth: 200, textAlign: 'center' },
  helper: {
    fontSize: 15,
    color: T.textSecondary,
    marginBottom: 18,
    marginTop: 12,
    lineHeight: 22,
  },
  jetblueFlicaCard: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: T.accent,
    backgroundColor: T.surface,
    padding: 14,
    marginBottom: 20,
  },
  jetblueBadge: {
    alignSelf: 'flex-start',
    backgroundColor: T.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
  },
  jetblueBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  jetblueFlicaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  jetblueFlicaTextCol: { flex: 1, minWidth: 0 },
  jetblueFlicaTitle: { fontSize: 17, fontWeight: '800', color: T.text, marginBottom: 6 },
  jetblueFlicaSub: { fontSize: 14, color: T.textSecondary, lineHeight: 21 },
  jetblueFlicaChevron: { marginTop: 2 },
  options: { gap: 10 },
  opt: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
  },
  optSelected: {
    borderWidth: 2,
    borderColor: T.accent,
    backgroundColor: '#FEF2F2',
  },
  optRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  optTextCol: { flex: 1, minWidth: 0 },
  optText: { fontSize: 15, fontWeight: '700', color: T.text },
  optTextPrimary: { fontSize: 16, fontWeight: '800' },
  optSub: { fontSize: 13, color: T.textSecondary, marginTop: 4, lineHeight: 18 },
  optCheck: { marginTop: 2 },
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
  photoModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  photoModalCard: {
    backgroundColor: T.surface,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: T.line,
  },
  photoModalTitle: { fontSize: 18, fontWeight: '800', color: T.text },
  photoModalSub: { fontSize: 14, color: T.textSecondary, marginTop: 8, lineHeight: 20 },
  photoModalBtn: {
    marginTop: 14,
    backgroundColor: T.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  photoModalBtnTx: { color: '#fff', fontWeight: '800', fontSize: 16 },
  photoModalCancel: { marginTop: 10, paddingVertical: 12, alignItems: 'center' },
  photoModalCancelTx: { fontSize: 16, fontWeight: '600', color: T.textSecondary },
});
