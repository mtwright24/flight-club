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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  airportBoardFetch,
  flightTrackerDevLog,
  inboundAircraftFetch,
} from '../../src/features/flight-tracker/api/flightTrackerService';
import type { NormalizedBoardRow } from '../../src/features/flight-tracker/types';
import {
  ActiveTrackedCard,
  BoardPreviewRow,
  DashboardSection,
  DelayAlertRow,
  ftHub,
  QuickActionTile,
  RecentSearchChip,
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
import { colors, radius, spacing } from '../../src/styles/theme';

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

/** Fixed 3×2 layout — avoids flexWrap + min-width bugs that collapse to one column */
const QUICK_ACTION_ROWS = [QUICK_ACTIONS.slice(0, 2), QUICK_ACTIONS.slice(2, 4), QUICK_ACTIONS.slice(4, 6)];

export default function FlightTrackerHubScreen() {
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
  const [boardError, setBoardError] = useState<string | null>(null);
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

  const loadBoardPreview = useCallback(async () => {
    setBoardLoading(true);
    setBoardError(null);
    try {
      const res = await airportBoardFetch({
        airportCode: PREVIEW_AIRPORT,
        boardType: 'departures',
      });
      setBoardRows(res.rows.slice(0, 6));
      if (res.rows.length === 0) {
        flightTrackerDevLog('hub-board', 'preview_empty', { airport: PREVIEW_AIRPORT, source: res.source });
      }
    } catch (e: unknown) {
      setBoardRows([]);
      const msg = e instanceof Error ? e.message : 'Board preview failed';
      setBoardError(msg);
      flightTrackerDevLog('hub-board', 'preview_error', { message: msg });
    } finally {
      setBoardLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoardPreview();
  }, [loadBoardPreview]);

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
          if (r.supported === false) continue;
          const sum = r.flight.inboundSummary;
          if (sum?.delayMinutes != null && sum.delayMinutes > 0) {
            next[w.id] = `Inbound aircraft arriving ${sum.delayMinutes}m late`;
          } else if (r.minutesLate != null && r.minutesLate > 0) {
            next[w.id] = `Inbound aircraft arriving ${r.minutesLate}m late`;
          }
        } catch (e: unknown) {
          flightTrackerDevLog('hub-inbound', 'hint_fetch_failed', {
            message: e instanceof Error ? e.message : String(e),
          });
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
    return rows.slice(0, 5);
  }, [watched, inboundHints]);

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
          <Ionicons name="search" size={18} color={colors.textSecondary} />
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
          {QUICK_ACTION_ROWS.map((row, rowIdx) => (
            <View key={`row-${rowIdx}`} style={styles.quickRow}>
              {row.map((a, i) => (
                <View key={a.href} style={[styles.quickTileCell, i > 0 && styles.quickTileCellGap]}>
                  <QuickActionTile
                    title={a.title}
                    subtitle={a.subtitle}
                    icon={a.icon}
                    onPress={() => router.push(a.href as never)}
                  />
                </View>
              ))}
            </View>
          ))}
        </View>

        {loadError ? (
          <DashboardSection title="Couldn’t load data">
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </DashboardSection>
        ) : null}

        <DashboardSection
          title="Active tracked flights"
          right={<SectionHeaderLink label="View all" onPress={() => router.push('/flight-tracker/saved')} />}
        >
          {loading ? (
            <View style={styles.sectionLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : activeTracked.length === 0 ? (
            <Text style={styles.emptyMuted}>Save a flight to pin live tracker cards here.</Text>
          ) : (
            activeTracked.slice(0, 8).map((w, i, arr) => (
              <ActiveTrackedCard
                key={w.id}
                item={w}
                inboundHint={inboundHints[w.id]}
                isLast={i === arr.length - 1}
                onPress={() => router.push(`/flight-tracker/flight/${encodeURIComponent(w.flight_key)}`)}
              />
            ))
          )}
        </DashboardSection>

        <DashboardSection title="Delay alerts">
          {delayRisks.length === 0 ? (
            <Text style={styles.emptyMuted}>No current delay risks on your saved flights.</Text>
          ) : (
            delayRisks.map((d, i, arr) => (
              <DelayAlertRow
                key={d.id}
                title={d.title}
                subtitle={d.subtitle}
                isLast={i === arr.length - 1}
                onPress={d.flightKey ? () => router.push(`/flight-tracker/flight/${encodeURIComponent(d.flightKey!)}`) : undefined}
              />
            ))
          )}
        </DashboardSection>

        <DashboardSection
          title="Saved watchlist"
          right={<SectionHeaderLink label="View all" onPress={() => router.push('/flight-tracker/saved')} />}
        >
          {loading ? (
            <View style={styles.sectionLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : watched.length === 0 ? (
            <Text style={styles.emptyMuted}>No saved flights yet.</Text>
          ) : (
            watched.slice(0, 4).map((w, i, arr) => (
              <WatchlistRow
                key={w.id}
                item={w}
                isLast={i === arr.length - 1}
                onPress={() => router.push(`/flight-tracker/flight/${encodeURIComponent(w.flight_key)}`)}
              />
            ))
          )}
        </DashboardSection>

        <DashboardSection
          title="Recent searches"
          right={<SectionHeaderLink label="View all" onPress={() => router.push('/flight-tracker/search')} />}
        >
          {recent.length === 0 ? (
            <Text style={styles.emptyMuted}>Search for a flight number, route, or airport.</Text>
          ) : (
            <View style={styles.recentGrid}>
              {recent.map((r, idx) => (
                <RecentSearchChip
                  key={`${r.query}-${idx}`}
                  label={r.query}
                  meta={r.query_type}
                  onPress={() => router.push({ pathname: '/flight-tracker/results', params: { q: r.query } })}
                />
              ))}
            </View>
          )}
        </DashboardSection>

        <DashboardSection
          title={`${PREVIEW_AIRPORT} departures`}
          right={<SectionHeaderLink label="View board" onPress={() => router.push('/flight-tracker/airport-board')} />}
        >
          {boardLoading ? (
            <View style={styles.sectionLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : boardError ? (
            <View>
              <Text style={styles.errorText}>{boardError}</Text>
              <Pressable style={styles.retryBtn} onPress={() => void loadBoardPreview()}>
                <Text style={styles.retryText}>Retry preview</Text>
              </Pressable>
            </View>
          ) : boardRows.length === 0 ? (
            <Text style={styles.emptyMuted}>
              No departures returned for {PREVIEW_AIRPORT} today — the provider may have no matching flights for this date, or try again shortly.
            </Text>
          ) : (
            <>
              <View style={styles.boardHeaderRow}>
                <Text style={styles.boardH}>Flight</Text>
                <Text style={[styles.boardH, styles.boardHFlex]}>Route</Text>
                <Text style={styles.boardH}>Time</Text>
                <Text style={styles.boardH}>Gate</Text>
              </View>
              {boardRows.map((row, i, arr) => (
                <BoardPreviewRow
                  key={`${row.providerFlightId ?? row.displayFlightNumber}-${i}`}
                  row={row}
                  isLast={i === arr.length - 1}
                />
              ))}
            </>
          )}
        </DashboardSection>
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
    fontSize: 16,
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
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 4,
    letterSpacing: -0.12,
    lineHeight: 16,
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
    paddingVertical: 9,
    paddingHorizontal: 6,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  quickGrid: {
    width: '100%',
    marginBottom: 16,
  },
  quickRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: ftHub.quickTileGap,
  },
  /** Equal 2-col split — Pressable as direct flex child does not expand reliably on native */
  quickTileCell: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  quickTileCellGap: {
    marginLeft: ftHub.quickTileGap,
  },
  recentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: ftHub.quickTileGap,
  },
  sectionLoading: { paddingVertical: 14, alignItems: 'center' },
  emptyMuted: { color: colors.textSecondary, fontSize: 11, fontWeight: '600', lineHeight: 16 },
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
    paddingBottom: 8,
    marginBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8ECF0',
    gap: 8,
  },
  boardH: { width: 72, fontSize: 9, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase' },
  boardHFlex: { flex: 1, width: undefined },
});
