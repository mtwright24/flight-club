import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
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
  buildApplyRowsFromPairingBatch,
  candidatesToConfirmedApplyRows,
  fetchCandidatesForBatch,
  fetchImportBatch,
  getSignedImportFileUrl,
  reviewCategoryForCandidate,
  updateImportCandidate,
  type ScheduleImportCandidateRow,
} from '../../../src/features/crew-schedule/scheduleApi';
import {
  fetchDutiesGroupedByPairingIds,
  fetchPairingsForBatch,
  type SchedulePairingDutyRow,
  type SchedulePairingRow,
} from '../../../src/features/crew-schedule/jetblueFlicaImport';
import {
  evaluateBatchPairingSave,
  snapshotFromPairingRow,
  validateJetBluePairingImport,
} from '../../../src/features/crew-schedule/jetblueFlicaImportValidation';
import {
  FC,
  formatDateRangeDisplay,
  formatTripRouteArrows,
  pairingCardAttentionSubtext,
  pairingCardPrimaryLabel,
} from '../../../src/features/crew-schedule/jetblueFlicaImportUi';
import { looksLikeFlicaRawText } from '../../../src/features/schedule-import/parser/jetblueFlicaOcrDetect';
import { scheduleTheme as T } from '../../../src/features/crew-schedule/scheduleTheme';
import CrewScheduleHeader from '../../../src/features/crew-schedule/components/CrewScheduleHeader';
import ZoomableImportImage from '../../../src/features/crew-schedule/components/ZoomableImportImage';
import { supabase } from '../../../src/lib/supabaseClient';

const { height: SCREEN_H } = Dimensions.get('window');
const PREVIEW_CAP = 80;

const C = {
  good: '#15803D',
  goodBg: '#DCFCE7',
  review: '#B45309',
  reviewBg: '#FEF3C7',
  skip: '#64748B',
  skipBg: '#F1F5F9',
};

function useBatchIdParam(): string | undefined {
  const { batchId } = useLocalSearchParams<{ batchId?: string | string[] }>();
  if (typeof batchId === 'string') return batchId;
  if (Array.isArray(batchId) && batchId[0]) return batchId[0];
  return undefined;
}

