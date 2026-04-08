import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  applyMergeMonth,
  applyReplaceMonth,
  candidatesToApplyRows,
  fetchCandidatesForBatch,
  fetchImportBatch,
  getSignedImportFileUrl,
  type ScheduleImportCandidateRow,
} from '../../../src/features/crew-schedule/scheduleApi';
import { scheduleTheme as T } from '../../../src/features/crew-schedule/scheduleTheme';
import CrewScheduleHeader from '../../../src/features/crew-schedule/components/CrewScheduleHeader';
import { supabase } from '../../../src/lib/supabaseClient';

function useBatchIdParam(): string | undefined {
  const { batchId } = useLocalSearchParams<{ batchId?: string | string[] }>();
  if (typeof batchId === 'string') return batchId;
  if (Array.isArray(batchId) && batchId[0]) return batchId[0];
  return undefined;
}

function rowSummaryLine(c: ScheduleImportCandidateRow): string {
  return (
    [c.pairing_code, c.report_time, c.city, c.status_code].filter(Boolean).join(' · ') ||
    (c.raw_row_text ?? '').slice(0, 120)
  );
}

/** Group rows for review UX (Schedule Intelligence). */
function bucketFor(c: ScheduleImportCandidateRow): 'junk' | 'unknown' | 'ready' | 'review' {
  const st = (c.status_code ?? '').toUpperCase();
  if (c.ignored_flag || st === 'BLANK') return 'junk';
  if (st === 'UNK') return 'unknown';
  if (!c.warning_flag && (c.confidence_score ?? 0) >= 0.65) return 'ready';
  return 'review';
}

const PREVIEW_CAP = 18;

function CandidateCard({
  c,
  warnStyle,
}: {
  c: ScheduleImportCandidateRow;
  warnStyle: boolean;
}) {
  return (
    <View style={[styles.row, warnStyle && styles.rowWarn]}>
      <Text style={styles.rowDate}>{c.date ?? '—'}</Text>
      <Text style={styles.rowBody} numberOfLines={3}>
        {rowSummaryLine(c)}
      </Text>
    </View>
  );
}

