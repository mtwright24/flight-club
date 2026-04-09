import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../styles/theme';

export default function PromoUpgradeCard({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Learn about Pro tools and bundles"
    >
      <View style={styles.iconBox}>
        <Ionicons name="layers-outline" size={24} color={colors.headerRed} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>More tools when your roster demands them</Text>
        <Text style={styles.sub}>
          Pro adds focused utilities—duty, language, contract help—without replacing the free tools you already rely on. Bundles group what commuters and frequent flyers use together.
        </Text>
      </View>
      <View style={styles.ctaPill}>
        <Text style={styles.ctaText}>{"See what's included"}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.96 },
  wrap: {
    flexDirection: 'column',
    marginHorizontal: 16,
    marginVertical: 20,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: '#E8E0DC',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  iconBox: {
    alignSelf: 'flex-start',
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(181, 22, 30, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  textCol: { width: '100%' },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 23,
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    lineHeight: 21,
  },
  ctaPill: {
    alignSelf: 'flex-start',
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(181, 22, 30, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(181, 22, 30, 0.2)',
  },
  ctaText: { fontSize: 13, fontWeight: '800', color: colors.headerRed },
});
