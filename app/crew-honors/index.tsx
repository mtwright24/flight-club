import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../../src/components/FlightClubHeader';
import CrewHonorMiniCard from '../../src/components/crewHonors/CrewHonorMiniCard';
import { CH } from '../../src/components/crewHonors/crewHonorsTheme';
import { useAuth } from '../../src/hooks/useAuth';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../src/styles/refreshControl';
import {
  featuredWinnersFromList,
  getCrewHonorFinalistsForVoting,
  getCrewHonorsByCycle,
  getCrewHonorsCycles,
  mergePublishedWinnersSorted,
  pickSpotlightPublishedCycle,
  restWinnersExcludingFeatured,
  submitCrewHonorVote,
  type CrewHonorCategoryGroup,
  type CrewHonorCycleListRow,
  type CrewHonorWinner,
} from '../../lib/crewHonors';

type GroupFilter = 'all' | CrewHonorCategoryGroup;
type TimeFilter = 'this_month' | 'all_time';

function monthShortLabel(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${year}`;
}

export default function CrewHonorsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const gridGap = 10;
  const gridCardW = Math.floor((width - 32 - gridGap) / 2);
  const featuredCardW = Math.min(124, Math.max(100, Math.floor((width - 48) / 3)));
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const [loading, setLoading] = useState(true);
  const [cycles, setCycles] = useState<CrewHonorCycleListRow[]>([]);
  const [winnersByCycle, setWinnersByCycle] = useState<Record<string, CrewHonorWinner[]>>({});
  const [finalists, setFinalists] = useState<any[]>([]);
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('this_month');
  const [votingBusy, setVotingBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const cycleRows = (await getCrewHonorsCycles()) as CrewHonorCycleListRow[];
    setCycles(cycleRows);
    const byCycle: Record<string, CrewHonorWinner[]> = {};
    await Promise.all(
      cycleRows.map(async (c) => {
        byCycle[c.id] = await getCrewHonorsByCycle(c.id, userId, groupFilter);
      })
    );
    setWinnersByCycle(byCycle);
    const votingCycle = cycleRows.find((c) => c.status === 'voting_open');
    if (votingCycle) {
      const list = await getCrewHonorFinalistsForVoting(votingCycle.id);
      setFinalists(list);
    } else {
      setFinalists([]);
    }
    setLoading(false);
  }, [groupFilter, userId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await load();
  });

  const publishedCycles = useMemo(
    () => cycles.filter((c) => c.status === 'published' || c.status === 'archived'),
    [cycles]
  );

  const spotlightCycle = useMemo(() => pickSpotlightPublishedCycle(publishedCycles), [publishedCycles]);

  const { featuredWinners, gridWinners, archiveBlocks } = useMemo(() => {
    if (timeFilter === 'this_month') {
      const cw = spotlightCycle ? winnersByCycle[spotlightCycle.id] || [] : [];
      const feat = featuredWinnersFromList(cw);
      const rest = restWinnersExcludingFeatured(cw, feat);
      const arch = publishedCycles
        .filter((c) => c.id !== spotlightCycle?.id)
        .map((c) => ({ cycle: c, winners: winnersByCycle[c.id] || [] }));
      return { featuredWinners: feat, gridWinners: rest, archiveBlocks: arch };
    }
    const flat = mergePublishedWinnersSorted(publishedCycles, winnersByCycle);
    const feat = featuredWinnersFromList(flat);
    const rest = restWinnersExcludingFeatured(flat, feat);
    const arch = publishedCycles
      .filter((c) => c.id !== publishedCycles[0]?.id)
      .map((c) => ({ cycle: c, winners: winnersByCycle[c.id] || [] }));
    return { featuredWinners: feat, gridWinners: rest, archiveBlocks: arch };
  }, [timeFilter, spotlightCycle, publishedCycles, winnersByCycle]);

  const nominationCycle = cycles.find((c) => c.status === 'nominations_open') || null;
  const votingCycle = cycles.find((c) => c.status === 'voting_open') || null;

  const onVote = useCallback(
    async (finalist: any) => {
      setVotingBusy(finalist.id);
      await submitCrewHonorVote({
        cycleId: finalist.cycle_id,
        categoryId: finalist.category_id,
        finalistId: finalist.id,
      });
      setVotingBusy(null);
      await load();
    },
    [load]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <FlightClubHeader title="Crew Honors" showLogo={false} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={REFRESH_CONTROL_COLORS} tintColor={REFRESH_TINT} />
        }
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Crew Honors</Text>
          <Text style={styles.heroSub}>Recognizing standout crew</Text>
        </View>

        <View style={styles.filterRow}>
          {(
            [
              { key: 'this_month', label: 'This Month' },
              { key: 'all_time', label: 'All Time' },
            ] as const
          ).map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setTimeFilter(f.key)}
              style={[styles.filterPill, timeFilter === f.key && styles.filterPillActive]}
            >
              <Text style={[styles.filterPillText, timeFilter === f.key && styles.filterPillTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.filterRow}>
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'professional', label: 'Professional' },
              { key: 'community', label: 'Community' },
              { key: 'fun', label: 'Fun' },
            ] as const
          ).map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setGroupFilter(f.key)}
              style={[styles.filterPill, groupFilter === f.key && styles.filterPillActive]}
            >
              <Text style={[styles.filterPillText, groupFilter === f.key && styles.filterPillTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={CH.red} />
          </View>
        ) : (
          <>
            <Section title="Featured Winners · Current Cycle Spotlight" variant="featured">
              {!spotlightCycle || featuredWinners.length === 0 ? (
                <Empty body="Honors for the current cycle will appear here when published." />
              ) : (
                <>
                  <Text style={styles.cycleLabel}>
                    {spotlightCycle.title} · {monthShortLabel(spotlightCycle.month, spotlightCycle.year)}
                  </Text>
                  <View style={styles.spotlightRim}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={[styles.heroScroll, { gap: 12, paddingVertical: 2 }]}
                    >
                      {featuredWinners.map((w) => (
                        <CrewHonorMiniCard
                          key={w.id}
                          winner={w}
                          layout="featured"
                          cardWidth={featuredCardW}
                          onPress={() => router.push(`/crew-honors/${w.id}`)}
                        />
                      ))}
                    </ScrollView>
                  </View>
                </>
              )}
            </Section>

            <Section title={timeFilter === 'this_month' ? 'All Current Honors · this cycle' : 'All Current Honors'}>
              {gridWinners.length === 0 ? (
                <Empty body="No honors match these filters yet." />
              ) : (
                <WinnerGrid cardWidth={gridCardW} gap={gridGap} winners={gridWinners} onOpen={(w) => router.push(`/crew-honors/${w.id}`)} />
              )}
            </Section>

            <Section title="Previous cycles">
              {archiveBlocks.length === 0 || archiveBlocks.every((b) => !b.winners.length) ? (
                <Empty body="Older published cycles will show here once there is more than one cycle on record." />
              ) : (
                archiveBlocks.map(({ cycle, winners }) =>
                  winners.length ? (
                    <View key={cycle.id} style={styles.archiveBlock}>
                      <Text style={styles.archiveTitle}>
                        {cycle.title} · {monthShortLabel(cycle.month, cycle.year)}
                      </Text>
                      <WinnerGrid cardWidth={gridCardW} gap={gridGap} winners={winners} onOpen={(w) => router.push(`/crew-honors/${w.id}`)} />
                    </View>
                  ) : null
                )
              )}
            </Section>

            <Section title="Nominate someone">
              {nominationCycle ? (
                <View style={styles.ctaRow}>
                  <Text style={styles.ctaCopy}>Nominations are open for {nominationCycle.title}. Recognize a standout crew member.</Text>
                  <Pressable style={styles.ctaBtn} onPress={() => router.push('/crew-honors/nominate')}>
                    <Text style={styles.ctaBtnText}>Nominate now</Text>
                  </Pressable>
                </View>
              ) : (
                <Empty body="Nominations are closed right now." />
              )}
            </Section>

            <Section title="Voting">
              {!votingCycle ? (
                <Empty body="Voting is closed." />
              ) : finalists.length === 0 ? (
                <Empty body="Finalists for this vote are not available yet." />
              ) : (
                <>
                  <Text style={styles.cycleLabel}>
                    {votingCycle.title} · voting ends {new Date(votingCycle.voting_close_at).toLocaleDateString()}
                  </Text>
                  {finalists.map((f: any) => (
                    <View key={f.id} style={styles.voteRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.voteCat}>{f.category?.title || 'Category'}</Text>
                        <Text style={styles.voteNominee}>
                          {f.nominee?.display_name || f.nominee?.full_name || f.nominee?.first_name || f.nominee?.handle || 'Flight crew'}
                        </Text>
                      </View>
                      <Pressable
                        style={[styles.voteBtn, votingBusy === f.id && { opacity: 0.5 }]}
                        onPress={() => void onVote(f)}
                        disabled={votingBusy === f.id}
                      >
                        <Text style={styles.voteBtnText}>Vote</Text>
                      </Pressable>
                    </View>
                  ))}
                </>
              )}
            </Section>

            <Section title="How it works">
              <Text style={styles.howText}>Nominate during the nomination window.</Text>
              <Text style={styles.howText}>Community categories open for voting during the vote window.</Text>
              <Text style={styles.howText}>Winners publish each cycle and appear on Home and here.</Text>
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function WinnerGrid({
  winners,
  onOpen,
  cardWidth,
  gap,
}: {
  winners: CrewHonorWinner[];
  onOpen: (winner: CrewHonorWinner) => void;
  cardWidth: number;
  gap: number;
}) {
  return (
    <View style={[styles.grid, { gap }]}>
      {winners.map((w) => (
        <CrewHonorMiniCard key={w.id} winner={w} layout="grid" cardWidth={cardWidth} onPress={() => onOpen(w)} />
      ))}
    </View>
  );
}

function Section({
  title,
  children,
  variant = 'default',
}: {
  title: string;
  children: React.ReactNode;
  variant?: 'default' | 'featured';
}) {
  return (
    <View style={[styles.section, variant === 'featured' && styles.sectionFeaturedWrap]}>
      <Text style={[styles.sectionTitle, variant === 'featured' && styles.sectionTitleFeatured]}>{title}</Text>
      {children}
    </View>
  );
}

function Empty({ body }: { body: string }) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CH.pageBg },
  content: { padding: 16, paddingBottom: 36 },
  hero: { marginBottom: 6 },
  heroTitle: { color: CH.navy, fontWeight: '800', fontSize: 26, letterSpacing: -0.4 },
  heroSub: { color: CH.muted, fontWeight: '600', marginTop: 4, fontSize: 15 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterPill: { borderWidth: 1, borderColor: CH.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  filterPillActive: { backgroundColor: CH.red, borderColor: CH.red },
  filterPillText: { color: CH.navySoft, fontWeight: '700', fontSize: 13 },
  filterPillTextActive: { color: '#fff' },
  loading: { paddingVertical: 28, alignItems: 'center' },
  section: { marginTop: 8, marginBottom: 6 },
  sectionFeaturedWrap: { marginTop: 14 },
  sectionTitle: { color: CH.red, fontWeight: '800', fontSize: 15, marginBottom: 10, letterSpacing: -0.2 },
  sectionTitleFeatured: { fontSize: 16, letterSpacing: -0.35 },
  cycleLabel: { color: CH.muted, fontWeight: '700', fontSize: 13, marginBottom: 10 },
  heroScroll: { flexDirection: 'row', alignItems: 'stretch', paddingRight: 4 },
  spotlightRim: {
    borderRadius: CH.radiusLg,
    borderWidth: 2,
    borderColor: CH.cardBorder,
    padding: 10,
    backgroundColor: CH.champagne,
    ...CH.shadow.elevated,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  emptyBox: { backgroundColor: '#fff', borderWidth: 1, borderColor: CH.line, borderRadius: CH.radiusMd, padding: 14 },
  emptyText: { color: CH.muted, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  archiveBlock: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: CH.line,
    borderRadius: CH.radiusMd,
    padding: 12,
    marginBottom: 12,
  },
  archiveTitle: { color: CH.navy, fontWeight: '800', fontSize: 14, marginBottom: 10 },
  ctaRow: { backgroundColor: '#fff', borderWidth: 1, borderColor: CH.line, borderRadius: CH.radiusMd, padding: 14 },
  ctaCopy: { color: CH.navySoft, fontWeight: '600', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  ctaBtn: { alignSelf: 'flex-start', borderRadius: 999, backgroundColor: CH.red, paddingHorizontal: 16, paddingVertical: 10 },
  ctaBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: CH.radiusMd,
    borderWidth: 1,
    borderColor: CH.line,
    padding: 12,
    marginBottom: 8,
  },
  voteCat: { color: CH.navy, fontWeight: '800', fontSize: 13 },
  voteNominee: { color: CH.muted, fontWeight: '600', marginTop: 2, fontSize: 13 },
  voteBtn: { borderRadius: 999, backgroundColor: CH.red, paddingHorizontal: 14, paddingVertical: 9 },
  voteBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  howText: { color: CH.navySoft, fontWeight: '600', fontSize: 14, lineHeight: 20, marginBottom: 4 },
});
