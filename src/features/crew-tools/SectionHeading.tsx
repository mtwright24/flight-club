import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../styles/theme';

type Props = {
  title: string;
  onSeeAll?: () => void;
};

export default function SectionHeading({ title, onSeeAll }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} hitSlop={8} style={({ pressed }) => [styles.seeAllRow, pressed && styles.pressed]}>
          <Text style={styles.seeAll}>See all</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  seeAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAll: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  pressed: { opacity: 0.7 },
});
