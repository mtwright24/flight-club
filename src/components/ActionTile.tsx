import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../styles/theme';

export default function ActionTile({ icon, label, onPress }: { icon: React.ReactNode, label: string, onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <View style={styles.iconWrap}>{icon}</View>
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 98,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    margin: spacing.xs,
    ...shadow.tileShadow,
    padding: spacing.md,
  },
  iconWrap: { marginBottom: 8 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 16,
  },
});
