import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../styles/theme';
import { Ionicons } from '@expo/vector-icons';

export default function ActivityPill({ icon, text }: { icon: React.ReactNode, text: string }) {
  return (
    <View style={styles.pill}>
      <View style={styles.iconWrap}>{icon}</View>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.pillBg,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: { marginRight: 8 },
  text: { color: colors.textPrimary, fontWeight: '600', fontSize: 13 },
});
