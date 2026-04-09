import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { airportBoardFetch, inboundAircraftFetch } from '../../src/features/flight-tracker/api/flightTrackerService';
import type { NormalizedBoardRow } from '../../src/features/flight-tracker/types';
import {
  ActiveTrackedCard,
  BoardPreviewRow,
  DelayAlertRow,
  ftHub,
  getFlightTrackerQuickTileWidth,
  QuickActionTile,
  RecentSearchChip,
  SectionHeader,
  SectionHeaderLink,
  WatchlistRow,
} from '../../src/features/flight-tracker/components/FlightTrackerHubParts';
import { useDmUnreadBadge } from '../../src/hooks/useDmUnreadBadge';
import { useNotificationsBadge } from '../../src/hooks/useNotificationsBadge';
import { useAuth } from '../../src/hooks/useAuth';
import {
  listRecentFlightSearches,
  listWatchedFlights,
  type TrackedFlightItem,
} from '../../src/lib/supabase/flightTracker';
import { colors, radius, shadow, spacing } from '../../src/styles/theme';

const PREVIEW_AIRPORT = 'JFK';

const QUICK_ACTIONS: {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  href: string;
}[] = [
  { title: 'Track a Flight', subtitle: 'Live status, gate, timing', icon: 'airplane-outline', href: '/flight-tracker/search' },
  { title: 'My Saved Flights', subtitle: 'Quick access to saved flights', icon: 'bookmark-outline', href: '/flight-tracker/saved' },
  { title: 'Delay Watcher', subtitle: 'Monitor late turns, swaps, changes', icon: 'timer-outline', href: '/flight-tracker/delay-watcher' },
  { title: 'Airport Board', subtitle: 'Arrivals & departures at a glance', icon: 'business-outline', href: '/flight-tracker/airport-board' },
  { title: 'Inbound Aircraft', subtitle: 'Track your inbound aircraft', icon: 'arrow-down-circle-outline', href: '/flight-tracker/inbound-aircraft' },
  { title: 'Schedule Sync', subtitle: 'Import & sync your pairings', icon: 'sync-outline', href: '/flight-tracker/schedule-sync' },
];

