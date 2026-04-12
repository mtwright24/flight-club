import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchCandidatesForBatch,
  type ScheduleImportCandidateRow,
  updateImportCandidate,
} from '../../../src/features/crew-schedule/scheduleApi';
import { scheduleTheme as T } from '../../../src/features/crew-schedule/scheduleTheme';
import CrewScheduleHeader from '../../../src/features/crew-schedule/components/CrewScheduleHeader';

const fields: { key: keyof ScheduleImportCandidateRow; label: string }[] = [
  { key: 'date', label: 'Date (YYYY-MM-DD)' },
  { key: 'day_of_week', label: 'Day' },
  { key: 'pairing_code', label: 'Pairing' },
  { key: 'report_time', label: 'Report' },
  { key: 'city', label: 'City / route' },
  { key: 'd_end_time', label: 'Release / end' },
  { key: 'layover', label: 'Layover' },
  { key: 'wx', label: 'WX' },
  { key: 'status_code', label: 'Status' },
  { key: 'notes', label: 'Notes' },
];

function useBatchIdParam(): string | undefined {
  const { batchId } = useLocalSearchParams<{ batchId?: string | string[] }>();
  if (typeof batchId === 'string') return batchId;
  if (Array.isArray(batchId) && batchId[0]) return batchId[0];
  return undefined;
}

export default function ImportEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const batchId = useBatchIdParam();

  const [rows, setRows] = useState<ScheduleImportCandidateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!batchId) return;
    setLoading(true);
    try {
      const c = await fetchCandidatesForBatch(batchId);
      setRows(c);
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchLocal = (id: string, key: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [key]: value || null } : r))
    );
  };

  const saveRow = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    await updateImportCandidate(id, {
      date: row.date,
      day_of_week: row.day_of_week,
      pairing_code: row.pairing_code,
      report_time: row.report_time,
      city: row.city,
      d_end_time: row.d_end_time,
      layover: row.layover,
      wx: row.wx,
      status_code: row.status_code,
      notes: row.notes,
    });
  };

  if (!batchId) {
    return (
      <View style={styles.shell}>
        <CrewScheduleHeader title="Edit rows" />
        <Text style={styles.err}>Missing batch.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.shell}>
        <CrewScheduleHeader title="Edit rows" />
        <View style={styles.center}>
          <ActivityIndicator color={T.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <CrewScheduleHeader title="Edit before save" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.lead}>
          Adjust fields, then return to Review Imported Schedule to save or merge with your calendar.
        </Text>
        {rows.map((row) => (
          <View key={row.id} style={styles.card}>
            <Text style={styles.raw} numberOfLines={2}>
              {row.raw_row_text}
            </Text>
            {fields.map(({ key, label }) => (
              <View key={key} style={styles.field}>
                <Text style={styles.label}>{label}</Text>
                <TextInput
                  style={styles.input}
                  value={(row[key] as string) ?? ''}
                  onChangeText={(t) => patchLocal(row.id, key, t)}
                  onBlur={() => void saveRow(row.id)}
                  placeholder="—"
                  placeholderTextColor={T.textSecondary}
                />
              </View>
            ))}
          </View>
        ))}
        <Pressable style={styles.done} onPress={() => router.back()}>
          <Text style={styles.doneText}>Back to review</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  lead: { fontSize: 14, color: T.textSecondary, marginBottom: 16, lineHeight: 20 },
  card: {
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    backgroundColor: T.surface,
  },
  raw: { fontSize: 11, color: T.textSecondary, marginBottom: 10, fontStyle: 'italic' },
  field: { marginBottom: 10 },
  label: { fontSize: 11, fontWeight: '700', color: T.textSecondary, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: T.text,
    backgroundColor: '#fff',
  },
  done: {
    marginTop: 8,
    backgroundColor: T.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  err: { padding: 24, color: T.accent },
});
