import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import {
  freshnessLabel,
  listRecentFlightSearches,
  listWatchedFlights,
  type TrackedFlightItem,
} from '../../src/lib/supabase/flightTracker';
import { colors, radius, shadow, spacing } from '../../src/styles/theme';

export default function FlightTrackerHubScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<{ query: string; query_type: string; flight_key: string | null }[]>([]);
  const [watched, setWatched] = useState<TrackedFlightItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setRecent([]);
      setWatched([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [history, watchlist] = await Promise.all([
        listRecentFlightSearches(userId, 8),
        listWatchedFlights(userId),
      ]);
      setRecent(history);
      setWatched(watchlist);
    } catch (e: any) {
      setRecent([]);
      setWatched([]);
      setLoadError(e?.message || 'Unable to load tracker data.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const featured = useMemo(
    () => watched.find((w) => w.flight?.normalized_status && !['landed', 'cancelled'].includes(w.flight.normalized_status)) || watched[0],
    [watched],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Flight Tracker</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>Live flight intelligence across your tools</Text>

        <Pressable
          style={styles.searchWrap}
          onPress={() => router.push({ pathname: '/flight-tracker/results', params: { q: query.trim() } })}
        >
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Track by flight, route, or airport"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => router.push({ pathname: '/flight-tracker/results', params: { q: query.trim() } })}
            autoCapitalize="characters"
            returnKeyType="search"
          />
        </Pressable>

        <View style={styles.quickActions}>
          <QuickAction label="Track a Flight" icon="airplane-outline" onPress={() => router.push('/flight-tracker/search')} />
          <QuickAction label="My Saved Flights" icon="bookmark-outline" onPress={() => router.push('/flight-tracker/saved')} />
          <QuickAction label="Delay Watcher" icon="timer-outline" onPress={() => router.push('/flight-tracker/delay-watcher')} />
          <QuickAction label="Airport Board" icon="business-outline" onPress={() => router.push('/flight-tracker/airport-board')} />
          <QuickAction label="Inbound Aircraft" icon="git-branch-outline" onPress={() => router.push('/flight-tracker/inbound-aircraft')} />
          <QuickAction label="Schedule Sync" icon="sync-outline" onPress={() => router.push('/flight-tracker/schedule-sync')} />
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : loadError ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tracker setup issue</Text>
            <Text style={styles.emptyText}>{loadError}</Text>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent searches</Text>
              {recent.length === 0 ? (
                <Text style={styles.emptyText}>Search for a flight number, route, or airport.</Text>
              ) : (
                recent.map((r, idx) => (
                  <Pressable
                    key={`${r.query}-${idx}`}
                    style={styles.rowItem}
                    onPress={() => router.push({ pathname: '/flight-tracker/results', params: { q: r.query } })}
                  >
                    <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.rowText}>{r.query}</Text>
                    <Text style={styles.rowMeta}>{r.query_type}</Text>
                  </Pressable>
                ))
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Saved watchlist</Text>
                <Pressable onPress={() => router.push('/flight-tracker/saved')}>
                  <Text style={styles.sectionLink}>View all {'>'}</Text>
                </Pressable>
              </View>
              {watched.length === 0 ? (
                <Text style={styles.emptyText}>No saved flights yet.</Text>
              ) : (
                watched.slice(0, 3).map((w) => (
                  <Pressable
                    key={w.id}
                    style={styles.watchCard}
                    onPress={() => router.push(`/flight-tracker/flight/${encodeURIComponent(w.flight_key)}`)}
                  >
                    <Text style={styles.watchTitle}>
                      {w.flight?.airline_code} {w.flight?.flight_number}
                    </Text>
                    <Text style={styles.watchRoute}>
                      {w.flight?.origin_airport} {'->'} {w.flight?.destination_airport}
                    </Text>
                    <Text style={styles.watchMeta}>
                      {w.flight?.normalized_status?.replace(/_/g, ' ') || 'unknown'} · {freshnessLabel(w.flight?.updated_at || null)}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Featured live tracker</Text>
              {!featured?.flight ? (
                <Text style={styles.emptyText}>Save a flight to pin a live tracker card here.</Text>
              ) : (
                <Pressable
                  style={[styles.watchCard, styles.featuredCard]}
                  onPress={() => router.push(`/flight-tracker/flight/${encodeURIComponent(featured.flight_key)}`)}
                >
                  <Text style={styles.watchTitle}>
                    {featured.flight.airline_code} {featured.flight.flight_number}
                  </Text>
                  <Text style={styles.watchRoute}>
                    {featured.flight.origin_airport} {'->'} {featured.flight.destination_airport}
                  </Text>
                  <Text style={styles.watchMeta}>
                    {featured.flight.normalized_status.replace(/_/g, ' ')} · {freshnessLabel(featured.flight.updated_at)}
                  </Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ label, icon, onPress }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void }) {
  return (
    <Pressable style={styles.quickChip} onPress={onPress}>
      <Ionicons name={icon} size={14} color={colors.primary} />
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    backgroundColor: colors.headerRed,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  subtitle: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 10 },
  searchWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  searchInput: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  quickChip: {
    borderWidth: 1,
    borderColor: '#FBC5C7',
    backgroundColor: '#FFF7F7',
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
  loading: { paddingVertical: 40, alignItems: 'center' },
  section: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: '#fff',
    padding: 12,
    marginTop: 10,
    ...shadow.cardShadow,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 14, marginBottom: 6 },
  sectionLink: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  emptyText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  rowItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 8 },
  rowText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700', flex: 1 },
  rowMeta: { color: colors.textSecondary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  watchCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: '#fff',
    padding: 10,
    marginTop: 8,
  },
  featuredCard: { backgroundColor: '#F8FAFC' },
  watchTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  watchRoute: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginTop: 2 },
  watchMeta: { color: colors.textSecondary, fontSize: 11, fontWeight: '600', marginTop: 3, textTransform: 'capitalize' },
});
