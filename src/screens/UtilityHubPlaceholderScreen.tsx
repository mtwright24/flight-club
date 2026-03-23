import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING } from '../styles/theme';

/**
 * Home Row 1 "Utility Hub" destination — placeholder until product scope is defined.
 * Intentionally not the same surface as the Crew Tools tab (separate pillar).
 */
export default function UtilityHubPlaceholderScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Utility Hub</Text>
        <Text style={styles.lead}>
          This space is reserved for future utilities. It is separate from the{' '}
          <Text style={styles.em}>Crew Tools</Text> tab, where the full tools ecosystem will live.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={() => router.push('/(tabs)/crew-tools')}
          accessibilityRole="button"
          accessibilityLabel="Open Crew Tools tab"
        >
          <Text style={styles.ctaText}>Open Crew Tools</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.navy,
    marginBottom: SPACING.md,
  },
  lead: {
    fontSize: 16,
    color: COLORS.navySoft,
    lineHeight: 24,
    marginBottom: SPACING.lg,
  },
  em: { fontWeight: '700', color: COLORS.navy },
  cta: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.red,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  ctaPressed: { opacity: 0.9 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
