import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useScheduleTripsForMonth } from '../hooks/useScheduleTripsForMonth';
import {
  loadLastMonthCursor,
  loadScheduleViewMode,
  saveLastMonthCursor,
} from '../scheduleViewStorage';
import { scheduleTheme as T } from '../scheduleTheme';
import type { CrewScheduleTrip, ScheduleViewMode } from '../types';
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

  React.useEffect(() => {
    void loadLastMonthCursor().then((c) => {
      if (c) {
        setYear(c.year);
        setMonth(c.month);
      }
    });
  }, []);

  const { trips, refresh } = useScheduleTripsForMonth(year, month);

  useFocusEffect(
    useCallback(() => {
      void loadScheduleViewMode().then(setViewMode);
      void refresh();
    }, [refresh])
  );

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

  const openManage = useCallback(() => {
    router.push('/crew-schedule/manage');
  }, [router]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.monthRow}>
        <Pressable onPress={goPrevMonth} style={styles.iconHit} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </Pressable>
        <Text style={styles.monthText}>{monthLabel}</Text>
        <Pressable onPress={goNextMonth} style={styles.iconHit} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={22} color={T.text} />
        </Pressable>
      </View>

      <View style={styles.readingArea}>
        {viewMode === 'classic' && (
          <ClassicListView trips={trips} onPressTrip={openTrip} onOpenManage={openManage} />
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
            onManageSchedule={() => router.push('/crew-schedule/manage')}
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
  },
  monthText: { fontSize: 16, fontWeight: '800', color: T.text },
  iconHit: { paddingHorizontal: 6, paddingVertical: 4 },
  readingArea: { paddingHorizontal: 0, paddingTop: 0 },
});
