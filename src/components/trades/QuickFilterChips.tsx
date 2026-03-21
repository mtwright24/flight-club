/**
 * QuickFilterChips Component
 * Horizontal scroll of quick-toggle filter options
 * Chips: Swap/Drop/Pickup, Today/Tomorrow, AM/PM/Overnight, Has $, Has 📷
 */

import React, { useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  ScrollView,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import type { TradeFilter } from '../../types/trades';

interface QuickFilterChip {
  id: string;
  label: string;
  icon?: string;
  category: 'type' | 'date' | 'daypart' | 'incentive' | 'screenshot';
  value: any;
}

interface QuickFilterChipsProps {
  filters: TradeFilter;
  onFilterChange: (filterUpdate: Partial<TradeFilter>) => void;
}

export const QuickFilterChips: React.FC<QuickFilterChipsProps> = ({
  filters,
  onFilterChange,
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = getStyles(isDark);

  // Define available chips
  const chips: QuickFilterChip[] = useMemo(
    () => [
      // Trade types
      { id: 'type-swap', label: 'Swap', category: 'type', value: 'swap' },
      { id: 'type-drop', label: 'Drop', category: 'type', value: 'drop' },
      { id: 'type-pickup', label: 'Pickup', category: 'type', value: 'pickup' },

      // Date ranges
      { id: 'date-today', label: 'Today', category: 'date', value: 'today' },
      { id: 'date-tomorrow', label: 'Tomorrow', category: 'date', value: 'tomorrow' },

      // Day parts
      { id: 'daypart-am', label: 'AM', category: 'daypart', value: 'AM' },
      { id: 'daypart-pm', label: 'PM', category: 'daypart', value: 'PM' },
      { id: 'daypart-overnight', label: 'Overnight', category: 'daypart', value: 'overnight' },

      // Special filters
      { id: 'incentive', label: '💰', category: 'incentive', value: true },
      { id: 'screenshot', label: '📷', category: 'screenshot', value: true },
    ],
    []
  );

  // Determine which chips are active
  const isChipActive = (chip: QuickFilterChip): boolean => {
    switch (chip.category) {
      case 'type':
        return filters.types?.includes(chip.value) ?? false;
      case 'date':
        return filters.date_range === chip.value;
      case 'daypart':
        return filters.day_parts?.includes(chip.value) ?? false;
      case 'incentive':
        return filters.has_incentive_only ?? false;
      case 'screenshot':
        return filters.has_screenshot_only ?? false;
      default:
        return false;
    }
  };

  // Handle chip press
  const handleChipPress = (chip: QuickFilterChip) => {
    switch (chip.category) {
      case 'type': {
        const currentTypes = filters.types || [];
        const updated = currentTypes.includes(chip.value)
          ? currentTypes.filter((t) => t !== chip.value)
          : [...currentTypes, chip.value];
        onFilterChange({
          types: updated.length > 0 ? updated : undefined,
        });
        break;
      }

      case 'date': {
        // Toggle: same chip = clear, different = set
        const newRange =
          filters.date_range === chip.value ? undefined : (chip.value as any);
        onFilterChange({ date_range: newRange });
        break;
      }

      case 'daypart': {
        const currentParts = filters.day_parts || [];
        const updated = currentParts.includes(chip.value)
          ? currentParts.filter((p) => p !== chip.value)
          : [...currentParts, chip.value];
        onFilterChange({
          day_parts: updated.length > 0 ? updated : undefined,
        });
        break;
      }

      case 'incentive': {
        onFilterChange({
          has_incentive_only: !filters.has_incentive_only,
        });
        break;
      }

      case 'screenshot': {
        onFilterChange({
          has_screenshot_only: !filters.has_screenshot_only,
        });
        break;
      }
    }
  };

  return (
    <View style={styles.scrollContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {chips.map((chip) => (
          <TouchableOpacity
            key={chip.id}
            style={[
              styles.chip,
              isChipActive(chip) && styles.chipActive,
            ]}
            onPress={() => handleChipPress(chip)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chipText,
                isChipActive(chip) && styles.chipTextActive,
              ]}
            >
              {chip.icon || chip.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

/**
 * Styles
 */

function getStyles(isDark: boolean) {
  return StyleSheet.create({
    scrollContainer: {
      backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#2A3A4A' : '#E5E5E5',
      paddingVertical: 8,
    },

    contentContainer: {
      paddingHorizontal: 16,
      alignItems: 'center',
    },

    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      height: 32,
      borderRadius: 16,
      marginRight: 8,
      backgroundColor: isDark ? '#2A2A2A' : '#F0F0F0',
      borderWidth: 1,
      borderColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
    },

    chipActive: {
      backgroundColor: '#DC3545',
      borderColor: '#DC3545',
    },

    chipText: {
      fontSize: 12,
      fontWeight: '500',
      color: isDark ? '#FFFFFF' : '#000000',
    },

    chipTextActive: {
      color: '#FFFFFF',
      fontWeight: '600',
    },
  });
}
