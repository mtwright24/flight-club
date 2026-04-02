import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../../styles/refreshControl';
import { getMockTripsForMonth } from '../mockScheduleData';
import {
  loadLastMonthCursor,
  loadScheduleViewMode,
  saveLastMonthCursor,
  saveScheduleViewMode,
} from '../scheduleViewStorage';
import { scheduleTheme as T } from '../scheduleTheme';
import type { CrewScheduleTrip, ScheduleViewMode } from '../types';
import ClassicListView from '../components/ClassicListView';
import CalendarMonthView from '../components/CalendarMonthView';
import SmartListView from '../components/SmartListView';

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

const VIEW_OPTIONS: { id: ScheduleViewMode; label: string }[] = [
  { id: 'classic', label: 'Classic List' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'smart', label: 'Smart List' },
];

function formatRelativeUpdated(iso: string): string {
  const t = new Date(iso).getTime();
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleString();
}

export default function ScheduleTabScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('classic');
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toISOString());

  useEffect(() => {
    void loadScheduleViewMode().then(setViewMode);
    void loadLastMonthCursor().then((c) => {
      if (c) {
        setYear(c.year);
        setMonth(c.month);
      }
    });
  }, []);

  const trips = useMemo(() => getMockTripsForMonth(year, month), [year, month]);

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  const persistMonth = useCallback((y: number, m: number) => {
    setYear(y);
    setMonth(m);
    void saveLastMonthCursor(y, m);
  }, []);

  const goPrevMonth = () => {
    if (month === 1) persistMonth(year - 1, 12);
    else persistMonth(year, month - 1);
  };

  const goNextMonth = () => {
    if (month === 12) persistMonth(year + 1, 1);
    else persistMonth(year, month + 1);
  };

  const goToday = () => {
    const d = new Date();
    persistMonth(d.getFullYear(), d.getMonth() + 1);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 400));
    setLastUpdated(new Date().toISOString());
    setRefreshing(false);
  }, []);

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
          params: {
            prefillPairing: trip.pairingCode,
            prefillRoute: trip.routeSummary,
            prefillStart: trip.startDate,
            prefillEnd: trip.endDate,
            prefillFrom: trip.origin ?? '',
            prefillTo: trip.destination ?? '',
            prefillBase: trip.base ?? '',
            prefillCredit: trip.creditHours != null ? String(trip.creditHours) : '',
          },
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

  const setMode = (m: ScheduleViewMode) => {
    setViewMode(m);
    void saveScheduleViewMode(m);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: 0 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={REFRESH_CONTROL_COLORS}
          tintColor={REFRESH_TINT}
        />
      }
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.controlStrip}>
        <View style={styles.monthRow}>
          <Pressable onPress={goPrevMonth} style={styles.iconHit} accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={22} color={T.text} />
          </Pressable>
          <Text style={styles.monthText}>{monthLabel}</Text>
          <Pressable onPress={goNextMonth} style={styles.iconHit} accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={22} color={T.text} />
          </Pressable>
        </View>
        <View style={styles.viewRow}>
          {VIEW_OPTIONS.map((opt) => {
            const active = viewMode === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setMode(opt.id)}
                style={[styles.seg, active && styles.segActive]}
              >
                <Text style={[styles.segText, active && styles.segTextActive]} numberOfLines={1}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.actionRow}>
          <Pressable
            style={styles.importBtn}
            onPress={() => router.push('/crew-schedule/import-schedule')}
          >
            <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
            <Text style={styles.importBtnText}>Import Schedule</Text>
          </Pressable>
          <Pressable style={styles.todayBtn} onPress={goToday}>
            <Text style={styles.todayText}>Today</Text>
          </Pressable>
          <Pressable style={styles.todayBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={18} color={T.accent} />
          </Pressable>
        </View>
        <Text style={styles.updated}>Last updated {formatRelativeUpdated(lastUpdated)}</Text>
      </View>

      <View style={styles.readingArea}>
        {viewMode === 'classic' && (
          <ClassicListView
            trips={trips}
            onPressTrip={openTrip}
            onImportSchedule={() => router.push('/crew-schedule/import-schedule')}
          />
        )}
        {viewMode === 'calendar' && (
          <CalendarMonthView
            year={year}
            month={month}
            trips={trips}
            onPressDay={onPressCalendarDay}
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
            onHotel={(trip) =>
              router.push({ pathname: '/crew-schedule/hotels', params: { tripId: trip.id } })
            }
            onAlert={(trip) =>
              router.push({ pathname: '/crew-schedule/alerts', params: { tripId: trip.id } })
            }
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: T.bg },
  scrollContent: { flexGrow: 1 },
  controlStrip: {
    backgroundColor: T.surface,
    paddingHorizontal: 10,
    paddingTop: 1,
    paddingBottom: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  monthText: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  iconHit: { paddingHorizontal: 4, paddingVertical: 2 },
  viewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 3,
  },
  seg: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 6,
    backgroundColor: T.surfaceMuted,
    borderWidth: 1,
    borderColor: T.line,
  },
  segActive: {
    backgroundColor: '#FFFFFF',
    borderColor: T.accent,
  },
  segText: { fontSize: 11, fontWeight: '700', color: T.textSecondary },
  segTextActive: { color: T.accent },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: T.accent,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  importBtnText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  todayBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
  },
  todayText: { fontWeight: '800', color: T.accent, fontSize: 11 },
  updated: { fontSize: 10, color: T.textSecondary, marginTop: 2 },
  readingArea: { paddingHorizontal: 0, paddingTop: 4 },
});
