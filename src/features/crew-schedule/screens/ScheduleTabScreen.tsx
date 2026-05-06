import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
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
import ModernClassicListView from "../components/ModernClassicListView";
import ModernScheduleChrome from "../components/ModernScheduleChrome";
import MonthlyStatsStrip from "../components/MonthlyStatsStrip";
import FlicaCrewScheduleSection from "../components/FlicaCrewScheduleSection";
import SmartListView from "../components/SmartListView";
import { useScheduleTripsForMonth } from "../hooks/useScheduleTripsForMonth";
import {
    fetchCrewScheduleFlicaForMonth,
    hasFlicaDirectImportForMonth,
    type CrewScheduleFlicaRow,
} from "../scheduleApi";
import {
    canGoToNextImportedMonth,
    canGoToPreviousImportedMonth,
    clampYearMonthToImportedScheduleMonths,
    getAvailableImportedScheduleMonths,
    tryStepImportedScheduleMonth,
    type ScheduleYearMonth,
} from "../scheduleAvailableMonths";
import { monthCalendarKey } from "../scheduleMonthCache";
import {
    canGoToNextScheduleMonth,
    canGoToPreviousScheduleMonth,
    clampYearMonthToScheduleWindow,
    tryStepScheduleMonth,
} from "../scheduleMonthWindow";
import { readCommittedMonthSnapshot } from "../scheduleStableSnapshots";
import { scheduleTheme as T } from "../scheduleTheme";
import {
    loadLastMonthCursor,
    loadScheduleViewMode,
    saveLastMonthCursor,
} from "../scheduleViewStorage";
import { tradePostPrefillParams } from "../tradePostPrefillParams";
import { stashTripForDetailNavigation } from "../tripDetailNavCache";
import type { CrewScheduleTrip, ScheduleViewMode } from "../types";
import { DEFAULT_SCHEDULE_VIEW } from "../types";
import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../lib/supabaseClient";
import { useCrewScheduleHeaderBridge } from "../crewScheduleHeaderBridge";
import { buildMonthlyStatsStripValues } from "../modernClassic/modernClassicHeaderMetrics";
import { SCHEDULE_MOCK_HEADER_RED } from "../scheduleMockPalette";

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

/** Crew schedule header subtitle — abbreviate FA; other roles stay uppercase. */
function formatRoleForScheduleHeader(role: string): string {
  const raw = String(role).trim();
  if (!raw) return "";
  const compact = raw.replace(/[\s/_-]+/g, "").toLowerCase();
  const spaced = raw.replace(/[\s/_-]+/g, " ").trim().toLowerCase();
  if (
    compact === "fa" ||
    compact === "flightattendant" ||
    spaced === "flight attendant" ||
    compact === "f/a"
  ) {
    return "FA";
  }
  return raw.toUpperCase();
}

function crewScheduleHeaderSubtitleTail(
  base: string | null | undefined,
  role: string | null | undefined,
): string | null {
  const b = String(base ?? "").trim().toUpperCase();
  const r = formatRoleForScheduleHeader(String(role ?? ""));
  if (!b && !r) return null;
  if (b && r) return `${b} Base · ${r}`;
  if (b) return `${b} Base`;
  return r;
}

