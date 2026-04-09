import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../styles/refreshControl';
import { colors, spacing } from '../../styles/theme';
import BundleCard from './BundleCard';
import {
  CrewToolCardCompact,
  CrewToolCardFeatured,
  CrewToolCardStore,
} from './CrewToolCards';
import CrewToolsSearchBar from './CrewToolsSearchBar';
import CrewToolsSegmentedControl from './CrewToolsSegmentedControl';
import ExploreToolsGrid from './ExploreToolsGrid';
import FeaturedToolCarousel from './FeaturedToolCarousel';
import PromoUpgradeCard from './PromoUpgradeCard';
import {
  CREW_BUNDLES,
  BEST_COMMUTERS_IDS,
  BEST_INFLIGHT_IDS,
  BEST_PILOTS_IDS,
  EXPLORE_FEATURED_IDS,
  EXPLORE_GRID_IDS,
  MY_FAVORITES_IDS,
  MY_INCLUDED_IDS,
  MY_RECENT_IDS,
  MY_SUGGESTED_IDS,
  NEW_TOOLS_IDS,
  SAVED_BUNDLE_IDS,
  SAVED_TOOL_IDS,
  TOP_FREE_IDS,
  TOP_PREMIUM_IDS,
  toolsByIds,
  TRENDING_IDS,
  TRY_LATER_IDS,
} from './data';
import { standardCarouselCardWidth } from './layoutTokens';
import { matchesBundleQuery, matchesToolQuery } from './search';
import SectionHeading from './SectionHeading';
import ToolCarousel from './ToolCarousel';
import type { CrewBundle, CrewTool, CrewToolsMode } from './types';

