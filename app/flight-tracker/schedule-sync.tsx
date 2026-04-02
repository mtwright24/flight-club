import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../src/styles/theme';

export default function ScheduleSyncScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Schedule Sync</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Crew Schedule live enrichment</Text>
        <Text style={styles.body}>
          Flight Tracker now exposes schedule-segment enrichment hooks so Crew Schedule can read unified operational status, delays, and ETAs from the shared cached flight layer.
        </Text>
        <Pressable style={styles.cta} onPress={() => router.push('/crew-schedule')}>
          <Text style={styles.ctaText}>Open Crew Schedule</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: { backgroundColor: colors.headerRed, paddingHorizontal: spacing.md, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  content: { padding: spacing.md },
  title: { color: colors.textPrimary, fontWeight: '800', fontSize: 16, marginBottom: 6 },
  body: { color: colors.textSecondary, fontWeight: '600', fontSize: 13, lineHeight: 19 },
  cta: { marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9, alignSelf: 'flex-start' },
  ctaText: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
});
