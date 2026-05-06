import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { dateToIsoDateLocal } from "../modernClassic/classicMonthGridCore";
import {
  dailyCreditDisplay,
  dutyDayIndexLabel,
  legsForDutyDate,
  primaryDayRoute,
} from "../modernClassic/modernClassicDayDisplay";
import { scheduleProgressFromMetrics } from "../modernClassic/modernClassicHeaderMetrics";
import { SCHEDULE_MOCK_HEADER_RED } from "../scheduleMockPalette";
import { scheduleTheme as T } from "../scheduleTheme";
import type { CrewScheduleTrip, ScheduleMonthMetrics } from "../types";
import { stashTripForDetailNavigation } from "../tripDetailNavCache";
import {
  PAIRING_DETAIL_STAT_DIGIT_TRACKING,
  PAIRING_DETAIL_STAT_DIGIT_TYPE,
} from "../scheduleTileNumerals";
import TripQuickPreviewSheet from "./TripQuickPreviewSheet";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const PAGE_BG = "#F1F5F9";

type CellKind = "work" | "off" | "empty" | "rsv" | "pto" | "dh";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function tripsForDay(
  ymd: string,
  trips: CrewScheduleTrip[],
): CrewScheduleTrip[] {
  return trips.filter((t) => ymd >= t.startDate && ymd <= t.endDate);
}

function cellKind(primary: CrewScheduleTrip | undefined): CellKind {
  if (!primary) return "empty";
  switch (primary.status) {
    case "off":
      return "off";
    case "rsv":
      return "rsv";
    case "pto":
    case "ptv":
      return "pto";
    case "deadhead":
      return "dh";
    default:
      return "work";
  }
}

/** Decimal hours suffix for grid when trip has credit/block totals (e.g. `5.2h`). */
function dayCreditHoursShort(
  trip: CrewScheduleTrip | undefined,
): string | null {
  if (!trip || trip.status === "off") return null;
  const total =
    trip.pairingCreditHours ?? trip.creditHours ?? null;
  if (total == null || Number.isNaN(total)) return null;
  const n = Math.max(1, trip.dutyDays ?? 1);
  const daily = total / n;
  if (Number.isNaN(daily)) return null;
  return `${daily.toFixed(1)}h`;
}

function dayBlockShort(trip: CrewScheduleTrip | undefined, iso: string): string {
  if (!trip) return "—";
  const legs = legsForDutyDate(trip, iso);
  const raw = legs[0]?.blockTimeLocal?.trim();
  if (raw) return raw;
  const tb = trip.pairingBlockHours;
  if (tb == null || Number.isNaN(tb)) return "—";
  const n = Math.max(1, trip.dutyDays ?? 1);
  return `${(tb / n).toFixed(1)}h`;
}

function formatLongDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function initialSelectedIso(year: number, month: number): string {
  const now = new Date();
  if (now.getFullYear() === year && now.getMonth() + 1 === month) {
    return dateToIsoDateLocal(now);
  }
  return `${year}-${pad2(month)}-01`;
}

const TILE_DOW = Platform.select({
  android: { fontFamily: "sans-serif-light", fontWeight: "normal" as const },
  ios: { fontWeight: "500" as const },
  web: { fontWeight: "500" as const },
  default: { fontWeight: "500" as const },
});

const TILE_DAY = Platform.select({
  android: { fontFamily: "sans-serif-thin", fontWeight: "normal" as const },
  ios: { fontWeight: "500" as const },
  web: { fontWeight: "500" as const },
  default: { fontWeight: "500" as const },
});

const androidNoFontPad =
  Platform.OS === "android" ? ({ includeFontPadding: false } as const) : {};

type Props = {
  year: number;
  month: number;
  monthLabel: string;
  canPrevMonth: boolean;
  canNextMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** Month metrics for Guarantee progress (same source as Modern Classic). */
  monthMetrics: ScheduleMonthMetrics | null | undefined;
  trips: CrewScheduleTrip[];
  /** Opens trip detail when user taps the selected-day card (existing calendar behavior). */
  onPressDay: (isoDate: string) => void;
  onOpenTrip?: (trip: CrewScheduleTrip, cellIso?: string) => void;
};

