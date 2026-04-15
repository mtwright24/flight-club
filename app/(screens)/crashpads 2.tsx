import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import FlightClubHeader from '../../src/components/FlightClubHeader';
import HousingListingCard from '../../src/components/housing/HousingListingCard';
import { useAuth } from '../../src/hooks/useAuth';
import { useNotificationsBadge } from '../../src/hooks/useNotificationsBadge';
import {
    fetchHousingListings,
    fetchHousingNeedPosts,
    fetchSavedListingIds,
    toggleSavedListing,
    type HousingFilters,
    type HousingSort,
} from '../../src/lib/housing';
import { colors, radius, shadow, spacing } from '../../src/styles/theme';
import type { HousingListing, HousingNeedPost } from '../../src/types/housing';

type TabKey = 'crashpad' | 'room' | 'apartment' | 'wanted';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'crashpad', label: 'Crashpads' },
  { key: 'room', label: 'Rooms' },
  { key: 'apartment', label: 'Apartments' },
  { key: 'wanted', label: 'Wanted' },
];

export default function CrashpadsHousingHubScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { session } = useAuth();
  const unread = useNotificationsBadge();
  const userId = session?.user?.id;

  const initialTab: TabKey =
    (params.type === 'room' || params.type === 'apartment' || params.type === 'wanted')
      ? (params.type as TabKey)
      : 'crashpad';

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [hotTonight, setHotTonight] = useState(params.hot === '1');
  const [sort, setSort] = useState<HousingSort>('recommended');
  const [listings, setListings] = useState<HousingListing[]>([]);
  const [needs, setNeeds] = useState<HousingNeedPost[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const baseFromParams = typeof params.base === 'string' ? params.base : undefined;
  const areaFromParams = typeof params.area === 'string' ? params.area : undefined;
  const minFromParams = typeof params.min === 'string' ? Number(params.min) || undefined : undefined;
  const maxFromParams = typeof params.max === 'string' ? Number(params.max) || undefined : undefined;
  const bedFromParams = typeof params.bed === 'string' && params.bed ? params.bed : undefined;
  const standbyOnlyFromParams = params.standby === '1';

  const filters: HousingFilters = useMemo(
    () => ({
      base_airport: baseFromParams,
      // Default "Crashpads" tab shows the full marketplace; type-specific tabs narrow results.
      housing_type:
        activeTab === 'room'
          ? 'room'
          : activeTab === 'apartment'
          ? 'apartment'
          : undefined,
      bed_type: bedFromParams as any,
      min_price: minFromParams,
      max_price: maxFromParams,
      available_tonight: hotTonight || undefined,
      standby_only: standbyOnlyFromParams || undefined,
      sort,
    }),
    [activeTab, baseFromParams, bedFromParams, hotTonight, maxFromParams, minFromParams, sort, standbyOnlyFromParams],
  );

  const hasActiveFilters = useMemo(
    () => {
      const hasPrice = typeof minFromParams === 'number' || typeof maxFromParams === 'number';
      const hasBed = !!bedFromParams;
      const hasBaseOrArea = !!baseFromParams || !!areaFromParams;
      const hasHot = hotTonight;
      const hasStandby = standbyOnlyFromParams;
      const isTypeSpecific = activeTab === 'room' || activeTab === 'apartment' || activeTab === 'wanted';
      return hasPrice || hasBed || hasBaseOrArea || hasHot || hasStandby || isTypeSpecific;
    },
    [activeTab, areaFromParams, baseFromParams, bedFromParams, hotTonight, maxFromParams, minFromParams, standbyOnlyFromParams],
  );

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);

      if (activeTab === 'wanted') {
        const data = await fetchHousingNeedPosts({ base_airport: baseFromParams });
        if (!mounted) return;
        setNeeds(data);
        setListings([]);
      } else {
        const data = await fetchHousingListings(filters);
        if (!mounted) return;
        setListings(data);
        setNeeds([]);
      }

      if (userId) {
        const ids = await fetchSavedListingIds(userId);
        if (mounted) setSavedIds(ids);
      }

      if (mounted) setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [activeTab, baseFromParams, filters, userId]);

  const handleToggleSort = () => {
    setSort((prev) => {
      if (prev === 'recommended') return 'price_low';
      if (prev === 'price_low') return 'price_high';
      if (prev === 'price_high') return 'newest';
      return 'recommended';
    });
  };

  const sortLabel = useMemo(() => {
    if (sort === 'price_low') return 'Price • Low to High';
    if (sort === 'price_high') return 'Price • High to Low';
    if (sort === 'newest') return 'Newest';
    return 'Recommended';
  }, [sort]);

  const bedLabel = useMemo(() => {
    if (!bedFromParams) return 'Any Bed';
    if (bedFromParams === 'hot_bed') return 'Hot Bed';
    if (bedFromParams === 'cold_bed') return 'Cold Bed';
    if (bedFromParams === 'private_room') return 'Private Room';
    return 'Any Bed';
  }, [bedFromParams]);

  const baseLabel = useMemo(() => {
    if (!baseFromParams && !areaFromParams) return 'Any Base';
    if (baseFromParams && areaFromParams) return `${baseFromParams} / ${areaFromParams}`;
    return baseFromParams || areaFromParams || 'Any Base';
  }, [areaFromParams, baseFromParams]);

  const priceLabel = useMemo(() => {
    if (!minFromParams && !maxFromParams) return 'Any Price';
    if (minFromParams && maxFromParams) return `$${minFromParams}–$${maxFromParams}`;
    if (minFromParams) return `From $${minFromParams}`;
    return `Up to $${maxFromParams}`;
  }, [maxFromParams, minFromParams]);

  const resultCount = activeTab === 'wanted' ? needs.length : listings.length;

  const handleOpenFilters = () => {
    router.push({
      pathname: '/(screens)/crashpads-filter',
      params: {
        base: baseFromParams,
        area: areaFromParams,
        min: minFromParams?.toString(),
        max: maxFromParams?.toString(),
        bed: bedFromParams,
        type: activeTab,
        hot: hotTonight ? '1' : '0',
      },
    });
  };

  const handleTabPress = (key: TabKey) => {
    setActiveTab(key);
  };

  const handleToggleHotTonight = (value: boolean) => {
    setHotTonight(value);
  };

  const [showLocationSheet, setShowLocationSheet] = useState(false);
  const [showPriceSheet, setShowPriceSheet] = useState(false);
  const [showBedSheet, setShowBedSheet] = useState(false);

  const applyQuickFiltersAndClose = (next: {
    base?: string;
    area?: string;
    min?: string;
    max?: string;
    bed?: string;
  }) => {
    const paramsOut: any = {
      base: next.base ?? baseFromParams,
      area: next.area ?? areaFromParams,
      min: next.min ?? (minFromParams ? String(minFromParams) : undefined),
      max: next.max ?? (maxFromParams ? String(maxFromParams) : undefined),
      bed: next.bed ?? bedFromParams,
      type: activeTab,
      hot: hotTonight ? '1' : '0',
    };

    Object.keys(paramsOut).forEach((key) => {
      if (paramsOut[key] === undefined || paramsOut[key] === '') {
        delete paramsOut[key];
      }
    });

    router.push({ pathname: '/(screens)/crashpads', params: paramsOut });
    setShowLocationSheet(false);
    setShowPriceSheet(false);
    setShowBedSheet(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlightClubHeader
        title="Crashpads & Housing"
        bellCount={unread}
        dmCount={0}
        onPressBell={() => router.push('/notifications')}
        onPressMessage={() => router.push('/messages-inbox')}
        onPressMenu={() => router.push('/menu')}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Tabs */}
        <View style={styles.tabsRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsInnerRow}
          >
            {TABS.map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => handleTabPress(tab.key)}
                style={[
                  styles.tabPill,
                  activeTab === tab.key && styles.tabPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    activeTab === tab.key && styles.tabLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Compact search control grid */}
        <View style={styles.searchGrid}>
          <Pressable style={styles.searchCell} onPress={() => setShowLocationSheet(true)}>
            <Text style={styles.searchLabel}>Base / Area</Text>
            <Text style={styles.searchValue} numberOfLines={1}>
              {baseLabel}
            </Text>
          </Pressable>
          <Pressable style={styles.searchCell} onPress={() => setShowPriceSheet(true)}>
            <Text style={styles.searchLabel}>Price</Text>
            <Text style={styles.searchValue} numberOfLines={1}>
              {priceLabel}
            </Text>
          </Pressable>
          <Pressable style={styles.searchCell} onPress={() => setShowBedSheet(true)}>
            <Text style={styles.searchLabel}>Bed Type</Text>
            <Text style={styles.searchValue} numberOfLines={1}>
              {bedLabel}
            </Text>
          </Pressable>
          <Pressable style={styles.searchCell} onPress={handleOpenFilters}>
            <Text style={styles.searchLabel}>Filter</Text>
            <Text style={styles.searchValueSub} numberOfLines={1}>
              More filters
            </Text>
          </Pressable>
        </View>

        {/* Map / Sort row */}
        <View style={styles.mapSortRow}>
          <Pressable
            style={styles.mapButton}
            onPress={() =>
              router.push({
                pathname: '/(screens)/crashpads-map',
                params: {
                  base: baseFromParams ?? '',
                  area: areaFromParams ?? '',
                  type: activeTab,
                  min: minFromParams != null ? String(minFromParams) : '',
                  max: maxFromParams != null ? String(maxFromParams) : '',
                  bed: bedFromParams ?? '',
                  hot: hotTonight ? '1' : '',
                  standby: standbyOnlyFromParams ? '1' : '',
                  sort,
                },
              })
            }
          >
            <Ionicons name="map-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.mapSortText}>Map</Text>
          </Pressable>
          <Pressable style={styles.mapButton} onPress={handleToggleSort}>
            <Ionicons name="swap-vertical" size={16} color={colors.textSecondary} />
            <Text style={styles.mapSortText}>Sort • {sortLabel}</Text>
          </Pressable>
        </View>

        {/* Hot Bed Tonight toggle */}
        <View style={styles.hotCard}>
          <View style={styles.hotLeft}>
            <Text style={styles.hotIcon}>🔥</Text>
            <View>
              <Text style={styles.hotTitle}>Hot Bed Tonight</Text>
              <Text style={styles.hotSubtitle}>Only show pads with beds tonight</Text>
            </View>
          </View>
          <Switch
            value={hotTonight}
            onValueChange={handleToggleHotTonight}
            trackColor={{ false: '#CBD5E1', true: colors.primary }}
            thumbColor="#fff"
          />
        </View>

        {/* Action buttons row */}
        <View style={styles.ctaBlock}>
          <View style={styles.ctaRow}>
            <Pressable
              style={styles.primaryCta}
              onPress={() => router.push('/(screens)/crashpads-post-availability')}
            >
              <Text style={styles.primaryCtaText}>Post Availability</Text>
            </Pressable>
            <Pressable
              style={styles.outlineCta}
              onPress={() => router.push('/(screens)/crashpads-post-need')}
            >
              <Text style={styles.outlineCtaText}>Post Need</Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.saveSearchLink}
            onPress={handleOpenFilters}
          >
            <Ionicons name="bookmark-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.saveSearchText}>Save search & alerts</Text>
          </Pressable>
        </View>

        {/* Result count */}
        <Text style={styles.resultCount}>{resultCount} Results</Text>

        {/* Listing or need feed */}
        <View style={{ marginTop: spacing.md }}>
          {loading ? (
            <Text style={styles.loadingText}>Loading {activeTab === 'wanted' ? 'needs' : 'listings'}…</Text>
          ) : resultCount === 0 && hasActiveFilters ? (
            <View style={styles.emptyCard}>
              <Ionicons name="home-outline" size={32} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>No {activeTab === 'wanted' ? 'needs' : 'listings'} match these filters yet</Text>
              <Text style={styles.emptyBody}>
                Try adjusting your filters or expanding to nearby bases.
              </Text>
              <Pressable style={styles.emptyButton} onPress={handleOpenFilters}>
                <Text style={styles.emptyButtonText}>Reset filters</Text>
              </Pressable>
            </View>
          ) : activeTab === 'wanted' ? (
            needs.map((need) => (
              <View key={need.id} style={[styles.needCard, shadow.cardShadow]}>
                <View style={styles.needHeaderRow}>
                  <Text style={styles.needTitle}>{need.base_airport} crew need</Text>
                  {need.need_tonight && (
                    <View style={styles.needBadge}>
                      <Text style={styles.needBadgeText}>Tonight</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.needMeta} numberOfLines={1}>
                  {need.need_type} • {need.duration || 'Flexible'}
                </Text>
                {need.budget && (
                  <Text style={styles.needPrice}>Budget up to ${need.budget}</Text>
                )}
                {need.notes && (
                  <Text style={styles.needNotes} numberOfLines={3}>
                    {need.notes}
                  </Text>
                )}
              </View>
            ))
          ) : (
            listings.map((item) => (
              <HousingListingCard
                key={item.id}
                item={item}
                isSaved={savedIds.includes(item.id)}
                onToggleSave={async () => {
                  if (!userId) return;
                  const willSave = !savedIds.includes(item.id);
                  setSavedIds((prev) =>
                    willSave
                      ? [...prev, item.id]
                      : prev.filter((id) => id !== item.id),
                  );
                  await toggleSavedListing(userId, item.id, willSave);
                }}
                onPress={() =>
                  router.push({ pathname: '/(screens)/crashpads-detail', params: { id: item.id } })
                }
              />
            ))
          )}
        </View>
      </ScrollView>

      {showLocationSheet && (
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>Location</Text>
            <View style={{ marginBottom: spacing.md }}>
              <Text style={styles.sheetLabel}>Base / Airport</Text>
              <Pressable
                style={styles.sheetChip}
                onPress={() => applyQuickFiltersAndClose({ base: 'JFK' })}
              >
                <Text style={styles.sheetChipText}>JFK</Text>
              </Pressable>
              <Pressable
                style={styles.sheetChip}
                onPress={() => applyQuickFiltersAndClose({ base: 'LGA' })}
              >
                <Text style={styles.sheetChipText}>LGA</Text>
              </Pressable>
              <Pressable
                style={styles.sheetChip}
                onPress={() => applyQuickFiltersAndClose({ base: 'EWR' })}
              >
                <Text style={styles.sheetChipText}>EWR</Text>
              </Pressable>
            </View>
            <Pressable style={styles.sheetCancel} onPress={() => setShowLocationSheet(false)}>
              <Text style={styles.sheetCancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}

      {showPriceSheet && (
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>Price</Text>
            <View style={{ marginBottom: spacing.sm }}>
              <Pressable
                style={styles.sheetChip}
                onPress={() => applyQuickFiltersAndClose({ max: '50' })}
              >
                <Text style={styles.sheetChipText}>Under $50/night</Text>
              </Pressable>
              <Pressable
                style={styles.sheetChip}
                onPress={() => applyQuickFiltersAndClose({ max: '500' })}
              >
                <Text style={styles.sheetChipText}>Under $500/mo</Text>
              </Pressable>
            </View>
            <Pressable style={styles.sheetCancel} onPress={() => setShowPriceSheet(false)}>
              <Text style={styles.sheetCancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}

      {showBedSheet && (
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>Bed Type</Text>
            <View style={{ marginBottom: spacing.sm }}>
              <Pressable
                style={styles.sheetChip}
                onPress={() => applyQuickFiltersAndClose({ bed: 'hot_bed' })}
              >
                <Text style={styles.sheetChipText}>Hot Bed</Text>
              </Pressable>
              <Pressable
                style={styles.sheetChip}
                onPress={() => applyQuickFiltersAndClose({ bed: 'cold_bed' })}
              >
                <Text style={styles.sheetChipText}>Cold Bed</Text>
              </Pressable>
              <Pressable
                style={styles.sheetChip}
                onPress={() => applyQuickFiltersAndClose({ bed: 'private_room' })}
              >
                <Text style={styles.sheetChipText}>Private Room</Text>
              </Pressable>
            </View>
            <Pressable style={styles.sheetCancel} onPress={() => setShowBedSheet(false)}>
              <Text style={styles.sheetCancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  tabsRow: {
    marginBottom: spacing.sm,
  },
  tabsInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
  },
  tabPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tabLabelActive: {
    color: '#fff',
  },
  searchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.md,
  },
  searchCell: {
    width: '50%',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  searchLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  searchValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  searchValueSub: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  mapSortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mapSortText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  hotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadow.cardShadow,
  },
  hotLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hotIcon: {
    fontSize: 18,
  },
  hotTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  hotSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  ctaBlock: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  ctaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  primaryCta: {
    flex: 1.1,
    marginRight: 6,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  primaryCtaText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  outlineCta: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
  },
  outlineCtaText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  saveSearchLink: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saveSearchText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  resultCount: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.textSecondary,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    marginTop: spacing.sm,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  needCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  needHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  needTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  needBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  needBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  needMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  needPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  needNotes: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  sheetOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    backgroundColor: 'rgba(15,23,42,0.35)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: colors.cardBg,
    padding: spacing.md,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sheetLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  sheetChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    marginBottom: 8,
  },
  sheetChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sheetCancel: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sheetCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});
