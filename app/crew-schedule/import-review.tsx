import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleTheme as T } from '../../src/features/crew-schedule/scheduleTheme';
import CrewScheduleHeader from '../../src/features/crew-schedule/components/CrewScheduleHeader';

/**
 * Draft review — placeholder for parsed rows before saving to the canonical schedule store.
 */
export default function ImportReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const src = typeof source === 'string' ? source : source?.[0] ?? 'unknown';
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 600));
    setBusy(false);
    router.replace('/crew-schedule');
  };

  return (
    <View style={styles.shell}>
      <CrewScheduleHeader title="Review draft" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.tag}>Source: {src}</Text>
        <Text style={styles.body}>
          Parsed trips will appear here for edit and confirm. Connect OCR / PDF parser output to populate this list, then
          persist to Supabase or local schedule storage.
        </Text>

        <View style={styles.mockRow}>
          <Text style={styles.mockLabel}>Preview</Text>
          <Text style={styles.mock}>No parsed rows yet — pipeline stub.</Text>
        </View>

        {busy ? (
          <View style={styles.loading}>
            <ActivityIndicator color={T.accent} />
            <Text style={styles.loadingText}>Saving schedule…</Text>
          </View>
        ) : (
          <Pressable style={styles.confirm} onPress={confirm}>
            <Text style={styles.confirmText}>Confirm & save</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16 },
  tag: { fontSize: 12, fontWeight: '800', color: T.accent, marginBottom: 8 },
  body: { fontSize: 15, color: T.text, lineHeight: 22, marginBottom: 20 },
  mockRow: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
    borderStyle: 'dashed',
  },
  mockLabel: { fontSize: 12, fontWeight: '800', color: T.textSecondary, marginBottom: 6 },
  mock: { fontSize: 14, color: T.textSecondary },
  loading: { alignItems: 'center', marginTop: 24, gap: 8 },
  loadingText: { fontSize: 14, color: T.textSecondary },
  confirm: {
    marginTop: 24,
    backgroundColor: T.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
