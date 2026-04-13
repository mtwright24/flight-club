import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
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
import { confidenceBand } from '../../../src/features/crew-schedule/jetblueFlicaTemplate';
import { scheduleTheme as T } from '../../../src/features/crew-schedule/scheduleTheme';
import CrewScheduleHeader from '../../../src/features/crew-schedule/components/CrewScheduleHeader';

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

function hhmmToBlockNumeric(hhmm: string): number | null {
  const t = hhmm.trim();
  if (!/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h + m / 60;
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
    setLegLayover(d.layover_city ?? '');
    setLegRelease(d.release_time_local ?? '');
    setLegRaw(d.raw_text ?? '');
  }, []);

  const saveLeg = useCallback(async () => {
    if (!legModal) return;
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
  ]);

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

  const onSave = useCallback(async () => {
    if (!pairingId) return;
    setSaving(true);
    try {
      await updateSchedulePairing(pairingId, {
        pairing_id: pairingCode.trim() || pairing?.pairing_id,
        operate_start_date: startDate.trim() || null,
        operate_end_date: endDate.trim() || null,
        report_time_local: report.trim() || null,
        base_code: base.trim() || null,
        needs_review: false,
        pairing_confidence: 0.9,
      });
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
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [pairingId, pairingCode, startDate, endDate, report, base, pairing?.pairing_id, importId, batchId, router]);

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
        <CrewScheduleHeader title="Pairing detail" />
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
  const laySummary =
    (nj?.layoverStations?.length ? nj.layoverStations.join(', ') : null) ?? buildLayoverSummaryFromDuties(duties);
  const band = confidenceBand(pairing?.pairing_confidence ?? null);

  return (
    <View style={styles.shell}>
      <CrewScheduleHeader title="Edit pairing" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.badge}>
          Confidence: {pairing?.pairing_confidence != null ? `${Math.round(pairing.pairing_confidence * 100)}%` : '—'}{' '}
          ({band})
        </Text>

        <Text style={styles.kv}>
          <Text style={styles.kvLabel}>Pairing </Text>
          <Text style={styles.kvVal}>{pairingCode || '—'}</Text>
        </Text>
        <Text style={styles.kv}>
          <Text style={styles.kvLabel}>Operate </Text>
          <Text style={styles.kvVal}>
            {startDate || '—'} → {endDate || '—'}
          </Text>
        </Text>
        <Text style={styles.kv}>
          <Text style={styles.kvLabel}>Report </Text>
          <Text style={styles.kvVal}>{report || '—'}</Text>
        </Text>
        <Text style={styles.kv}>
          <Text style={styles.kvLabel}>Base </Text>
          <Text style={styles.kvVal}>{base || '—'}</Text>
        </Text>
        <Text style={styles.summary}>Route: {routeSummary}</Text>
        <Text style={styles.summary}>Layovers: {laySummary}</Text>
        <Text style={styles.h2}>Duty days & legs ({duties.length})</Text>
        <Text style={styles.muted}>
          Each flight is tappable. D-END / layover / rest apply to the duty day (shown on the last leg of that day). Raw OCR
          is for reference — no new screenshot is required to edit.
        </Text>

        {dutyGroups.map(([dateKey, rows]) => {
          const last = rows[rows.length - 1];
          const ddmeta = last?.duty_day;
          const dEnd = last?.release_time_local ?? (ddmeta?.d_end_local as string | undefined) ?? null;
          const rept = (ddmeta?.next_report_local as string | undefined) ?? null;
          const layCity = last?.layover_city ?? (ddmeta?.layover_city_code as string | undefined) ?? null;
          const layRest = last?.layover_rest_display ?? (ddmeta?.layover_rest_display as string | undefined) ?? null;
          return (
            <View key={dateKey} style={styles.dutyBundle}>
              <Text style={styles.dutyDayLabel}>Duty day · {dateKey}</Text>
              {dEnd || rept ? (
                <Text style={styles.dutyDayMeta}>
                  {[dEnd ? `D-END ${dEnd}` : null, rept ? `REPT ${rept}` : null].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              {layCity || layRest ? (
                <Text style={styles.dutyDayMeta}>
                  Layover {layCity ?? '—'}
                  {layRest ? ` · Rest ${layRest}` : ''}
                </Text>
              ) : null}
              {rows.map((d) => (
                <Pressable key={d.id} style={styles.legCard} onPress={() => openLeg(d)}>
                  <Text style={styles.legLine}>
                    Flt {d.flight_number ?? '—'} · {d.from_airport ?? '?'}→{d.to_airport ?? '?'}
                  </Text>
                  <Text style={styles.legSub}>
                    {d.departure_time_local ?? '—'} / {d.arrival_time_local ?? '—'}
                    {d.block_time_local ? ` · BLK ${d.block_time_local}` : ''}
                    {d.equipment_code ? ` · Eqp ${d.equipment_code}` : ''}
                  </Text>
                  {d.layover_city ? <Text style={styles.legSub}>Layover city {d.layover_city}</Text> : null}
                  {d.is_deadhead ? <Text style={styles.legSubDh}>Deadhead</Text> : null}
                </Pressable>
              ))}
            </View>
          );
        })}

        <Text style={styles.h2}>Pairing fields</Text>
        <Text style={styles.label}>Pairing ID</Text>
        <TextInput value={pairingCode} onChangeText={setPairingCode} style={styles.input} placeholder="J1107" />

        <Text style={styles.label}>Operate start (YYYY-MM-DD)</Text>
        <TextInput value={startDate} onChangeText={setStartDate} style={styles.input} placeholder="2026-04-03" />

        <Text style={styles.label}>Operate end (YYYY-MM-DD)</Text>
        <TextInput value={endDate} onChangeText={setEndDate} style={styles.input} />

        <Text style={styles.label}>Report time (local)</Text>
        <TextInput value={report} onChangeText={setReport} style={styles.input} placeholder="HHMM" />

        <Text style={styles.label}>Base</Text>
        <TextInput value={base} onChangeText={setBase} style={styles.input} placeholder="BOS" />

        <Pressable style={[styles.btn, saving && styles.btnDisabled]} onPress={() => void onSave()} disabled={saving}>
          <Text style={styles.btnText}>{saving ? 'Saving…' : 'Save pairing'}</Text>
        </Pressable>
        <Pressable
          style={styles.ghost}
          onPress={() =>
            batchId
              ? router.replace({
                  pathname: '/crew-schedule/import-review/[batchId]',
                  params: { batchId },
                })
              : importId
                ? router.replace({
                    pathname: '/crew-schedule/import-jetblue-review/[importId]',
                    params: { importId },
                  })
                : router.back()
          }
        >
          <Text style={styles.ghostText}>Cancel</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={legModal != null} transparent animationType="slide" onRequestClose={() => setLegModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Edit leg</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScroll}>
              <Text style={styles.label}>Duty date (YYYY-MM-DD)</Text>
              <TextInput value={legDutyDate} onChangeText={setLegDutyDate} style={styles.input} />
              <Text style={styles.label}>Flight number</Text>
              <TextInput value={legFlight} onChangeText={setLegFlight} style={styles.input} />
              <Text style={styles.label}>From / To (IATA)</Text>
              <View style={styles.row2}>
                <TextInput value={legFrom} onChangeText={setLegFrom} style={[styles.input, styles.half]} placeholder="JFK" />
                <TextInput value={legTo} onChangeText={setLegTo} style={[styles.input, styles.half]} placeholder="LAX" />
              </View>
              <Text style={styles.label}>Depart / Arrive local (HH:MM)</Text>
              <View style={styles.row2}>
                <TextInput value={legDep} onChangeText={setLegDep} style={[styles.input, styles.half]} placeholder="10:30" />
                <TextInput value={legArr} onChangeText={setLegArr} style={[styles.input, styles.half]} placeholder="15:36" />
              </View>
              <Text style={styles.label}>Block (HH:MM)</Text>
              <TextInput value={legBlock} onChangeText={setLegBlock} style={styles.input} placeholder="06:26" />
              <View style={styles.switchRow}>
                <Text style={styles.label}>Deadhead</Text>
                <Switch value={legDh} onValueChange={setLegDh} />
              </View>
              <Text style={styles.label}>Layover city</Text>
              <TextInput value={legLayover} onChangeText={setLegLayover} style={styles.input} />
              <Text style={styles.label}>Release / D-end</Text>
              <TextInput value={legRelease} onChangeText={setLegRelease} style={styles.input} />
              <Text style={styles.label}>Raw OCR (reference)</Text>
              <TextInput
                value={legRaw}
                onChangeText={setLegRaw}
                style={[styles.input, styles.rawInput]}
                multiline
              />
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.ghost} onPress={() => setLegModal(null)}>
                <Text style={styles.ghostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, legSaving && styles.btnDisabled]}
                onPress={() => void saveLeg()}
                disabled={legSaving}
              >
                <Text style={styles.btnText}>{legSaving ? 'Saving…' : 'Save leg'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  err: { padding: 24, color: T.accent },
  badge: { fontSize: 13, fontWeight: '700', color: T.textSecondary, marginBottom: 8 },
  kv: { fontSize: 14, color: T.text, marginBottom: 4 },
  kvLabel: { fontWeight: '700', color: T.textSecondary },
  kvVal: { fontWeight: '600', color: T.text },
  summary: { fontSize: 14, color: T.text, marginBottom: 6, lineHeight: 20 },
  h2: { fontSize: 15, fontWeight: '800', color: T.text, marginTop: 16, marginBottom: 6 },
  muted: { fontSize: 12, color: T.textSecondary, marginBottom: 10, lineHeight: 17 },
  label: { fontSize: 11, fontWeight: '800', color: T.textSecondary, marginTop: 10, marginBottom: 4 },
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
  legCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    marginBottom: 10,
    backgroundColor: T.surface,
  },
  legLine: { fontSize: 14, fontWeight: '700', color: T.text },
  legSub: { fontSize: 12, color: T.textSecondary, marginTop: 4 },
  legSubDh: { fontSize: 11, fontWeight: '700', color: '#92400E', marginTop: 4 },
  dutyBundle: { marginBottom: 16 },
  dutyDayLabel: { fontSize: 13, fontWeight: '800', color: T.text, marginBottom: 6 },
  dutyDayMeta: { fontSize: 12, color: T.textSecondary, marginBottom: 8, lineHeight: 17 },
  btn: {
    marginTop: 20,
    backgroundColor: T.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  ghost: { paddingVertical: 14, alignItems: 'center' },
  ghostText: { color: T.textSecondary, fontWeight: '700', fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: T.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    maxHeight: '92%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: T.text, marginBottom: 8 },
  modalScroll: { maxHeight: 480 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
});
