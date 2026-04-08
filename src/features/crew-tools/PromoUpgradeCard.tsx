import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../styles/theme';

export default function PromoUpgradeCard({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.iconBox}>
        <Ionicons name="ribbon-outline" size={26} color="#B45309" />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>Use Crew Tools to the fullest</Text>
        <Text style={styles.sub}>Upgrade to access Pro tools & curated bundles.</Text>
      </View>
      <View style={styles.ctaPill}>
        <Text style={styles.ctaText}>Unlock</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.95 },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 20,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  iconBox: {
    marginRight: 12,
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  ctaPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(180, 83, 9, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(180, 83, 9, 0.35)',
  },
  ctaText: { fontSize: 13, fontWeight: '800', color: '#B45309' },
});