export default function FlightTrackerHubScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const quickTileWidth = getFlightTrackerQuickTileWidth(windowWidth, spacing.md, ftHub.quickTileGap);
  const router = useRouter();
  const unread = useNotificationsBadge();
  const { count: dmUnread } = useDmUnreadBadge();
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<{ query: string; query_type: string; flight_key: string | null }[]>([]);
  const [watched, setWatched] = useState<TrackedFlightItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [boardRows, setBoardRows] = useState<NormalizedBoardRow[]>([]);
  const [boardLoading, setBoardLoading] = useState(true);
  const [inboundHints, setInboundHints] = useState<Record<string, string>>({});

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
        listRecentFlightSearches(userId, 12),
        listWatchedFlights(userId),
      ]);
      setRecent(history);
      setWatched(watchlist);
    } catch (e: unknown) {
      setRecent([]);
      setWatched([]);
      setLoadError(e instanceof Error ? e.message : 'Unable to load tracked flights.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setBoardLoading(true);
      try {
        const res = await airportBoardFetch({
          airportCode: PREVIEW_AIRPORT,
          boardType: 'departures',
        });
        if (!cancelled) setBoardRows(res.rows.slice(0, 6));
      } catch {
        if (!cancelled) setBoardRows([]);
      } finally {
        if (!cancelled) setBoardLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!userId || watched.length === 0) {
      setInboundHints({});
      return;
    }
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const w of watched.slice(0, 3)) {
        if (!w.tracked_flight_id) continue;
        try {
          const r = await inboundAircraftFetch({ trackedFlightId: w.tracked_flight_id });
          const sum = r.flight.inboundSummary;
          if (sum?.delayMinutes != null && sum.delayMinutes > 0) {
            next[w.id] = `Inbound aircraft arriving ${sum.delayMinutes}m late`;
          } else if (r.minutesLate != null && r.minutesLate > 0) {
            next[w.id] = `Inbound aircraft arriving ${r.minutesLate}m late`;
          }
        } catch {
          /* optional */
        }
      }
      if (!cancelled) setInboundHints(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, watched]);

  const delayRisks = useMemo(() => {
    const rows: { id: string; title: string; subtitle: string; flightKey?: string }[] = [];
    for (const w of watched) {
      const f = w.flight;
      if (!f) continue;
      const dm = f.delay_minutes;
      if (dm != null && dm >= 10) {
        rows.push({
          id: `delay-${w.id}`,
          title: `${f.airline_code} ${f.flight_number}`,
          subtitle: `${dm} minute delay · ${f.origin_airport} → ${f.destination_airport}`,
          flightKey: w.flight_key,
        });
      }
      const hint = inboundHints[w.id];
      if (hint) {
        rows.push({
          id: `inb-${w.id}`,
          title: `${f.airline_code} ${f.flight_number}`,
          subtitle: hint,
          flightKey: w.flight_key,
        });
      }
    }
    const congested = boardRows.filter((r) => r.status === 'delayed').length >= 3;
    if (rows.length === 0 && congested) {
      rows.push({
        id: 'congestion',
        title: `${PREVIEW_AIRPORT} departures`,
        subtitle: 'Heavy delays on the board — allow extra taxi and gate time.',
      });
    }
    return rows.slice(0, 5);
  }, [watched, inboundHints, boardRows]);

  const activeTracked = watched.filter((w) => w.flight);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <Text
              style={styles.headerTitle}
              numberOfLines={1}
              ellipsizeMode="tail"
              {...(Platform.OS === 'ios'
                ? { adjustsFontSizeToMinimumFontScale: true, minimumFontScale: 0.85 }
                : {})}
            >
              Flight Tracker
            </Text>
          </View>
          <View style={styles.rightRow}>
            <Pressable
              onPress={() => router.push('/search')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}
              accessibilityLabel="Search"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="search-outline" size={24} color={colors.cardBg} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/notifications')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}
              accessibilityLabel="Notifications"
            >
              <Ionicons name="notifications-outline" size={24} color={colors.cardBg} />
              {unread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => router.push('/messages-inbox')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}
              accessibilityLabel="Messages"
            >
              <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.cardBg} />
              {dmUnread > 0 ? (
                <View style={[styles.badge, { right: -2 }]}>
                  <Text style={styles.badgeText}>{dmUnread > 99 ? '99+' : dmUnread}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => router.push('/menu')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}
              accessibilityLabel="Menu"
            >
              <Ionicons name="menu" size={24} color={colors.cardBg} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.heroSubtitle}>Live flight intelligence across your tools</Text>

        <Pressable
          style={styles.searchWrap}
          onPress={() => router.push({ pathname: '/flight-tracker/results', params: { q: query.trim() } })}
        >
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Track by flight, route, airport, or tail number"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => router.push({ pathname: '/flight-tracker/results', params: { q: query.trim() } })}
            autoCapitalize="characters"
            returnKeyType="search"
          />
        </Pressable>

        <View style={styles.quickGrid}>
          {QUICK_ACTIONS.map((a) => (
            <QuickActionTile
              key={a.href}
              title={a.title}
              subtitle={a.subtitle}
              icon={a.icon}
              tileWidth={quickTileWidth}
              onPress={() => router.push(a.href as never)}
            />
          ))}
        </View>

        {loadError ? (
          <View style={styles.sectionCard}>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <SectionHeader
            title="Active tracked flights"
            right={<SectionHeaderLink label="View all" onPress={() => router.push('/flight-tracker/saved')} />}
          />
          {loading ? (
            <View style={styles.sectionLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : activeTracked.length === 0 ? (
            <Text style={styles.emptyMuted}>Save a flight to pin live tracker cards here.</Text>
          ) : (
            activeTracked.slice(0, 8).map((w) => (
              <ActiveTrackedCard
                key={w.id}
                item={w}
                inboundHint={inboundHints[w.id]}
                onPress={() => router.push(`/flight-tracker/flight/${encodeURIComponent(w.flight_key)}`)}
              />
            ))
          )}
        </View>

        <View style={styles.sectionCard}>
          <SectionHeader title="Delay alerts" />
          {delayRisks.length === 0 ? (
            <Text style={styles.emptyMuted}>No current delay risks on your saved flights.</Text>
          ) : (
            delayRisks.map((d) => (
              <DelayAlertRow
                key={d.id}
                title={d.title}
                subtitle={d.subtitle}
                onPress={d.flightKey ? () => router.push(`/flight-tracker/flight/${encodeURIComponent(d.flightKey!)}`) : undefined}
              />
            ))
          )}
        </View>

        <View style={styles.sectionCard}>
          <SectionHeader
            title="Saved watchlist"
            right={<SectionHeaderLink label="View all" onPress={() => router.push('/flight-tracker/saved')} />}
          />
          {loading ? (
            <View style={styles.sectionLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : watched.length === 0 ? (
            <Text style={styles.emptyMuted}>No saved flights yet.</Text>
          ) : (
            watched.slice(0, 4).map((w) => (
              <WatchlistRow
                key={w.id}
                item={w}
                onPress={() => router.push(`/flight-tracker/flight/${encodeURIComponent(w.flight_key)}`)}
              />
            ))
          )}
        </View>

        <View style={styles.sectionCard}>
          <SectionHeader
            title="Recent searches"
            right={<SectionHeaderLink label="View all" onPress={() => router.push('/flight-tracker/search')} />}
          />
          {recent.length === 0 ? (
            <Text style={styles.emptyMuted}>Search for a flight number, route, or airport.</Text>
          ) : (
            <View style={styles.recentGrid}>
              {recent.map((r, idx) => (
                <RecentSearchChip
                  key={`${r.query}-${idx}`}
                  label={r.query}
                  meta={r.query_type}
                  chipWidth={quickTileWidth}
                  onPress={() => router.push({ pathname: '/flight-tracker/results', params: { q: r.query } })}
                />
              ))}
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <SectionHeader
            title={`${PREVIEW_AIRPORT} departures`}
            right={<SectionHeaderLink label="View board" onPress={() => router.push('/flight-tracker/airport-board')} />}
          />
          {boardLoading ? (
            <View style={styles.sectionLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : boardRows.length === 0 ? (
            <Text style={styles.emptyMuted}>Airport board unavailable right now.</Text>
          ) : (
            <>
              <View style={styles.boardHeaderRow}>
                <Text style={styles.boardH}>Flight</Text>
                <Text style={[styles.boardH, styles.boardHFlex]}>Route</Text>
                <Text style={styles.boardH}>Time</Text>
                <Text style={styles.boardH}>Gate</Text>
              </View>
              {boardRows.map((row, i) => (
                <BoardPreviewRow key={`${row.providerFlightId ?? row.displayFlightNumber}-${i}`} row={row} />
              ))}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ftHub.screenBg },
  headerSafe: { backgroundColor: colors.headerRed },
  scroll: { flex: 1 },
  header: {
    backgroundColor: colors.headerRed,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  titleWrap: { flex: 1, minWidth: 0, paddingHorizontal: spacing.xs },
  headerTitle: {
    color: colors.cardBg,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: {
    minWidth: 40,
    minHeight: 40,
    padding: 6,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconPressed: { backgroundColor: 'rgba(255,255,255,0.1)' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: colors.dangerRed,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
    zIndex: 2,
  },
  badgeText: { color: colors.cardBg, fontSize: 10, fontWeight: '800' },
  content: { paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: spacing.xl * 2 },
  heroSubtitle: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 6,
    letterSpacing: -0.15,
    lineHeight: 18,
  },
  searchWrap: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 6,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: ftHub.quickTileGap,
    marginBottom: 16,
  },
  recentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: ftHub.quickTileGap,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: ftHub.sectionRadius,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: ftHub.sectionBorder,
    ...shadow.cardShadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  sectionLoading: { paddingVertical: 18, alignItems: 'center' },
  emptyMuted: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  errorText: { color: colors.error, fontWeight: '700', textAlign: 'center' },
  retryBtn: {
    marginTop: 10,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: { color: colors.textPrimary, fontWeight: '800' },
  boardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  boardH: { width: 72, fontSize: 10, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase' },
  boardHFlex: { flex: 1, width: undefined },
});
