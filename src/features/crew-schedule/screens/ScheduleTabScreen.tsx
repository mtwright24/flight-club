import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { FlicaMonthStats, FlicaPairing } from '../../../services/flicaScheduleHtmlParser';
import FlicaCrewScheduleSection from '../components/FlicaCrewScheduleSection';
import { useScheduleTripsForMonth } from '../hooks/useScheduleTripsForMonth';
import {
  fetchCrewScheduleFlicaForMonth,
  hasFlicaDirectImportForMonth,
  type CrewScheduleFlicaRow,
  removeMonthScheduleAndImports,
} from '../scheduleApi';
import {
  loadLastMonthCursor,
  loadScheduleViewMode,
  saveLastMonthCursor,
} from '../scheduleViewStorage';
import { scheduleTheme as T } from '../scheduleTheme';
import type { CrewScheduleTrip, ScheduleViewMode } from '../types';
import { tradePostPrefillParams } from '../tradePostPrefillParams';
import ClassicListView from '../components/ClassicListView';
import CalendarMonthView from '../components/CalendarMonthView';
import SmartListView from '../components/SmartListView';
import { Ionicons } from '@expo/vector-icons';
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export default function ScheduleTabScreen() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('classic');
  const [removingMonth, setRemovingMonth] = useState(false);
  const [flicaRow, setFlicaRow] = useState<CrewScheduleFlicaRow | null>(null);

  const monthKey = useMemo(
    () => `${year}-${String(month).padStart(2, '0')}`,
    [year, month]
  );

  React.useEffect(() => {
    void loadLastMonthCursor().then((c) => {
      if (c) {
        setYear(c.year);
        setMonth(c.month);
      }
    });
  }, []);

  const { trips, monthMetrics, refreshing, refresh, refreshSilent } = useScheduleTripsForMonth(year, month);
  const [flicaDirectForMonth, setFlicaDirectForMonth] = useState(false);

  const loadFlicaDirectFlag = useCallback(() => {
    void hasFlicaDirectImportForMonth(year, month).then(setFlicaDirectForMonth);
  }, [year, month]);

  const loadFlicaRow = useCallback(async () => {
    try {
      const row = await fetchCrewScheduleFlicaForMonth(year, month);
      setFlicaRow(row);
    } catch {
      setFlicaRow(null);
    }
  }, [year, month]);

  useEffect(() => {
    void loadFlicaRow();
  }, [loadFlicaRow]);

  useEffect(() => {
    loadFlicaDirectFlag();
  }, [loadFlicaDirectFlag]);

  useFocusEffect(
    useCallback(() => {
      void loadScheduleViewMode().then(setViewMode);
      void refreshSilent();
      void loadFlicaRow();
      loadFlicaDirectFlag();
    }, [loadFlicaDirectFlag, loadFlicaRow, refreshSilent])
  );

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  const persistMonth = useCallback((y: number, m: number) => {
    setYear(y);
    setMonth(m);
    void saveLastMonthCursor(y, m);
  }, []);

  const goPrevMonth = useCallback(() => {
    if (removingMonth) return;
    if (month === 1) persistMonth(year - 1, 12);
    else persistMonth(year, month - 1);
  }, [month, year, persistMonth, removingMonth]);

  const goNextMonth = useCallback(() => {
    if (removingMonth) return;
    if (month === 12) persistMonth(year + 1, 1);
    else persistMonth(year, month + 1);
  }, [month, year, persistMonth, removingMonth]);

  /**
   * Swipe to change month — **must** use JS-thread `PanResponder` here, not `Gesture.Pan().onEnd`
   * from react-native-gesture-handler: that path runs on the native/UI worklet and calling
   * `setState` (month) crashes the app / kills Expo. PanResponder is safe.
   * Horizontal drags only (vertical scroll is left to `ScrollView`).
   */
  const monthSwipePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => {
          return Math.abs(g.dx) > 28 && Math.abs(g.dx) > Math.abs(g.dy) + 12;
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, g) => {
          if (removingMonth) return;
          const minDist = 56;
          const minVel = 0.4;
          if (g.dx < -minDist || g.vx < -minVel) {
            goNextMonth();
          } else if (g.dx > minDist || g.vx > minVel) {
            goPrevMonth();
          }
        },
      }),
    [goNextMonth, goPrevMonth, removingMonth]
  );

  const openTrip = useCallback(
    (trip: CrewScheduleTrip) => {
      router.push({ pathname: '/crew-schedule/trip-detail', params: { tripId: trip.id } });
    },
    [router]
  );

  const openTradePost = useCallback(
    (trip?: CrewScheduleTrip) => {
      if (trip) {
        router.push({
          pathname: '/crew-exchange/create-post',
          params: tradePostPrefillParams(trip),
        });
      } else {
        router.push('/crew-exchange/create-post');
      }
    },
    [router]
  );

  const onPressCalendarDay = useCallback(
    (iso: string) => {
      const onDay = trips.filter((t) => iso >= t.startDate && iso <= t.endDate);
      if (onDay.length > 0) openTrip(onDay[0]);
    },
    [trips, openTrip]
  );

  const openManage = useCallback(() => {
    router.push('/crew-schedule/manage');
  }, [router]);

  const runRemoveMonthConfirmed = useCallback(async () => {
    setRemovingMonth(true);
    try {
      const r = await removeMonthScheduleAndImports(monthKey);
      setFlicaDirectForMonth(false);
      await refresh();
      const doneMsg =
        r.entriesRemoved > 0 || r.batchesRemoved > 0
          ? `Removed ${r.entriesRemoved} calendar day${r.entriesRemoved === 1 ? '' : 's'} and ${r.batchesRemoved} import batch${r.batchesRemoved === 1 ? '' : 'es'}.`
          : 'Nothing was stored for this month.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`Done\n\n${doneMsg}`);
      } else {
        Alert.alert('Done', doneMsg);
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`Could not remove\n\n${err}`);
      } else {
        Alert.alert('Could not remove', err);
      }
    } finally {
      setRemovingMonth(false);
    }
  }, [monthKey, refresh]);

  const flicaPairings = useMemo(
    () => (Array.isArray(flicaRow?.pairings) ? (flicaRow.pairings as FlicaPairing[]) : []),
    [flicaRow]
  );

  const flicaStats: FlicaMonthStats = useMemo(() => {
    const raw = (flicaRow?.stats ?? {}) as Partial<FlicaMonthStats>;
    return {
      block: raw.block ?? '',
      credit: raw.credit ?? '',
      tafb: raw.tafb ?? '',
      ytd: raw.ytd ?? '',
      daysOff: typeof raw.daysOff === 'number' ? raw.daysOff : 0,
    };
  }, [flicaRow]);

  /** Non-FLICA months: refetch `schedule_entries`. FLICA direct months: full WebView + cookie + token + month download. */
  const onSchedulePullToRefresh = useCallback(() => {
    if (flicaDirectForMonth) {
      router.push({
        pathname: '/crew-schedule/import-flica-direct',
        params: { autoSync: '1' },
      });
      return;
    }
    void refresh();
  }, [flicaDirectForMonth, refresh, router]);

  const onRemoveMonthFromSchedule = useCallback(() => {
    const title = `Delete imported schedule for ${monthLabel}?`;
    const message =
      'This deletes all days on your calendar for this month, saved month totals, and import batches stored for this month (including FLICA pairing reviews tied to those imports). This cannot be undone.';

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${title}\n\n${message}`)) void runRemoveMonthConfirmed();
      return;
    }

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void runRemoveMonthConfirmed(),
      },
    ]);
  }, [monthLabel, runRemoveMonthConfirmed]);

  return (
    <View style={styles.screenRoot} {...monthSwipePan.panHandlers}>
      <View style={styles.monthRow} accessibilityLabel="Month header — swipe left or right to change month">
        <Pressable
          onPress={goPrevMonth}
          style={styles.iconHit}
          disabled={removingMonth}
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </Pressable>
        <Text style={styles.monthText}>{monthLabel}</Text>
        <Pressable
          onPress={goNextMonth}
          style={styles.iconHit}
          disabled={removingMonth}
          accessibilityLabel="Next month"
        >
          <Ionicons name="chevron-forward" size={22} color={T.text} />
        </Pressable>
      </View>

      <View style={styles.monthToolsRow} collapsable={false}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={onRemoveMonthFromSchedule}
          disabled={removingMonth}
          style={[styles.deleteImportBtn, removingMonth && styles.deleteImportBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`Delete imported schedule for ${monthLabel}`}
          hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
        >
          {removingMonth ? (
            <ActivityIndicator size="small" color={T.importReview.bad} />
          ) : (
            <Ionicons name="trash-outline" size={18} color={T.importReview.bad} />
          )}
          <Text style={styles.deleteImportLabel}>
            {removingMonth ? 'Removing…' : 'Delete imported schedule'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        refreshControl={
          <RefreshControl
            refreshing={flicaDirectForMonth ? false : refreshing}
            onRefresh={onSchedulePullToRefresh}
            tintColor={T.accent}
          />
        }
      >
        <View style={styles.readingArea}>
          {flicaPairings.length > 0 ? (
            <FlicaCrewScheduleSection
              stats={flicaStats}
              pairings={flicaPairings}
              importedAt={flicaRow?.imported_at}
            />
          ) : null}
          {viewMode === 'classic' && (
            <ClassicListView
              year={year}
              month={month}
              trips={trips}
              monthMetrics={monthMetrics}
              onPressTrip={openTrip}
              onOpenManage={openManage}
            />
          )}
          {viewMode === 'calendar' && (
            <CalendarMonthView
              year={year}
              month={month}
              trips={trips}
              onPressDay={onPressCalendarDay}
              onOpenTrip={openTrip}
            />
          )}
          {viewMode === 'smart' && (
            <SmartListView
              trips={trips}
              onPressTrip={openTrip}
              onPost={(trip) => openTradePost(trip)}
              onChat={(trip) =>
                router.push({ pathname: '/crew-schedule/trip-chat', params: { tripId: trip.id } })
              }
              onManageSchedule={() => router.push('/crew-schedule/manage')}
              onAlert={(trip) =>
                router.push({ pathname: '/crew-schedule/alerts', params: { tripId: trip.id } })
              }
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: T.bg },
  scroll: { flex: 1, backgroundColor: T.bg },
  scrollContent: { flexGrow: 1, paddingBottom: 8 },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
    gap: 4,
  },
  monthText: { fontSize: 16, fontWeight: '800', color: T.text },
  monthRowCenter: { flex: 1, textAlign: 'center', marginHorizontal: 4 },
  monthSide: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  iconHit: { paddingHorizontal: 6, paddingVertical: 4 },
  monthToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
  },
  deleteImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.importReview.badBg,
    backgroundColor: T.importReview.badBg,
  },
  deleteImportBtnDisabled: { opacity: 0.65 },
  deleteImportLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: T.importReview.bad,
    marginLeft: 8,
  },
  readingArea: { paddingHorizontal: 0, paddingTop: 0 },
});
