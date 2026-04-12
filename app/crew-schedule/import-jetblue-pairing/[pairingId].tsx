import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
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
  type SchedulePairingDutyRow,
  type SchedulePairingRow,
} from '../../../src/features/crew-schedule/jetblueFlicaImport';
import { confidenceBand } from '../../../src/features/crew-schedule/jetblueFlicaTemplate';
import { scheduleTheme as T } from '../../../src/features/crew-schedule/scheduleTheme';
import CrewScheduleHeader from '../../../src/features/crew-schedule/components/CrewScheduleHeader';

function useParams(): { pairingId?: string; importId?: string } {
  const p = useLocalSearchParams<{ pairingId?: string | string[]; importId?: string | string[] }>();
  const pairingId = typeof p.pairingId === 'string' ? p.pairingId : p.pairingId?.[0];
  const importId = typeof p.importId === 'string' ? p.importId : p.importId?.[0];
  return { pairingId, importId };
}

export default function ImportJetBluePairingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pairingId, importId } = useParams();

  const [loading, setLoading] = useState(true);
  const [pairing, setPairing] = useState<SchedulePairingRow | null>(null);
  const [duties, setDuties] = useState<SchedulePairingDutyRow[]>([]);

  const [pairingCode, setPairingCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [report, setReport] = useState('');
  const [base, setBase] = useState('');
  const [saving, setSaving] = useState(false);

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
      if (importId) {
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
  }, [pairingId, pairingCode, startDate, endDate, report, base, pairing?.pairing_id, importId, router]);

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

  const routeSummary = buildRouteSummaryFromDuties(duties);
  const laySummary = buildLayoverSummaryFromDuties(duties);
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
        <Text style={styles.summary}>Route: {routeSummary}</Text>
        <Text style={styles.summary}>Layovers: {laySummary}</Text>

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

        <Text style={styles.h2}>Duty rows ({duties.length})</Text>
        <Text style={styles.muted}>
          Leg-level editing and close-up screenshot attach ship in a follow-up; raw OCR lives on each row in the DB.
        </Text>
        {duties.slice(0, 12).map((d) => (
          <View key={d.id} style={styles.legCard}>
            <Text style={styles.legLine}>
              {d.duty_date ?? '—'} · {d.from_airport ?? '?'}→{d.to_airport ?? '?'}
            </Text>
            {d.layover_city ? <Text style={styles.legSub}>Layover {d.layover_city}</Text> : null}
            <Text style={styles.legRaw} numberOfLines={2}>
              {d.raw_text ?? ''}
            </Text>
          </View>
        ))}

        <Pressable style={[styles.btn, saving && styles.btnDisabled]} onPress={() => void onSave()} disabled={saving}>
          <Text style={styles.btnText}>{saving ? 'Saving…' : 'Save pairing'}</Text>
        </Pressable>
        <Pressable
          style={styles.ghost}
          onPress={() =>
            importId
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
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  err: { padding: 24, color: T.accent },
  badge: { fontSize: 13, fontWeight: '700', color: T.textSecondary, marginBottom: 8 },
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
  legCard: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.line,
    marginBottom: 8,
    backgroundColor: T.surface,
  },
  legLine: { fontSize: 14, fontWeight: '700', color: T.text },
  legSub: { fontSize: 12, color: T.textSecondary, marginTop: 4 },
  legRaw: { fontSize: 10, color: '#94A3B8', marginTop: 6, fontFamily: 'Menlo' },
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
});
