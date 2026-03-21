import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing } from '../styles/theme';

export default function SectionHeader({ title, onPress }: { title: string, onPress?: () => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {onPress && (
        <Pressable onPress={onPress} style={styles.actionBtn}>
          <Text style={styles.actionText}>View All {'>'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { color: colors.headerRed, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  actionBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  actionText: { color: colors.accentBlue, fontWeight: '700', fontSize: 13 },
});
