import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { scheduleTheme as T } from '../../../src/features/crew-schedule/scheduleTheme';

/**
 * Schedule-driven reminders — scaffold for report, layover, hotel, trade, chat alerts.
 */
export default function AlertsTabScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const id = typeof tripId === 'string' ? tripId : Array.isArray(tripId) ? tripId[0] : undefined;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Alerts</Text>
      <Text style={styles.body}>
        Report reminders, layover alerts, trade responses, and trip chat pings will consolidate here. Trip detail can
        pre-select a trip when creating an alert.
      </Text>
      {id ? (
        <View style={styles.pill}>
          <Text style={styles.pillLabel}>Trip context (stub)</Text>
          <Text style={styles.mono}>{id}</Text>
        </View>
      ) : null}
      <Pressable style={styles.btn} onPress={() => router.push('/notifications')}>
        <Text style={styles.btnText}>Open notifications center</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: '800', color: T.text, marginBottom: 8 },
  body: { fontSize: 14, color: T.textSecondary, lineHeight: 20, marginBottom: 16 },
  pill: {
    backgroundColor: T.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginBottom: 16,
  },
  pillLabel: { fontSize: 12, fontWeight: '700', color: T.textSecondary, marginBottom: 4 },
  mono: { fontSize: 13, color: T.text, fontWeight: '600' },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: T.surface,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
  },
  btnText: { color: T.accent, fontWeight: '800', fontSize: 14 },
});
