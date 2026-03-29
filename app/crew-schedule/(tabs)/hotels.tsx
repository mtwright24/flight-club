import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { scheduleTheme as T } from '../../../src/features/crew-schedule/scheduleTheme';

/**
 * Layover hotels tied to trips — scaffold for van notes, address, food, safety.
 */
export default function HotelsTabScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const id = typeof tripId === 'string' ? tripId : Array.isArray(tripId) ? tripId[0] : undefined;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Hotels</Text>
      <Text style={styles.body}>
        Upcoming layover hotels from your schedule will list here. Trip detail can jump to hotel context for a specific
        pairing.
      </Text>
      {id ? (
        <View style={styles.pill}>
          <Text style={styles.pillLabel}>Trip context (stub)</Text>
          <Text style={styles.mono}>{id}</Text>
        </View>
      ) : (
        <Text style={styles.muted}>Import a schedule or select a trip to see layover hotels.</Text>
      )}
      <Pressable style={styles.link} onPress={() => router.push('/(screens)/crashpads')}>
        <Text style={styles.linkText}>Browse crashpads & housing (separate module)</Text>
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
    marginBottom: 12,
  },
  pillLabel: { fontSize: 12, fontWeight: '700', color: T.textSecondary, marginBottom: 4 },
  mono: { fontSize: 13, color: T.text, fontWeight: '600' },
  muted: { fontSize: 13, color: T.textSecondary, fontStyle: 'italic', marginBottom: 12 },
  link: { paddingVertical: 8 },
  linkText: { fontSize: 14, fontWeight: '700', color: T.accent },
});
