import React, { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { CrewScheduleTrip, ScheduleMonthMetrics } from "../types";
import { scheduleTheme as T } from "../scheduleTheme";
import { isTripLikeKind, type DayRow } from "../modernClassic/classicMonthGridCore";
import {
  additionalLegsSummary,
  dailyCreditDisplay,
  dutyDayIndexLabel,
  primaryDayRoute,
} from "../modernClassic/modernClassicDayDisplay";
import { useClassicMonthDayRows } from "../modernClassic/useClassicMonthDayRows";
import { SCHEDULE_MOCK_HEADER_RED } from "../scheduleMockPalette";
import {
  PAIRING_DETAIL_STAT_DIGIT_TRACKING,
  PAIRING_DETAIL_STAT_DIGIT_TYPE,
} from "../scheduleTileNumerals";

/** Pairing row: avoid "800" — on Android default sans-serif often ignores light weights. */
const PAIRING_CODE_TYPE = Platform.select({
  android: { fontFamily: "sans-serif-light", fontWeight: "normal" as const },
  ios: { fontWeight: "500" as const },
  default: { fontWeight: "500" as const },
});
const PAIRING_DAY_TYPE = Platform.select({
  android: { fontFamily: "sans-serif-thin", fontWeight: "normal" as const },
  ios: { fontWeight: "400" as const },
  default: { fontWeight: "400" as const },
});
const ROUTE_TYPE = Platform.select({
  android: { fontFamily: "sans-serif-light", fontWeight: "normal" as const },
  ios: { fontWeight: "500" as const },
  default: { fontWeight: "500" as const },
});

/** Compact duty time for mock (e.g. 1930L). */
function fmtDutyClock(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  const dup = s.match(/^(\d{4})L+$/i);
  if (dup) return `${dup[1]}L`;
  if (/^\d{4}$/.test(s)) return `${s}L`;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hh = m[1]!.padStart(2, "0");
    const mm = m[2]!;
    return `${hh}${mm}L`;
  }
  if (/L$/i.test(s)) return s.replace(/l$/i, "L");
  return `${s}L`;
}

type ListSeg =
  | { kind: "week"; key: string; week: number }
  | { kind: "row"; key: string; row: DayRow };

type Props = {
  year: number;
  month: number;
  refreshKey?: number;
  trips: CrewScheduleTrip[];
  monthMetrics?: ScheduleMonthMetrics | null;
  tripLayerReady: boolean;
  onOpenFullTrip: (trip: CrewScheduleTrip, rowDateIso?: string) => void;
  onOpenManage?: () => void;
};