export default function ImportReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const batchId = useBatchIdParam();

  const [batch, setBatch] = useState<Awaited<ReturnType<typeof fetchImportBatch>>>(null);
  const [candidates, setCandidates] = useState<ScheduleImportCandidateRow[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!batchId) return;
    setLoading(true);
    try {
      const b = await fetchImportBatch(batchId);
      setBatch(b);
      if (b?.source_file_path) {
        const url = await getSignedImportFileUrl(b.source_file_path);
        setPreviewUrl(url);
      } else {
        setPreviewUrl(null);
      }
      const c = await fetchCandidatesForBatch(batchId);
      setCandidates(c);
      await supabase.from('schedule_import_batches').update({ parse_status: 'reviewed' }).eq('id', batchId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Could not load import', msg);
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const monthKey = batch?.selected_month_key ?? batch?.month_key ?? '';

  const onReplace = useCallback(() => {
    if (!batchId || !monthKey) return;
    const rows = candidatesToApplyRows(candidates);
    if (rows.length === 0) {
      Alert.alert('Nothing to save', 'Add or fix dates on candidate rows first. Use Edit before save.');
      return;
    }
    Alert.alert(
      'Replace month',
      `This deletes all schedule rows for ${monthKey} and replaces them with ${rows.length} imported rows.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await applyReplaceMonth(monthKey, batchId, rows);
              router.replace('/crew-schedule/(tabs)');
            } catch (e) {
              Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }, [batchId, candidates, monthKey, router]);

  const onMerge = useCallback(() => {
    if (!batchId || !monthKey) return;
    const rows = candidatesToApplyRows(candidates);
    if (rows.length === 0) {
      Alert.alert('Nothing to save', 'Add or fix dates on candidate rows first.');
      return;
    }
    Alert.alert(
      'Merge changes',
      `This updates only the ${rows.length} date(s) in this import and leaves other days in ${monthKey} unchanged.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge',
          onPress: async () => {
            setSaving(true);
            try {
              await applyMergeMonth(monthKey, batchId, rows);
              router.replace('/crew-schedule/(tabs)');
            } catch (e) {
              Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }, [batchId, candidates, monthKey, router]);

  const onEdit = useCallback(() => {
    if (!batchId) return;
    router.push({
      pathname: '../import-edit/[batchId]',
      params: { batchId },
    });
  }, [batchId, router]);

  if (!batchId) {
    return (
      <View style={styles.shell}>
        <CrewScheduleHeader title="Review import" />
        <Text style={styles.err}>Missing batch.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.shell}>
        <CrewScheduleHeader title="Review import" />
        <View style={styles.center}>
          <ActivityIndicator color={T.accent} size="large" />
          <Text style={styles.muted}>Loading parsed rows…</Text>
        </View>
      </View>
    );
  }

  const warnCount = candidates.filter((c) => c.warning_flag).length;
  const isPdf = batch?.source_file_path?.toLowerCase().endsWith('.pdf');
  const cls = batch?.classification_json as { parser_key?: string; signals?: string[] } | null | undefined;
  const parserKey = cls?.parser_key;
  const ready = candidates.filter((c) => bucketFor(c) === 'ready');
  const review = candidates.filter((c) => bucketFor(c) === 'review');
  const unknown = candidates.filter((c) => bucketFor(c) === 'unknown');
  const junk = candidates.filter((c) => bucketFor(c) === 'junk');

  const renderBucket = (title: string, rows: ScheduleImportCandidateRow[], hint: string) => {
    if (rows.length === 0) return null;
    const slice = rows.slice(0, PREVIEW_CAP);
    const more = rows.length - slice.length;
    return (
      <View style={styles.bucket}>
        <Text style={styles.h2}>
          {title} ({rows.length})
        </Text>
        <Text style={styles.bucketHint}>{hint}</Text>
        {slice.map((c) => (
          <CandidateCard key={c.id} c={c} warnStyle={c.warning_flag} />
        ))}
        {more > 0 ? (
          <Text style={styles.muted}>+ {more} more in this group — use Edit before save for full list.</Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.shell}>
      <CrewScheduleHeader title="Parse review" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.h1}>Month {monthKey || '—'}</Text>
        <Text style={styles.sub}>
          {batch?.source_type} · {candidates.length} row{candidates.length === 1 ? '' : 's'}
          {warnCount > 0 ? ` · ${warnCount} warning(s)` : ''}
        </Text>

        {batch?.detected_month_key && batch.detected_month_key !== monthKey ? (
          <Text style={styles.infoLine}>
            Detected in image: {batch.detected_month_key} · Selected: {monthKey || '—'}
          </Text>
        ) : null}

        {parserKey ? (
          <Text style={styles.infoLine}>
            Parser: {parserKey}
            {batch?.classification_confidence != null
              ? ` · ${Math.round(batch.classification_confidence * 100)}% match`
              : ''}
          </Text>
        ) : null}

        {batch?.parse_error ? <Text style={styles.warn}>{batch.parse_error}</Text> : null}

        {previewUrl && !isPdf ? (
          <Image source={{ uri: previewUrl }} style={styles.preview} resizeMode="contain" />
        ) : (
          <View style={styles.fileBox}>
            <Text style={styles.fileLabel}>File</Text>
            <Text style={styles.fileMono} numberOfLines={2}>
              {batch?.source_file_path ?? '—'}
            </Text>
          </View>
        )}

        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Summary</Text>
          <Text style={styles.summaryLine}>High confidence: {ready.length}</Text>
          <Text style={styles.summaryLine}>Needs review: {review.length}</Text>
          <Text style={styles.summaryLine}>Unknown (UNK): {unknown.length}</Text>
          <Text style={styles.summaryLine}>Ignored / blank: {junk.length}</Text>
        </View>

        {candidates.length === 0 ? (
          <Text style={styles.muted}>No rows parsed. Try a clearer image or PDF with selectable text.</Text>
        ) : (
          <>
            {renderBucket(
              'Ready to save',
              ready,
              'Strong parse confidence — spot-check, then merge or replace.'
            )}
            {renderBucket(
              'Needs review',
              review,
              'Warnings or medium confidence — edit before save or fix in the sheet.'
            )}
            {renderBucket(
              'Unknown rows',
              unknown,
              'Row text did not match known trip/duty patterns — map manually in Edit.'
            )}
            {renderBucket(
              'Ignored / junk',
              junk,
              'Blank lines or noise — excluded from merge/replace when you save.'
            )}
          </>
        )}
        {candidates.length > PREVIEW_CAP * 4 ? (
          <Text style={styles.muted}>Preview is capped per group. Edit before save shows every row.</Text>
        ) : null}

        {saving ? (
          <View style={styles.saving}>
            <ActivityIndicator color={T.accent} />
            <Text style={styles.muted}>Saving…</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            <Pressable style={styles.btnPrimary} onPress={onReplace}>
              <Text style={styles.btnPrimaryText}>Replace month</Text>
            </Pressable>
            <Pressable style={styles.btnSecondary} onPress={onMerge}>
              <Text style={styles.btnSecondaryText}>Merge changes</Text>
            </Pressable>
            <Pressable style={styles.btnSecondary} onPress={onEdit}>
              <Text style={styles.btnSecondaryText}>Edit before save</Text>
            </Pressable>
            <Pressable style={styles.btnGhost} onPress={() => router.back()}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  h1: { fontSize: 18, fontWeight: '800', color: T.text },
  sub: { fontSize: 13, color: T.textSecondary, marginTop: 4, marginBottom: 12 },
  warn: { fontSize: 13, color: '#B45309', marginBottom: 10 },
  preview: { width: '100%', height: 200, borderRadius: 10, backgroundColor: '#111' },
  fileBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
    marginBottom: 12,
  },
  fileLabel: { fontSize: 11, fontWeight: '800', color: T.textSecondary, marginBottom: 4 },
  fileMono: { fontSize: 12, color: T.text },
  h2: {
    fontSize: 13,
    fontWeight: '800',
    color: T.textSecondary,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 6,
  },
  bucket: { marginBottom: 10 },
  bucketHint: { fontSize: 12, color: T.textSecondary, marginBottom: 8, lineHeight: 17 },
  summaryBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
    padding: 12,
    marginBottom: 14,
    gap: 4,
  },
  summaryTitle: { fontSize: 12, fontWeight: '800', color: T.textSecondary, marginBottom: 4 },
  summaryLine: { fontSize: 14, color: T.text },
  infoLine: { fontSize: 12, color: T.textSecondary, marginBottom: 6 },
  row: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
    marginBottom: 6,
  },
  rowWarn: { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  rowDate: { fontSize: 12, fontWeight: '800', color: T.accent },
  rowBody: { fontSize: 14, color: T.text, marginTop: 2 },
  muted: { fontSize: 14, color: T.textSecondary },
  err: { padding: 24, color: T.accent },
  saving: { alignItems: 'center', marginTop: 16, gap: 8 },
  actions: { marginTop: 20, gap: 10 },
  btnPrimary: {
    backgroundColor: T.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnSecondary: {
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnSecondaryText: { color: T.text, fontWeight: '800', fontSize: 16 },
  btnGhost: { paddingVertical: 12, alignItems: 'center' },
  btnGhostText: { color: T.textSecondary, fontWeight: '700', fontSize: 15 },
});
