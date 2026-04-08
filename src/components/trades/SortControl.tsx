/**
 * SortControl Component
 * FLiCA-style dual sort picker
 * Sort1 (required) + Sort2 (optional)
 */

import React, { useState } from 'react';
import {
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { colors } from '../../styles/theme';
import type { TradeSort } from '../../types/trades';

interface SortOption {
  label: string;
  value: TradeSort['sort1_field'];
}

interface SortControlProps {
  sort: TradeSort;
  onSortChange: (newSort: TradeSort) => void;
}

const SORT_OPTIONS: SortOption[] = [
  { label: 'Pairing Date', value: 'pairing_date' },
  { label: 'Credit Minutes', value: 'credit_minutes' },
  { label: 'Incentive Amount', value: 'incentive_amount' },
  { label: 'Recently Posted', value: 'created_at' },
];

export const SortControl: React.FC<SortControlProps> = ({ sort, onSortChange }) => {
  const styles = getStyles();

  const [showSort1Menu, setShowSort1Menu] = useState(false);
  const [showSort2Menu, setShowSort2Menu] = useState(false);

  const sort1Label =
    SORT_OPTIONS.find((opt) => opt.value === sort.sort1_field)?.label ||
    'Pairing Date';

  const sort2Label = sort.sort2_field
    ? SORT_OPTIONS.find((opt) => opt.value === sort.sort2_field)?.label
    : 'None';

  const handleSort1Change = (value: TradeSort['sort1_field']) => {
    onSortChange({
      ...sort,
      sort1_field: value,
    });
    setShowSort1Menu(false);
  };

  const handleSort1DirectionToggle = () => {
    onSortChange({
      ...sort,
      sort1_direction: sort.sort1_direction === 'asc' ? 'desc' : 'asc',
    });
  };

  const handleSort2Change = (value: TradeSort['sort1_field'] | null) => {
    if (value === null) {
      onSortChange({
        ...sort,
        sort2_field: undefined,
        sort2_direction: undefined,
      });
    } else {
      onSortChange({
        ...sort,
        sort2_field: value,
        sort2_direction: 'asc',
      });
    }
    setShowSort2Menu(false);
  };

  const handleSort2DirectionToggle = () => {
    if (!sort.sort2_field) return;
    onSortChange({
      ...sort,
      sort2_direction: sort.sort2_direction === 'asc' ? 'desc' : 'asc',
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Sort</Text>
      </View>

      {/* Sort1 (Required) */}
      <View style={styles.sortSection}>
        <View style={styles.sortLabel}>
          <Text style={styles.sortLabelText}>Sort 1 (Required)</Text>
        </View>

        <View style={styles.sortRow}>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => setShowSort1Menu(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.sortButtonText}>{sort1Label}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.directionButton}
            onPress={handleSort1DirectionToggle}
            activeOpacity={0.7}
          >
            <Text style={styles.directionButtonText}>
              {sort.sort1_direction === 'asc' ? '↑ ASC' : '↓ DESC'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sort2 (Optional) */}
      <View style={styles.sortSection}>
        <View style={styles.sortLabel}>
          <Text style={styles.sortLabelText}>Sort 2 (Optional)</Text>
        </View>

        <View style={styles.sortRow}>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => setShowSort2Menu(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.sortButtonText}>{sort2Label}</Text>
          </TouchableOpacity>

          {sort.sort2_field && (
            <TouchableOpacity
              style={styles.directionButton}
              onPress={handleSort2DirectionToggle}
              activeOpacity={0.7}
            >
              <Text style={styles.directionButtonText}>
                {sort.sort2_direction === 'asc' ? '↑ ASC' : '↓ DESC'}
              </Text>
            </TouchableOpacity>
          )}

          {sort.sort2_field && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => handleSort2Change(null)}
            >
              <Text style={styles.clearButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Sort1 Menu Modal */}
      <Modal
        visible={showSort1Menu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSort1Menu(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowSort1Menu(false)}
        >
          <View style={[styles.modalContent, styles.modalMenu]}>
            <FlatList
              data={SORT_OPTIONS}
              keyExtractor={(item) => item.value}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.menuItem,
                    sort.sort1_field === item.value && styles.menuItemActive,
                  ]}
                  onPress={() => handleSort1Change(item.value)}
                >
                  <Text
                    style={[
                      styles.menuItemText,
                      sort.sort1_field === item.value && styles.menuItemTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </Pressable>
      </Modal>

      {/* Sort2 Menu Modal */}
      <Modal
        visible={showSort2Menu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSort2Menu(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowSort2Menu(false)}
        >
          <View style={[styles.modalContent, styles.modalMenu]}>
            <TouchableOpacity
              style={[
                styles.menuItem,
                !sort.sort2_field && styles.menuItemActive,
              ]}
              onPress={() => handleSort2Change(null)}
            >
              <Text
                style={[
                  styles.menuItemText,
                  !sort.sort2_field && styles.menuItemTextActive,
                ]}
              >
                None
              </Text>
            </TouchableOpacity>

            <FlatList
              data={SORT_OPTIONS}
              keyExtractor={(item) => item.value}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.menuItem,
                    sort.sort2_field === item.value && styles.menuItemActive,
                  ]}
                  onPress={() => handleSort2Change(item.value)}
                >
                  <Text
                    style={[
                      styles.menuItemText,
                      sort.sort2_field === item.value && styles.menuItemTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

/**
 * Styles
 */

function getStyles() {
  return StyleSheet.create({
    container: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor: '#E5E5E5',
    },

    header: {
      marginBottom: 12,
    },

    headerText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#000000',
    },

    sortSection: {
      marginBottom: 12,
    },

    sortLabel: {
      marginBottom: 6,
    },

    sortLabelText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#666666',
      textTransform: 'uppercase',
    },

    sortRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
    },

    sortButton: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: '#F0F0F0',
      borderWidth: 1,
      borderColor: '#E0E0E0',
    },

    sortButtonText: {
      fontSize: 12,
      fontWeight: '500',
      color: '#000000',
    },

    directionButton: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: colors.headerRed,
      borderWidth: 1,
      borderColor: colors.headerRed,
    },

    directionButtonText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#FFFFFF',
    },

    clearButton: {
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: '#FFE8E8',
    },

    clearButtonText: {
      fontSize: 12,
      color: colors.headerRed,
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },

    modalContent: {
      borderRadius: 12,
      backgroundColor: '#FFFFFF',
      paddingVertical: 8,
      minWidth: 200,
    },

    modalMenu: {
      maxHeight: 300,
    },

    menuItem: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#F0F0F0',
    },

    menuItemActive: {
      backgroundColor: '#F5F5F5',
    },

    menuItemText: {
      fontSize: 13,
      color: '#000000',
    },

    menuItemTextActive: {
      fontWeight: '600',
      color: colors.headerRed,
    },
  });
}
