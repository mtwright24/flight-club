import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../../../../src/components/FlightClubHeader';
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
      setRouteLabel(`${r.airline_code} ${r.from_airport}→${r.to_airport} · ${r.travel_date}`);
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
          <Text style={styles.sub}>{routeLabel}</Text>
          <Text style={styles.meta}>{answers.length} recorded answer{answers.length === 1 ? '' : 's'} (newest first)</Text>
          {answers.length === 0 ? (
            <Text style={styles.muted}>No loads answers yet.</Text>
          ) : (
            answers.map((a) => (
              <View key={a.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.badge}>{a.is_latest ? 'Latest' : 'Earlier'}</Text>
                  <Text style={styles.when}>{new Date(a.as_of || a.created_at).toLocaleString()}</Text>
                </View>
                <Text style={styles.by}>
                  {a.responder?.display_name || 'Crew'} · {a.load_level} · {a.answer_source || 'community'}
                </Text>
                <Text style={styles.line}>
                  Open seats (total): <Text style={styles.val}>{a.open_seats_total ?? '—'}</Text>
                </Text>
                {staffLoadsCabinEntries(a.open_seats_by_cabin as Record<string, unknown>).length ? (
                  <View style={styles.block}>
                    <Text style={styles.blockHead}>Open by cabin</Text>
                    {staffLoadsCabinEntries(a.open_seats_by_cabin as Record<string, unknown>).map((c) => (
                      <Text key={`o-${a.id}-${c.key}`} style={styles.lineSm}>
                        {c.key}: {c.value}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <Text style={styles.line}>
                  Listed non-rev (total): <Text style={styles.val}>{a.nonrev_listed_total ?? '—'}</Text>
                </Text>
                {staffLoadsCabinEntries(a.nonrev_by_cabin as Record<string, unknown>).length ? (
                  <View style={styles.block}>
                    <Text style={styles.blockHead}>Non-rev by cabin</Text>
                    {staffLoadsCabinEntries(a.nonrev_by_cabin as Record<string, unknown>).map((c) => (
                      <Text key={`n-${a.id}-${c.key}`} style={styles.lineSm}>
                        {c.key}: {c.value}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {a.notes ? <Text style={styles.notes}>{a.notes}</Text> : null}
              </View>
            ))
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
  sub: { fontWeight: '900', fontSize: 16, color: '#0f172a' },
  meta: { color: '#64748b', fontWeight: '600', marginTop: 4, marginBottom: 14 },
  muted: { color: '#64748b', fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  badge: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.headerRed,
    backgroundColor: 'rgba(181,22,30,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  when: { fontSize: 12, color: '#64748b', fontWeight: '700' },
  by: { fontSize: 13, color: '#334155', fontWeight: '700', marginBottom: 8 },
  line: { fontSize: 14, color: '#334155', marginBottom: 4, fontWeight: '600' },
  lineSm: { fontSize: 13, color: '#475569', marginBottom: 2 },
  val: { fontWeight: '900', color: '#0f172a' },
  block: { marginTop: 6, marginBottom: 4 },
  blockHead: { fontSize: 11, fontWeight: '800', color: '#94a3b8', marginBottom: 4 },
  notes: { marginTop: 10, color: '#0f172a', lineHeight: 20 },
});
