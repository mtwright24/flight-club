import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import FlightClubHeader from '../../src/components/FlightClubHeader';
import HousingListingCard from '../../src/components/housing/HousingListingCard';
import { useAuth } from '../../src/hooks/useAuth';
import { useNotificationsBadge } from '../../src/hooks/useNotificationsBadge';
import {
  fetchHousingListings,
  fetchHousingNeedPosts,
  fetchSavedListingIds,
  fetchSavedSearches,
  toggleSavedListing,
  upsertSavedSearch,
  type HousingFilters,
  type HousingSort,
} from '../../src/lib/housing';
import { colors, radius, shadow, spacing } from '../../src/styles/theme';
import type { HousingListing, HousingNeedPost, HousingSavedSearch } from '../../src/types/housing';

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
    params.type === 'room' || params.type === 'apartment' || params.type === 'wanted'
      ? (params.type as TabKey)
      : 'crashpad';

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [hotTonight, setHotTonight] = useState(params.hot === '1');
  const [sort, setSort] = useState<HousingSort>('recommended');
  const [listings, setListings] = useState<HousingListing[]>([]);
  const [needs, setNeeds] = useState<HousingNeedPost[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedSearches, setSavedSearches] = useState<HousingSavedSearch[]>([]);
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
      housing_type: activeTab === 'room' ? 'room' : activeTab === 'apartment' ? 'apartment' : undefined,
      bed_type: bedFromParams as any,
      min_price: minFromParams,
      max_price: maxFromParams,
      available_tonight: hotTonight || undefined,
      standby_only: standbyOnlyFromParams || undefined,
      sort,
    }),
    [activeTab, baseFromParams, bedFromParams, hotTonight, maxFromParams, minFromParams, sort, standbyOnlyFromParams],
  );

  const hasActiveFilters = useMemo(() => {
    const hasPrice = typeof minFromParams === 'number' || typeof maxFromParams === 'number';
    const hasBed = !!bedFromParams;
    const hasBaseOrArea = !!baseFromParams || !!areaFromParams;
    const hasHot = hotTonight;
    const hasStandby = standbyOnlyFromParams;
    const isTypeSpecific = activeTab === 'room' || activeTab === 'apartment' || activeTab === 'wanted';
    return hasPrice || hasBed || hasBaseOrArea || hasHot || hasStandby || isTypeSpecific;
  }, [activeTab, areaFromParams, baseFromParams, bedFromParams, hotTonight, maxFromParams, minFromParams, standbyOnlyFromParams]);

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
        const [ids, searches] = await Promise.all([
          fetchSavedListingIds(userId),
          fetchSavedSearches(userId),
        ]);
        if (mounted) {
          setSavedIds(ids);
          setSavedSearches(searches);
        }
      } else if (mounted) {
        setSavedIds([]);
        setSavedSearches([]);
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

  const baseLabel = useMemo(() => {
    if (!baseFromParams && !areaFromParams) return 'JFK / Jamaica';
    if (baseFromParams && areaFromParams) return `${baseFromParams} / ${areaFromParams}`;
    return baseFromParams || areaFromParams || 'Any Base';
  }, [areaFromParams, baseFromParams]);

  const priceLabel = useMemo(() => {
    if (!minFromParams && !maxFromParams) return '$600-$1,200';
    if (minFromParams && maxFromParams) return `$${minFromParams}-$${maxFromParams}`;
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

  const saveCurrentSearch = async () => {
    if (!userId) return;
    await upsertSavedSearch({
      user_id: userId,
      base_airport: baseFromParams || null,
      area: areaFromParams || null,
      housing_type:
        activeTab === 'room'
          ? 'room'
          : activeTab === 'apartment'
          ? 'apartment'
          : activeTab === 'crashpad'
          ? 'crashpad'
          : null,
      min_price: minFromParams ?? null,
      max_price: maxFromParams ?? null,
      bed_type: (bedFromParams as any) || null,
      available_tonight: hotTonight,
      standby_only: standbyOnlyFromParams,
      alerts_enabled: true,
    } as any);
    const refreshed = await fetchSavedSearches(userId);
    setSavedSearches(refreshed);
  };

  const openSavedSearch = (s: HousingSavedSearch) => {
    const nextParams: Record<string, string> = { type: activeTab, hot: hotTonight ? '1' : '0' };
    if (s.base_airport) nextParams.base = s.base_airport;
    if (s.area) nextParams.area = s.area;
    if (typeof s.min_price === 'number') nextParams.min = String(s.min_price);
    if (typeof s.max_price === 'number') nextParams.max = String(s.max_price);
    if (s.bed_type) nextParams.bed = s.bed_type;
    if (s.housing_type) nextParams.type = s.housing_type;
    if (s.available_tonight) nextParams.hot = '1';
    if (s.standby_only) nextParams.standby = '1';
    router.push({ pathname: '/(screens)/crashpads', params: nextParams });
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
        <View style={styles.tabsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsInnerRow}>
            {TABS.map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabPill, activeTab === tab.key && styles.tabPillActive]}
              >
                <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]} numberOfLines={1}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.searchStripWrap}>
          <Pressable style={styles.searchStrip} onPress={handleOpenFilters}>
            <Ionicons name="search" size={14} color={colors.textSecondary} />
            <Text style={styles.searchStripText} numberOfLines={1}>
              {baseLabel}
            </Text>
            <Text style={styles.searchStripDot}>•</Text>
            <Text style={styles.searchStripText} numberOfLines={1}>
              {priceLabel}
            </Text>
            <View style={styles.filterPill}>
              <Text style={styles.filterPillText}>FILTER</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.mapSortRow}>
          <Pressable style={styles.mapButton} onPress={() => router.push('/(screens)/crashpads-map')}>
            <Ionicons name="map-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.mapSortText}>Map</Text>
          </Pressable>
          <Pressable style={styles.mapButton} onPress={handleToggleSort}>
            <Ionicons name="swap-vertical" size={16} color={colors.textSecondary} />
            <Text style={styles.mapSortText}>Sort • {sortLabel}</Text>
          </Pressable>
        </View>

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
            onValueChange={setHotTonight}
            trackColor={{ false: '#CBD5E1', true: colors.primary }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.ctaBlock}>
          <View style={styles.ctaRow}>
            <Pressable style={styles.primaryCta} onPress={() => router.push('/(screens)/crashpads-post-availability')}>
              <Text style={styles.primaryCtaText}>Post Availability</Text>
            </Pressable>
            <Pressable style={styles.outlineCta} onPress={() => router.push('/(screens)/crashpads-post-need')}>
              <Text style={styles.outlineCtaText}>Post Need</Text>
            </Pressable>
          </View>
          <Pressable style={styles.saveSearchLink} onPress={saveCurrentSearch}>
            <Ionicons name="bookmark-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.saveSearchText}>Save search & alerts</Text>
          </Pressable>
        </View>

        <View style={styles.savedSection}>
          <View style={styles.savedHeaderRow}>
            <Text style={styles.savedHeader}>Saved Searches</Text>
            <Pressable onPress={() => router.push('/(screens)/crashpads-saved-searches')}>
              <Text style={styles.savedHeaderLink}>View all {'>'}</Text>
            </Pressable>
          </View>
          {savedSearches.length === 0 ? (
            <View style={styles.savedCard}>
              <Text style={styles.savedBody}>No saved searches yet. Save your current search to get alerts.</Text>
            </View>
          ) : (
            savedSearches.slice(0, 2).map((s) => (
              <Pressable key={s.id} style={[styles.savedCard, shadow.cardShadow]} onPress={() => openSavedSearch(s)}>
                <Text style={styles.savedTitle}>
                  {(s.base_airport || 'Any Base')}{s.area ? ` / ${s.area}` : ''}
                </Text>
                <Text style={styles.savedBody}>
                  {s.housing_type ? `${s.housing_type} • ` : ''}
                  {s.min_price || s.max_price ? `$${s.min_price || 0}-$${s.max_price || '—'}` : 'Any Price'}
                  {s.bed_type ? ` • ${s.bed_type.replace(/_/g, ' ')}` : ''}
                </Text>
              </Pressable>
            ))
          )}
        </View>

        <Text style={styles.resultCount}>{resultCount} Results</Text>

        <View style={{ marginTop: spacing.md }}>
          {loading ? (
            <Text style={styles.loadingText}>Loading {activeTab === 'wanted' ? 'needs' : 'listings'}...</Text>
          ) : resultCount === 0 && hasActiveFilters ? (
            <View style={styles.emptyCard}>
              <Ionicons name="home-outline" size={32} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>No {activeTab === 'wanted' ? 'needs' : 'listings'} match these filters yet</Text>
              <Text style={styles.emptyBody}>Try adjusting your filters or expanding to nearby bases.</Text>
              <Pressable style={styles.emptyButton} onPress={handleOpenFilters}>
                <Text style={styles.emptyButtonText}>Reset filters</Text>
              </Pressable>
            </View>
          ) : activeTab === 'wanted' ? (
            needs.map((need) => (
              <View key={need.id} style={[styles.needCard, shadow.cardShadow]}>
                <View style={styles.needHeaderRow}>
                  <Text style={styles.needTitle}>{need.base_airport} crew need</Text>
                  {need.need_tonight ? (
                    <View style={styles.needBadge}>
                      <Text style={styles.needBadgeText}>Tonight</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.needMeta} numberOfLines={1}>
                  {need.need_type} • {need.duration || 'Flexible'}
                </Text>
                {need.budget ? <Text style={styles.needPrice}>Budget up to ${need.budget}</Text> : null}
                {need.notes ? (
                  <Text style={styles.needNotes} numberOfLines={3}>
                    {need.notes}
                  </Text>
                ) : null}
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
                  const previous = savedIds;
                  setSavedIds((prev) => (willSave ? [...prev, item.id] : prev.filter((x) => x !== item.id)));
                  const { error } = await toggleSavedListing(userId, item.id, willSave);
                  if (error) {
                    setSavedIds(previous);
                    Alert.alert('Could not update saved listing', error);
                  }
                }}
                onPress={() => router.push({ pathname: '/(screens)/crashpads-detail', params: { id: item.id } })}
              />
            ))
          )}
        </View>
      </ScrollView>
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
  searchStripWrap: {
    marginBottom: spacing.sm,
  },
  searchStrip: {
    minHeight: 42,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchStripText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  searchStripDot: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterPill: {
    marginLeft: 'auto',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FFF4F4',
  },
  filterPillText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
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
  savedSection: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  savedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  savedHeader: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '800',
  },
  savedHeaderLink: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  savedCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    padding: 10,
    marginBottom: 8,
  },
  savedTitle: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '800',
    marginBottom: 3,
  },
  savedBody: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
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
});