export default function CalendarMonthView({
  year,
  month,
  monthLabel,
  canPrevMonth,
  canNextMonth,
  onPrevMonth,
  onNextMonth,
  monthMetrics,
  trips,
  onPressDay,
  onOpenTrip,
}: Props) {
  const [selectedIso, setSelectedIso] = useState(() =>
    initialSelectedIso(year, month),
  );
  const [preview, setPreview] = useState<{
    trip: CrewScheduleTrip;
    dateIso: string;
  } | null>(null);

  useEffect(() => {
    setSelectedIso(initialSelectedIso(year, month));
  }, [year, month]);

  const closePreview = useCallback(() => setPreview(null), []);
  const openFullFromPreview = useCallback(() => {
    const p = preview;
    setPreview(null);
    if (p && onOpenTrip) onOpenTrip(p.trip, p.dateIso);
  }, [preview, onOpenTrip]);

  const { cells, rowCount } = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startPad = first.getDay();
    const dim = new Date(year, month, 0).getDate();
    const c: ({ day: number; inMonth: boolean } | null)[] = [];
    for (let i = 0; i < startPad; i++) c.push(null);
    for (let d = 1; d <= dim; d++) c.push({ day: d, inMonth: true });
    while (c.length % 7 !== 0) c.push(null);
    while (c.length < 42) c.push(null);
    return { cells: c, rowCount: Math.ceil(c.length / 7) };
  }, [year, month]);

  const prog = useMemo(
    () => scheduleProgressFromMetrics(monthMetrics ?? null),
    [monthMetrics],
  );
  const pctFill = Math.min(100, Math.round(prog.pct * 100));
  const pctLabel = Math.round(prog.pct * 100);
  const progressRight = `${pctLabel}% · ${Math.round(prog.workedH)}/${Math.round(prog.targetH)}h`;

  const primarySelected =
    tripsForDay(selectedIso, trips)[0] ?? undefined;
  const todayIso = dateToIsoDateLocal(new Date());
  const isTodaySelected = selectedIso === todayIso;

  return (
    <View style={styles.page}>
      <View style={styles.monthNav}>
        <Pressable
          onPress={onPrevMonth}
          disabled={!canPrevMonth}
          style={[styles.circleNav, !canPrevMonth && styles.circleNavOff]}
          accessibilityLabel="Previous month"
        >
          <Ionicons
            name="chevron-back"
            size={16}
            color={canPrevMonth ? T.text : T.line}
          />
        </Pressable>
        <Text style={styles.monthTitle}>{monthLabel}</Text>
        <Pressable
          onPress={onNextMonth}
          disabled={!canNextMonth}
          style={[styles.circleNav, !canNextMonth && styles.circleNavOff]}
          accessibilityLabel="Next month"
        >
          <Ionicons
            name="chevron-forward"
            size={16}
            color={canNextMonth ? T.text : T.line}
          />
        </Pressable>
      </View>

      <View style={styles.guaranteeCard}>
        <View style={styles.guaranteeTop}>
          <Text style={styles.guaranteeTitle}>Guarantee</Text>
          <Text style={styles.guaranteeStat} numberOfLines={1}>
            {progressRight}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pctFill}%` }]} />
        </View>
      </View>

      <View style={styles.legendRow}>
        {[
          { k: "Working", c: "#FCA5A5" },
          { k: "Off", c: "#E2E8F0" },
          { k: "Reserve", c: "#FDBA74" },
          { k: "PTO", c: "#86EFAC" },
          { k: "DH", c: "#D8B4FE" },
        ].map((item) => (
          <View key={item.k} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.c }]} />
            <Text style={styles.legendLabel}>{item.k}</Text>
          </View>
        ))}
      </View>

      <View style={styles.gridCard}>
        <View style={styles.dowRow}>
          {WEEKDAYS.map((w, i) => (
            <Text
              key={i}
              style={[styles.dowCell, TILE_DOW]}
              {...androidNoFontPad}
            >
              {w}
            </Text>
          ))}
        </View>
        {Array.from({ length: rowCount }).map((_, ri) => (
          <View key={ri} style={styles.weekRow}>
            {cells.slice(ri * 7, ri * 7 + 7).map((cell, ci) => {
              if (!cell || !cell.inMonth) {
                return <View key={ci} style={styles.cellSlot} />;
              }
              const iso = `${year}-${pad2(month)}-${pad2(cell.day)}`;
              const dayTrips = tripsForDay(iso, trips);
              const primary = dayTrips[0];
              const kind = cellKind(primary);
              const hoursShort = dayCreditHoursShort(primary);
              const selected = iso === selectedIso;
              return (
                <Pressable
                  key={iso}
                  onPress={() => setSelectedIso(iso)}
                  onLongPress={
                    onOpenTrip && primary
                      ? () => {
                          stashTripForDetailNavigation(primary, trips, {
                            visibleMonth: { year, month },
                            rowDateIso: iso,
                          });
                          setPreview({ trip: primary, dateIso: iso });
                        }
                      : undefined
                  }
                  delayLongPress={420}
                  style={styles.cellSlot}
                  accessibilityHint={
                    onOpenTrip && primary
                      ? "Long press for trip preview."
                      : undefined
                  }
                >
                  <View
                    style={[
                      styles.cellInner,
                      kind === "work" && styles.cellWork,
                      kind === "off" && styles.cellOff,
                      kind === "empty" && styles.cellEmptyFill,
                      kind === "rsv" && styles.cellRsv,
                      kind === "pto" && styles.cellPto,
                      kind === "dh" && styles.cellDh,
                      selected && styles.cellSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNum,
                        TILE_DAY,
                        PAIRING_DETAIL_STAT_DIGIT_TYPE,
                        PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                      ]}
                      {...androidNoFontPad}
                    >
                      {cell.day}
                    </Text>
                    {hoursShort ? (
                      <Text
                        style={styles.hoursMini}
                        numberOfLines={1}
                        {...androidNoFontPad}
                      >
                        {hoursShort}
                      </Text>
                    ) : (
                      <Text style={styles.hoursMiniMuted}> </Text>
                    )}
                    {kind === "work" || kind === "dh" ? (
                      <View style={styles.workDot} />
                    ) : (
                      <View style={styles.dotSpacer} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <SelectedDayDetailCard
        selectedIso={selectedIso}
        isToday={isTodaySelected}
        primary={primarySelected}
        onOpenTripForDay={onPressDay}
      />

      {onOpenTrip ? (
        <TripQuickPreviewSheet
          visible={preview != null}
          trip={preview?.trip ?? null}
          pairingUuid={preview?.trip?.schedulePairingId}
          onClose={closePreview}
          onOpenFullTrip={openFullFromPreview}
        />
      ) : null}
    </View>
  );
}

function SelectedDayDetailCard({
  selectedIso,
  isToday,
  primary,
  onOpenTripForDay,
}: {
  selectedIso: string;
  isToday: boolean;
  primary: CrewScheduleTrip | undefined;
  onOpenTripForDay: (iso: string) => void;
}) {
  const openable = !!primary;

  const route = primary
    ? primaryDayRoute(primary, selectedIso, primary.routeSummary ?? "")
    : "—";
  const dutyLbl = primary
    ? dutyDayIndexLabel(primary, selectedIso)
    : null;
  const pairing = primary
    ? String(primary.pairingCode ?? "")
        .trim()
        .toUpperCase()
        .replace(/^PAIRING\s+/i, "") || "—"
    : "—";
  const dayLine =
    dutyLbl != null
      ? `Day ${dutyLbl.current} of ${dutyLbl.total}`
      : "";

  const legs = primary ? legsForDutyDate(primary, selectedIso) : [];
  const report = legs[0]?.reportLocal?.trim() ?? "—";
  const dEnd = legs.length
    ? legs[legs.length - 1]?.releaseLocal?.trim() ?? "—"
    : "—";
  const credit =
    dayCreditHoursShort(primary) ??
    (primary ? dailyCreditDisplay(primary, selectedIso).main : "—");
  const block = dayBlockShort(primary, selectedIso);
  const lay =
    primary?.layoverByDate?.[selectedIso]?.trim() ||
    primary?.layoverStationByDate?.[selectedIso]?.trim() ||
    primary?.layoverCity?.trim() ||
    "—";
  const gate = legs[0]?.departureTerminalGate?.trim() ?? "";

  const wx = primary && primary.status !== "off" ? "☀︎" : "—";

  const body = (
    <>
      <View style={detailStyles.rail} />
      <View style={detailStyles.main}>
        <View style={detailStyles.topRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={detailStyles.dateLine} numberOfLines={2}>
              {formatLongDate(selectedIso)}
              {isToday ? (
                <Text style={detailStyles.todayBadge}> · TODAY</Text>
              ) : null}
            </Text>
            {primary ? (
              <>
                <Text style={detailStyles.pairingLine} numberOfLines={1}>
                  {pairing}
                  {dayLine ? (
                    <Text style={detailStyles.dayPart}> · {dayLine}</Text>
                  ) : null}
                </Text>
                {gate ? (
                  <Text style={detailStyles.gateLine} numberOfLines={1}>
                    {gate}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={detailStyles.offHint}>No trip — day off</Text>
            )}
          </View>
          <Text style={detailStyles.wx}>{wx}</Text>
        </View>
        <Text style={detailStyles.routeLine} numberOfLines={1}>
          {route}
        </Text>
        <View style={detailStyles.statsRow}>
          {(
            [
              ["REPORT", report],
              ["BLOCK", block],
              ["CREDIT", credit],
              ["D-END", dEnd],
              ["LAYOVER", lay],
            ] as const
          ).map(([label, val]) => (
            <View key={label} style={detailStyles.statCell}>
              <Text style={detailStyles.statKey}>{label}</Text>
              <Text style={detailStyles.statVal} numberOfLines={1}>
                {val}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );

  if (openable) {
    return (
      <Pressable
        style={detailStyles.card}
        onPress={() => onOpenTripForDay(selectedIso)}
        accessibilityRole="button"
        accessibilityLabel="Open trip detail for selected day"
      >
        {body}
      </Pressable>
    );
  }

  return <View style={detailStyles.card}>{body}</View>;
}

const detailStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#fff",
    borderRadius: 14,
    marginTop: 12,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  rail: {
    width: 4,
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    alignSelf: "stretch",
  },
  main: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minWidth: 0,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  dateLine: {
    fontSize: 12,
    fontWeight: "700",
    color: T.text,
  },
  todayBadge: {
    fontSize: 11,
    fontWeight: "800",
    color: SCHEDULE_MOCK_HEADER_RED,
  },
  pairingLine: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "800",
    color: SCHEDULE_MOCK_HEADER_RED,
  },
  dayPart: {
    fontSize: 12,
    fontWeight: "600",
    color: T.textSecondary,
  },
  gateLine: {
    marginTop: 2,
    fontSize: 11,
    color: T.textSecondary,
    fontWeight: "600",
  },
  offHint: {
    marginTop: 4,
    fontSize: 12,
    color: T.textSecondary,
    fontWeight: "600",
  },
  wx: { fontSize: 18, marginTop: 2 },
  routeLine: {
    marginTop: 8,
    fontSize: 17,
    fontWeight: "700",
    color: T.text,
    letterSpacing: -0.3,
  },
  statsRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statCell: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 52,
  },
  statKey: {
    fontSize: 8,
    fontWeight: "700",
    color: T.textSecondary,
    letterSpacing: 0.3,
  },
  statVal: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: T.text,
  },
});

const styles = StyleSheet.create({
  page: {
    width: "100%",
    backgroundColor: PAGE_BG,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 16,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingVertical: 8,
  },
  circleNav: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
  },
  circleNavOff: { opacity: 0.45 },
  monthTitle: { fontSize: 15, fontWeight: "600", color: T.text },
  guaranteeCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    marginBottom: 10,
  },
  guaranteeTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  guaranteeTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: T.text,
  },
  guaranteeStat: {
    fontSize: 11,
    fontWeight: "700",
    color: T.textSecondary,
    maxWidth: "55%",
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#16A34A",
    maxWidth: "100%",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
  },
  gridCard: {
    backgroundColor: "transparent",
    borderRadius: 16,
    paddingBottom: 4,
  },
  dowRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  dowCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    color: "#64748B",
    paddingVertical: 2,
    fontWeight: "600",
  },
  weekRow: {
    flexDirection: "row",
    marginBottom: 5,
    gap: 5,
  },
  cellSlot: {
    flex: 1,
    minWidth: 0,
    aspectRatio: 1,
    maxHeight: 64,
  },
  cellInner: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 3,
    paddingTop: 4,
    paddingBottom: 4,
    alignItems: "center",
    justifyContent: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  cellWork: { backgroundColor: "#FEF2F2" },
  cellOff: { backgroundColor: "#FAFAFA" },
  cellEmptyFill: { backgroundColor: "#FFFFFF" },
  cellRsv: { backgroundColor: "#FFF7ED" },
  cellPto: { backgroundColor: "#F0FDF4" },
  cellDh: { backgroundColor: "#FAF5FF" },
  cellSelected: {
    borderColor: SCHEDULE_MOCK_HEADER_RED,
    borderWidth: 2,
    backgroundColor: "#FEE2E2",
  },
  dayNum: {
    fontSize: 14,
    color: T.text,
  },
  hoursMini: {
    fontSize: 8,
    fontWeight: "700",
    color: SCHEDULE_MOCK_HEADER_RED,
    marginTop: 1,
  },
  hoursMiniMuted: {
    fontSize: 8,
    marginTop: 1,
    color: "transparent",
  },
  workDot: {
    marginTop: 3,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
  },
  dotSpacer: { height: 8, marginTop: 3 },
});
