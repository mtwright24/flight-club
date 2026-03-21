import React from 'react';
import { View, ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../styles/theme';

interface RoomChipsProps {
  filters: Record<string, any>;
  onFilterChange: (filters: Record<string, any>) => void;
  onCreatePress: () => void;
}

const CHIP_OPTIONS = [
  { key: 'base', label: 'Base' },
  { key: 'fleet', label: 'Fleet' },
  { key: 'airline', label: 'Airline' },
  { key: 'private', label: 'Private' },
  { key: 'verified', label: 'Verified' },
];

export default function RoomChips({ filters, onFilterChange, onCreatePress }: RoomChipsProps) {
  const handleChipToggle = (key: string) => {
    const newFilters = { ...filters };
    if (key === 'base' || key === 'fleet' || key === 'airline') {
      // For now, just toggle. In a full app, would open picker.
      if (newFilters[key]) {
        delete newFilters[key];
      } else {
        newFilters[key] = key; // placeholder
      }
    } else if (key === 'private' || key === 'verified') {
      newFilters[key] = !newFilters[key];
    }
    onFilterChange(newFilters);
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        {CHIP_OPTIONS.map((option) => {
          const isActive = !!filters[option.key as keyof typeof filters];
          return (
            <Pressable
              key={option.key}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => handleChipToggle(option.key)}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}

        {/* Create Room chip */}
        <Pressable style={styles.chipCreate} onPress={onCreatePress}>
          <Ionicons name="add" size={16} color={colors.headerRed} />
          <Text style={styles.chipCreateText}>New</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.screenBg,
  },
  scroll: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginRight: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.headerRed,
    borderColor: colors.headerRed,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  chipTextActive: {
    color: colors.cardBg,
  },
  chipCreate: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginRight: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.cardBg,
    borderWidth: 1.5,
    borderColor: colors.headerRed,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chipCreateText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.headerRed,
  },
});