export default function ScheduleTabScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { setCrewScheduleHeaderSubtitle } = useCrewScheduleHeaderBridge();
  const [profileBase, setProfileBase] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState<string | null>(null);

  React.useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) {
      setProfileBase(null);
      setProfileRole(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("base, role")
      .eq("id", uid)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProfileBase(
          data?.base != null && String(data.base).trim()
            ? String(data.base).trim()
            : null,
        );
        setProfileRole(
          data?.role != null && String(data.role).trim()
            ? String(data.role).trim()
            : null,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);
  const seedYm = useMemo(() => {
    const d = new Date();
    return clampYearMonthToScheduleWindow(d.getFullYear(), d.getMonth() + 1, d);
  }, []);

  const [year, setYear] = useState(seedYm.year);
  const [month, setMonth] = useState(seedYm.month);

  const ymRef = React.useRef(seedYm);
  ymRef.current = { year, month };
  const [viewMode, setViewMode] = useState<ScheduleViewMode>(DEFAULT_SCHEDULE_VIEW);
  const [flicaRow, setFlicaRow] = useState<CrewScheduleFlicaRow | null>(null);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);

  React.useEffect(() => {
    void loadLastMonthCursor().then((c) => {
      const anchor = new Date();
      if (c) {
        const cl = clampYearMonthToScheduleWindow(c.year, c.month, anchor);
        setYear(cl.year);
        setMonth(cl.month);
        if (cl.year !== c.year || cl.month !== c.month)
          void saveLastMonthCursor(cl.year, cl.month);
      }
    });
  }, []);

  const [importedMonths, setImportedMonths] = useState<ScheduleYearMonth[]>([]);

  React.useEffect(() => {
    void getAvailableImportedScheduleMonths()
      .then((months) => {
        setImportedMonths(months);
      })
      .catch(() => setImportedMonths([]));
  }, [scheduleRefreshKey]);

  React.useEffect(() => {
    if (!importedMonths.length) return;
    const ok = importedMonths.some((x) => x.year === year && x.month === month);
    if (ok) return;
    const c = clampYearMonthToImportedScheduleMonths(
      year,
      month,
      importedMonths,
    );
    if (c && (c.year !== year || c.month !== month)) {
      setYear(c.year);
      setMonth(c.month);
      void saveLastMonthCursor(c.year, c.month);
    }
  }, [importedMonths, year, month]);

  const { trips, monthMetrics, loading, refresh, refreshSilent } =
    useScheduleTripsForMonth(year, month);
  const [, setFlicaDirectForMonth] = useState(false);

  const requestedKey = useMemo(
    () => monthCalendarKey(year, month),
    [year, month],
  );

  const stableMonthFallback = useMemo(
    () => readCommittedMonthSnapshot(requestedKey),
    [requestedKey],
  );

  const { displayTrips, displayMetrics } = useMemo(() => {
    if (loading && stableMonthFallback?.trips?.length && trips.length === 0) {
      return {
        displayTrips: stableMonthFallback.trips,
        displayMetrics: stableMonthFallback.monthMetrics,
      };
    }
    return { displayTrips: trips, displayMetrics: monthMetrics };
  }, [loading, stableMonthFallback, trips, monthMetrics, requestedKey]);

  const monthBodyLoadingOverlay =
    loading && displayTrips.length === 0 && !stableMonthFallback?.trips?.length;

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

  const importedMonthsRef = useRef<ScheduleYearMonth[]>([]);
  importedMonthsRef.current = importedMonths;

  useFocusEffect(
    useCallback(() => {
      void loadScheduleViewMode().then(setViewMode);
      void refreshSilentRef.current();
      setScheduleRefreshKey((k) => k + 1);
      void loadFlicaRowRef.current();
      loadFlicaDirectFlagRef.current();
      const anchor = new Date();
      const { year: yy, month: mm } = ymRef.current;
      const im = importedMonthsRef.current;
      if (im.length > 0) {
        const ok = im.some((x) => x.year === yy && x.month === mm);
        if (!ok) {
          const snap = clampYearMonthToImportedScheduleMonths(yy, mm, im);
          if (snap && (snap.year !== yy || snap.month !== mm)) {
            setYear(snap.year);
            setMonth(snap.month);
            void saveLastMonthCursor(snap.year, snap.month);
          }
        }
      } else {
        const c = clampYearMonthToScheduleWindow(yy, mm, anchor);
        if (c.year !== yy || c.month !== mm) {
          setYear(c.year);
          setMonth(c.month);
          void saveLastMonthCursor(c.year, c.month);
        }
      }
      return () => setCrewScheduleHeaderSubtitle(null);
    }, [setCrewScheduleHeaderSubtitle]),
  );

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  const scheduleHeaderSubtitle = useMemo(() => {
    const tail = crewScheduleHeaderSubtitleTail(profileBase, profileRole);
    return tail ? `${monthLabel} · ${tail}` : monthLabel;
  }, [monthLabel, profileBase, profileRole]);

  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    setCrewScheduleHeaderSubtitle(scheduleHeaderSubtitle);
  }, [
    isFocused,
    scheduleHeaderSubtitle,
    setCrewScheduleHeaderSubtitle,
  ]);

  const persistMonth = useCallback(
    (y: number, m: number) => {
      if (importedMonths.length > 0) {
        const inList = importedMonths.some(
          (x) => x.year === y && x.month === m,
        );
        const target = inList
          ? { year: y, month: m }
          : clampYearMonthToImportedScheduleMonths(y, m, importedMonths);
        if (target) {
          setYear(target.year);
          setMonth(target.month);
          void saveLastMonthCursor(target.year, target.month);
        }
        return;
      }
      const c = clampYearMonthToScheduleWindow(y, m);
      setYear(c.year);
      setMonth(c.month);
      void saveLastMonthCursor(c.year, c.month);
    },
    [importedMonths],
  );

  const goPrevMonth = useCallback(() => {
    const anchor = new Date();
    if (importedMonths.length > 0) {
      const n = tryStepImportedScheduleMonth(year, month, -1, importedMonths);
      if (n) persistMonth(n.year, n.month);
      return;
    }
    const n = tryStepScheduleMonth(year, month, -1, anchor);
    if (n) persistMonth(n.year, n.month);
  }, [year, month, importedMonths, persistMonth]);

  const goNextMonth = useCallback(() => {
    const anchor = new Date();
    if (importedMonths.length > 0) {
      const n = tryStepImportedScheduleMonth(year, month, 1, importedMonths);
      if (n) persistMonth(n.year, n.month);
      return;
    }
    const n = tryStepScheduleMonth(year, month, 1, anchor);
    if (n) persistMonth(n.year, n.month);
  }, [year, month, importedMonths, persistMonth]);

  const canPrevMonth = useMemo(
    () =>
      importedMonths.length > 0
        ? canGoToPreviousImportedMonth(year, month, importedMonths)
        : canGoToPreviousScheduleMonth(year, month),
    [year, month, importedMonths],
  );
  const canNextMonth = useMemo(
    () =>
      importedMonths.length > 0
        ? canGoToNextImportedMonth(year, month, importedMonths)
        : canGoToNextScheduleMonth(year, month),
    [year, month, importedMonths],
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
    (trip: CrewScheduleTrip, rowDateIso?: string) => {
      stashTripForDetailNavigation(trip, displayTrips, {
        visibleMonth: { year, month },
        rowDateIso: rowDateIso ?? null,
      });
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
    [router, displayTrips, year, month],
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
      const onDay = displayTrips.filter(
        (t) => iso >= t.startDate && iso <= t.endDate,
      );
      if (onDay.length > 0) openTrip(onDay[0]!, iso);
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

  const statsStripValues = useMemo(
    () => buildMonthlyStatsStripValues(displayMetrics, flicaStats),
    [displayMetrics, flicaStats],
  );

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
    <View
      style={[
        styles.screenRoot,
        viewMode === "modernClassic" && styles.screenRootModern,
      ]}
      {...monthSwipePan.panHandlers}
    >
      {(viewMode === "modernClassic" ||
        viewMode === "classic" ||
        viewMode === "calendar") ? (
        <MonthlyStatsStrip values={statsStripValues} />
      ) : null}
      {viewMode !== "modernClassic" && viewMode !== "calendar" ? (
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
      ) : null}

      <ScrollView
        style={[styles.scroll, viewMode === "modernClassic" && styles.scrollModern]}
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
            tintColor={
              viewMode === "modernClassic" ? SCHEDULE_MOCK_HEADER_RED : T.accent
            }
          />
        }
      >
        <View
          style={[
            styles.readingArea,
            viewMode === "modernClassic" && styles.readingAreaModern,
          ]}
        >
          {monthBodyLoadingOverlay ? (
            <View style={styles.monthTransitionOverlay} pointerEvents="none">
              <ActivityIndicator size="small" color={T.accent} />
            </View>
          ) : null}
          {viewMode === "modernClassic" ? (
            <>
              <ModernScheduleChrome
                monthMetrics={displayMetrics ?? null}
                monthNavLabel={monthLabel}
                canPrevMonth={canPrevMonth}
                canNextMonth={canNextMonth}
                onPrevMonth={goPrevMonth}
                onNextMonth={goNextMonth}
              />
              <ModernClassicListView
                year={year}
                month={month}
                refreshKey={scheduleRefreshKey}
                trips={displayTrips}
                monthMetrics={displayMetrics ?? null}
                tripLayerReady={!loading || displayTrips.length > 0}
                onOpenFullTrip={openTrip}
                onOpenManage={openManage}
              />
            </>
          ) : (
            <>
              {flicaPairings.length > 0 && viewMode !== "classic" ? (
                <FlicaCrewScheduleSection
                  stats={flicaStats}
                  pairings={flicaPairings}
                  importedAt={flicaRow?.imported_at}
                />
              ) : null}
              {viewMode === "classic" && (
                <ClassicListView
                  year={year}
                  month={month}
                  refreshKey={scheduleRefreshKey}
                  trips={displayTrips}
                  monthMetrics={displayMetrics}
                  tripLayerReady={!loading || displayTrips.length > 0}
                  onPressTrip={openTrip}
                  onOpenManage={openManage}
                />
              )}
              {viewMode === "calendar" && (
                <CalendarMonthView
                  year={year}
                  month={month}
                  monthLabel={monthLabel}
                  canPrevMonth={canPrevMonth}
                  canNextMonth={canNextMonth}
                  onPrevMonth={goPrevMonth}
                  onNextMonth={goNextMonth}
                  monthMetrics={displayMetrics ?? null}
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
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: T.bg },
  screenRootModern: { backgroundColor: T.bg },
  scroll: { flex: 1, backgroundColor: T.bg },
  scrollModern: { backgroundColor: T.bg },
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
  readingAreaModern: { backgroundColor: T.bg },
  monthTransitionOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 48,
    zIndex: 4,
  },
});