export default function ModernClassicListView({
  year,
  month,
  refreshKey,
  trips,
  monthMetrics,
  tripLayerReady,
  onOpenFullTrip,
  onOpenManage,
}: Props) {
  const { rows, isReady, emptyMonth } = useClassicMonthDayRows({
    trips,
    year,
    month,
    refreshKey,
    monthMetrics,
    tripLayerReady,
  });

  const listData = useMemo((): ListSeg[] => {
    if (!rows?.length) return [];
    const out: ListSeg[] = [];
    let lastWeek = -1;
    for (const row of rows) {
      const dom = parseInt(row.dateIso.slice(8, 10), 10);
      const week = Number.isFinite(dom) ? Math.floor((dom - 1) / 7) + 1 : 1;
      if (week !== lastWeek) {
        out.push({ kind: "week", key: `w-${row.dateIso}-${week}`, week });
        lastWeek = week;
      }
      out.push({ kind: "row", key: row.id, row });
    }
    return out;
  }, [rows]);

  if (emptyMonth) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyTitle}>No schedule for this month</Text>
        <Text style={styles.emptyBody}>
          Import and view options are in Manage.
        </Text>
        {onOpenManage ? (
          <Pressable style={styles.importBtn} onPress={onOpenManage}>
            <Text style={styles.importBtnText}>Open Manage</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (!isReady || !rows) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={SCHEDULE_MOCK_HEADER_RED} size="small" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={listData}
        keyExtractor={(i) => i.key}
        scrollEnabled={false}
        removeClippedSubviews
        renderItem={({ item }) => {
          if (item.kind === "week") {
            return (
              <Text style={styles.weekLabel}>{`WEEK ${item.week}`}</Text>
            );
          }
          const row = item.row;
          const isOff = row.kind === "empty" && !row.trip;
          const isWork = row.trip && isTripLikeKind(row.kind);

          if (isOff) {
            return (
              <View style={styles.dayTileRowWrap}>
                <View style={styles.offCardOuter}>
                  <View style={styles.offCardInner}>
                  <View
                    style={
                      row.isToday ? styles.redRail : styles.offLeftSpacerRail
                    }
                  />
                  <View style={styles.offDateRail}>
                    <Text style={styles.tripDow}>
                      {row.dayCode.slice(0, 2)}
                    </Text>
                    <Text
                      style={[
                        styles.tripDom,
                        PAIRING_DETAIL_STAT_DIGIT_TYPE,
                        PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                      ]}
                    >
                      {row.dayNum}
                    </Text>
                  </View>
                  <View style={styles.offDivider} />
                  <View style={styles.offCenter}>
                    <View style={styles.offPill}>
                      <Text style={styles.offPillText}>DAY OFF</Text>
                    </View>
                  </View>
                  </View>
                </View>
              </View>
            );
          }

          if (isWork && row.trip) {
            const trip = row.trip;
            const route = primaryDayRoute(trip, row.dateIso, row.cityText);
            const extra = additionalLegsSummary(trip, row.dateIso);
            const dutyLbl = dutyDayIndexLabel(trip, row.dateIso);
            const credit = dailyCreditDisplay(trip, row.dateIso);
            const pairing =
              String(trip.pairingCode ?? row.pairingText ?? "")
                .trim()
                .toUpperCase()
                .replace(/^PAIRING\s+/i, "") || "—";
            const dayLine =
              dutyLbl != null
                ? `Day ${dutyLbl.current} of ${dutyLbl.total}`
                : "";
            const lay = String(row.layoverText ?? "").trim();
            const rpt = fmtDutyClock(row.reportText);
            const dend = fmtDutyClock(row.dEndText);

            return (
              <View style={styles.dayTileRowWrap}>
                <Pressable
                  onPress={() => onOpenFullTrip(trip, row.dateIso)}
                  style={({ pressed }) => [pressed && styles.cardStackPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open pairing ${pairing}`}
                >
                <View
                  style={[
                    styles.tripCardMain,
                    extra ? styles.tripCardMainNoBottomRadius : null,
                  ]}
                >
                  <View
                    style={
                      row.isToday ? styles.redRail : styles.offLeftSpacerRail
                    }
                  />
                  <View style={styles.tripDateRail}>
                    <Text style={styles.tripDow}>
                      {row.dayCode.slice(0, 2)}
                    </Text>
                    <Text
                      style={[
                        styles.tripDom,
                        PAIRING_DETAIL_STAT_DIGIT_TYPE,
                        PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                      ]}
                    >
                      {row.dayNum}
                    </Text>
                  </View>
                  <View style={styles.tripDivider} />
                  <View style={styles.tripMid}>
                    <Text style={styles.pairingRow} numberOfLines={1}>
                      <Text style={[styles.pairingCode, PAIRING_CODE_TYPE]}>
                        {pairing}
                      </Text>
                      {dayLine ? (
                        <Text style={[styles.pairingDayPart, PAIRING_DAY_TYPE]}>
                          {` · ${dayLine}`}
                        </Text>
                      ) : null}
                    </Text>
                    <Text style={[styles.routeLine, ROUTE_TYPE]} numberOfLines={1}>
                      {route}
                    </Text>
                    <Text style={styles.reportLine} numberOfLines={2}>
                      <Text
                        style={[
                          styles.rptStrong,
                          PAIRING_DETAIL_STAT_DIGIT_TYPE,
                          PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                        ]}
                      >
                        Rpt {rpt}
                      </Text>
                      <Text
                        style={[
                          styles.rptRest,
                          PAIRING_DETAIL_STAT_DIGIT_TYPE,
                          PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                        ]}
                      >
                        {" "}
                        · D-End {dend}
                        {lay ? ` · ${lay}` : ""}
                      </Text>
                    </Text>
                  </View>
                  <View style={styles.tripRight}>
                    <Text
                      style={[
                        styles.creditTop,
                        PAIRING_DETAIL_STAT_DIGIT_TYPE,
                        PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                      ]}
                      numberOfLines={1}
                    >
                      {credit.main}
                    </Text>
                    <Text
                      style={[
                        styles.creditPlus,
                        PAIRING_DETAIL_STAT_DIGIT_TYPE,
                        PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                      ]}
                      numberOfLines={1}
                    >
                      {credit.plus ?? " "}
                    </Text>
                    <Text style={styles.wxEmoji} numberOfLines={1}>
                      {row.wxText || "—"}
                    </Text>
                  </View>
                </View>
                {extra ? (
                  <View style={styles.continuationAttached}>
                    <View style={styles.continuationDot} />
                    <Text style={styles.continuationText} numberOfLines={2}>
                      {extra}
                    </Text>
                  </View>
                ) : null}
                </Pressable>
              </View>
            );
          }

          if (row.trip) {
            return (
              <View style={styles.dayTileRowWrap}>
                <Pressable
                  onPress={() => onOpenFullTrip(row.trip!, row.dateIso)}
                  style={({ pressed }) => [
                    styles.miscCard,
                    pressed && styles.cardStackPressed,
                  ]}
                >
                <Text style={styles.miscText} numberOfLines={2}>
                  {row.pairingText || row.cityText || "—"}
                </Text>
                </Pressable>
              </View>
            );
          }
          return (
            <View style={styles.dayTileRowWrap}>
              <View style={styles.miscCard}>
              <Text style={styles.miscText} numberOfLines={2}>
                {row.pairingText || row.cityText || "—"}
              </Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const CARD_RADIUS = 10;
const CARD_BORDER = "#E2E8F0";
/**
 * Vertical gap between calendar day tiles — split as margin above and below each card
 * so spacing matches the mock (breathing room top + bottom).
 */
const TILE_STACK_GAP = 4;

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: T.bg,
  },
  weekLabel: {
    marginTop: 6,
    marginBottom: 3,
    marginLeft: 2,
    fontSize: 9,
    fontWeight: "800",
    color: T.textSecondary,
    letterSpacing: 0.4,
  },
  /** Same vertical inset for every day row (pairing, OFF, misc) — margins on `Pressable` are unreliable. */
  dayTileRowWrap: {
    marginVertical: TILE_STACK_GAP / 2,
  },
  cardStackPressed: { opacity: 0.92 },
  /* —— Day off —— */
  offCardOuter: {
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  offCardInner: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 54,
    overflow: "hidden",
    borderRadius: CARD_RADIUS,
  },
  offLeftSpacerRail: {
    width: 3,
    alignSelf: "stretch",
    backgroundColor: "transparent",
  },
  offDateRail: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  offDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: "#ECEEF1",
  },
  offCenter: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingLeft: 8,
    paddingRight: 8,
    paddingVertical: 5,
  },
  offPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
  },
  offPillText: { fontSize: 9, fontWeight: "800", color: T.textSecondary },
  /* —— Trip —— */
  tripCardMain: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#fff",
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    minHeight: 54,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tripCardMainNoBottomRadius: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  redRail: {
    width: 3,
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    alignSelf: "stretch",
  },
  tripDateRail: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  tripDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: "#ECEEF1",
  },
  tripDow: { fontSize: 7, fontWeight: "600", color: T.textSecondary },
  tripDom: { fontSize: 11, fontWeight: "500", color: T.text, marginTop: 1 },
  tripMid: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 0,
  },
  pairingRow: {
    fontSize: 10,
    color: SCHEDULE_MOCK_HEADER_RED,
  },
  pairingCode: {
    color: SCHEDULE_MOCK_HEADER_RED,
  },
  pairingDayPart: {
    fontSize: 8,
    lineHeight: 11,
    color: T.textSecondary,
  },
  routeLine: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 12,
    color: T.text,
    letterSpacing: -0.15,
  },
  reportLine: { marginTop: 3, fontSize: 9, lineHeight: 12 },
  rptStrong: { fontWeight: "800", color: T.textSecondary },
  rptRest: { fontWeight: "500", color: T.textSecondary },

  continuationAttached: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FEF2F2",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#FDE8E8",
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#F9D5D5",
    paddingVertical: 5,
    paddingHorizontal: 8,
    gap: 6,
  },
  continuationDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    marginTop: 3,
  },
  continuationText: {
    flex: 1,
    fontSize: 8,
    fontWeight: "700",
    color: SCHEDULE_MOCK_HEADER_RED,
    lineHeight: 11,
  },

  tripRight: {
    width: 54,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 7,
    paddingVertical: 4,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "#F1F5F9",
  },
  creditTop: { fontSize: 10, fontWeight: "800", color: T.text },
  creditPlus: { fontSize: 8, fontWeight: "800", color: SCHEDULE_MOCK_HEADER_RED, marginTop: 2 },
  wxEmoji: { fontSize: 10, marginTop: 3 },

  miscCard: {
    padding: 8,
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  miscText: { fontSize: 10, color: T.textSecondary },
  loadingBox: { paddingVertical: 24, alignItems: "center", backgroundColor: T.bg },
  emptyBox: {
    marginHorizontal: 12,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: T.text },
  emptyBody: { marginTop: 6, fontSize: 12, color: T.textSecondary },
  importBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  importBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
