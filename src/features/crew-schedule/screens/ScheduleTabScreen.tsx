import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    PanResponder,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import type {
    FlicaMonthStats,
    FlicaPairing,
} from "../../../services/flicaScheduleHtmlParser";
import CalendarMonthView from "../components/CalendarMonthView";
import ClassicListView from "../components/ClassicListView";
import FlicaCrewScheduleSection from "../components/FlicaCrewScheduleSection";
import SmartListView from "../components/SmartListView";
import { useScheduleTripsForMonth } from "../hooks/useScheduleTripsForMonth";
import {
    fetchCrewScheduleFlicaForMonth,
    hasFlicaDirectImportForMonth,
    type CrewScheduleFlicaRow,
} from "../scheduleApi";
import {
    clampYearMonthToScheduleWindow,
    canGoToNextScheduleMonth,
    canGoToPreviousScheduleMonth,
    tryStepScheduleMonth,
} from "../scheduleMonthWindow";
import { monthCalendarKey } from "../scheduleMonthCache";
import { scheduleTheme as T } from "../scheduleTheme";
import {
    loadLastMonthCursor,
    loadScheduleViewMode,
    saveLastMonthCursor,
} from "../scheduleViewStorage";
import { tradePostPrefillParams } from "../tradePostPrefillParams";
import { stashTripForDetailNavigation } from "../tripDetailNavCache";
import type { CrewScheduleTrip, ScheduleMonthMetrics, ScheduleViewMode } from "../types";