function formatMonthSentence(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return 'this month';
  const months = [
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
  return `${months[m - 1]} ${y}`;
}

function formatDateHeading(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, mo, d] = iso.split('-').map(Number);
  if (!y || !mo || !d) return iso;
  const dt = new Date(y, mo - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** One-line summary for list rows (no internal status codes as primary text). */
function rowSummaryLine(c: ScheduleImportCandidateRow): string {
  const st = (c.status_code ?? '').toUpperCase();
  if (st === 'OFF') return 'Day off';
  if (st === 'PTO') return 'PTO';
  if (st === 'RSV') return c.city ? `Reserve · ${c.city}` : 'Reserve';
  if (st === 'TRIP' || st === 'DH' || st === 'CONT') {
    const parts = [c.pairing_code, c.city].filter(Boolean);
    if (parts.length) return parts.join(' · ');
  }
  if (c.pairing_code || c.city) {
    return [c.pairing_code, c.city].filter(Boolean).join(' · ');
  }
  const raw = (c.raw_row_text ?? '').trim();
  if (raw) return raw.length > 52 ? `${raw.slice(0, 49)}…` : raw;
  return 'Schedule line';
}

/** Duty type for detail sheet (human, not UNK/BLANK labels). */
function interpretDutyType(code: string | null | undefined): string {
  const u = (code ?? '').toUpperCase();
  switch (u) {
    case 'UNK':
      return 'Needs review';
    case 'BLANK':
      return 'Blank line';
    case 'TRIP':
      return 'Flight / pairing';
    case 'DH':
      return 'Deadhead';
    case 'OFF':
      return 'Day off';
    case 'PTO':
      return 'PTO';
    case 'RSV':
      return 'Reserve';
    case 'CONT':
      return 'Continuation';
    default:
      return code && code !== '—' ? code : '—';
  }
}

function ReviewRowCard({
  c,
  variant,
  tappable,
  onPress,
}: {
  c: ScheduleImportCandidateRow;
  variant: 'looks_good' | 'needs_review' | 'skipped';
  tappable: boolean;
  onPress: () => void;
}) {
  const label =
    variant === 'looks_good' ? 'Looks Good' : variant === 'needs_review' ? 'Needs Review' : 'Skipped';
  const chipBg = variant === 'looks_good' ? C.goodBg : variant === 'needs_review' ? C.reviewBg : C.skipBg;
  const chipText = variant === 'looks_good' ? C.good : variant === 'needs_review' ? C.review : C.skip;

  const isNeedsReview = variant === 'needs_review';
  const inner = (
    <View style={[styles.rowCardInner, isNeedsReview && styles.rowCardInnerNeedsReview]}>
      <View style={styles.rowCardLeft}>
        <Text style={isNeedsReview ? styles.rowDateNeedsReview : styles.rowDate}>{formatDateHeading(c.date)}</Text>
        <Text
          style={isNeedsReview ? styles.rowSummaryNeedsReview : styles.rowSummary}
          numberOfLines={2}
        >
          {rowSummaryLine(c)}
        </Text>
      </View>
      <View style={styles.rowCardRight}>
        <View style={[styles.statusChip, isNeedsReview && styles.statusChipNeedsReview, { backgroundColor: chipBg }]}>
          <Text style={[styles.statusChipText, isNeedsReview && styles.statusChipTextNeedsReview, { color: chipText }]}>
            {label}
          </Text>
        </View>
        {tappable ? (
          <Ionicons name="chevron-forward" size={18} color={T.textSecondary} style={styles.rowChevron} />
        ) : null}
      </View>
    </View>
  );

  if (!tappable) {
    return (
      <View style={[styles.rowCard, variant === 'needs_review' && styles.rowCardEmphasis, styles.rowCardMuted]}>
        {inner}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.rowCard,
        variant === 'needs_review' && styles.rowCardEmphasis,
        pressed && styles.rowPressed,
      ]}
    >
      {inner}
    </Pressable>
  );
}

function CandidateDetailBody({
  c,
  rawExpanded,
  onToggleRaw,
}: {
  c: ScheduleImportCandidateRow;
  rawExpanded: boolean;
  onToggleRaw: () => void;
}) {
  const rows: { label: string; value: string }[] = [
    { label: 'Date', value: c.date ?? '—' },
    { label: 'Day', value: c.day_of_week ?? '—' },
    { label: 'Duty type', value: interpretDutyType(c.status_code) },
    { label: 'Pairing / trip code', value: c.pairing_code ?? '—' },
    { label: 'Report time', value: c.report_time ?? '—' },
    { label: 'City / route', value: c.city ?? '—' },
    { label: 'Release (D-end)', value: c.d_end_time ?? '—' },
    { label: 'Layover', value: c.layover ?? '—' },
    { label: 'Depart (local)', value: c.depart_local ?? '—' },
    { label: 'Arrive (local)', value: c.arrive_local ?? '—' },
    { label: 'Notes', value: c.notes ?? '—' },
  ];

  return (
    <>
      {rows.map((r) => (
        <View key={r.label} style={styles.detailRow}>
          <Text style={styles.detailLabel}>{r.label}</Text>
          <Text style={styles.detailValue} selectable>
            {r.value}
          </Text>
        </View>
      ))}
      <Pressable onPress={onToggleRaw} style={styles.rawToggle}>
        <Text style={styles.rawToggleText}>{rawExpanded ? 'Hide' : 'Show'} text from scan</Text>
        <Ionicons name={rawExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={T.accent} />
      </Pressable>
      {rawExpanded ? (
        <Text style={styles.rawBody} selectable>
          {(c.raw_row_text ?? '').trim() || '—'}
        </Text>
      ) : null}
    </>
  );
}

export default function ImportReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const batchId = useBatchIdParam();
  const scrollRef = useRef<ScrollView>(null);
  const needsReviewSectionY = useRef(0);

  const [batch, setBatch] = useState<Awaited<ReturnType<typeof fetchImportBatch>>>(null);
  const [candidates, setCandidates] = useState<ScheduleImportCandidateRow[]>([]);
  const [pairings, setPairings] = useState<SchedulePairingRow[]>([]);
  const [legsByPairing, setLegsByPairing] = useState<Map<string, SchedulePairingDutyRow[]>>(new Map());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [detailCandidate, setDetailCandidate] = useState<ScheduleImportCandidateRow | null>(null);
  const [rawExpanded, setRawExpanded] = useState(false);

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
      const [c, pr] = await Promise.all([
        fetchCandidatesForBatch(batchId),
        fetchPairingsForBatch(batchId).catch(() => [] as SchedulePairingRow[]),
      ]);
      setCandidates(c);
      setPairings(pr);
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

  useEffect(() => {
    if (pairings.length === 0) {
      setLegsByPairing(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const map = await fetchDutiesGroupedByPairingIds(pairings.map((p) => p.id));
        if (!cancelled) setLegsByPairing(map);
      } catch {
        if (!cancelled) setLegsByPairing(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pairings]);

  const monthKey =
    batch?.detected_month_key ?? batch?.selected_month_key ?? batch?.month_key ?? '';

  const { looksGood, needsReview, skipped } = useMemo(() => {
    const lg: ScheduleImportCandidateRow[] = [];
    const nr: ScheduleImportCandidateRow[] = [];
    const sk: ScheduleImportCandidateRow[] = [];
    for (const c of candidates) {
      const cat = reviewCategoryForCandidate(c);
      if (cat === 'looks_good') lg.push(c);
      else if (cat === 'needs_review') nr.push(c);
      else sk.push(c);
    }
    return { looksGood: lg, needsReview: nr, skipped: sk };
  }, [candidates]);

  /** Pairing import validation (requires legs map — matches pairing detail + save gate). */
  const pairingPillStats = useMemo(() => {
    let looksGood = 0;
    let needsAttention = 0;
    for (const p of pairings) {
      const legs = legsByPairing.get(p.id) ?? [];
      const v = validateJetBluePairingImport(snapshotFromPairingRow(p), legs, p);
      if (v.badge === 'good') looksGood += 1;
      else needsAttention += 1;
    }
    return { looksGood, needsAttention };
  }, [pairings, legsByPairing]);

  /** Total count of required missing fields across all pairings (save gate messaging). */
  const totalMissingFieldCount = useMemo(() => {
    let n = 0;
    for (const p of pairings) {
      const legs = legsByPairing.get(p.id) ?? [];
      const v = validateJetBluePairingImport(snapshotFromPairingRow(p), legs, p);
      n += v.counts.missing;
    }
    return n;
  }, [pairings, legsByPairing]);

  /** Pairing codes that still have required fields missing (for save / alert messaging). */
  const pairingsMissingRequiredCodes = useMemo(() => {
    const codes: string[] = [];
    for (const p of pairings) {
      const legs = legsByPairing.get(p.id) ?? [];
      const v = validateJetBluePairingImport(snapshotFromPairingRow(p), legs, p);
      if (v.counts.missing > 0) codes.push((p.pairing_id ?? '').trim() || p.id);
    }
    return [...new Set(codes)];
  }, [pairings, legsByPairing]);

  const hasPairingReviewOrMissing = pairingPillStats.needsAttention > 0;

  const pairingListY = useRef(0);
  const [uploadExpanded, setUploadExpanded] = useState(true);

  useEffect(() => {
    if (pairings.length > 0) setUploadExpanded(false);
  }, [pairings.length]);

  const avgPairingConfidence = useMemo(() => {
    if (!pairings.length) return null;
    let n = 0;
    let s = 0;
    for (const p of pairings) {
      if (p.pairing_confidence != null) {
        s += p.pairing_confidence;
        n += 1;
      }
    }
    return n ? s / n : null;
  }, [pairings]);

  const confirmedApplyRows = useMemo(() => candidatesToConfirmedApplyRows(candidates), [candidates]);
  const confirmedCount = confirmedApplyRows.length;

  const openPairingSaveDialog = useCallback(async () => {
    if (!batchId) return;
    if (!monthKey) {
      Alert.alert(
        'Month not set',
        'This import does not have a target calendar month yet. Go back and pick a month, then try again.'
      );
      return;
    }
    try {
      let map = legsByPairing;
      if (pairings.length && map.size === 0) {
        map = await fetchDutiesGroupedByPairingIds(pairings.map((p) => p.id));
      }
      const gate = evaluateBatchPairingSave(pairings, map);
      if (!gate.ok) {
        Alert.alert('Required fields incomplete', gate.message);
        return;
      }

      const pairingRows = await buildApplyRowsFromPairingBatch(batchId, monthKey);
      if (pairingRows.length === 0) {
        Alert.alert(
          'Nothing to save',
          'No duty days were found in your pairings for this month. Open a pairing card and confirm dates and legs, then try again.'
        );
        return;
      }

      const showMergeReplace = () => {
        Alert.alert(
          'Save to calendar',
          `Save ${pairingRows.length} schedule day${pairingRows.length === 1 ? '' : 's'} from your pairings for ${formatMonthSentence(monthKey)}.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Merge with existing',
              onPress: async () => {
                setSaving(true);
                try {
                  await applyMergeMonth(monthKey, batchId, pairingRows);
                  router.replace('/crew-schedule/(tabs)');
                } catch (e) {
                  Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
                } finally {
                  setSaving(false);
                }
              },
            },
            {
              text: 'Replace this month',
              style: 'destructive',
              onPress: async () => {
                setSaving(true);
                try {
                  await applyReplaceMonth(monthKey, batchId, pairingRows);
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
      };

      if (gate.needsReviewConfirm) {
        Alert.alert(
          'Save with open review items?',
          `${gate.reviewCount} item${gate.reviewCount === 1 ? '' : 's'} are still flagged for review. You can save now or go back and double-check.`,
          [
            { text: 'Go back', style: 'cancel' },
            { text: 'Save to schedule', onPress: showMergeReplace },
          ]
        );
        return;
      }

      showMergeReplace();
    } catch (e) {
      Alert.alert('Could not prepare save', e instanceof Error ? e.message : String(e));
    }
  }, [batchId, legsByPairing, monthKey, pairings, router]);

  const openLineBasedSaveDialog = useCallback(() => {
    if (!batchId || !monthKey) return;
    if (confirmedCount === 0) {
      Alert.alert(
        'Nothing to save yet',
        'Confirm items under Looks Good, or open the editor to fix rows that need review.'
      );
      return;
    }
    Alert.alert(
      'Add to calendar',
      `Save ${confirmedCount} confirmed row${confirmedCount === 1 ? '' : 's'} for ${formatMonthSentence(monthKey)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge with existing',
          onPress: async () => {
            setSaving(true);
            try {
              await applyMergeMonth(monthKey, batchId, confirmedApplyRows);
              router.replace('/crew-schedule/(tabs)');
            } catch (e) {
              Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
            } finally {
              setSaving(false);
            }
          },
        },
        {
          text: 'Replace this month',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await applyReplaceMonth(monthKey, batchId, confirmedApplyRows);
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
  }, [batchId, confirmedApplyRows, confirmedCount, monthKey, router]);

  const openSaveDialog = useCallback(() => {
    if (pairings.length > 0) {
      void openPairingSaveDialog();
      return;
    }
    openLineBasedSaveDialog();
  }, [openLineBasedSaveDialog, openPairingSaveDialog, pairings.length]);

  const scrollToNeedsReview = useCallback(() => {
    if (needsReview.length === 0) return;
    const y = Math.max(0, needsReviewSectionY.current - 12);
    scrollRef.current?.scrollTo({ y, animated: true });
  }, [needsReview.length]);

  const scrollToPairingList = useCallback(() => {
    const y = Math.max(0, pairingListY.current - 8);
    scrollRef.current?.scrollTo({ y, animated: true });
  }, []);

  const onEdit = useCallback(() => {
    if (!batchId) return;
    router.push({
      pathname: '../import-edit/[batchId]',
      params: { batchId },
    });
  }, [batchId, router]);

  const onMarkLooksGood = useCallback(
    async (c: ScheduleImportCandidateRow) => {
      const st = (c.status_code ?? '').toUpperCase();
      if (st === 'UNK') {
        Alert.alert(
          'Set duty type first',
          'Open the full editor and choose what this line is (trip, day off, reserve, etc.).'
        );
        return;
      }
      try {
        await updateImportCandidate(c.id, {
          confidence_score: 0.9,
          warning_flag: false,
        });
        setDetailCandidate(null);
        await load();
      } catch (e) {
        Alert.alert('Could not update', e instanceof Error ? e.message : String(e));
      }
    },
    [load]
  );

  const onSkipItem = useCallback(
    async (c: ScheduleImportCandidateRow) => {
      Alert.alert('Skip this line?', 'It will not be added to your calendar.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateImportCandidate(c.id, { ignored_flag: true });
              setDetailCandidate(null);
              await load();
            } catch (e) {
              Alert.alert('Could not update', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ]);
    },
    [load]
  );

  if (!batchId) {
    return (
      <View style={styles.shell}>
        <CrewScheduleHeader title="Review Imported Schedule" />
        <Text style={styles.err}>Missing batch.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.shell}>
        <CrewScheduleHeader title="Review Imported Schedule" />
        <View style={styles.center}>
          <ActivityIndicator color={T.accent} size="large" />
          <Text style={styles.muted}>Loading your schedule…</Text>
        </View>
      </View>
    );
  }

  const isPdf = batch?.source_file_path?.toLowerCase().endsWith('.pdf');
  const cls = batch?.classification_json as {
    parser_key?: string;
    jetblue_flica_skip_generic_candidates?: boolean;
    ocr_pipeline?: {
      weak_ocr?: boolean;
      merged_len?: number;
      ocr_issues?: string[];
    };
  } | null | undefined;
  const parserKey = cls?.parser_key;
  const rawBlob = (batch?.raw_extracted_text ?? '').slice(0, 120_000);
  const rawLooksLikeFlica = looksLikeFlicaRawText(rawBlob);
  const isJetBlueFlicaPairingImport =
    pairings.length > 0 ||
    cls?.parser_key === 'jetblue_flica_structured_v1' ||
    cls?.jetblue_flica_skip_generic_candidates === true ||
    Boolean(batch?.schedule_import_id) ||
    Boolean(batch?.source_file_path?.includes('/jetblue/')) ||
    rawLooksLikeFlica;
  const jetblueImportId = batch?.schedule_import_id ?? null;
  /** Pairing list is primary: hide line-based review sections and use pairing save flow. */
  const pairingPrimaryMode = pairings.length > 0;

  const summaryLooksGood = pairingPrimaryMode ? pairingPillStats.looksGood : looksGood.length;
  const summaryNeedsAttention = pairingPrimaryMode ? pairingPillStats.needsAttention : needsReview.length;
  const summarySkipped = pairingPrimaryMode ? 0 : skipped.length;

  const renderSection = (
    title: string,
    subtitle: string | undefined,
    rows: ScheduleImportCandidateRow[],
    variant: 'looks_good' | 'needs_review' | 'skipped',
    sectionRef?: 'needs_review'
  ) => {
    if (rows.length === 0) return null;
    const slice = rows.slice(0, PREVIEW_CAP);
    const more = rows.length - slice.length;
    const tappable = variant !== 'skipped';
    return (
      <View
        onLayout={
          sectionRef === 'needs_review'
            ? (e) => {
                needsReviewSectionY.current = e.nativeEvent.layout.y;
              }
            : undefined
        }
        style={styles.sectionBlock}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        {slice.map((c) => (
          <ReviewRowCard
            key={c.id}
            c={c}
            variant={variant}
            tappable={tappable}
            onPress={() => {
              setRawExpanded(false);
              setDetailCandidate(c);
            }}
          />
        ))}
        {more > 0 ? (
          <Text style={styles.moreHint}>
            +{more} more — open the full editor to see or edit every line.
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.shell, pairingPrimaryMode && { backgroundColor: FC.pageBg }]}>
      <CrewScheduleHeader title={pairingPrimaryMode ? 'Import review' : 'Review Imported Schedule'} />
      <ScrollView
        ref={scrollRef}
        style={pairingPrimaryMode ? styles.scrollFlex : undefined}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: pairingPrimaryMode ? 10 : insets.bottom + 28,
          },
        ]}
      >
        {pairingPrimaryMode ? (
          <View style={styles.summaryCardPremium}>
            <Text style={styles.premiumSummaryTitle}>Imported pairings</Text>
            <Text style={styles.premiumSummaryMonth}>{monthKey ? formatMonthSentence(monthKey) : '—'}</Text>
            <Text style={styles.premiumSummaryMeta}>
              {pairings.length} total · {summaryLooksGood} look good · {summaryNeedsAttention} need attention
            </Text>
            {totalMissingFieldCount > 0 ? (
              <Text style={styles.premiumSummaryMeta}>
                {totalMissingFieldCount} required field{totalMissingFieldCount === 1 ? '' : 's'} to fix across trips
              </Text>
            ) : null}
            <Text style={styles.premiumSummaryHint}>Tap any card to review the trip or fix details.</Text>
            <View style={styles.pillRow}>
              <View style={[styles.pill, styles.pillGood, { backgroundColor: C.goodBg }]}>
                <Text style={[styles.pillCount, { color: C.good }]}>{summaryLooksGood}</Text>
                <Text style={[styles.pillLabel, { color: C.good }]}>Looks good</Text>
              </View>
              <View style={[styles.pill, styles.pillReview, { backgroundColor: C.reviewBg }]}>
                <Text style={[styles.pillCount, { color: C.review }]}>{summaryNeedsAttention}</Text>
                <Text style={[styles.pillLabel, { color: C.review }]}>Needs attention</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryEyebrow}>Import summary</Text>
            <Text style={styles.summaryLead}>
              {monthKey
                ? `We found your schedule for ${formatMonthSentence(monthKey)}.`
                : 'We scanned your screenshot and grouped the results below.'}
            </Text>
            <Text style={styles.summaryHint}>Review anything marked Needs Review, then save your schedule.</Text>
            {pairings.length > 0 ? (
              <Text style={styles.summarySubMeta}>
                Pairings: {pairings.length}
                {avgPairingConfidence != null ? ` · Avg parser confidence ${Math.round(avgPairingConfidence * 100)}%` : ''}
                {batch?.classification_confidence != null
                  ? ` · Classifier ${Math.round(batch.classification_confidence * 100)}%`
                  : ''}
              </Text>
            ) : null}

            <View style={styles.pillRow}>
              <View style={[styles.pill, styles.pillGood, { backgroundColor: C.goodBg }]}>
                <Text style={[styles.pillCount, { color: C.good }]}>{summaryLooksGood}</Text>
                <Text style={[styles.pillLabel, { color: C.good }]}>Looks Good</Text>
              </View>
              <View style={[styles.pill, styles.pillReview, { backgroundColor: C.reviewBg }]}>
                <Text style={[styles.pillCount, { color: C.review }]}>{summaryNeedsAttention}</Text>
                <Text style={[styles.pillLabel, { color: C.review }]}>Needs Review</Text>
              </View>
              <View style={[styles.pill, styles.pillSkip, { backgroundColor: C.skipBg }]}>
                <Text style={[styles.pillCount, { color: C.skip }]}>{summarySkipped}</Text>
                <Text style={[styles.pillLabel, { color: C.skip }]}>Skipped</Text>
              </View>
            </View>
          </View>
        )}

        {pairingPrimaryMode ? (
          <Pressable
            style={styles.uploadCollapsibleHeader}
            onPress={() => setUploadExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={uploadExpanded ? 'Hide original upload' : 'Show original upload'}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.uploadCollapsibleTitle}>Original upload</Text>
              <Text style={styles.uploadCollapsibleSub}>Pinch-zoom to compare</Text>
            </View>
            <Ionicons name={uploadExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={FC.textMuted} />
          </Pressable>
        ) : (
          <View style={styles.screenshotPreviewTop}>
            <Text style={styles.blockHeading}>Original upload</Text>
            <Text style={styles.blockHelper}>
              Full-resolution file is scanned for OCR — this thumbnail is for comparison. Tap for pinch-zoom.
            </Text>
          </View>
        )}
        {(!pairingPrimaryMode || uploadExpanded) &&
          (previewUrl && !isPdf ? (
            <Pressable
              onPress={() => setImageModalVisible(true)}
              style={[styles.previewWrap, pairingPrimaryMode && styles.previewWrapCompact]}
              accessibilityRole="button"
              accessibilityLabel="Open screenshot with pinch zoom"
            >
              <Image
                source={{ uri: previewUrl }}
                style={pairingPrimaryMode ? styles.previewMedium : styles.previewTall}
                resizeMode="contain"
              />
            </Pressable>
          ) : (
            <View style={[styles.fileBox, pairingPrimaryMode && { marginBottom: 12 }]}>
              <Text style={styles.fileMuted}>
                {isPdf
                  ? 'PDF import — no image preview. Parsed rows are listed below.'
                  : 'No image on file for this batch.'}
              </Text>
              {batch?.source_file_path ? (
                <Text style={styles.fileMono} numberOfLines={2}>
                  {batch.source_file_path}
                </Text>
              ) : null}
            </View>
          ))}

        {isJetBlueFlicaPairingImport && !pairingPrimaryMode ? (
          <View style={styles.jetblueBanner}>
            <Text style={styles.jetblueBannerTitle}>JetBlue FLICA pairing import</Text>
            <Text style={styles.jetblueBannerBody}>
              Pairing rows are available below. Generic OCR lines may still appear if the screenshot mixed formats.
            </Text>
            {jetblueImportId ? (
              <Pressable
                style={styles.jetblueBannerBtn}
                onPress={() =>
                  router.push({
                    pathname: '/crew-schedule/import-jetblue-review/[importId]',
                    params: { importId: jetblueImportId },
                  })
                }
              >
                <Text style={styles.jetblueBannerBtnText}>Open guided JetBlue review</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {pairings.length > 0 ? (
          <View
            style={styles.pairingSection}
            onLayout={(e) => {
              pairingListY.current = e.nativeEvent.layout.y;
            }}
          >
            {!pairingPrimaryMode ? (
              <>
                <Text style={styles.blockHeading}>Pairings ({pairings.length})</Text>
                <Text style={styles.blockHelper}>Tap a pairing to edit legs, times, and flags.</Text>
              </>
            ) : null}
            {pairings.map((p) => {
              const legs = legsByPairing.get(p.id) ?? [];
              const pv = validateJetBluePairingImport(snapshotFromPairingRow(p), legs, p);
              const primary = pairingCardPrimaryLabel(pv);
              const badgeLabel = primary.label;
              const needsAttention = primary.severity !== 'good';
              const badgeStyle = needsAttention ? styles.badgeSmWarn : styles.badgeSmOk;
              const routeDisplay = formatTripRouteArrows(legs);
              const attentionSub = pairingCardAttentionSubtext(pv);
              return pairingPrimaryMode ? (
                <Pressable
                  key={p.id}
                  style={[styles.pairingCardPremium, needsAttention && styles.pairingCardPremiumWarn]}
                  onPress={() =>
                    router.push({
                      pathname: '/crew-schedule/import-jetblue-pairing/[pairingId]',
                      params: { pairingId: p.id, batchId: batchId! },
                    })
                  }
                >
                  <View style={styles.pairingCardHeader}>
                    <Text style={styles.pairingCardTitlePremium}>{p.pairing_id}</Text>
                    <View style={[styles.badgeSm, badgeStyle]}>
                      <Text style={styles.badgeSmText}>{badgeLabel}</Text>
                    </View>
                  </View>
                  <Text style={styles.pairingCardDateRow}>{formatDateRangeDisplay(p.operate_start_date, p.operate_end_date)}</Text>
                  <Text style={styles.pairingCardRoutePremium} numberOfLines={3}>
                    {routeDisplay}
                  </Text>
                  <Text style={styles.pairingCardMetaLine}>
                    Report {p.report_time_local ?? '—'} · Base {p.base_code ?? '—'}
                  </Text>
                  {attentionSub ? (
                    <Text style={styles.pairingCardIssueLine} numberOfLines={3}>
                      {attentionSub}
                    </Text>
                  ) : null}
                </Pressable>
              ) : (
                <Pressable
                  key={p.id}
                  style={[styles.pairingCard, needsAttention && styles.pairingCardWarn]}
                  onPress={() =>
                    router.push({
                      pathname: '/crew-schedule/import-jetblue-pairing/[pairingId]',
                      params: { pairingId: p.id, batchId: batchId! },
                    })
                  }
                >
                  <View style={styles.pairingCardHeader}>
                    <Text style={styles.pairingCardTitle}>{p.pairing_id}</Text>
                    <View style={[styles.badgeSm, badgeStyle]}>
                      <Text style={styles.badgeSmText}>{badgeLabel}</Text>
                    </View>
                  </View>
                  <Text style={styles.pairingCardLine}>
                    {p.operate_start_date ?? '—'} → {p.operate_end_date ?? '—'} · Report {p.report_time_local ?? '—'} · Base{' '}
                    {p.base_code ?? '—'}
                  </Text>
                  {routeDisplay !== '—' ? (
                    <Text style={styles.pairingCardRoute} numberOfLines={2}>
                      Route {routeDisplay.replace(/ → /g, '-')}
                    </Text>
                  ) : null}
                  {attentionSub ? (
                    <Text style={styles.pairingCardIssueLine} numberOfLines={3}>
                      {attentionSub}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {batch?.detected_month_key && batch.detected_month_key !== monthKey ? (
          <Text style={styles.infoLine}>
            Image shows {formatMonthSentence(batch.detected_month_key)} · calendar month {monthKey || '—'}
          </Text>
        ) : null}

        {__DEV__ && parserKey ? (
          <Text style={styles.devLine}>
            Parser: {parserKey}
            {batch?.classification_confidence != null
              ? ` · ${Math.round(batch.classification_confidence * 100)}%`
              : ''}
          </Text>
        ) : null}

        {batch?.parse_error ? (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>{batch.parse_error}</Text>
          </View>
        ) : null}

        {needsReview.length === 0 && candidates.length > 0 && !pairingPrimaryMode ? (
          <View style={styles.positiveBanner}>
            <Ionicons name="checkmark-circle" size={22} color={C.good} />
            <Text style={styles.positiveBannerText}>Everything looks good. You’re ready to save.</Text>
          </View>
        ) : null}

        {!pairingPrimaryMode && needsReview.length > 0 ? (
          <Text style={styles.actionHint}>Start with items that need a quick look.</Text>
        ) : null}

        {!pairingPrimaryMode
          ? renderSection(
              'Needs Review',
              'These lines need a quick look — tap to review or open the full editor.',
              needsReview,
              'needs_review',
              'needs_review'
            )
          : null}

        {!pairingPrimaryMode && looksGood.length === 0 && candidates.length > 0 && needsReview.length > 0 ? (
          <Text style={styles.calmEmpty}>No rows are confirmed yet — that’s OK. Fix “Needs Review” first.</Text>
        ) : null}

        {!pairingPrimaryMode
          ? renderSection(
              'Looks Good',
              'Ready to add when you save.',
              looksGood,
              'looks_good'
            )
          : null}

        {!pairingPrimaryMode && skipped.length > 0
          ? renderSection(
              'Skipped',
              'Skipped items weren’t imported because they looked blank or not useful.',
              skipped,
              'skipped'
            )
          : null}

        {candidates.length === 0 && pairings.length === 0 ? (
          <Text style={styles.calmEmpty}>
            {isJetBlueFlicaPairingImport
              ? cls?.ocr_pipeline?.weak_ocr === true
                ? 'We detected a JetBlue FLICA schedule, but OCR was weak on this screenshot — pairings were not saved. Try a tighter, more zoomed crop of the pairing blocks, then re-import.'
                : monthKey && rawLooksLikeFlica
                  ? 'We found month and FLICA-style text in the scan, but no pairings were saved. Some details may need another pass — try a sharper screenshot of the pairing list or open guided JetBlue review after re-import.'
                  : 'No pairings were saved for this import. Confirm the Edge function saved OCR text (batch has raw text), then try again with a sharper FLICA screenshot. Pairing headers look like J1012 : 04MAY, J1012 04APR, or J1012/04APR — include the pairing blocks if possible.'
              : monthKey && rawLooksLikeFlica
                ? 'We found possible schedule content in this file, but not as line-by-line rows. Try re-importing with a clearer image or add rows in the editor.'
                : 'We didn’t find schedule lines in this file. Try a clearer image or open the editor to add rows by hand.'}
          </Text>
        ) : null}

        <Modal
          visible={detailCandidate != null}
          transparent
          animationType="slide"
          onRequestClose={() => setDetailCandidate(null)}
        >
          <View style={styles.detailModalBackdrop}>
            <View style={[styles.detailModalSheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.detailModalHeader}>
                <Text style={styles.detailModalTitle}>
                  {detailCandidate ? formatDateHeading(detailCandidate.date) : ''}
                </Text>
                <Pressable onPress={() => setDetailCandidate(null)} hitSlop={12}>
                  <Text style={styles.detailModalClose}>Close</Text>
                </Pressable>
              </View>
              <ScrollView style={styles.detailScroll} keyboardShouldPersistTaps="handled">
                {detailCandidate ? (
                  <CandidateDetailBody
                    c={detailCandidate}
                    rawExpanded={rawExpanded}
                    onToggleRaw={() => setRawExpanded((v) => !v)}
                  />
                ) : null}
              </ScrollView>
              {detailCandidate ? (
                <View style={styles.detailActions}>
                  <Pressable
                    style={styles.btnSecondary}
                    onPress={() => {
                      setDetailCandidate(null);
                      onEdit();
                    }}
                  >
                    <Text style={styles.btnSecondaryText}>Open full editor</Text>
                  </Pressable>
                  {reviewCategoryForCandidate(detailCandidate) === 'needs_review' ? (
                    <Pressable style={styles.btnSecondary} onPress={() => onMarkLooksGood(detailCandidate)}>
                      <Text style={styles.btnSecondaryText}>Mark looks good</Text>
                    </Pressable>
                  ) : null}
                  {reviewCategoryForCandidate(detailCandidate) !== 'skipped' ? (
                    <Pressable style={styles.btnGhost} onPress={() => onSkipItem(detailCandidate)}>
                      <Text style={styles.btnGhostTextDestructive}>Skip item</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </Modal>

        {!pairingPrimaryMode && saving ? (
          <View style={styles.saving}>
            <ActivityIndicator color={T.accent} />
            <Text style={styles.muted}>Saving…</Text>
          </View>
        ) : !pairingPrimaryMode ? (
          <View style={styles.actions}>
            <Pressable style={[styles.btnPrimary, styles.btnPrimaryCompact]} onPress={openSaveDialog}>
              <Text style={[styles.btnPrimaryText, styles.btnPrimaryTextCompact]}>Save confirmed items</Text>
            </Pressable>
            {needsReview.length > 0 ? (
              <Pressable style={[styles.btnSecondary, styles.btnSecondaryCompact]} onPress={scrollToNeedsReview}>
                <Text style={[styles.btnSecondaryText, styles.btnSecondaryTextCompact]}>Review remaining</Text>
              </Pressable>
            ) : null}
            <Pressable style={[styles.btnSecondary, styles.btnSecondaryCompact]} onPress={onEdit}>
              <Text style={[styles.btnSecondaryText, styles.btnSecondaryTextCompact]}>Edit all rows</Text>
            </Pressable>
            <Pressable style={[styles.btnGhost, styles.btnGhostCompact]} onPress={() => router.back()}>
              <Text style={[styles.btnGhostText, styles.btnGhostTextCompact]}>Start over</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      {pairingPrimaryMode ? (
        <View
          style={[styles.ctaDock, { paddingBottom: Math.max(insets.bottom, 8), borderTopColor: FC.border }]}
          pointerEvents="box-none"
        >
          {saving ? (
            <View style={styles.ctaSavingRow}>
              <ActivityIndicator color={FC.accent} size="small" />
              <Text style={styles.ctaSavingText}>Saving…</Text>
            </View>
          ) : (
            <>
              {totalMissingFieldCount > 0 ? (
                <Text style={styles.ctaGateCopy}>
                  {totalMissingFieldCount} required field{totalMissingFieldCount === 1 ? '' : 's'} must be fixed before saving
                </Text>
              ) : null}
              <Pressable
                style={[
                  styles.btnPrimary,
                  styles.btnPrimaryCompact,
                  totalMissingFieldCount > 0 && styles.btnPrimaryDisabled,
                ]}
                onPress={() => {
                  if (totalMissingFieldCount > 0) {
                    const shown = pairingsMissingRequiredCodes.slice(0, 14).join(', ');
                    const more =
                      pairingsMissingRequiredCodes.length > 14
                        ? ` (+${pairingsMissingRequiredCodes.length - 14} more)`
                        : '';
                    Alert.alert(
                      'Fix required fields',
                      `Complete highlighted required fields, then try again.\n\nTrips still missing required data: ${shown}${more}.`
                    );
                    scrollToPairingList();
                    return;
                  }
                  void openSaveDialog();
                }}
              >
                <Text style={[styles.btnPrimaryText, styles.btnPrimaryTextCompact]}>Save pairings to schedule</Text>
              </Pressable>
              {hasPairingReviewOrMissing ? (
                <Pressable style={[styles.btnSecondary, styles.btnSecondaryCompact]} onPress={scrollToPairingList}>
                  <Text style={[styles.btnSecondaryText, styles.btnSecondaryTextCompact]}>Review all issues</Text>
                </Pressable>
              ) : null}
              <Pressable style={[styles.btnGhost, styles.btnGhostCompact]} onPress={() => router.back()}>
                <Text style={[styles.btnGhostText, styles.btnGhostTextCompact]}>Start over</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}
      <ZoomableImportImage
        visible={imageModalVisible}
        uri={previewUrl}
        onClose={() => setImageModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  scrollFlex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 0 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  summaryCard: {
    backgroundColor: T.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    padding: 20,
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 14,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  summaryEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: T.textSecondary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  summaryLead: { fontSize: 17, fontWeight: '600', color: T.text, lineHeight: 24, letterSpacing: -0.2, marginBottom: 6 },
  summaryHint: { fontSize: 13, color: T.textSecondary, lineHeight: 19, marginBottom: 8 },
  summarySubMeta: { fontSize: 12, color: T.textSecondary, lineHeight: 17, marginBottom: 14 },
  summaryCardPremium: {
    backgroundColor: FC.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: FC.border,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  premiumSummaryTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: FC.text,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  premiumSummaryMonth: { fontSize: 15, fontWeight: '600', color: FC.textMuted, marginBottom: 10 },
  premiumSummaryMeta: { fontSize: 13, color: FC.text, lineHeight: 19, marginBottom: 8 },
  premiumSummaryHint: { fontSize: 13, color: FC.textMuted, lineHeight: 18, marginBottom: 14 },
  uploadCollapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FC.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: FC.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 12,
  },
  uploadCollapsibleTitle: { fontSize: 15, fontWeight: '700', color: FC.text },
  uploadCollapsibleSub: { fontSize: 12, color: FC.textMuted, marginTop: 2 },
  previewWrapCompact: { marginBottom: 12 },
  previewMedium: { width: '100%', height: 160 },
  pairingCardPremium: {
    backgroundColor: FC.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: FC.border,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  pairingCardPremiumWarn: {
    borderColor: 'rgba(245, 158, 11, 0.5)',
    backgroundColor: '#FFFCF5',
  },
  pairingCardTitlePremium: { fontSize: 22, fontWeight: '800', color: FC.text, flex: 1, letterSpacing: -0.4 },
  pairingCardDateRow: { fontSize: 15, fontWeight: '600', color: FC.text, marginTop: 6 },
  pairingCardRoutePremium: { fontSize: 15, fontWeight: '600', color: FC.text, marginTop: 10, lineHeight: 22 },
  pairingCardMetaLine: { fontSize: 13, color: FC.textMuted, marginTop: 8 },
  pairingCardIssueLine: { fontSize: 12, fontWeight: '600', color: FC.warn, marginTop: 10, lineHeight: 17 },
  ctaDock: {
    backgroundColor: FC.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  ctaSavingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 8 },
  ctaSavingText: { fontSize: 15, fontWeight: '600', color: FC.textMuted },
  ctaGateCopy: {
    fontSize: 13,
    fontWeight: '600',
    color: FC.bad,
    textAlign: 'center',
    marginBottom: 2,
    lineHeight: 18,
  },
  btnPrimaryDisabled: { opacity: 0.45 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flex: 1,
    minWidth: '28%',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 76,
  },
  pillGood: {
    borderWidth: 1,
    borderColor: 'rgba(21, 128, 61, 0.12)',
  },
  pillReview: {
    borderWidth: 1,
    borderColor: 'rgba(180, 83, 9, 0.15)',
  },
  pillSkip: {
    borderWidth: 1,
    borderColor: 'rgba(100, 116, 139, 0.14)',
  },
  pillCount: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  pillLabel: { fontSize: 11, fontWeight: '700', marginTop: 4, letterSpacing: 0.2, textAlign: 'center' },
  actionHint: {
    fontSize: 12,
    fontWeight: '600',
    color: T.textSecondary,
    marginBottom: 10,
    marginTop: 2,
    letterSpacing: 0.15,
  },
  positiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.goodBg,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(21, 128, 61, 0.12)',
  },
  positiveBannerText: { flex: 1, fontSize: 14, fontWeight: '600', color: C.good, lineHeight: 20 },
  screenshotPreviewTop: { marginBottom: 20, marginTop: 0 },
  blockHeading: { fontSize: 13, fontWeight: '800', color: T.textSecondary, letterSpacing: 0.6, marginBottom: 4 },
  blockHelper: { fontSize: 13, color: T.textSecondary, marginBottom: 12, lineHeight: 18 },
  sectionBlock: { marginBottom: 22 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: T.text, marginBottom: 6, letterSpacing: -0.3 },
  sectionSubtitle: { fontSize: 13, color: T.textSecondary, lineHeight: 18, marginBottom: 12 },
  rowCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
    marginBottom: 10,
    overflow: 'hidden',
  },
  rowCardEmphasis: {
    borderLeftWidth: 4,
    borderLeftColor: '#D97706',
    borderTopColor: 'rgba(217, 119, 6, 0.25)',
    borderRightColor: 'rgba(217, 119, 6, 0.25)',
    borderBottomColor: 'rgba(217, 119, 6, 0.25)',
    backgroundColor: '#FFFBF5',
  },
  rowCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  rowCardInnerNeedsReview: {
    paddingVertical: 14,
  },
  rowCardLeft: { flex: 1, minWidth: 0 },
  rowCardRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowDate: { fontSize: 12, fontWeight: '700', color: T.textSecondary, letterSpacing: -0.1 },
  rowDateNeedsReview: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9A3412',
    letterSpacing: 0.2,
  },
  rowSummary: { fontSize: 15, color: T.text, marginTop: 2, lineHeight: 21, fontWeight: '500' },
  rowSummaryNeedsReview: {
    fontSize: 16,
    fontWeight: '600',
    color: T.text,
    marginTop: 4,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  statusChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  statusChipNeedsReview: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  statusChipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  statusChipTextNeedsReview: { fontSize: 10, letterSpacing: 0.35 },
  rowChevron: { marginLeft: 2, opacity: 0.65 },
  rowPressed: { opacity: 0.92 },
  rowCardMuted: { opacity: 0.94 },
  moreHint: { fontSize: 12, color: T.textSecondary, marginTop: 6, marginBottom: 4 },
  calmEmpty: { fontSize: 14, color: T.textSecondary, lineHeight: 20, marginVertical: 10 },
  previewWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    backgroundColor: '#0f172a',
  },
  previewTall: { width: '100%', height: 280 },
  detailModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  detailModalSheet: {
    backgroundColor: T.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: SCREEN_H * 0.88,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  detailModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailModalTitle: { fontSize: 17, fontWeight: '800', color: T.text },
  detailModalClose: { fontSize: 16, fontWeight: '700', color: T.accent },
  detailScroll: { maxHeight: SCREEN_H * 0.5 },
  detailRow: { marginBottom: 12 },
  detailLabel: { fontSize: 11, fontWeight: '800', color: T.textSecondary, marginBottom: 2 },
  detailValue: { fontSize: 14, color: T.text, lineHeight: 20 },
  rawToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginTop: 4,
  },
  rawToggleText: { fontSize: 14, fontWeight: '700', color: T.accent },
  rawBody: {
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    color: T.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  detailActions: { gap: 10, marginTop: 8 },
  fileBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surfaceMuted,
  },
  fileMuted: { fontSize: 13, color: T.textSecondary, marginBottom: 6 },
  fileMono: { fontSize: 12, color: T.text },
  infoLine: { fontSize: 12, color: T.textSecondary, marginBottom: 8 },
  devLine: { fontSize: 11, color: '#94A3B8', marginBottom: 6 },
  noticeBox: {
    backgroundColor: T.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: T.line,
  },
  jetblueBanner: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#93C5FD',
    gap: 8,
  },
  jetblueBannerTitle: { fontSize: 14, fontWeight: '800', color: '#1E3A8A' },
  jetblueBannerBody: { fontSize: 13, color: '#1E40AF', lineHeight: 20 },
  jetblueBannerBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  jetblueBannerBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  pairingSection: { marginBottom: 16, gap: 8 },
  pairingCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
  },
  pairingCardWarn: { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  pairingCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  pairingCardTitle: { fontSize: 16, fontWeight: '800', color: T.text, flex: 1 },
  pairingCardLine: { fontSize: 13, color: T.text, marginTop: 4 },
  pairingCardRoute: { fontSize: 12, color: T.textSecondary, marginTop: 6, lineHeight: 17 },
  badgeSm: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeSmOk: { backgroundColor: '#DCFCE7' },
  badgeSmWarn: { backgroundColor: '#FEF3C7' },
  badgeSmText: { fontSize: 11, fontWeight: '800', color: '#0F172A' },
  noticeText: { fontSize: 13, color: T.textSecondary, lineHeight: 20 },
  muted: { fontSize: 14, color: T.textSecondary },
  err: { padding: 24, color: T.accent },
  saving: { alignItems: 'center', marginTop: 20, gap: 8 },
  actions: { marginTop: 22, gap: 8, paddingTop: 4 },
  btnPrimary: {
    backgroundColor: T.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnPrimaryCompact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnPrimaryTextCompact: { fontSize: 14, fontWeight: '800' },
  btnSecondary: {
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnSecondaryCompact: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  btnSecondaryText: { color: T.text, fontWeight: '800', fontSize: 16 },
  btnSecondaryTextCompact: { fontSize: 14, fontWeight: '700' },
  btnGhost: { paddingVertical: 12, alignItems: 'center' },
  btnGhostCompact: { paddingVertical: 6 },
  btnGhostText: { color: T.textSecondary, fontWeight: '700', fontSize: 15 },
  btnGhostTextCompact: { fontSize: 13, fontWeight: '600' },
  btnGhostTextDestructive: { color: '#B91C1C', fontWeight: '700', fontSize: 15 },
});
