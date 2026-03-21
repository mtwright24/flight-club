/**
 * CrewExchangeScreen
 * Main tradeboard feed with board selection, filters, sorting, and trades
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  useColorScheme,
  FlatList,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useTradeBoards, useTradeBoard, useTradeFilter, useTradeSort } from '../hooks/useTradeBoard';
import type { TradeBoard, TradePost, TradeSort, TradeType, TradeFilter } from '../types/trades';
import { Ionicons } from '@expo/vector-icons';

// Components
import AppHeader from '../components/AppHeader';
import { TradeRow } from '../components/trades/TradeRow';
import { AdvancedFilterSheet } from '../components/trades/AdvancedFilterSheet';
import { SortControl } from '../components/trades/SortControl';

export const CrewExchangeScreen: React.FC = () => {
  const router = useRouter();
  const { session } = useAuth();
  // Use the same color scheme logic as the rest of the app for consistency
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = getStyles(isDark);

  // Data hooks
  const { boards, loading: boardsLoading } = useTradeBoards();
  const [selectedBoard, setSelectedBoard] = useState<TradeBoard | null>(null);
  const { posts, loading: postsLoading } = useTradeBoard(selectedBoard);

  // Filter, sort, and display
  const { filters, updateFilters, clearFilters, filteredPosts } = useTradeFilter(posts);
  const { sort, updateSort, sortedPosts } = useTradeSort(filteredPosts);

  // UI state
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [interestedMap, setInterestedMap] = useState<Record<string, boolean>>({});
  const [interestDelta, setInterestDelta] = useState<Record<string, number>>({});

  type QuickChip =
    | { id: 'all'; label: string; category: 'all' }
    | { id: string; label: string; category: 'type'; value: TradeType }
    | { id: string; label: string; category: 'date'; value: TradeFilter['date_range'] }
    | { id: string; label: string; category: 'incentive' | 'screenshot' };

  // Quick filter chips
  const quickFilterChips: QuickChip[] = [
    { id: 'all', label: 'All', category: 'all' },
    { id: 'swap', label: 'Swap', category: 'type', value: 'swap' },
    { id: 'drop', label: 'Drop', category: 'type', value: 'drop' },
    { id: 'pickup', label: 'Pickup', category: 'type', value: 'pickup' },
    { id: 'today', label: 'Today', category: 'date', value: 'today' },
    { id: 'tomorrow', label: 'Tomorrow', category: 'date', value: 'tomorrow' },
    { id: 'weekend', label: 'Weekend', category: 'date', value: 'weekend' },
    { id: 'offers', label: '$ Offers', category: 'incentive' },
    { id: 'screenshot', label: 'Screenshot', category: 'screenshot' },
  ];

  // Set default board on load
  useEffect(() => {
    if (!selectedBoard && boards.length > 0) {
      setSelectedBoard(boards[0]);
    }
  }, [boards, selectedBoard]);

  // Check profile completion on mount
  useEffect(() => {
    const user = session?.user;
    if (user && !user.user_metadata?.['profile_complete']) {
      // Could show modal or navigate to profile completion
    }
  }, [session?.user]);

  const handlePostPress = (trade: TradePost) => {
    router.push({
      pathname: '/crew-exchange/[id]',
      params: { id: trade.id },
    });
  };

  const handlePostTradePress = () => {
    if (!selectedBoard) {
      Alert.alert('Select a board', 'Please select a tradeboard first.');
      return;
    }
    router.push({
      pathname: '/crew-exchange/create-post',
      params: { boardId: selectedBoard?.id },
    });
  };

  const handleTradeInterest = (trade: TradePost) => {
    const current = interestedMap[trade.id] ?? trade.user_interested ?? false;
    const next = !current;
    setInterestedMap((prev) => ({ ...prev, [trade.id]: next }));
    setInterestDelta((prev) => {
      const base = prev[trade.id] || 0;
      const delta = next ? 1 : -1;
      return { ...prev, [trade.id]: base + delta };
    });
  };

  const displayPosts = useMemo(() => {
    return sortedPosts.map((post) => {
      const delta = interestDelta[post.id] || 0;
      const interestCount = Math.max(0, (post.interest_count || 0) + delta);
      const userInterested = interestedMap[post.id] ?? post.user_interested;
      return {
        ...post,
        interest_count: interestCount,
        user_interested: userInterested,
      };
    });
  }, [sortedPosts, interestDelta, interestedMap]);

  const isChipActive = (chipId: string): boolean => {
    if (chipId === 'all') {
      return !filters.types && !filters.date_range && !filters.has_incentive_only && !filters.has_screenshot_only;
    }
    const chip = quickFilterChips.find((c) => c.id === chipId);
    if (!chip) return false;

    switch (chip.category) {
      case 'type':
        return filters.types?.includes(chip.value) ?? false;
      case 'date':
        return filters.date_range === chip.value;
      case 'incentive':
        return filters.has_incentive_only ?? false;
      case 'screenshot':
        return filters.has_screenshot_only ?? false;
      default:
        return false;
    }
  };

  const handleChipPress = (chipId: string) => {
    if (chipId === 'all') {
      clearFilters();
      return;
    }

    const chip = quickFilterChips.find((c) => c.id === chipId);
    if (!chip) return;

    switch (chip.category) {
      case 'type': {
        const currentTypes = filters.types || [];
        const updated = currentTypes.includes(chip.value)
          ? currentTypes.filter((t) => t !== chip.value)
          : [...currentTypes, chip.value];
        updateFilters({
          types: updated.length > 0 ? updated : undefined,
        });
        break;
      }
      case 'date': {
        const newRange = filters.date_range === chip.value ? undefined : (chip.value as any);
        updateFilters({ date_range: newRange });
        break;
      }
      case 'incentive': {
        updateFilters({ has_incentive_only: !filters.has_incentive_only });
        break;
      }
      case 'screenshot': {
        updateFilters({ has_screenshot_only: !filters.has_screenshot_only });
        break;
      }
    }
  };

  // Loading state
  if (boardsLoading) {
    return (
      <View style={styles.container}>
        <AppHeader title="Crew Exchange" showLogo={false} />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#DC3545" />
          <Text style={styles.loadingText}>Loading tradeboards...</Text>
        </View>
      </View>
    );
  }

  // No boards available
  if (!selectedBoard || boards.length === 0) {
    return (
      <View style={styles.container}>
        <AppHeader title="Crew Exchange" showLogo={false} />
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>
            No tradeboards available for your profile
          </Text>
          <Text style={styles.emptySubtext}>
            Please ensure your airline, base, and role are set
          </Text>
        </View>
      </View>
    );
  }

  const roleSingular = selectedBoard.role === 'Flight Attendant' ? 'Flight Attendant' : selectedBoard.role;
  const rolePlural = selectedBoard.role === 'Flight Attendant'
    ? 'Flight Attendants'
    : selectedBoard.role.endsWith('s')
      ? selectedBoard.role
      : `${selectedBoard.role}s`;

  return (
    <View style={styles.container}>
      {/* Permanent Red Header */}
      <AppHeader title="Crew Exchange" showLogo={false} />

      {/* Sticky Controls Area */}
      <View style={styles.stickyControls}>
        {/* Board Identity */}
        <View style={styles.boardIdentityCard}>
          <Text style={styles.boardIdentityTitle}>
            {selectedBoard.airline} {roleSingular} Tradeboard
          </Text>
          <Text style={styles.boardIdentitySubtitle}>
            {selectedBoard.base} Base • {rolePlural}
          </Text>
        </View>

        {/* Filters + Post Row */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowAdvancedFilters(true)}
            activeOpacity={0.7}
          >
            <View style={styles.filterButtonContent}>
              <Ionicons name="funnel-outline" size={14} color={isDark ? '#FFFFFF' : '#000000'} />
              <Text style={styles.filterButtonText}>Filters</Text>
              <Ionicons name="chevron-down" size={14} color={isDark ? '#FFFFFF' : '#000000'} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.postButton}
            onPress={handlePostTradePress}
            activeOpacity={0.7}
          >
            <Text style={styles.postButtonText}>+ Post</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Filter Chips */}
        <View style={styles.quickChipsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickChipsContent}
          >
            {quickFilterChips.map((chip) => (
              <TouchableOpacity
                key={chip.id}
                style={[
                  styles.quickChip,
                  isChipActive(chip.id) && styles.quickChipActive,
                ]}
                onPress={() => handleChipPress(chip.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.quickChipText,
                    isChipActive(chip.id) && styles.quickChipTextActive,
                  ]}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Trades List */}
      <View style={styles.listContainer}>
        {postsLoading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#DC3545" />
            <Text style={styles.loadingText}>Loading trades...</Text>
          </View>
        ) : displayPosts.length === 0 ? (
          <View style={styles.centerContent}>
            <Text style={styles.emptyText}>No trades found</Text>
            {Object.keys(filters).length > 0 && (
              <>
                <Text style={styles.emptySubtext}>Try adjusting your filters</Text>
                <TouchableOpacity
                  style={styles.clearFiltersButton}
                  onPress={clearFilters}
                >
                  <Text style={styles.clearFiltersButtonText}>Clear Filters</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <FlatList
            data={displayPosts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TradeRow
                trade={item}
                onPress={() => handlePostPress(item)}
                onInterestPress={() => handleTradeInterest(item)}
                userInterested={item.user_interested}
              />
            )}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* Sort Modal */}
      <Modal
        visible={showSortModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSortModal(false)}
      >
        <Pressable
          style={styles.sortOverlay}
          onPress={() => setShowSortModal(false)}
        >
          <View style={styles.sortModalContent}>
            <SortControl
              sort={sort}
              onSortChange={(newSort: TradeSort) => {
                updateSort(newSort);
              }}
            />
          </View>
        </Pressable>
      </Modal>

      {/* Advanced Filter Sheet */}
      <AdvancedFilterSheet
        visible={showAdvancedFilters}
        filters={filters}
        onFilterChange={updateFilters}
        onClose={() => setShowAdvancedFilters(false)}
        onSaveAsAlert={(name: string) => {
          // TODO: Save alert to Supabase
          console.log('Save alert:', name, filters);
        }}
      />
    </View>
  );
};

/**
 * Styles
 */

function getStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#1A1A1A' : '#F5F5F5',
    },

    centerContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
    },

    listContainer: {
      flex: 1,
    },

    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: isDark ? '#A0A0A0' : '#666666',
    },

    emptyText: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : '#000000',
      textAlign: 'center',
      marginBottom: 6,
    },

    emptySubtext: {
      fontSize: 12,
      color: isDark ? '#A0A0A0' : '#666666',
      textAlign: 'center',
      marginBottom: 16,
    },

    clearFiltersButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: '#DC3545',
      marginTop: 12,
    },

    clearFiltersButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#FFFFFF',
    },

    // Sticky Controls Area
    stickyControls: {
      backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#2A3A4A' : '#E5E5E5',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 10,
      gap: 10,
    },

    boardIdentityCard: {
      backgroundColor: isDark ? '#222222' : '#F7F7F7',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 16,
      borderWidth: 1,
      borderColor: isDark ? '#2F2F2F' : '#E6E6E6',
      width: '100%',
    },

    boardIdentityTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#FFFFFF' : '#000000',
      width: '100%',
      textAlign: 'center',
    },

    boardIdentitySubtitle: {
      marginTop: 6,
      fontSize: 14,
      color: isDark ? '#A0A0A0' : '#666666',
      width: '100%',
      textAlign: 'center',
    },

    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },

    filterButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: isDark ? '#2A2A2A' : '#F0F0F0',
      borderWidth: 1,
      borderColor: isDark ? '#3A3A3A' : '#E0E0E0',
    },

    filterButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      width: '100%',
    },

    filterButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : '#000000',
    },

    postButton: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: '#DC3545',
      alignItems: 'center',
    },

    postButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#FFFFFF',
    },

    // Quick Filter Chips
    quickChipsContainer: {
      paddingVertical: 4,
    },

    quickChipsContent: {
      alignItems: 'center',
    },

    quickChip: {
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

    quickChipActive: {
      backgroundColor: '#DC3545',
      borderColor: '#DC3545',
    },

    quickChipText: {
      fontSize: 12,
      fontWeight: '500',
      color: isDark ? '#FFFFFF' : '#000000',
    },

    quickChipTextActive: {
      color: '#FFFFFF',
      fontWeight: '600',
    },

    // Modals
    sortOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
    },

    sortModalContent: {
      width: '100%',
      maxWidth: 420,
      borderRadius: 12,
      backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF',
      overflow: 'hidden',
    },
  });
}