function parseMonthCalendarKey(key: string): { year: number; month: number } {
  const [ys, ms] = key.split("-");
  const year = parseInt(ys ?? "", 10);
  const month = parseInt(ms ?? "", 10);
  return { year: Number.isFinite(year) ? year : 2026, month: Number.isFinite(month) ? month : 1 };
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function ScheduleTabScreen() {
  const router = useRouter();
  const seedYm = useMemo(() => {
    const d = new Date();
    return clampYearMonthToScheduleWindow(d.getFullYear(), d.getMonth() + 1, d);
  }, []);

  const [year, setYear] = useState(seedYm.year);
  const [month, setMonth] = useState(seedYm.month);

  const ymRef = React.useRef(seedYm);
  ymRef.current = { year, month };
  const [viewMode, setViewMode] = useState<ScheduleViewMode>("classic");
  const [flicaRow, setFlicaRow] = useState<CrewScheduleFlicaRow | null>(null);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);

  React.useEffect(() => {
    void loadLastMonthCursor().then((c) => {
      const anchor = new Date();
      if (c) {
        const cl = clampYearMonthToScheduleWindow(c.year, c.month, anchor);
        setYear(cl.year);
        setMonth(cl.month);
        if (cl.year !== c.year || cl.month !== c.month) void saveLastMonthCursor(cl.year, cl.month);
      }
    });
  }, []);

  const { trips, monthMetrics, loading, refresh, refreshSilent } =
    useScheduleTripsForMonth(year, month);
  const [, setFlicaDirectForMonth] = useState(false);

  const [committedMonth, setCommittedMonth] = useState<{
    key: string;
    trips: CrewScheduleTrip[];
    monthMetrics: ScheduleMonthMetrics | null;
  } | null>(null);

  const requestedKey = useMemo(() => monthCalendarKey(year, month), [year, month]);

  useEffect(() => {
    if (loading) return;
    setCommittedMonth({
      key: monthCalendarKey(year, month),
      trips,
      monthMetrics,
    });
  }, [loading, year, month, trips, monthMetrics]);

  const monthLoadPending =
    committedMonth != null && loading && committedMonth.key !== requestedKey;

  const { displayYear, displayMonth, displayTrips, displayMetrics } = useMemo(() => {
    const dk = monthLoadPending ? committedMonth!.key : requestedKey;
    const ym = parseMonthCalendarKey(dk);
    return {
      displayYear: ym.year,
      displayMonth: ym.month,
      displayTrips: monthLoadPending ? committedMonth!.trips : trips,
      displayMetrics: monthLoadPending ? committedMonth!.monthMetrics : monthMetrics,
    };
  }, [monthLoadPending, committedMonth, requestedKey, trips, monthMetrics]);

  const loadFlicaDirectFlag = useCallback(() => {
    void hasFlicaDirectImportForMonth(displayYear, displayMonth).then(setFlicaDirectForMonth);
  }, [displayYear, displayMonth]);

  const loadFlicaRow = useCallback(async () => {
    try {
      const row = await fetchCrewScheduleFlicaForMonth(displayYear, displayMonth);
      setFlicaRow(row);
    } catch {
      setFlicaRow(null);
    }
  }, [displayYear, displayMonth]);

  /** Refs: useFocusEffect must use a stable callback ([] deps). Otherwise any identity churn re-fires focus → setScheduleRefreshKey loops (maximum update depth). */
  const refreshSilentRef = useRef(refreshSilent);
  refreshSilentRef.current = refreshSilent;
  const loadFlicaRowRef = useRef(loadFlicaRow);
  loadFlicaRowRef.current = loadFlicaRow;
  const loadFlicaDirectFlagRef = useRef(loadFlicaDirectFlag);
  loadFlicaDirectFlagRef.current = loadFlicaDirectFlag;

  useEffect(() => {
    void loadFlicaRow();
  }, [loadFlicaRow]);

  useEffect(() => {
    loadFlicaDirectFlag();
  }, [loadFlicaDirectFlag]);

  useFocusEffect(
    useCallback(() => {
      void loadScheduleViewMode().then(setViewMode);
      void refreshSilentRef.current();
      setScheduleRefreshKey((k) => k + 1);
      void loadFlicaRowRef.current();
      loadFlicaDirectFlagRef.current();
      const anchor = new Date();
      const { year: yy, month: mm } = ymRef.current;
      const c = clampYearMonthToScheduleWindow(yy, mm, anchor);
      if (c.year !== yy || c.month !== mm) {
        setYear(c.year);
        setMonth(c.month);
        void saveLastMonthCursor(c.year, c.month);
      }
    }, []),
  );

  const monthLabel = `${MONTH_NAMES[displayMonth - 1]} ${displayYear}`;

  const persistMonth = useCallback((y: number, m: number) => {
    const c = clampYearMonthToScheduleWindow(y, m);
    setYear(c.year);
    setMonth(c.month);
    void saveLastMonthCursor(c.year, c.month);
  }, []);

  const goPrevMonth = useCallback(() => {
    const anchor = new Date();
    const n = tryStepScheduleMonth(year, month, -1, anchor);
    if (n) persistMonth(n.year, n.month);
  }, [year, month, persistMonth]);

  const goNextMonth = useCallback(() => {
    const anchor = new Date();
    const n = tryStepScheduleMonth(year, month, 1, anchor);
    if (n) persistMonth(n.year, n.month);
  }, [year, month, persistMonth]);

  const canPrevMonth = useMemo(
    () => canGoToPreviousScheduleMonth(year, month),
    [year, month],
  );
  const canNextMonth = useMemo(
    () => canGoToNextScheduleMonth(year, month),
    [year, month],
  );

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
          const minDist = 56;
          const minVel = 0.4;
          if (g.dx < -minDist || g.vx < -minVel) {
            goNextMonth();
          } else if (g.dx > minDist || g.vx > minVel) {
            goPrevMonth();
          }
        },
      }),
    [goNextMonth, goPrevMonth],
  );

  const openTrip = useCallback(
    (trip: CrewScheduleTrip) => {
      stashTripForDetailNavigation(trip);
      router.push({
        pathname: "/crew-schedule/trip-detail",
        params: {
          tripId: trip.id,
          ...(trip.schedulePairingId
            ? { pairingUuid: trip.schedulePairingId }
            : {}),
        },
      });
    },
    [router],
  );

  const openTradePost = useCallback(
    (trip?: CrewScheduleTrip) => {
      if (trip) {
        router.push({
          pathname: "/crew-exchange/create-post",
          params: tradePostPrefillParams(trip),
        });
      } else {
        router.push("/crew-exchange/create-post");
      }
    },
    [router],
  );

  const onPressCalendarDay = useCallback(
    (iso: string) => {
      const onDay = displayTrips.filter((t) => iso >= t.startDate && iso <= t.endDate);
      if (onDay.length > 0) openTrip(onDay[0]);
    },
    [displayTrips, openTrip],
  );

  const openManage = useCallback(() => {
    router.push("/crew-schedule/manage");
  }, [router]);

  const flicaPairings = useMemo(
    () =>
      Array.isArray(flicaRow?.pairings)
        ? (flicaRow.pairings as FlicaPairing[])
        : [],
    [flicaRow],
  );

  const flicaStats: FlicaMonthStats = useMemo(() => {
    const raw = (flicaRow?.stats ?? {}) as Partial<FlicaMonthStats>;
    return {
      block: raw.block ?? "",
      credit: raw.credit ?? "",
      tafb: raw.tafb ?? "",
      ytd: raw.ytd ?? "",
      daysOff: typeof raw.daysOff === "number" ? raw.daysOff : 0,
    };
  }, [flicaRow]);

  /**
   * If content is shorter than the screen (e.g. “blank” month), the outer ScrollView may not
   * deliver pull-to-refresh. Force a min height so the bounce/gesture can still fire.
   */
  const scrollContentMinHeight = useMemo(
    () => Math.max(420, Dimensions.get("window").height - 150),
    [],
  );

  /**
   * Schedule tab: pull-down = open FLICA import/sync (same as Manage → “FLICA” path). This screen is
   * FLICA-first; we do not require DB heuristics to fire the gesture (those failed when the list was empty).
   */
  const onSchedulePullToRefresh = useCallback(() => {
    router.push("/crew-schedule/import-flica-direct?autoSync=1");
  }, [router]);

  return (
    <View style={styles.screenRoot} {...monthSwipePan.panHandlers}>
      <View
        style={styles.monthRow}
        accessibilityLabel="Month header — swipe left or right to change month"
      >
        <Pressable
          onPress={goPrevMonth}
          style={styles.iconHit}
          disabled={!canPrevMonth}
          accessibilityLabel="Previous month"
          accessibilityState={{ disabled: !canPrevMonth }}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={canPrevMonth ? T.text : T.line}
          />
        </Pressable>
        <View style={styles.monthTitleRow}>
          <Text style={styles.monthText}>{monthLabel}</Text>
        </View>
        <Pressable
          onPress={goNextMonth}
          style={styles.iconHit}
          disabled={!canNextMonth}
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: !canNextMonth }}
        >
          <Ionicons
            name="chevron-forward"
            size={22}
            color={canNextMonth ? T.text : T.line}
          />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { minHeight: scrollContentMinHeight },
        ]}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        refreshControl={
          <RefreshControl
            progressViewOffset={Platform.OS === "android" ? 0 : undefined}
            refreshing={false}
            onRefresh={onSchedulePullToRefresh}
            tintColor={T.accent}
          />
        }
      >
        <View style={styles.readingArea}>
          {monthLoadPending ? (
            <View style={styles.monthTransitionOverlay} pointerEvents="none">
              <ActivityIndicator size="small" color={T.accent} />
            </View>
          ) : null}
          {flicaPairings.length > 0 ? (
            <FlicaCrewScheduleSection
              stats={flicaStats}
              pairings={flicaPairings}
              importedAt={flicaRow?.imported_at}
            />
          ) : null}
          {viewMode === "classic" && (
            <ClassicListView
              year={displayYear}
              month={displayMonth}
              refreshKey={scheduleRefreshKey}
              trips={displayTrips}
              monthMetrics={displayMetrics}
              tripLayerReady={monthLoadPending || !loading}
              onPressTrip={openTrip}
              onOpenManage={openManage}
            />
          )}
          {viewMode === "calendar" && (
            <CalendarMonthView
              year={displayYear}
              month={displayMonth}
              trips={displayTrips}
              onPressDay={onPressCalendarDay}
              onOpenTrip={openTrip}
            />
          )}
          {viewMode === "smart" && (
            <SmartListView
              trips={displayTrips}
              onPressTrip={openTrip}
              onPost={(trip) => openTradePost(trip)}
              onChat={(trip) =>
                router.push({
                  pathname: "/crew-schedule/trip-chat",
                  params: { tripId: trip.id },
                })
              }
              onManageSchedule={() => router.push("/crew-schedule/manage")}
              onAlert={(trip) =>
                router.push({
                  pathname: "/crew-schedule/alerts",
                  params: { tripId: trip.id },
                })
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
    gap: 4,
  },
  monthText: { fontSize: 16, fontWeight: "800", color: T.text },
  monthTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  monthRowCenter: { flex: 1, textAlign: "center", marginHorizontal: 4 },
  monthSide: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  iconHit: { paddingHorizontal: 6, paddingVertical: 4 },
  readingArea: { paddingHorizontal: 0, paddingTop: 0, position: "relative" },
  monthTransitionOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 48,
    zIndex: 4,
  },
});
