import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../styles/theme';
import type { CrewBundle } from './types';

const ACCENT: Record<CrewBundle['accent'], { bg: string; fg: string }> = {
  red: { bg: 'rgba(181, 22, 30, 0.1)', fg: colors.headerRed },
  navy: { bg: '#EEF2FF', fg: '#3730A3' },
  gold: { bg: 'rgba(180, 83, 9, 0.12)', fg: '#B45309' },
};

export default function BundleCard({
  bundle,
  onPress,
}: {
  bundle: CrewBundle;
  onPress: (b: CrewBundle) => void;
}) {
  const a = ACCENT[bundle.accent];
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => onPress(bundle)}
    >
      <View style={[styles.accentBar, { backgroundColor: a.bg }]} />
      <View style={styles.inner}>
        <View style={styles.top}>
          <View style={[styles.kicker, { backgroundColor: a.bg }]}>
            <Text style={[styles.kickerText, { color: a.fg }]}>BUNDLE</Text>
          </View>
          <Text style={styles.price}>{bundle.priceLabel}</Text>
        </View>
        <Text style={styles.title}>{bundle.title}</Text>
        <Text style={styles.blurb}>{bundle.blurb}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="apps-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.metaSpaced}>{bundle.toolCount} tools included</Text>
        </View>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>{bundle.cta === 'unlock' ? 'Unlock Bundle' : 'View Bundle'}</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.headerRed} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.94 },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  accentBar: { height: 4, width: '100%' },
  inner: { padding: spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  kicker: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  kickerText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  price: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  title: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  blurb: { fontSize: 14, color: colors.textSecondary, marginTop: 6, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  metaSpaced: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginLeft: 6 },
  cta: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(181, 22, 30, 0.06)',
    borderRadius: radius.md,
  },
  ctaText: { fontSize: 14, fontWeight: '800', color: colors.headerRed },
});