export default function CrewToolsScreen() {
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();
  const carouselCardW = useMemo(() => standardCarouselCardWidth(screenW), [screenW]);

  const [mode, setMode] = useState<CrewToolsMode>('my');
  const [query, setQuery] = useState('');

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    /* future: sync catalog + entitlements */
  });

  const onToolPress = useCallback(
    (tool: CrewTool) => {
      if (tool.route) {
        router.push(tool.route as Href);
        return;
      }
      Alert.alert('Coming soon', `${tool.title} will be available in a future update.`);
    },
    [router]
  );

  const onBundlePress = useCallback((bundle: CrewBundle) => {
    Alert.alert(
      bundle.title,
      'Bundle details and checkout will connect to your Flight Club plan in a future release.'
    );
  }, []);

  const onPromoPress = useCallback(() => {
    Alert.alert('Flight Club Pro', 'Upgrade flows will connect to billing when enabled.');
  }, []);

  const seeAll = useCallback((label: string) => {
    Alert.alert('See all', `${label} — full lists will sync with your tools and saves.`);
  }, []);

  const q = query.trim();

  const myFavorites = useMemo(
    () => toolsByIds(MY_FAVORITES_IDS).filter((t) => matchesToolQuery(t, q)),
    [q]
  );
  const myRecent = useMemo(
    () => toolsByIds(MY_RECENT_IDS).filter((t) => matchesToolQuery(t, q)),
    [q]
  );
  const myIncluded = useMemo(
    () => toolsByIds(MY_INCLUDED_IDS).filter((t) => matchesToolQuery(t, q)),
    [q]
  );
  const mySuggested = useMemo(
    () => toolsByIds(MY_SUGGESTED_IDS).filter((t) => matchesToolQuery(t, q)),
    [q]
  );

  const featured = useMemo(
    () => toolsByIds(EXPLORE_FEATURED_IDS).filter((t) => matchesToolQuery(t, q)),
    [q]
  );
  const exploreGrid = useMemo(
    () => toolsByIds(EXPLORE_GRID_IDS).filter((t) => matchesToolQuery(t, q)),
    [q]
  );
  const topFree = useMemo(
    () => toolsByIds(TOP_FREE_IDS).filter((t) => matchesToolQuery(t, q)),
    [q]
  );
  const topPremium = useMemo(
    () => toolsByIds(TOP_PREMIUM_IDS).filter((t) => matchesToolQuery(t, q)),
    [q]
  );
  const trending = useMemo(
    () => toolsByIds(TRENDING_IDS).filter((t) => matchesToolQuery(t, q)),
    [q]
  );
  const newTools = useMemo(
    () => toolsByIds(NEW_TOOLS_IDS).filter((t) => matchesToolQuery(t, q)),
    [q]
  );
  const bestCommuters = useMemo(
    () => toolsByIds(BEST_COMMUTERS_IDS).filter((t) => matchesToolQuery(t, q)),
    [q]
  );
  const bestInflight = useMemo(
    () => toolsByIds(BEST_INFLIGHT_IDS).filter((t) => matchesToolQuery(t, q)),
    [q]
  );
  const bestPilots = useMemo(
    () => toolsByIds(BEST_PILOTS_IDS).filter((t) => matchesToolQuery(t, q)),
    [q]
  );

  const bundles = useMemo(
    () => CREW_BUNDLES.filter((b) => matchesBundleQuery(b, q)),
    [q]
  );

  const savedTools = useMemo(
    () => toolsByIds(SAVED_TOOL_IDS).filter((t) => matchesToolQuery(t, q)),
    [q]
  );
  const savedBundles = useMemo(
    () =>
      CREW_BUNDLES.filter((b) => SAVED_BUNDLE_IDS.includes(b.id)).filter((b) =>
        matchesBundleQuery(b, q)
      ),
    [q]
  );
  const tryLater = useMemo(
    () => toolsByIds(TRY_LATER_IDS).filter((t) => matchesToolQuery(t, q)),
    [q]
  );

  const showEmpty =
    q.length > 0 &&
    (mode === 'my'
      ? myFavorites.length + myRecent.length + myIncluded.length + mySuggested.length === 0
      : mode === 'explore'
        ? featured.length +
            exploreGrid.length +
            topFree.length +
            topPremium.length +
            trending.length +
            newTools.length +
            bestCommuters.length +
            bestInflight.length +
            bestPilots.length ===
          0
        : mode === 'bundles'
          ? bundles.length === 0
          : savedTools.length + savedBundles.length + tryLater.length === 0);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={REFRESH_CONTROL_COLORS}
            tintColor={REFRESH_TINT}
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        <CrewToolsSegmentedControl mode={mode} onChange={setMode} />
        <CrewToolsSearchBar value={query} onChangeText={setQuery} />

        {showEmpty ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No matches</Text>
            <Text style={styles.emptySub}>Try another search or clear the search field.</Text>
          </View>
        ) : null}

        {mode === 'my' && !showEmpty ? (
          <>
            {myFavorites.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Favorites" onSeeAll={() => seeAll('Favorites')} />
                <ToolCarousel
                  listKey="favorites"
                  tools={myFavorites}
                  cardWidth={carouselCardW}
                  renderCard={(t) => <CrewToolCardCompact tool={t} onPress={onToolPress} />}
                />
              </View>
            ) : null}

            {myRecent.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Recently used" onSeeAll={() => seeAll('Recently used')} />
                <ToolCarousel
                  listKey="recent"
                  tools={myRecent}
                  cardWidth={carouselCardW}
                  renderCard={(t) => <CrewToolCardCompact tool={t} onPress={onToolPress} />}
                />
              </View>
            ) : null}

            {myIncluded.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading
                  title="Included in your plan"
                  onSeeAll={() => seeAll('Included in your plan')}
                />
                <ToolCarousel
                  listKey="included"
                  tools={myIncluded}
                  cardWidth={carouselCardW}
                  renderCard={(t) => <CrewToolCardCompact tool={t} onPress={onToolPress} />}
                />
              </View>
            ) : null}

            {mySuggested.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Suggested for you" onSeeAll={() => seeAll('Suggested for you')} />
                <ToolCarousel
                  listKey="suggested"
                  tools={mySuggested}
                  cardWidth={carouselCardW}
                  renderCard={(t) => (
                    <CrewToolCardStore
                      tool={t}
                      onPress={onToolPress}
                      goldPro={t.id === 'crew-calendar-pro'}
                    />
                  )}
                />
              </View>
            ) : null}

            <PromoUpgradeCard onPress={onPromoPress} />
          </>
        ) : null}

        {mode === 'explore' && !showEmpty ? (
          <>
            {featured.length > 0 ? (
              <View style={styles.exploreFeaturedBand}>
                <SectionHeading title="Featured" onSeeAll={() => seeAll('Featured')} />
                <FeaturedToolCarousel
                  tools={featured}
                  screenWidth={screenW}
                  renderCard={(t) => <CrewToolCardFeatured tool={t} onPress={onToolPress} />}
                />
              </View>
            ) : null}

            {exploreGrid.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Explore tools" onSeeAll={() => seeAll('Explore tools')} />
                <ExploreToolsGrid
                  tools={exploreGrid}
                  renderCard={(t) => <CrewToolCardStore tool={t} onPress={onToolPress} />}
                />
              </View>
            ) : null}

            {topFree.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Top free tools" onSeeAll={() => seeAll('Top free tools')} />
                <ToolCarousel
                  listKey="topfree"
                  tools={topFree}
                  cardWidth={carouselCardW}
                  renderCard={(t) => <CrewToolCardStore tool={t} onPress={onToolPress} />}
                />
              </View>
            ) : null}

            {topPremium.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Top premium tools" onSeeAll={() => seeAll('Top premium tools')} />
                <ToolCarousel
                  listKey="toppremium"
                  tools={topPremium}
                  cardWidth={carouselCardW}
                  renderCard={(t) => <CrewToolCardStore tool={t} onPress={onToolPress} />}
                />
              </View>
            ) : null}

            {trending.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Trending" onSeeAll={() => seeAll('Trending')} />
                <ToolCarousel
                  listKey="trending"
                  tools={trending}
                  cardWidth={carouselCardW}
                  renderCard={(t) => <CrewToolCardCompact tool={t} onPress={onToolPress} />}
                />
              </View>
            ) : null}

            {newTools.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="New tools" onSeeAll={() => seeAll('New tools')} />
                <ToolCarousel
                  listKey="newtools"
                  tools={newTools}
                  cardWidth={carouselCardW}
                  renderCard={(t) => <CrewToolCardStore tool={t} onPress={onToolPress} />}
                />
              </View>
            ) : null}

            {bestCommuters.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Best for commuters" onSeeAll={() => seeAll('Best for commuters')} />
                <ToolCarousel
                  listKey="commuters"
                  tools={bestCommuters}
                  cardWidth={carouselCardW}
                  renderCard={(t) => <CrewToolCardStore tool={t} onPress={onToolPress} />}
                />
              </View>
            ) : null}

            {bestInflight.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Best for inflight" onSeeAll={() => seeAll('Best for inflight')} />
                <ToolCarousel
                  listKey="inflight"
                  tools={bestInflight}
                  cardWidth={carouselCardW}
                  renderCard={(t) => <CrewToolCardStore tool={t} onPress={onToolPress} />}
                />
              </View>
            ) : null}

            {bestPilots.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Best for pilots" onSeeAll={() => seeAll('Best for pilots')} />
                <ToolCarousel
                  listKey="pilots"
                  tools={bestPilots}
                  cardWidth={carouselCardW}
                  renderCard={(t) => <CrewToolCardStore tool={t} onPress={onToolPress} />}
                />
              </View>
            ) : null}
          </>
        ) : null}

        {mode === 'bundles' && !showEmpty ? (
          <View style={styles.bundleBlock}>
            {bundles.map((b) => (
              <BundleCard key={b.id} bundle={b} onPress={onBundlePress} />
            ))}
          </View>
        ) : null}

        {mode === 'saved' && !showEmpty ? (
          <>
            {savedTools.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Saved tools" onSeeAll={() => seeAll('Saved tools')} />
                <ToolCarousel
                  listKey="savedtools"
                  tools={savedTools}
                  cardWidth={carouselCardW}
                  renderCard={(t) => <CrewToolCardCompact tool={t} onPress={onToolPress} />}
                />
              </View>
            ) : null}
            {savedBundles.length > 0 ? (
              <View style={styles.bundleBlockTight}>
                <SectionHeading title="Saved bundles" onSeeAll={() => seeAll('Saved bundles')} />
                {savedBundles.map((b) => (
                  <BundleCard key={b.id} bundle={b} onPress={onBundlePress} />
                ))}
              </View>
            ) : null}
            {tryLater.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Try later" onSeeAll={() => seeAll('Try later')} />
                <ToolCarousel
                  listKey="trylater"
                  tools={tryLater}
                  cardWidth={carouselCardW}
                  renderCard={(t) => <CrewToolCardStore tool={t} onPress={onToolPress} />}
                />
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screenBg },
  scrollContent: { paddingBottom: spacing.xl + 24 },
  section: {
    marginTop: 4,
    marginBottom: 8,
  },
  bundleBlock: {
    paddingHorizontal: 16,
    marginTop: 12,
    paddingBottom: 8,
  },
  bundleBlockTight: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  empty: {
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  emptySub: { fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center' },
  exploreFeaturedBand: {
    paddingTop: 8,
    paddingBottom: 14,
    marginBottom: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
});
