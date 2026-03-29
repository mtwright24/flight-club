import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { scheduleTheme as T } from '../../../src/features/crew-schedule/scheduleTheme';

/**
 * Trip-specific chat scaffold — deep-link with ?tripId= for future thread binding.
 */
export default function TripChatTabScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const id = typeof tripId === 'string' ? tripId : Array.isArray(tripId) ? tripId[0] : undefined;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Trip Chat</Text>
      <Text style={styles.body}>
        Trip-linked conversations will appear here. Schedule rows and trip detail can deep-link into this tab with a
        trip context.
      </Text>
      {id ? (
        <View style={styles.pill}>
          <Text style={styles.pillLabel}>Focused trip (stub)</Text>
          <Text style={styles.mono}>{id}</Text>
        </View>
      ) : (
        <Text style={styles.muted}>No trip selected. Open from a trip detail or schedule item.</Text>
      )}
      <Pressable style={styles.btn} onPress={() => router.push('/messages-inbox')}>
        <Text style={styles.btnText}>Open Messages inbox</Text>
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
  muted: { fontSize: 13, color: T.textSecondary, fontStyle: 'italic', marginBottom: 16 },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: T.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
