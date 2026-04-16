import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  buildLayoverSummaryFromDuties,
  buildRouteSummaryFromDuties,
  fetchDutiesForPairing,
  fetchPairingById,
  updateSchedulePairing,
  updateSchedulePairingLeg,
  type SchedulePairingDutyRow,
  type SchedulePairingRow,
} from '../../../src/features/crew-schedule/jetblueFlicaImport';
import { fetchImportBatch, getSignedImportFileUrl } from '../../../src/features/crew-schedule/scheduleApi';
import {
  enumeratePairingIssues,
  validateJetBluePairingImport,
  type FieldReviewState,
  type LegFieldKey,
  type PairingFieldKey,
  type PairingIssueItem,
} from '../../../src/features/crew-schedule/jetblueFlicaImportValidation';
import ImportFieldReviewAssist from '../../../src/features/crew-schedule/components/ImportFieldReviewAssist';
import {
  loadAssistFeedbackDoneForPairing,
  saveAssistFeedbackDoneForPairing,
} from '../../../src/features/crew-schedule/importAssistFeedbackStorage';
import {
  FC,
  formatDateRangeDisplay,
  formatTripRouteArrows,
} from '../../../src/features/crew-schedule/jetblueFlicaImportUi';
import { confidenceBand } from '../../../src/features/crew-schedule/jetblueFlicaTemplate';
import { scheduleTheme as T } from '../../../src/features/crew-schedule/scheduleTheme';
import CrewScheduleHeader from '../../../src/features/crew-schedule/components/CrewScheduleHeader';
import ZoomableImportImage from '../../../src/features/crew-schedule/components/ZoomableImportImage';

function useParams(): { pairingId?: string; importId?: string; batchId?: string } {
  const p = useLocalSearchParams<{
    pairingId?: string | string[];
    importId?: string | string[];
    batchId?: string | string[];
  }>();
  const pairingId = typeof p.pairingId === 'string' ? p.pairingId : p.pairingId?.[0];
  const importId = typeof p.importId === 'string' ? p.importId : p.importId?.[0];
  const batchId = typeof p.batchId === 'string' ? p.batchId : p.batchId?.[0];
  return { pairingId, importId, batchId };
}

function legAssistTier(
  lf: Partial<Record<LegFieldKey, { state?: string }>> | undefined
): 'ok' | 'review' | 'miss' {
  if (!lf) return 'ok';
  for (const fs of Object.values(lf)) {
    if (fs?.state === 'missing_required') return 'miss';
  }
  for (const fs of Object.values(lf)) {
    if (fs?.state === 'needs_review') return 'review';
  }
  return 'ok';
}

