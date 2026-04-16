import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../../../../src/components/FlightClubHeader';
import {
  STAFF_LOADS_VISUAL,
  StaffChip,
  StaffLoadsCardShell,
  loadLevelChipColors,
  loadLevelHeadline,
  loadLevelStripColor,
  normalizeStaffLoadLevel,
} from '../../../../src/components/loads/StaffLoadsRequestPresentation';
import { getStaffLoadRequestDetail, staffLoadsCabinEntries, type StaffAnswerRow } from '../../../../src/lib/supabase/staffLoads';
import { colors } from '../../../../src/styles/theme';

export default function StaffLoadLoadsHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [answers, setAnswers] = useState<StaffAnswerRow[]>([]);
  const [routeLabel, setRouteLabel] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const d = await getStaffLoadRequestDetail(id);
    setAnswers(d.answers || []);
    const r = d.request;
    if (r) {
      setRouteLabel(`${r.airline_code} ${r.flight_number || '—'} · ${r.from_airport} → ${r.to_airport}`);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlightClubHeader title="Loads history" showLogo={false} />
      <Pressable style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
        <Ionicons name="chevron-back" size={22} color={colors.headerRed} />
        <Text style={styles.backTx}>Back to request</Text>
      </Pressable>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.headerRed} />
      ) : (
        <ScrollView contentContainerStyle={styles.pad}>
          <Text style={styles.routeTitle}>{routeLabel}</Text>
          <Text style={styles.meta}>{answers.length} snapshot{answers.length === 1 ? '' : 's'} · newest first</Text>
          {answers.length === 0 ? (
            <Text style={styles.muted}>No loads answers yet.</Text>
          ) : (
            answers.map((a) => {
              const kind = normalizeStaffLoadLevel(a.load_level);
              const strip = loadLevelStripColor(kind);
              const chips = loadLevelChipColors(kind);
              const hl = loadLevelHeadline(kind);
              return (
                <StaffLoadsCardShell key={a.id} accentColor={strip} style={styles.answerCard}>
                  <View style={styles.answerTop}>
                    <StaffChip
                      label={a.is_latest ? 'Latest' : 'Earlier'}
                      backgroundColor={a.is_latest ? STAFF_LOADS_VISUAL.chip.bgAnswered : STAFF_LOADS_VISUAL.chip.bgStale}
                      color={a.is_latest ? STAFF_LOADS_VISUAL.chip.fgAnswered : STAFF_LOADS_VISUAL.chip.fgStale}
                    />
                    <Text style={styles.when}>{new Date(a.as_of || a.created_at).toLocaleString()}</Text>
                  </View>
                  <View style={styles.answerHeadlineRow}>
                    <Text style={styles.answerHeadline}>{hl}</Text>
                    <StaffChip label={a.load_level} backgroundColor={chips.bg} color={chips.fg} size="md" />
                  </View>
                  <Text style={styles.byLine}>
                    {a.responder?.display_name || 'Crew'} · {a.answer_source || 'community'}
                  </Text>
                  <View style={styles.statGrid}>
                    <View style={styles.statCell}>
                      <Text style={styles.statLab}>Open seats</Text>
                      <Text style={styles.statNum}>{a.open_seats_total ?? '—'}</Text>
                    </View>
                    <View style={styles.statCell}>
                      <Text style={styles.statLab}>Listed non-rev</Text>
                      <Text style={styles.statNum}>{a.nonrev_listed_total ?? '—'}</Text>
                    </View>
                  </View>
                  {staffLoadsCabinEntries(a.open_seats_by_cabin as Record<string, unknown>).length ? (
                    <View style={styles.cabinBlock}>
                      <Text style={styles.cabinTitle}>Open by cabin</Text>
                      <View style={styles.cabinWrap}>
                        {staffLoadsCabinEntries(a.open_seats_by_cabin as Record<string, unknown>).map((c) => (
                          <View key={`o-${a.id}-${c.key}`} style={styles.cabinChip}>
                            <Text style={styles.cabinKey}>{c.key}</Text>
                            <Text style={styles.cabinVal}>{c.value}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {staffLoadsCabinEntries(a.nonrev_by_cabin as Record<string, unknown>).length ? (
                    <View style={styles.cabinBlock}>
                      <Text style={styles.cabinTitle}>Non-rev by cabin</Text>
                      <View style={styles.cabinWrap}>
                        {staffLoadsCabinEntries(a.nonrev_by_cabin as Record<string, unknown>).map((c) => (
                          <View key={`n-${a.id}-${c.key}`} style={styles.cabinChip}>
                            <Text style={styles.cabinKey}>{c.key}</Text>
                            <Text style={styles.cabinVal}>{c.value}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {a.notes ? <Text style={styles.notes}>{a.notes}</Text> : null}
                </StaffLoadsCardShell>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 8 },
  backTx: { color: colors.headerRed, fontWeight: '800', fontSize: 15 },
  pad: { padding: 16, paddingBottom: 40 },
  routeTitle: { fontWeight: '900', fontSize: 17, color: '#0f172a', letterSpacing: -0.2 },
  meta: { color: '#94a3b8', fontWeight: '700', fontSize: 12, marginTop: 6, marginBottom: 14 },
  muted: { color: '#64748b', fontWeight: '600' },
  answerCard: { marginBottom: 12 },
  answerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  when: { fontSize: 11, color: '#94a3b8', fontWeight: '700' },
  answerHeadlineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  answerHeadline: { fontSize: 22, fontWeight: '900', color: '#0f172a', letterSpacing: -0.4 },
  byLine: { fontSize: 12, color: '#64748b', fontWeight: '700', marginBottom: 10 },
  statGrid: { flexDirection: 'row', gap: 8 },
  statCell: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  statLab: { fontSize: 10, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 },
  statNum: { fontSize: 18, fontWeight: '900', color: '#0f172a', marginTop: 2 },
  cabinBlock: { marginTop: 12 },
  cabinTitle: { fontSize: 11, fontWeight: '800', color: '#64748b', marginBottom: 6 },
  cabinWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cabinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  cabinKey: { fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'capitalize' },
  cabinVal: { fontSize: 13, fontWeight: '900', color: '#0f172a' },
  notes: { marginTop: 12, color: '#334155', lineHeight: 20, fontSize: 14, fontWeight: '600' },
});
