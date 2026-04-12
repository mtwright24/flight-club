import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { confidenceBand } from '../../../src/features/crew-schedule/jetblueFlicaTemplate';
import {
  buildLayoverSummaryFromDuties,
  buildRouteSummaryFromDuties,
  fetchBatchesForScheduleImport,
  fetchDutiesForPairing,
  fetchPairingsForScheduleImport,
  fetchScheduleImport,
  fetchScheduleImportImages,
  fetchScheduleImportIssues,
  type ScheduleImportRow,
  type ScheduleImportImageRow,
  type ScheduleImportIssueRow,
  type SchedulePairingDutyRow,
  type SchedulePairingRow,
} from '../../../src/features/crew-schedule/jetblueFlicaImport';
import { scheduleTheme as T } from '../../../src/features/crew-schedule/scheduleTheme';
import CrewScheduleHeader from '../../../src/features/crew-schedule/components/CrewScheduleHeader';

function useImportId(): string | undefined {
  const { importId } = useLocalSearchParams<{ importId?: string | string[] }>();
  if (typeof importId === 'string') return importId;
  if (Array.isArray(importId) && importId[0]) return importId[0];
  return undefined;
}

export default function ImportJetBlueReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const importId = useImportId();

  const [loading, setLoading] = useState(true);
  const [imp, setImp] = useState<ScheduleImportRow | null>(null);
  const [images, setImages] = useState<ScheduleImportImageRow[]>([]);
  const [issues, setIssues] = useState<ScheduleImportIssueRow[]>([]);
  const [pairings, setPairings] = useState<SchedulePairingRow[]>([]);
  const [batches, setBatches] = useState<{ id: string }[]>([]);
  const [dutyMap, setDutyMap] = useState<Record<string, SchedulePairingDutyRow[]>>({});

  const load = useCallback(async () => {
    if (!importId) return;
    setLoading(true);
    try {
      const [row, imgs, iss, pr, bat] = await Promise.all([
        fetchScheduleImport(importId),
        fetchScheduleImportImages(importId),
        fetchScheduleImportIssues(importId),
        fetchPairingsForScheduleImport(importId),
        fetchBatchesForScheduleImport(importId),
      ]);
      setImp(row);
      setImages(imgs);
      setIssues(iss);
      setPairings(pr);
      setBatches(bat);
    } finally {
      setLoading(false);
    }
  }, [importId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!pairings.length) {
      setDutyMap({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        pairings.map(async (p) => {
          try {
            const legs = await fetchDutiesForPairing(p.id);
            return [p.id, legs] as const;
          } catch {
            return [p.id, [] as SchedulePairingDutyRow[]] as const;
          }
        })
      );
      if (!cancelled) setDutyMap(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [pairings]);

  const firstBatchId = batches[0]?.id;

  const confirmedPairings = pairings.filter(
    (p) => !p.needs_review && !p.pairing_requires_review && (p.pairing_confidence ?? 0) >= 0.85
  );
  const reviewPairings = pairings.filter(
    (p) => p.needs_review || p.pairing_requires_review || (p.pairing_confidence ?? 0) < 0.85
  );

  if (!importId) {
    return (
      <View style={styles.shell}>
        <CrewScheduleHeader title="Review import" />
        <Text style={styles.err}>Missing import.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.shell}>
        <CrewScheduleHeader title="JetBlue import review" />
        <View style={styles.center}>
          <ActivityIndicator color={T.accent} size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <CrewScheduleHeader title="JetBlue import review" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.h1}>Import session</Text>
        <Text style={styles.sub}>
          {imp?.import_year}-{String(imp?.import_month ?? 0).padStart(2, '0')} · {imp?.status ?? '—'} · template{' '}
          {imp?.template_key ?? '—'}
        </Text>
        {imp?.overall_confidence != null ? (
          <Text style={styles.sub}>
            Overall confidence: {Math.round(imp.overall_confidence * 100)}% (
            {confidenceBand(imp.overall_confidence)})
          </Text>
        ) : null}

        <View style={styles.stats}>
          <Text style={styles.statLine}>Screenshots: {images.length}</Text>
          <Text style={styles.statLine}>OCR batches: {batches.length}</Text>
          <Text style={styles.statLine}>Pairings extracted: {pairings.length}</Text>
          <Text style={styles.statLine}>Confirmed (high): {confirmedPairings.length}</Text>
          <Text style={styles.statLine}>Needs review: {reviewPairings.length + issues.length}</Text>
        </View>

        {issues.length > 0 ? (
          <View style={styles.issueBox}>
            <Text style={styles.issueTitle}>Issues ({issues.length})</Text>
            {issues.slice(0, 6).map((i) => (
              <Text key={i.id} style={styles.issueLine}>
                {i.issue_type}: {i.message}
              </Text>
            ))}
          </View>
        ) : null}

        {firstBatchId ? (
          <Pressable
            style={styles.btn}
            onPress={() =>
              router.push({
                pathname: '/crew-schedule/import-review/[batchId]',
                params: { batchId: firstBatchId },
              })
            }
          >
            <Text style={styles.btnText}>Review OCR rows (line-by-line)</Text>
          </Pressable>
        ) : (
          <Text style={styles.muted}>No OCR batch linked yet — upload screenshots from the previous step.</Text>
        )}

        <Text style={styles.h2}>Pairings</Text>
        <Text style={styles.muted}>
          Template-based JetBlue FLICA import: pairings group duty rows; tap a card to edit fields. Calendar, Classic,
          and Smart views consume the same trip/date model after you save to the schedule.
        </Text>

        {pairings.map((p) => {
          const legs = dutyMap[p.id] ?? [];
          const route = buildRouteSummaryFromDuties(legs);
          const lays = buildLayoverSummaryFromDuties(legs);
          const band = confidenceBand(p.pairing_confidence ?? null);
          const needs =
            p.needs_review || p.pairing_requires_review || band === 'low' || (p.pairing_confidence ?? 0) < 0.85;
          return (
            <Pressable
              key={p.id}
              style={[styles.card, needs && styles.cardWarn]}
              onPress={() =>
                router.push({
                  pathname: '/crew-schedule/import-jetblue-pairing/[pairingId]',
                  params: { pairingId: p.id, importId: importId ?? '' },
                })
              }
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{p.pairing_id}</Text>
                <View style={[styles.badge, needs ? styles.badgeWarn : styles.badgeOk]}>
                  <Text style={styles.badgeText}>{needs ? 'Review' : 'Confirmed'}</Text>
                </View>
              </View>
              <Text style={styles.cardLine}>
                {p.operate_start_date ?? '—'} → {p.operate_end_date ?? '—'} · Report {p.report_time_local ?? '—'}
              </Text>
              <Text style={styles.cardLine}>Base {p.base_code ?? '—'}</Text>
              <Text style={styles.cardLine} numberOfLines={2}>
                Route: {route}
              </Text>
              <Text style={styles.cardLine} numberOfLines={1}>
                Layovers: {lays}
              </Text>
              <Text style={styles.cardMeta}>
                {p.pairing_confidence != null ? `${Math.round(p.pairing_confidence * 100)}% · ${band}` : '—'} ·{' '}
                {legs.length} duty row{legs.length === 1 ? '' : 's'}
              </Text>
            </Pressable>
          );
        })}

        <Pressable style={styles.ghost} onPress={() => router.replace('/crew-schedule/(tabs)')}>
          <Text style={styles.ghostText}>Back to schedule</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 18, fontWeight: '800', color: T.text },
  h2: { fontSize: 15, fontWeight: '800', color: T.text, marginTop: 20, marginBottom: 6 },
  sub: { fontSize: 13, color: T.textSecondary, marginTop: 4 },
  stats: {
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
    gap: 4,
  },
  statLine: { fontSize: 14, color: T.text },
  issueBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  issueTitle: { fontWeight: '800', color: '#B45309', marginBottom: 6 },
  issueLine: { fontSize: 12, color: '#92400E', marginBottom: 4 },
  btn: {
    marginTop: 16,
    backgroundColor: T.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  muted: { fontSize: 13, color: T.textSecondary, lineHeight: 19, marginTop: 8 },
  card: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
  },
  cardWarn: { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: T.text, flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeOk: { backgroundColor: '#DCFCE7' },
  badgeWarn: { backgroundColor: '#FEF3C7' },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#0F172A' },
  cardLine: { fontSize: 13, color: T.text, marginTop: 4 },
  cardMeta: { fontSize: 12, color: T.textSecondary, marginTop: 6 },
  ghost: { marginTop: 20, paddingVertical: 12, alignItems: 'center' },
  ghostText: { color: T.textSecondary, fontWeight: '700', fontSize: 15 },
  err: { padding: 24, color: T.accent },
});
