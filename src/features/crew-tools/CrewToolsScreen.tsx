import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../styles/refreshControl';
import { colors, spacing } from '../../styles/theme';
import BundleCard from './BundleCard';
import CrewToolsSearchBar from './CrewToolsSearchBar';
import CrewToolsSegmentedControl from './CrewToolsSegmentedControl';
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
import { matchesBundleQuery, matchesToolQuery } from './search';
import SectionHeading from './SectionHeading';
import type { CrewBundle, CrewTool, CrewToolsMode } from './types';
import {
  ExploreHeroCard,
  FeaturedToolCard,
  RowToolCard,
  StoreToolCard,
} from './ToolCards';

function HorizontalRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.hScroll}
    >
      {children}
    </ScrollView>
  );
}

export default function CrewToolsScreen() {
  const router = useRouter();
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
                <HorizontalRow>
                  {myFavorites.map((t) => (
                    <RowToolCard key={t.id} tool={t} onPress={onToolPress} />
                  ))}
                </HorizontalRow>
              </View>
            ) : null}

            {myRecent.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Recently used" onSeeAll={() => seeAll('Recently used')} />
                <HorizontalRow>
                  {myRecent.map((t) => (
                    <RowToolCard key={t.id} tool={t} onPress={onToolPress} />
                  ))}
                </HorizontalRow>
              </View>
            ) : null}

            {myIncluded.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading
                  title="Included in your plan"
                  onSeeAll={() => seeAll('Included in your plan')}
                />
                <HorizontalRow>
                  {myIncluded.map((t) => (
                    <RowToolCard key={t.id} tool={t} onPress={onToolPress} />
                  ))}
                </HorizontalRow>
              </View>
            ) : null}

            {mySuggested.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Suggested for you" onSeeAll={() => seeAll('Suggested for you')} />
                <HorizontalRow>
                  {mySuggested.map((t) => (
                    <StoreToolCard
                      key={t.id}
                      tool={t}
                      onPress={onToolPress}
                      goldPro={t.id === 'crew-calendar-pro'}
                    />
                  ))}
                </HorizontalRow>
              </View>
            ) : null}

            <PromoUpgradeCard onPress={onPromoPress} />
          </>
        ) : null}

        {mode === 'explore' && !showEmpty ? (
          <>
            {featured.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Featured" onSeeAll={() => seeAll('Featured')} />
                <HorizontalRow>
                  {featured.map((t) => (
                    <FeaturedToolCard key={t.id} tool={t} onPress={onToolPress} />
                  ))}
                </HorizontalRow>
              </View>
            ) : null}

            {exploreGrid.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Explore tools" onSeeAll={() => seeAll('Explore tools')} />
                <HorizontalRow>
                  <ExploreHeroCard tool={exploreGrid[0]} onPress={onToolPress} />
                  {exploreGrid.slice(1).map((t) => (
                    <StoreToolCard key={t.id} tool={t} onPress={onToolPress} />
                  ))}
                </HorizontalRow>
              </View>
            ) : null}

            {topFree.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Top free tools" onSeeAll={() => seeAll('Top free tools')} />
                <HorizontalRow>
                  {topFree.map((t) => (
                    <StoreToolCard key={t.id} tool={t} onPress={onToolPress} />
                  ))}
                </HorizontalRow>
              </View>
            ) : null}

            {topPremium.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Top premium tools" onSeeAll={() => seeAll('Top premium tools')} />
                <HorizontalRow>
                  {topPremium.map((t) => (
                    <StoreToolCard key={t.id} tool={t} onPress={onToolPress} />
                  ))}
                </HorizontalRow>
              </View>
            ) : null}

            {trending.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Trending" onSeeAll={() => seeAll('Trending')} />
                <HorizontalRow>
                  {trending.map((t) => (
                    <RowToolCard key={t.id} tool={t} onPress={onToolPress} />
                  ))}
                </HorizontalRow>
              </View>
            ) : null}

            {newTools.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="New tools" onSeeAll={() => seeAll('New tools')} />
                <HorizontalRow>
                  {newTools.map((t) => (
                    <StoreToolCard key={t.id} tool={t} onPress={onToolPress} />
                  ))}
                </HorizontalRow>
              </View>
            ) : null}

            {bestCommuters.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Best for commuters" onSeeAll={() => seeAll('Best for commuters')} />
                <HorizontalRow>
                  {bestCommuters.map((t) => (
                    <StoreToolCard key={t.id} tool={t} onPress={onToolPress} />
                  ))}
                </HorizontalRow>
              </View>
            ) : null}

            {bestInflight.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Best for inflight" onSeeAll={() => seeAll('Best for inflight')} />
                <HorizontalRow>
                  {bestInflight.map((t) => (
                    <StoreToolCard key={t.id} tool={t} onPress={onToolPress} />
                  ))}
                </HorizontalRow>
              </View>
            ) : null}

            {bestPilots.length > 0 ? (
              <View style={styles.section}>
                <SectionHeading title="Best for pilots" onSeeAll={() => seeAll('Best for pilots')} />
                <HorizontalRow>
                  {bestPilots.map((t) => (
                    <StoreToolCard key={t.id} tool={t} onPress={onToolPress} />
                  ))}
                </HorizontalRow>
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
                <HorizontalRow>
                  {savedTools.map((t) => (
                    <RowToolCard key={t.id} tool={t} onPress={onToolPress} />
                  ))}
                </HorizontalRow>
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
                <HorizontalRow>
                  {tryLater.map((t) => (
                    <StoreToolCard key={t.id} tool={t} onPress={onToolPress} />
                  ))}
                </HorizontalRow>
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
  hScroll: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  section: {
    marginTop: 8,
    marginBottom: 4,
  },
  bundleBlock: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  bundleBlockTight: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  empty: {
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  emptySub: { fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center' },
});
