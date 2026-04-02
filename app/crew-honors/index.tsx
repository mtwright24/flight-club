import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightClubHeader from '../../src/components/FlightClubHeader';
import { useAuth } from '../../src/hooks/useAuth';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../src/styles/refreshControl';
import { COLORS, RADIUS, SHADOW } from '../../src/styles/theme';
import {
  getCrewHonorFinalistsForVoting,
  getCrewHonorsByCycle,
  getCrewHonorsCycles,
  submitCrewHonorVote,
  type CrewHonorCategoryGroup,
  type CrewHonorWinner,
} from '../../lib/crewHonors';

type GroupFilter = 'all' | CrewHonorCategoryGroup;
type TimeFilter = 'this_month' | 'all_time';

function monthLabel(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${year}`;
}

export default function CrewHonorsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const [loading, setLoading] = useState(true);
  const [cycles, setCycles] = useState<any[]>([]);
  const [winnersByCycle, setWinnersByCycle] = useState<Record<string, CrewHonorWinner[]>>({});
  const [finalists, setFinalists] = useState<any[]>([]);
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('this_month');
  const [votingBusy, setVotingBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const cycleRows = await getCrewHonorsCycles();
    setCycles(cycleRows);
    const byCycle: Record<string, CrewHonorWinner[]> = {};
    await Promise.all(
      cycleRows.map(async (c: any) => {
        byCycle[c.id] = await getCrewHonorsByCycle(c.id, userId, groupFilter);
      })
    );
    setWinnersByCycle(byCycle);
    const votingCycle = cycleRows.find((c: any) => c.status === 'voting_open');
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

  const publishedCycles = useMemo(() => cycles.filter((c) => c.status === 'published' || c.status === 'archived'), [cycles]);
  const currentCycle = publishedCycles[0] || null;
  const archiveCycles = publishedCycles.slice(1);
  const nominationCycle = cycles.find((c) => c.status === 'nominations_open') || null;
  const votingCycle = cycles.find((c) => c.status === 'voting_open') || null;

  const currentWinners = currentCycle ? winnersByCycle[currentCycle.id] || [] : [];
  const archiveForRender =
    timeFilter === 'this_month'
      ? archiveCycles.filter((c) => c.month === new Date().getMonth() + 1 && c.year === new Date().getFullYear())
      : archiveCycles;

  const onVote = useCallback(async (finalist: any) => {
    setVotingBusy(finalist.id);
    await submitCrewHonorVote({
      cycleId: finalist.cycle_id,
      categoryId: finalist.category_id,
      finalistId: finalist.id,
    });
    setVotingBusy(null);
    await load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <FlightClubHeader title="Crew Honors" showLogo={false} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={REFRESH_CONTROL_COLORS} tintColor={REFRESH_TINT} />}
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Crew Honors</Text>
          <Text style={styles.heroSub}>Recognizing standout crew</Text>
        </View>

        <View style={styles.filterRow}>
          {[
            { key: 'this_month', label: 'This Month' },
            { key: 'all_time', label: 'All Time' },
          ].map((f) => (
            <Pressable key={f.key} onPress={() => setTimeFilter(f.key as TimeFilter)} style={[styles.filterPill, timeFilter === f.key && styles.filterPillActive]}>
              <Text style={[styles.filterPillText, timeFilter === f.key && styles.filterPillTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.filterRow}>
          {[
            { key: 'all', label: 'All' },
            { key: 'professional', label: 'Professional' },
            { key: 'community', label: 'Community' },
            { key: 'fun', label: 'Fun' },
          ].map((f) => (
            <Pressable key={f.key} onPress={() => setGroupFilter(f.key as GroupFilter)} style={[styles.filterPill, groupFilter === f.key && styles.filterPillActive]}>
              <Text style={[styles.filterPillText, groupFilter === f.key && styles.filterPillTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={COLORS.red} /></View>
        ) : (
          <>
            <Section title="Featured Winners / Current Cycle Spotlight">
              {!currentCycle || currentWinners.length === 0 ? (
                <Empty body="No published Crew Honors winners yet for the active cycle." />
              ) : (
                <>
                  <Text style={styles.cycleLabel}>{currentCycle.title} · {monthLabel(currentCycle.month, currentCycle.year)}</Text>
                  <WinnerGrid winners={currentWinners} onOpen={(w) => router.push(`/crew-honors/${w.id}`)} />
                </>
              )}
            </Section>

            <Section title="All Current Honors">
              {currentWinners.length === 0 ? <Empty body="No current honors are live yet." /> : <WinnerGrid winners={currentWinners} onOpen={(w) => router.push(`/crew-honors/${w.id}`)} />}
            </Section>

            <Section title="Previous Cycles Archive">
              {archiveForRender.length === 0 ? (
                <Empty body="No archive cycles have been published yet." />
              ) : (
                archiveForRender.map((cycle: any) => {
                  const winners = winnersByCycle[cycle.id] || [];
                  return (
                    <View key={cycle.id} style={styles.archiveBlock}>
                      <Text style={styles.archiveTitle}>{cycle.title} · {monthLabel(cycle.month, cycle.year)}</Text>
                      {winners.length === 0 ? (
                        <Text style={styles.archiveEmpty}>No published winners in this cycle.</Text>
                      ) : (
                        <WinnerGrid winners={winners} onOpen={(w) => router.push(`/crew-honors/${w.id}`)} />
                      )}
                    </View>
                  );
                })
              )}
            </Section>

            <Section title="Nominate Someone">
              {nominationCycle ? (
                <View style={styles.ctaRow}>
                  <Text style={styles.ctaCopy}>
                    Nominations are open for {nominationCycle.title}. Submit a recognition for standout crew.
                  </Text>
                  <Pressable style={styles.ctaBtn} onPress={() => router.push('/crew-honors/nominate')}>
                    <Text style={styles.ctaBtnText}>Nominate Now</Text>
                  </Pressable>
                </View>
              ) : (
                <Empty body="Nominations are currently closed." />
              )}
            </Section>

            <Section title="Voting">
              {!votingCycle ? (
                <Empty body="Voting is currently closed." />
              ) : finalists.length === 0 ? (
                <Empty body="Voting opens soon — finalists are not published yet." />
              ) : (
                <>
                  <Text style={styles.cycleLabel}>
                    Voting open for {votingCycle.title} · ends {new Date(votingCycle.voting_close_at).toLocaleDateString()}
                  </Text>
                  {finalists.map((f: any) => (
                    <View key={f.id} style={styles.voteRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.voteCat}>{f.category?.title || 'Category'}</Text>
                        <Text style={styles.voteNominee}>
                          {f.nominee?.display_name || f.nominee?.full_name || f.nominee?.first_name || 'Crew Member'}
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
              <Text style={styles.howText}>1) Nominate during nomination window.</Text>
              <Text style={styles.howText}>2) Community-vote categories open during voting window.</Text>
              <Text style={styles.howText}>3) Winners publish monthly and appear on Home + Crew Honors.</Text>
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function WinnerGrid({ winners, onOpen }: { winners: CrewHonorWinner[]; onOpen: (winner: CrewHonorWinner) => void }) {
  return (
    <View style={styles.grid}>
      {winners.map((w) => (
        <Pressable key={w.id} style={[styles.winnerCard, SHADOW.soft]} onPress={() => onOpen(w)}>
          <View style={[styles.badge, { backgroundColor: w.category.accent_secondary, borderColor: w.category.trim_color }]}>
            <Ionicons name="ribbon-outline" size={14} color={w.category.accent_primary} />
          </View>
          <Text style={styles.winnerCat} numberOfLines={2}>{w.category.title}</Text>
          <Text style={styles.winnerName} numberOfLines={1}>{w.display_name}</Text>
          <Text style={styles.winnerBlurb} numberOfLines={1}>{w.short_blurb}</Text>
          <Text style={styles.winnerMeta} numberOfLines={1}>{w.total_reactions} reactions · {w.comments_count} comments</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
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
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 12, paddingBottom: 30 },
  hero: { marginBottom: 8 },
  heroTitle: { color: COLORS.navy, fontWeight: '800', fontSize: 24 },
  heroSub: { color: COLORS.text2, fontWeight: '600', marginTop: 4 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterPill: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  filterPillActive: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  filterPillText: { color: COLORS.navy, fontWeight: '700', fontSize: 12 },
  filterPillTextActive: { color: '#fff' },
  loading: { paddingVertical: 24, alignItems: 'center' },
  section: { marginTop: 10, marginBottom: 4 },
  sectionTitle: { color: COLORS.red, fontWeight: '800', fontSize: 16, marginBottom: 8 },
  cycleLabel: { color: COLORS.text2, fontWeight: '700', fontSize: 12, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  winnerCard: {
    width: '48%',
    minHeight: 132,
    backgroundColor: '#FFFDF7',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#EEDFB7',
    padding: 10,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  winnerCat: { color: COLORS.navy, fontWeight: '800', fontSize: 12, minHeight: 30 },
  winnerName: { color: COLORS.navySoft, fontWeight: '700', fontSize: 12, marginTop: 3 },
  winnerBlurb: { color: COLORS.text2, fontWeight: '600', fontSize: 11, marginTop: 3 },
  winnerMeta: { color: COLORS.text2, fontWeight: '700', fontSize: 10, marginTop: 7 },
  emptyBox: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.lg, padding: 12 },
  emptyText: { color: COLORS.text2, fontWeight: '600', fontSize: 13, lineHeight: 18 },
  archiveBlock: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.lg, padding: 10, marginBottom: 8 },
  archiveTitle: { color: COLORS.navy, fontWeight: '800', fontSize: 13, marginBottom: 8 },
  archiveEmpty: { color: COLORS.text2, fontWeight: '600', fontSize: 12 },
  ctaRow: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.lg, padding: 12 },
  ctaCopy: { color: COLORS.navySoft, fontWeight: '600', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  ctaBtn: { alignSelf: 'flex-start', borderRadius: 999, backgroundColor: COLORS.red, paddingHorizontal: 14, paddingVertical: 8 },
  ctaBtnText: { color: '#fff', fontWeight: '800' },
  voteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.line, padding: 10, marginBottom: 8 },
  voteCat: { color: COLORS.navy, fontWeight: '800', fontSize: 12 },
  voteNominee: { color: COLORS.text2, fontWeight: '600', marginTop: 2, fontSize: 12 },
  voteBtn: { borderRadius: 999, backgroundColor: COLORS.red, paddingHorizontal: 12, paddingVertical: 8 },
  voteBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  howText: { color: COLORS.navySoft, fontWeight: '600', fontSize: 13, lineHeight: 18, marginBottom: 4 },
});