function hhmmToBlockNumeric(hhmm: string): number | null {
  const t = hhmm.trim();
  if (!/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h + m / 60;
}

/** FLICA OCR slips (matches schedule parser / station normalizer). */
function displayOcrAirportCode(s: string | null | undefined): string {
  const t = (s ?? '').trim().toUpperCase();
  if (!t) return '';
  if (t === 'JAS') return 'LAS';
  if (t === 'JHR') return 'LHR';
  return t;
}

function shellColors(state: FieldReviewState | undefined): { border: string; bg: string } {
  if (state === 'missing_required' || state === 'needs_review') return { border: '#F59E0B', bg: '#FFFBEB' };
  if (state === 'good') return { border: '#A7F3D0', bg: '#FFFFFF' };
  return { border: T.line, bg: T.surface };
}

function PairingFieldShell({
  label,
  state,
  helper,
  onLayoutRelY,
  children,
}: {
  label: string;
  state: FieldReviewState | undefined;
  helper?: string;
  onLayoutRelY?: (relY: number) => void;
  children: React.ReactNode;
}) {
  const c = shellColors(state);
  return (
    <View
      style={styles.fieldBlock}
      onLayout={(e) => {
        onLayoutRelY?.(e.nativeEvent.layout.y);
      }}
    >
      <Text style={styles.label}>{label}</Text>
      {helper ? <Text style={styles.fieldHelper}>{helper}</Text> : null}
      <View style={[styles.inputShell, { borderColor: c.border, backgroundColor: c.bg }]}>{children}</View>
    </View>
  );
}

function LegFieldShell({
  label,
  state,
  helper,
  children,
}: {
  label: string;
  state: FieldReviewState | undefined;
  helper?: string;
  children: React.ReactNode;
}) {
  const c = shellColors(state);
  return (
    <View style={styles.fieldBlockTight}>
      <Text style={styles.label}>{label}</Text>
      {helper ? <Text style={styles.fieldHelper}>{helper}</Text> : null}
      <View style={[styles.inputShell, { borderColor: c.border, backgroundColor: c.bg }]}>{children}</View>
    </View>
  );
}

export default function ImportJetBluePairingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pairingId, importId, batchId } = useParams();

  const [loading, setLoading] = useState(true);
  const [pairing, setPairing] = useState<SchedulePairingRow | null>(null);
  const [duties, setDuties] = useState<SchedulePairingDutyRow[]>([]);

  const [pairingCode, setPairingCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [report, setReport] = useState('');
  const [base, setBase] = useState('');
  const [saving, setSaving] = useState(false);

  const [legModal, setLegModal] = useState<SchedulePairingDutyRow | null>(null);
  const [legDutyDate, setLegDutyDate] = useState('');
  const [legFlight, setLegFlight] = useState('');
  const [legFrom, setLegFrom] = useState('');
  const [legTo, setLegTo] = useState('');
  const [legDep, setLegDep] = useState('');
  const [legArr, setLegArr] = useState('');
  const [legBlock, setLegBlock] = useState('');
  const [legDh, setLegDh] = useState(false);
  const [legLayover, setLegLayover] = useState('');
  const [legRelease, setLegRelease] = useState('');
  const [legRaw, setLegRaw] = useState('');
  const [legSaving, setLegSaving] = useState(false);
  const [dutyOpen, setDutyOpen] = useState<Record<string, boolean>>({});
  const [tripDetailsOpen, setTripDetailsOpen] = useState(false);
  const [legScanExpanded, setLegScanExpanded] = useState(false);
  const [assistFeedbackDone, setAssistFeedbackDone] = useState<Record<string, boolean>>({});
  const [importPreviewUrl, setImportPreviewUrl] = useState<string | null>(null);
  const [importImageModalVisible, setImportImageModalVisible] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const pairingSectionTop = useRef(0);
  const pairingFieldScrollY = useRef<Partial<Record<PairingFieldKey, number>>>({});

  const load = useCallback(async () => {
    if (!pairingId) return;
    setLoading(true);
    try {
      const p = await fetchPairingById(pairingId);
      setPairing(p);
      if (p) {
        setPairingCode(p.pairing_id ?? '');
        setStartDate(p.operate_start_date ?? '');
        setEndDate(p.operate_end_date ?? '');
        setReport(p.report_time_local ?? '');
        setBase(p.base_code ?? '');
      }
      const d = await fetchDutiesForPairing(pairingId);
      setDuties(d);
    } finally {
      setLoading(false);
    }
  }, [pairingId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!batchId) {
      setImportPreviewUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const b = await fetchImportBatch(batchId);
        if (cancelled) return;
        if (b?.source_file_path?.toLowerCase().endsWith('.pdf')) {
          setImportPreviewUrl(null);
          return;
        }
        if (b?.source_file_path) {
          const url = await getSignedImportFileUrl(b.source_file_path);
          if (!cancelled) setImportPreviewUrl(url);
        } else setImportPreviewUrl(null);
      } catch {
        if (!cancelled) setImportPreviewUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  useEffect(() => {
    if (!pairingId) return;
    let cancelled = false;
    setAssistFeedbackDone({});
    void (async () => {
      const m = await loadAssistFeedbackDoneForPairing(pairingId);
      if (cancelled) return;
      setAssistFeedbackDone((prev) => ({ ...m, ...prev }));
    })();
    return () => {
      cancelled = true;
    };
  }, [pairingId]);

  const dutyGroups = useMemo(() => {
    const m = new Map<string, SchedulePairingDutyRow[]>();
    for (const row of duties) {
      const k = row.duty_date ?? '—';
      const arr = m.get(k) ?? [];
      arr.push(row);
      m.set(k, arr);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [duties]);

  /** Chronologically first duty date key — default-expanded until the user toggles. */
  const firstDutyDateKey = useMemo(() => dutyGroups[0]?.[0] ?? '', [dutyGroups]);

  const pairingSnap = useMemo(
    () => ({
      pairing_id: pairingCode.trim(),
      operate_start_date: startDate.trim(),
      operate_end_date: endDate.trim(),
      report_time_local: report.trim(),
      base_code: base.trim(),
    }),
    [pairingCode, startDate, endDate, report, base]
  );

  const mergedDutiesForValidation = useMemo(() => {
    if (!legModal) return duties;
    return duties.map((d) =>
      d.id !== legModal.id
        ? d
        : {
            ...d,
            duty_date: legDutyDate.trim() || null,
            flight_number: legFlight.trim() || null,
            from_airport: legFrom.trim() || null,
            to_airport: legTo.trim() || null,
            departure_time_local: legDep.trim() || null,
            arrival_time_local: legArr.trim() || null,
            release_time_local: legRelease.trim() || null,
            layover_city: legLayover.trim() || null,
          }
    );
  }, [duties, legModal, legDutyDate, legFlight, legFrom, legTo, legDep, legArr, legRelease, legLayover]);

  const editorValidation = useMemo(
    () => validateJetBluePairingImport(pairingSnap, mergedDutiesForValidation, pairing),
    [pairingSnap, mergedDutiesForValidation, pairing]
  );

  const persistValidation = useMemo(
    () => validateJetBluePairingImport(pairingSnap, duties, pairing),
    [pairingSnap, duties, pairing]
  );

  const issueSummaryText = useMemo(() => {
    const v = editorValidation;
    const m = v.counts.missing;
    const r = v.counts.review;
    if (m > 0 && r > 0)
      return `${m} required field${m === 1 ? '' : 's'} missing · ${r} field${r === 1 ? '' : 's'} need review`;
    if (m > 0) return `${m} required field${m === 1 ? '' : 's'} missing`;
    if (r > 0) return `${r} field${r === 1 ? '' : 's'} need review`;
    return null;
  }, [editorValidation]);

  const issueRows = useMemo(
    () => enumeratePairingIssues(duties, editorValidation.pairingFields, editorValidation.legFields),
    [duties, editorValidation.pairingFields, editorValidation.legFields]
  );
  const issueRowsMissing = useMemo(() => issueRows.filter((r) => r.kind === 'missing_required'), [issueRows]);
  const issueRowsReview = useMemo(() => issueRows.filter((r) => r.kind === 'needs_review'), [issueRows]);

  const tripExpandOnce = useRef(false);
  useEffect(() => {
    if (loading || !pairing || tripExpandOnce.current) return;
    const v = validateJetBluePairingImport(
      {
        pairing_id: pairing.pairing_id ?? '',
        operate_start_date: pairing.operate_start_date ?? '',
        operate_end_date: pairing.operate_end_date ?? '',
        report_time_local: pairing.report_time_local ?? '',
        base_code: pairing.base_code ?? '',
      },
      duties,
      pairing
    );
    const pairingKeys: PairingFieldKey[] = [
      'pairing_id',
      'operate_start_date',
      'operate_end_date',
      'report_time_local',
      'base_code',
    ];
    const hasPairingIssue = pairingKeys.some((k) => v.pairingFields[k]?.state !== 'good');
    if (hasPairingIssue) {
      setTripDetailsOpen(true);
      tripExpandOnce.current = true;
    }
  }, [loading, pairing, duties]);

  const scrollToPairingField = useCallback((key: PairingFieldKey) => {
    const y = pairingFieldScrollY.current[key];
    if (y == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  }, []);

  const markAssistFeedback = useCallback((key: string) => {
    setAssistFeedbackDone((m) => {
      const next = { ...m, [key]: true };
      if (pairingId) void saveAssistFeedbackDoneForPairing(pairingId, next);
      return next;
    });
  }, [pairingId]);

  const applyPairingField = useCallback((key: PairingFieldKey, value: string) => {
    const v = value.trim();
    switch (key) {
      case 'pairing_id':
        setPairingCode(v);
        break;
      case 'operate_start_date':
        setStartDate(v);
        break;
      case 'operate_end_date':
        setEndDate(v);
        break;
      case 'report_time_local':
        setReport(v);
        break;
      case 'base_code':
        setBase(v.toUpperCase());
        break;
    }
  }, []);

  const applyLegField = useCallback((key: LegFieldKey, value: string) => {
    const v = value.trim();
    switch (key) {
      case 'duty_date':
        setLegDutyDate(v);
        break;
      case 'flight_number':
        setLegFlight(v);
        break;
      case 'from_airport':
        setLegFrom(v.toUpperCase());
        break;
      case 'to_airport':
        setLegTo(v.toUpperCase());
        break;
      case 'departure_time_local':
        setLegDep(v);
        break;
      case 'arrival_time_local':
        setLegArr(v);
        break;
      case 'release_time_local':
        setLegRelease(v);
        break;
      case 'layover_city':
        setLegLayover(v);
        break;
    }
  }, []);

  const openLeg = useCallback((d: SchedulePairingDutyRow) => {
    setLegModal(d);
    setLegDutyDate(d.duty_date ?? '');
    setLegFlight(d.flight_number ?? '');
    setLegFrom(d.from_airport ?? '');
    setLegTo(d.to_airport ?? '');
    setLegDep(d.departure_time_local ?? '');
    setLegArr(d.arrival_time_local ?? '');
    setLegBlock(d.block_time_local ?? '');
    setLegDh(Boolean(d.is_deadhead));
    setLegLayover(displayOcrAirportCode(d.layover_city) || (d.layover_city ?? ''));
    setLegRelease(d.release_time_local ?? '');
    setLegRaw(d.raw_text ?? '');
    setLegScanExpanded(false);
  }, []);

  const onIssueRowPress = useCallback(
    (item: PairingIssueItem) => {
      const nav = item.nav;
      if (nav.scope === 'pairing') {
        setTripDetailsOpen(true);
        setTimeout(() => scrollToPairingField(nav.pairingKey), 100);
        return;
      }
      const leg = duties.find((d) => d.id === nav.legId);
      if (!leg) return;
      const dateKey = leg.duty_date ?? '—';
      setDutyOpen((o) => ({ ...o, [dateKey]: true }));
      setTimeout(() => openLeg(leg), 60);
    },
    [duties, openLeg, scrollToPairingField]
  );

  const closeLegModal = useCallback(() => {
    Keyboard.dismiss();
    setLegModal(null);
  }, []);

  const saveLeg = useCallback(async () => {
    if (!legModal) return;
    const v = validateJetBluePairingImport(pairingSnap, mergedDutiesForValidation, pairing);
    const lf = v.legFields[legModal.id];
    let missingCt = 0;
    for (const fs of Object.values(lf ?? {})) {
      if (fs?.state === 'missing_required') missingCt += 1;
    }
    if (missingCt > 0) {
      Alert.alert('Required fields', 'Please complete the highlighted fields before saving.');
      return;
    }
    let reviewCt = 0;
    for (const fs of Object.values(lf ?? {})) {
      if (fs?.state === 'needs_review') reviewCt += 1;
    }
    if (reviewCt > 0) {
      const ok = await new Promise<boolean>((res) => {
        Alert.alert('Needs review', 'Some values still look uncertain. Save this leg anyway?', [
          { text: 'Cancel', style: 'cancel', onPress: () => res(false) },
          { text: 'Save changes', onPress: () => res(true) },
        ]);
      });
      if (!ok) return;
    }
    setLegSaving(true);
    try {
      const blockNum = hhmmToBlockNumeric(legBlock);
      await updateSchedulePairingLeg(legModal.id, {
        duty_date: legDutyDate.trim() || null,
        flight_number: legFlight.trim() || null,
        departure_station: legFrom.trim().toUpperCase() || null,
        arrival_station: legTo.trim().toUpperCase() || null,
        scheduled_departure_local: legDep.trim() || null,
        scheduled_arrival_local: legArr.trim() || null,
        block_time: blockNum,
        layover_city: legLayover.trim() || null,
        release_time_local: legRelease.trim() || null,
        is_deadhead: legDh,
        raw_text: legRaw.trim() || null,
        normalized_json: {
          block_time_local: legBlock.trim() || null,
          edited: true,
        },
      });
      Keyboard.dismiss();
      setLegModal(null);
      await load();
    } catch (e) {
      Alert.alert('Could not save leg', e instanceof Error ? e.message : String(e));
    } finally {
      setLegSaving(false);
    }
  }, [
    legModal,
    legDutyDate,
    legFlight,
    legFrom,
    legTo,
    legDep,
    legArr,
    legBlock,
    legDh,
    legLayover,
    legRelease,
    legRaw,
    load,
    pairingSnap,
    mergedDutiesForValidation,
    pairing,
  ]);

  const patchPairingToDb = useCallback(async () => {
    if (!pairingId) return;
    await updateSchedulePairing(pairingId, {
      pairing_id: pairingCode.trim() || pairing?.pairing_id,
      operate_start_date: startDate.trim() || null,
      operate_end_date: endDate.trim() || null,
      report_time_local: report.trim() || null,
      base_code: base.trim() || null,
      needs_review: persistValidation.badge === 'needs_review',
      pairing_confidence: persistValidation.badge === 'good' ? 0.92 : pairing?.pairing_confidence ?? 0.75,
    });
  }, [
    pairingId,
    pairing?.pairing_id,
    pairingCode,
    startDate,
    endDate,
    report,
    base,
    persistValidation.badge,
    pairing?.pairing_confidence,
  ]);

  const finishSaveAndNavigate = useCallback(async () => {
    await patchPairingToDb();
    Alert.alert('Saved', 'Pairing fields updated for this import session.');
    if (batchId) {
      router.replace({
        pathname: '/crew-schedule/import-review/[batchId]',
        params: { batchId },
      });
    } else if (importId) {
      router.replace({
        pathname: '/crew-schedule/import-jetblue-review/[importId]',
        params: { importId },
      });
    } else {
      router.back();
    }
  }, [patchPairingToDb, batchId, importId, router]);

  const goBackToReview = useCallback(() => {
    if (batchId) {
      router.replace({
        pathname: '/crew-schedule/import-review/[batchId]',
        params: { batchId },
      });
    } else if (importId) {
      router.replace({
        pathname: '/crew-schedule/import-jetblue-review/[importId]',
        params: { importId },
      });
    } else {
      router.back();
    }
  }, [batchId, importId, router]);

  const onMarkForReview = useCallback(async () => {
    if (!pairingId) return;
    if (legModal) {
      Alert.alert('Close leg editor', 'Finish editing this leg first.');
      return;
    }
    setSaving(true);
    try {
      await updateSchedulePairing(pairingId, {
        needs_review: true,
        pairing_confidence: Math.min(0.65, pairing?.pairing_confidence ?? 0.65),
      });
      goBackToReview();
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [pairingId, legModal, pairing?.pairing_confidence, goBackToReview]);

  const onSave = useCallback(async () => {
    if (!pairingId) return;
    if (legModal) {
      Alert.alert('Finish leg edit', 'Save or cancel the leg you’re editing first.');
      return;
    }
    const v = persistValidation;
    if (v.counts.missing > 0) {
      if (v.firstMissing?.scope === 'pairing') setTripDetailsOpen(true);
      const runFocus = () => {
        if (v.firstMissing?.scope === 'pairing' && v.firstMissing.key) {
          scrollToPairingField(v.firstMissing.key as PairingFieldKey);
        } else if (v.firstMissing?.scope === 'leg' && v.firstMissing.legId) {
          const leg = duties.find((d) => d.id === v.firstMissing!.legId);
          if (leg) openLeg(leg);
        }
      };
      setTimeout(runFocus, v.firstMissing?.scope === 'pairing' ? 120 : 0);
      Alert.alert(
        'Required fields',
        'Please complete the highlighted fields. We moved to the first place that needs attention.'
      );
      return;
    }
    if (v.badge === 'needs_review' || v.counts.review > 0) {
      Alert.alert(
        'Needs review',
        'Some fields still look uncertain. Save your trip details anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save pairing',
            onPress: () => {
              setSaving(true);
              void (async () => {
                try {
                  await finishSaveAndNavigate();
                } catch (e) {
                  Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
                } finally {
                  setSaving(false);
                }
              })();
            },
          },
        ]
      );
      return;
    }
    setSaving(true);
    try {
      await finishSaveAndNavigate();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [
    pairingId,
    legModal,
    persistValidation,
    scrollToPairingField,
    duties,
    openLeg,
    finishSaveAndNavigate,
  ]);

  const toggleDuty = useCallback(
    (k: string) => {
      setDutyOpen((o) => {
        const v = o[k];
        const wasExpanded =
          v === true || (v === undefined && k === firstDutyDateKey && firstDutyDateKey !== '');
        return { ...o, [k]: !wasExpanded };
      });
    },
    [firstDutyDateKey]
  );

  if (!pairingId) {
    return (
      <View style={styles.shell}>
        <CrewScheduleHeader title="Pairing" />
        <Text style={styles.err}>Missing pairing.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.shell}>
        <CrewScheduleHeader title="Review pairing" />
        <View style={styles.center}>
          <ActivityIndicator color={T.accent} size="large" />
        </View>
      </View>
    );
  }

  const nj = (pairing as SchedulePairingRow & { normalized_json?: { routeSummary?: string; layoverStations?: string[] } })
    ?.normalized_json;
  const routeFromNj = typeof nj?.routeSummary === 'string' ? nj.routeSummary.replace(/\s*→\s*/g, '-').replace(/→/g, '-') : null;
  const routeSummary = routeFromNj ?? buildRouteSummaryFromDuties(duties);
  const routeArrowDisplay =
    duties.length > 0
      ? formatTripRouteArrows(duties)
      : routeSummary && routeSummary !== '—'
        ? routeSummary.split('-').join(' → ')
        : '—';
  const laySummary = buildLayoverSummaryFromDuties(duties);
  const band = confidenceBand(pairing?.pairing_confidence ?? null);

  /** OCR / parser text for review assist (not shown until user taps “Show scan text”). */
  const pairingScanSnippet = (pairing?.raw_text ?? '').trim().slice(0, 16_000) || undefined;
  const legScanSnippet = (legRaw ?? '').trim().slice(0, 16_000) || undefined;

  const legModalFields = legModal ? editorValidation.legFields[legModal.id] : undefined;

  const sumBadge =
    editorValidation.badge === 'good'
      ? { label: 'Looks good', bg: FC.goodBg, fg: FC.good }
      : { label: 'Needs attention', bg: FC.warnBg, fg: FC.warn };

  return (
    <View style={styles.shell}>
      <CrewScheduleHeader title="Review pairing" />
      <ScrollView
        ref={scrollRef}
        style={styles.scrollFlex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.summaryHeroCard}>
          <View style={styles.summaryHeroTop}>
            <Text style={styles.summaryHeroCode}>{pairingCode || '—'}</Text>
            <View style={[styles.sumBadge, { backgroundColor: sumBadge.bg }]}>
              <Text style={[styles.sumBadgeText, { color: sumBadge.fg }]}>{sumBadge.label}</Text>
            </View>
          </View>
          <Text style={styles.summaryHeroRoute} numberOfLines={4}>
            {routeArrowDisplay}
          </Text>
          <Text style={styles.summaryHeroDates}>{formatDateRangeDisplay(startDate, endDate)}</Text>
          <Text style={styles.summaryHeroSub}>
            Report {report || '—'} · Base {base || '—'}
            {laySummary ? ` · Layovers: ${laySummary}` : ''}
          </Text>
          <Text style={styles.summaryHeroConfidence}>
            Parser confidence{' '}
            {pairing?.pairing_confidence != null ? `${Math.round(pairing.pairing_confidence * 100)}%` : '—'} ({band})
          </Text>
        </View>

        {issueSummaryText ? (
          <View
            style={[styles.issueBanner, styles.issueBannerWarn]}
          >
            <Text style={styles.issueBannerText}>{issueSummaryText}</Text>
          </View>
        ) : null}

        {issueRows.length > 0 ? (
          <View style={styles.issueListCard}>
            <Text style={styles.issueListTitle}>What to check</Text>
            <Text style={styles.issueListHint}>Tap a row to jump to the field.</Text>
            {issueRowsMissing.length > 0 ? (
              <>
                <Text style={styles.issueSectionLabel}>Missing required</Text>
                {issueRowsMissing.map((row) => (
                  <Pressable
                    key={row.id}
                    onPress={() => onIssueRowPress(row)}
                    style={({ pressed }) => [styles.issueRow, pressed && styles.issueRowPressed]}
                  >
                    <Ionicons name="alert-circle" size={18} color={FC.warn} style={styles.issueRowIcon} />
                    <View style={styles.issueRowTextCol}>
                      <Text style={styles.issueRowText}>{row.label}</Text>
                      {row.detail ? (
                        <Text style={styles.issueRowDetail} numberOfLines={4}>
                          {row.detail}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={FC.textSubtle} />
                  </Pressable>
                ))}
              </>
            ) : null}
            {issueRowsReview.length > 0 ? (
              <>
                <Text style={[styles.issueSectionLabel, issueRowsMissing.length > 0 && { marginTop: 10 }]}>
                  Needs review
                </Text>
                {issueRowsReview.map((row) => (
                  <Pressable
                    key={row.id}
                    onPress={() => onIssueRowPress(row)}
                    style={({ pressed }) => [styles.issueRow, pressed && styles.issueRowPressed]}
                  >
                    <Ionicons name="warning" size={18} color={FC.warn} style={styles.issueRowIcon} />
                    <View style={styles.issueRowTextCol}>
                      <Text style={styles.issueRowText}>{row.label}</Text>
                      {row.detail ? (
                        <Text style={styles.issueRowDetail} numberOfLines={4}>
                          {row.detail}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={FC.textSubtle} />
                  </Pressable>
                ))}
              </>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Duty days</Text>
        {dutyGroups.map(([dateKey, rows]) => {
          const last = rows[rows.length - 1];
          const ddmeta = last?.duty_day;
          const dEnd = last?.release_time_local ?? (ddmeta?.d_end_local as string | undefined) ?? null;
          const rept = (ddmeta?.next_report_local as string | undefined) ?? null;
          const layCityRaw = last?.layover_city ?? (ddmeta?.layover_city_code as string | undefined) ?? null;
          const layCity = layCityRaw ? displayOcrAirportCode(layCityRaw) : null;
          const layRest = last?.layover_rest_display ?? (ddmeta?.layover_rest_display as string | undefined) ?? null;
          const s = dutyOpen[dateKey];
          const expanded =
            s === true ||
            (s === undefined && dateKey === firstDutyDateKey && firstDutyDateKey !== '');
          const dutyHasIssue = rows.some((r) => legAssistTier(editorValidation.legFields[r.id]) !== 'ok');
          return (
            <View
              key={dateKey}
              style={[styles.dutyCard, dutyHasIssue ? styles.dutyCardAttention : null]}
            >
              <Pressable style={styles.dutyCardHeader} onPress={() => toggleDuty(dateKey)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dutyCardDate}>{dateKey}</Text>
                  {dEnd || rept ? (
                    <Text style={styles.dutyCardMetaLine} numberOfLines={2}>
                      {[dEnd ? `D-END ${dEnd}` : null, rept ? `Next report ${rept}` : null].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                  {layCity || layRest ? (
                    <Text style={styles.dutyCardMetaLine}>
                      Layover {layCity ?? '—'}
                      {layRest ? ` · Rest ${layRest}` : ''}
                    </Text>
                  ) : null}
                  <Text style={styles.dutyLegCount}>{rows.length} leg{rows.length === 1 ? '' : 's'}</Text>
                </View>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={FC.textMuted} />
              </Pressable>
              {expanded
                ? rows.map((d) => {
                    const tier = legAssistTier(editorValidation.legFields[d.id]);
                    return (
                    <Pressable
                      key={d.id}
                      style={[
                        styles.legCardPremium,
                        tier !== 'ok' && styles.legCardTierReview,
                      ]}
                      onPress={() => openLeg(d)}
                    >
                      <View style={styles.legCardTop}>
                        <Text style={styles.legFlight}>{d.flight_number ?? '—'}</Text>
                        {d.is_deadhead ? (
                          <View style={styles.dhPill}>
                            <Text style={styles.dhPillText}>Deadhead</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.legRoute}>
                        {d.from_airport ?? '?'} → {d.to_airport ?? '?'}
                      </Text>
                      <Text style={styles.legTimes}>
                        Depart {d.departure_time_local ?? '—'} · Arrive {d.arrival_time_local ?? '—'}
                        {d.block_time_local ? ` · Block ${d.block_time_local}` : ''}
                      </Text>
                    </Pressable>
                    );
                  })
                : null}
            </View>
          );
        })}

        <Pressable style={styles.tripDetailsToggle} onPress={() => setTripDetailsOpen((v) => !v)}>
          <Text style={styles.tripDetailsToggleText}>{tripDetailsOpen ? 'Hide trip details' : 'Edit trip details'}</Text>
          <Ionicons name={tripDetailsOpen ? 'chevron-up' : 'chevron-down'} size={20} color={FC.accent} />
        </Pressable>

        {tripDetailsOpen ? (
          <View
            onLayout={(e) => {
              pairingSectionTop.current = e.nativeEvent.layout.y;
            }}
            style={styles.tripDetailsCard}
          >
            <PairingFieldShell
              label="Pairing ID"
              state={editorValidation.pairingFields.pairing_id?.state}
              helper={editorValidation.pairingFields.pairing_id?.helper}
              onLayoutRelY={(ry) => {
                pairingFieldScrollY.current.pairing_id = pairingSectionTop.current + ry;
              }}
            >
              <TextInput
                value={pairingCode}
                onChangeText={setPairingCode}
                style={styles.inputBare}
                placeholder="J1107"
              />
            </PairingFieldShell>
            <ImportFieldReviewAssist
              assistKey={`${pairingId}-pairing_id`}
              fieldLabel="Pairing ID"
              status={editorValidation.pairingFields.pairing_id}
              fieldScope="pairing"
              fieldKey="pairing_id"
              pairingId={pairingId}
              batchId={batchId}
              onApplyCandidate={(val) => applyPairingField('pairing_id', val)}
              feedbackSubmitted={!!assistFeedbackDone[`${pairingId}:pairing_id`]}
              onFeedbackSubmitted={() => markAssistFeedback(`${pairingId}:pairing_id`)}
            />

            <PairingFieldShell
              label="Start date"
              state={editorValidation.pairingFields.operate_start_date?.state}
              helper={editorValidation.pairingFields.operate_start_date?.helper}
              onLayoutRelY={(ry) => {
                pairingFieldScrollY.current.operate_start_date = pairingSectionTop.current + ry;
              }}
            >
              <TextInput
                value={startDate}
                onChangeText={setStartDate}
                style={styles.inputBare}
                placeholder="2026-04-03"
              />
            </PairingFieldShell>
            <ImportFieldReviewAssist
              assistKey={`${pairingId}-start`}
              fieldLabel="Start date"
              status={editorValidation.pairingFields.operate_start_date}
              fieldScope="pairing"
              fieldKey="operate_start_date"
              pairingId={pairingId}
              batchId={batchId}
              scanTextSnippet={pairingScanSnippet}
              onViewImportImage={importPreviewUrl ? () => setImportImageModalVisible(true) : undefined}
              onApplyCandidate={(val) => applyPairingField('operate_start_date', val)}
              feedbackSubmitted={!!assistFeedbackDone[`${pairingId}:operate_start_date`]}
              onFeedbackSubmitted={() => markAssistFeedback(`${pairingId}:operate_start_date`)}
            />

            <PairingFieldShell
              label="End date"
              state={editorValidation.pairingFields.operate_end_date?.state}
              helper={editorValidation.pairingFields.operate_end_date?.helper}
              onLayoutRelY={(ry) => {
                pairingFieldScrollY.current.operate_end_date = pairingSectionTop.current + ry;
              }}
            >
              <TextInput value={endDate} onChangeText={setEndDate} style={styles.inputBare} />
            </PairingFieldShell>
            <ImportFieldReviewAssist
              assistKey={`${pairingId}-end`}
              fieldLabel="End date"
              status={editorValidation.pairingFields.operate_end_date}
              fieldScope="pairing"
              fieldKey="operate_end_date"
              pairingId={pairingId}
              batchId={batchId}
              scanTextSnippet={pairingScanSnippet}
              onViewImportImage={importPreviewUrl ? () => setImportImageModalVisible(true) : undefined}
              onApplyCandidate={(val) => applyPairingField('operate_end_date', val)}
              feedbackSubmitted={!!assistFeedbackDone[`${pairingId}:operate_end_date`]}
              onFeedbackSubmitted={() => markAssistFeedback(`${pairingId}:operate_end_date`)}
            />

            <PairingFieldShell
              label="Report time (local)"
              state={editorValidation.pairingFields.report_time_local?.state}
              helper={editorValidation.pairingFields.report_time_local?.helper}
              onLayoutRelY={(ry) => {
                pairingFieldScrollY.current.report_time_local = pairingSectionTop.current + ry;
              }}
            >
              <TextInput
                value={report}
                onChangeText={setReport}
                style={styles.inputBare}
                placeholder="1930 or 1930L"
              />
            </PairingFieldShell>
            <ImportFieldReviewAssist
              assistKey={`${pairingId}-report`}
              fieldLabel="Report time"
              status={editorValidation.pairingFields.report_time_local}
              fieldScope="pairing"
              fieldKey="report_time_local"
              pairingId={pairingId}
              batchId={batchId}
              scanTextSnippet={pairingScanSnippet}
              onViewImportImage={importPreviewUrl ? () => setImportImageModalVisible(true) : undefined}
              onApplyCandidate={(val) => applyPairingField('report_time_local', val)}
              feedbackSubmitted={!!assistFeedbackDone[`${pairingId}:report_time_local`]}
              onFeedbackSubmitted={() => markAssistFeedback(`${pairingId}:report_time_local`)}
            />

            <PairingFieldShell
              label="Base"
              state={editorValidation.pairingFields.base_code?.state}
              helper={editorValidation.pairingFields.base_code?.helper}
              onLayoutRelY={(ry) => {
                pairingFieldScrollY.current.base_code = pairingSectionTop.current + ry;
              }}
            >
              <TextInput value={base} onChangeText={setBase} style={styles.inputBare} placeholder="3-letter base" />
            </PairingFieldShell>
            <ImportFieldReviewAssist
              assistKey={`${pairingId}-base`}
              fieldLabel="Base"
              status={editorValidation.pairingFields.base_code}
              fieldScope="pairing"
              fieldKey="base_code"
              pairingId={pairingId}
              batchId={batchId}
              scanTextSnippet={pairingScanSnippet}
              onViewImportImage={importPreviewUrl ? () => setImportImageModalVisible(true) : undefined}
              onApplyCandidate={(val) => applyPairingField('base_code', val)}
              feedbackSubmitted={!!assistFeedbackDone[`${pairingId}:base_code`]}
              onFeedbackSubmitted={() => markAssistFeedback(`${pairingId}:base_code`)}
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.pairingCtaDock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable style={[styles.btnPrimaryWide, saving && styles.btnDisabled]} onPress={() => void onSave()} disabled={saving}>
          <Text style={styles.btnPrimaryWideText}>{saving ? 'Saving…' : 'Save pairing'}</Text>
        </Pressable>
        <Pressable style={styles.btnSecondaryWide} onPress={() => void onMarkForReview()} disabled={saving}>
          <Text style={styles.btnSecondaryWideText}>Mark for review</Text>
        </Pressable>
        <Pressable style={styles.btnGhostWide} onPress={goBackToReview}>
          <Text style={styles.btnGhostWideText}>Back</Text>
        </Pressable>
      </View>

      <Modal
        isVisible={legModal != null}
        onBackdropPress={closeLegModal}
        onBackButtonPress={closeLegModal}
        onSwipeComplete={closeLegModal}
        swipeDirection={['down']}
        style={styles.rnModalRoot}
        backdropOpacity={0.45}
        propagateSwipe
        avoidKeyboard
        useNativeDriverForBackdrop
      >
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.modalGrabber} accessibilityLabel="Drag down to close" />
          <Text style={styles.modalTitle}>Correct leg</Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            nestedScrollEnabled
          >
            <LegFieldShell
              label="Duty date"
              state={legModalFields?.duty_date?.state}
              helper={legModalFields?.duty_date?.helper}
            >
              <TextInput value={legDutyDate} onChangeText={setLegDutyDate} style={styles.inputBare} />
            </LegFieldShell>
            {legModal ? (
              <ImportFieldReviewAssist
                assistKey={`${legModal.id}-duty_date`}
                fieldLabel="Duty date"
                status={legModalFields?.duty_date}
                fieldScope="leg"
                fieldKey="duty_date"
                pairingId={pairingId}
                batchId={batchId}
                legId={legModal.id}
                scanTextSnippet={legScanSnippet}
                onViewImportImage={importPreviewUrl ? () => setImportImageModalVisible(true) : undefined}
                onApplyCandidate={(val) => applyLegField('duty_date', val)}
                feedbackSubmitted={!!assistFeedbackDone[`${legModal.id}:duty_date`]}
                onFeedbackSubmitted={() => markAssistFeedback(`${legModal.id}:duty_date`)}
              />
            ) : null}
            <LegFieldShell
              label="Flight number"
              state={legModalFields?.flight_number?.state}
              helper={legModalFields?.flight_number?.helper}
            >
              <TextInput value={legFlight} onChangeText={setLegFlight} style={styles.inputBare} />
            </LegFieldShell>
            {legModal ? (
              <ImportFieldReviewAssist
                assistKey={`${legModal.id}-flight_number`}
                fieldLabel="Flight number"
                status={legModalFields?.flight_number}
                fieldScope="leg"
                fieldKey="flight_number"
                pairingId={pairingId}
                batchId={batchId}
                legId={legModal.id}
                scanTextSnippet={legScanSnippet}
                reconstructedRowText={legModal.parser_leg_meta?.reconstructed_row_text ?? null}
                onViewImportImage={importPreviewUrl ? () => setImportImageModalVisible(true) : undefined}
                onApplyCandidate={(val) => applyLegField('flight_number', val)}
                feedbackSubmitted={!!assistFeedbackDone[`${legModal.id}:flight_number`]}
                onFeedbackSubmitted={() => markAssistFeedback(`${legModal.id}:flight_number`)}
              />
            ) : null}
            <View style={styles.row2}>
              <View style={styles.half}>
                <LegFieldShell
                  label="From (IATA)"
                  state={legModalFields?.from_airport?.state}
                  helper={legModalFields?.from_airport?.helper}
                >
                  <TextInput value={legFrom} onChangeText={setLegFrom} style={styles.inputBare} placeholder="From (3 letters)" />
                </LegFieldShell>
                {legModal ? (
                  <ImportFieldReviewAssist
                    assistKey={`${legModal.id}-from_airport`}
                    fieldLabel="Departure airport"
                    status={legModalFields?.from_airport}
                    fieldScope="leg"
                    fieldKey="from_airport"
                    pairingId={pairingId}
                    batchId={batchId}
                    legId={legModal.id}
                    scanTextSnippet={legScanSnippet}
                    onViewImportImage={importPreviewUrl ? () => setImportImageModalVisible(true) : undefined}
                    onApplyCandidate={(val) => applyLegField('from_airport', val)}
                    feedbackSubmitted={!!assistFeedbackDone[`${legModal.id}:from_airport`]}
                    onFeedbackSubmitted={() => markAssistFeedback(`${legModal.id}:from_airport`)}
                  />
                ) : null}
              </View>
              <View style={styles.half}>
                <LegFieldShell
                  label="To (IATA)"
                  state={legModalFields?.to_airport?.state}
                  helper={legModalFields?.to_airport?.helper}
                >
                  <TextInput value={legTo} onChangeText={setLegTo} style={styles.inputBare} placeholder="To (3 letters)" />
                </LegFieldShell>
                {legModal ? (
                  <ImportFieldReviewAssist
                    assistKey={`${legModal.id}-to_airport`}
                    fieldLabel="Arrival airport"
                    status={legModalFields?.to_airport}
                    fieldScope="leg"
                    fieldKey="to_airport"
                    pairingId={pairingId}
                    batchId={batchId}
                    legId={legModal.id}
                    onApplyCandidate={(val) => applyLegField('to_airport', val)}
                    feedbackSubmitted={!!assistFeedbackDone[`${legModal.id}:to_airport`]}
                    onFeedbackSubmitted={() => markAssistFeedback(`${legModal.id}:to_airport`)}
                  />
                ) : null}
              </View>
            </View>
            <View style={styles.row2}>
              <View style={styles.half}>
                <LegFieldShell
                  label="Depart (local)"
                  state={legModalFields?.departure_time_local?.state}
                  helper={legModalFields?.departure_time_local?.helper}
                >
                  <TextInput value={legDep} onChangeText={setLegDep} style={styles.inputBare} placeholder="10:30" />
                </LegFieldShell>
                {legModal ? (
                  <ImportFieldReviewAssist
                    assistKey={`${legModal.id}-departure_time_local`}
                    fieldLabel="Depart time"
                    status={legModalFields?.departure_time_local}
                    fieldScope="leg"
                    fieldKey="departure_time_local"
                    pairingId={pairingId}
                    batchId={batchId}
                    legId={legModal.id}
                    scanTextSnippet={legScanSnippet}
                    onViewImportImage={importPreviewUrl ? () => setImportImageModalVisible(true) : undefined}
                    onApplyCandidate={(val) => applyLegField('departure_time_local', val)}
                    feedbackSubmitted={!!assistFeedbackDone[`${legModal.id}:departure_time_local`]}
                    onFeedbackSubmitted={() => markAssistFeedback(`${legModal.id}:departure_time_local`)}
                  />
                ) : null}
              </View>
              <View style={styles.half}>
                <LegFieldShell
                  label="Arrive (local)"
                  state={legModalFields?.arrival_time_local?.state}
                  helper={legModalFields?.arrival_time_local?.helper}
                >
                  <TextInput value={legArr} onChangeText={setLegArr} style={styles.inputBare} placeholder="15:36" />
                </LegFieldShell>
                {legModal ? (
                  <ImportFieldReviewAssist
                    assistKey={`${legModal.id}-arrival_time_local`}
                    fieldLabel="Arrive time"
                    status={legModalFields?.arrival_time_local}
                    fieldScope="leg"
                    fieldKey="arrival_time_local"
                    pairingId={pairingId}
                    batchId={batchId}
                    legId={legModal.id}
                    scanTextSnippet={legScanSnippet}
                    onViewImportImage={importPreviewUrl ? () => setImportImageModalVisible(true) : undefined}
                    onApplyCandidate={(val) => applyLegField('arrival_time_local', val)}
                    feedbackSubmitted={!!assistFeedbackDone[`${legModal.id}:arrival_time_local`]}
                    onFeedbackSubmitted={() => markAssistFeedback(`${legModal.id}:arrival_time_local`)}
                  />
                ) : null}
              </View>
            </View>
            <LegFieldShell label="Block" state="good">
              <TextInput value={legBlock} onChangeText={setLegBlock} style={styles.inputBare} placeholder="06:26" />
            </LegFieldShell>
            <View style={styles.switchRow}>
              <Text style={styles.label}>Deadhead</Text>
              <Switch value={legDh} onValueChange={setLegDh} />
            </View>
            <LegFieldShell
              label="Layover city"
              state={legModalFields?.layover_city?.state}
              helper={legModalFields?.layover_city?.helper}
            >
              <TextInput value={legLayover} onChangeText={setLegLayover} style={styles.inputBare} placeholder="Layover (3 letters)" />
            </LegFieldShell>
            {legModal ? (
              <ImportFieldReviewAssist
                assistKey={`${legModal.id}-layover_city`}
                fieldLabel="Layover city"
                status={legModalFields?.layover_city}
                fieldScope="leg"
                fieldKey="layover_city"
                pairingId={pairingId}
                batchId={batchId}
                legId={legModal.id}
                scanTextSnippet={legScanSnippet}
                onViewImportImage={importPreviewUrl ? () => setImportImageModalVisible(true) : undefined}
                onApplyCandidate={(val) => applyLegField('layover_city', val)}
                feedbackSubmitted={!!assistFeedbackDone[`${legModal.id}:layover_city`]}
                onFeedbackSubmitted={() => markAssistFeedback(`${legModal.id}:layover_city`)}
              />
            ) : null}
            <LegFieldShell
              label="Release / D-END"
              state={legModalFields?.release_time_local?.state}
              helper={legModalFields?.release_time_local?.helper}
            >
              <TextInput value={legRelease} onChangeText={setLegRelease} style={styles.inputBare} />
            </LegFieldShell>
            {legModal ? (
              <ImportFieldReviewAssist
                assistKey={`${legModal.id}-release_time_local`}
                fieldLabel="Release / D-END"
                status={legModalFields?.release_time_local}
                fieldScope="leg"
                fieldKey="release_time_local"
                pairingId={pairingId}
                batchId={batchId}
                legId={legModal.id}
                scanTextSnippet={legScanSnippet}
                onViewImportImage={importPreviewUrl ? () => setImportImageModalVisible(true) : undefined}
                onApplyCandidate={(val) => applyLegField('release_time_local', val)}
                feedbackSubmitted={!!assistFeedbackDone[`${legModal.id}:release_time_local`]}
                onFeedbackSubmitted={() => markAssistFeedback(`${legModal.id}:release_time_local`)}
              />
            ) : null}
            <Pressable style={styles.scanToggle} onPress={() => setLegScanExpanded((v) => !v)}>
              <Text style={styles.scanToggleText}>{legScanExpanded ? 'Hide scan text' : 'Show scan text'}</Text>
              <Ionicons name={legScanExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={FC.accent} />
            </Pressable>
            {legScanExpanded ? (
              <TextInput
                value={legRaw}
                onChangeText={setLegRaw}
                style={[styles.input, styles.rawInput]}
                multiline
                placeholder="From your screenshot"
              />
            ) : null}
          </ScrollView>
          <View style={styles.modalActions}>
            <Pressable style={styles.ghost} onPress={closeLegModal}>
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, legSaving && styles.btnDisabled]}
              onPress={() => void saveLeg()}
              disabled={legSaving}
            >
              <Text style={styles.btnText}>{legSaving ? 'Saving…' : 'Save changes'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <ZoomableImportImage
        visible={importImageModalVisible}
        uri={importPreviewUrl}
        onClose={() => setImportImageModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: FC.pageBg },
  scrollFlex: { flex: 1 },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  err: { padding: 24, color: T.accent },
  summaryHeroCard: {
    backgroundColor: FC.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: FC.border,
    padding: 18,
    marginBottom: 14,
  },
  summaryHeroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  summaryHeroCode: { fontSize: 26, fontWeight: '800', color: FC.text, letterSpacing: -0.5, flex: 1 },
  sumBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  sumBadgeText: { fontSize: 11, fontWeight: '800' },
  summaryHeroRoute: { fontSize: 16, fontWeight: '600', color: FC.text, lineHeight: 22, marginTop: 10 },
  summaryHeroDates: { fontSize: 15, fontWeight: '600', color: FC.text, marginTop: 8 },
  summaryHeroSub: { fontSize: 13, color: FC.textMuted, marginTop: 8, lineHeight: 19 },
  summaryHeroConfidence: { fontSize: 12, color: FC.textSubtle, marginTop: 10 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: FC.text,
    marginBottom: 10,
    marginTop: 4,
  },
  dutyCard: {
    backgroundColor: FC.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: FC.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  dutyCardAttention: {
    borderColor: 'rgba(245, 158, 11, 0.55)',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  dutyCardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8 },
  dutyCardDate: { fontSize: 16, fontWeight: '800', color: FC.text },
  dutyCardMetaLine: { fontSize: 13, color: FC.textMuted, marginTop: 4, lineHeight: 18 },
  dutyLegCount: { fontSize: 12, fontWeight: '600', color: FC.textSubtle, marginTop: 6 },
  legCardPremium: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: FC.pageBg,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.9)',
  },
  legCardTierReview: {
    borderColor: 'rgba(245, 158, 11, 0.45)',
    backgroundColor: '#FFFCF7',
  },
  legCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  legFlight: { fontSize: 17, fontWeight: '800', color: FC.text },
  dhPill: {
    backgroundColor: '#FFEDD5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
  },
  dhPillText: { fontSize: 10, fontWeight: '800', color: '#9A3412' },
  legRoute: { fontSize: 15, fontWeight: '600', color: FC.text, marginTop: 2 },
  legTimes: { fontSize: 13, color: FC.textMuted, marginTop: 6, lineHeight: 18 },
  tripDetailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: FC.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FC.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  tripDetailsToggleText: { fontSize: 15, fontWeight: '700', color: FC.accent },
  tripDetailsCard: {
    backgroundColor: FC.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: FC.border,
    padding: 14,
    marginBottom: 16,
  },
  pairingCtaDock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: FC.border,
    backgroundColor: FC.card,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  btnPrimaryWide: {
    backgroundColor: FC.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnPrimaryWideText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnSecondaryWide: {
    borderWidth: 1,
    borderColor: FC.border,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: FC.card,
  },
  btnSecondaryWideText: { color: FC.text, fontWeight: '800', fontSize: 15 },
  btnGhostWide: { paddingVertical: 10, alignItems: 'center' },
  btnGhostWideText: { color: FC.textMuted, fontWeight: '700', fontSize: 15 },
  scanToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginTop: 4,
  },
  scanToggleText: { fontSize: 14, fontWeight: '700', color: FC.accent },
  badge: { fontSize: 13, fontWeight: '700', color: T.textSecondary, marginBottom: 8 },
  kv: { fontSize: 14, color: T.text, marginBottom: 4 },
  kvLabel: { fontWeight: '700', color: T.textSecondary },
  kvVal: { fontWeight: '600', color: T.text },
  summary: { fontSize: 14, color: T.text, marginBottom: 6, lineHeight: 20 },
  h2: { fontSize: 15, fontWeight: '800', color: T.text, marginTop: 16, marginBottom: 6 },
  muted: { fontSize: 12, color: T.textSecondary, marginBottom: 10, lineHeight: 17 },
  label: { fontSize: 11, fontWeight: '800', color: T.textSecondary, marginTop: 10, marginBottom: 4 },
  mutedSmall: { fontSize: 11, color: T.textSecondary, marginBottom: 8, lineHeight: 15 },
  issueBanner: { padding: 12, borderRadius: 10, marginBottom: 12, borderWidth: 1 },
  issueBannerWarn: { backgroundColor: '#FFFBEB', borderColor: '#F59E0B' },
  issueBannerText: { fontSize: 13, fontWeight: '700', color: T.text, lineHeight: 18 },
  issueListCard: {
    backgroundColor: FC.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FC.border,
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  issueListTitle: { fontSize: 15, fontWeight: '800', color: FC.text, marginBottom: 2 },
  issueListHint: { fontSize: 12, color: FC.textMuted, marginBottom: 6 },
  issueSectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: FC.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  issueRowPressed: { opacity: 0.88, backgroundColor: 'rgba(15,23,42,0.03)' },
  issueRowIcon: { marginTop: 1 },
  issueRowTextCol: { flex: 1, minWidth: 0 },
  issueRowText: { fontSize: 14, fontWeight: '600', color: FC.text, lineHeight: 20 },
  issueRowDetail: { fontSize: 12, color: FC.textMuted, marginTop: 4, lineHeight: 17 },
  fieldBlock: { marginTop: 12 },
  fieldBlockTight: { marginTop: 8 },
  fieldHelper: { fontSize: 11, fontWeight: '600', color: T.textSecondary, marginBottom: 4 },
  inputShell: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 0,
    minHeight: 44,
    justifyContent: 'center',
  },
  inputBare: {
    fontSize: 16,
    color: T.text,
    paddingVertical: 10,
    margin: 0,
    backgroundColor: 'transparent',
  },
  input: {
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: T.text,
    backgroundColor: T.surface,
  },
  rawInput: { minHeight: 80, fontFamily: 'Menlo', fontSize: 12 },
  row2: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  btn: {
    backgroundColor: T.accent,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  ghost: { paddingVertical: 14, alignItems: 'center' },
  ghostText: { color: T.textSecondary, fontWeight: '700', fontSize: 15 },
  /** Bottom sheet host for react-native-modal (swipe down + keyboard avoidance). */
  rnModalRoot: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  modalGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: T.line,
    marginBottom: 12,
  },
  modalSheet: {
    backgroundColor: FC.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: Platform.OS === 'ios' ? '90%' : '92%',
    borderWidth: 1,
    borderColor: FC.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: T.text, marginBottom: 8 },
  modalScroll: {
    flexGrow: 0,
    maxHeight: Math.round(Dimensions.get('window').height * 0.52),
  },
  modalScrollContent: { paddingBottom: 8 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.line,
  },
});
