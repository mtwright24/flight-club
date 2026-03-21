import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, shadow, spacing } from '../styles/theme';

export default function AwardCard({ name, airline }: { name: string, airline: string }) {
  return (
    <View style={styles.card}>
      <View style={styles.ribbon} />
      <View style={styles.avatar} />
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.airline}>{airline}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 110,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    alignItems: 'center',
    padding: spacing.md,
    marginRight: spacing.sm,
    ...shadow.cardShadow,
  },
  ribbon: {
    width: 40,
    height: 8,
    backgroundColor: colors.headerRed,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    marginBottom: 8,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accentBlue,
    marginBottom: 10,
  },
  name: { fontWeight: '700', color: colors.textPrimary, fontSize: 16 },
  airline: { fontSize: 13, color: colors.textSecondary },
});
