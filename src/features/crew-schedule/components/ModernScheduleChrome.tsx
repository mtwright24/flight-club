import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { scheduleProgressFromMetrics } from "../modernClassic/modernClassicHeaderMetrics";
import { scheduleTheme as T } from "../scheduleTheme";
import type { ScheduleMonthMetrics } from "../types";

/**
 * Content below the global `CrewScheduleHeader` tab header only:
 * Schedule Progress strip + month navigator (no duplicate title, totals, or view pills).
 */
type Props = {
  monthMetrics: ScheduleMonthMetrics | null | undefined;
  monthNavLabel: string;
  canPrevMonth: boolean;
  canNextMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
};

export default function ModernScheduleChrome({
  monthMetrics,
  monthNavLabel,
  canPrevMonth,
  canNextMonth,
  onPrevMonth,
  onNextMonth,
}: Props) {
  const prog = scheduleProgressFromMetrics(monthMetrics ?? null);
  const pctFill = Math.min(100, Math.round(prog.pct * 100));
  const pctLabel = Math.round(prog.pct * 100);
  const progressRight = `${pctLabel}% · ${Math.round(prog.workedH)}/${Math.round(prog.targetH)}h`;

  return (
    <View style={styles.wrap}>
      <View style={styles.progressCard}>
        <View style={styles.progressLeft}>
          <Text style={styles.sparkle}>✦</Text>
          <Text style={styles.progressTitle}>Schedule Progress</Text>
        </View>
        <View style={styles.progressMid}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pctFill}%` }]} />
          </View>
        </View>
        <View style={styles.progressRight}>
          <Text style={styles.progressStat} numberOfLines={1}>
            {progressRight}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={T.textSecondary} />
        </View>
      </View>

      <View style={styles.monthRow}>
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
        <Text style={styles.monthNavTitle}>{monthNavLabel}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    paddingHorizontal: 12,
    paddingTop: 6,
    backgroundColor: T.bg,
  },
  progressCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  progressLeft: { flexDirection: "row", alignItems: "center", gap: 5 },
  sparkle: { fontSize: 11, color: "#EAB308", lineHeight: 14 },
  progressTitle: { fontSize: 10, fontWeight: "700", color: T.text },
  progressMid: { flex: 1, minWidth: 0, justifyContent: "center" },
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
  progressRight: { flexDirection: "row", alignItems: "center", gap: 2 },
  progressStat: {
    fontSize: 10,
    fontWeight: "700",
    color: T.textSecondary,
    maxWidth: 88,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 14,
  },
  circleNav: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
  },
  circleNavOff: { opacity: 0.45 },
  monthNavTitle: { fontSize: 14, fontWeight: "500", color: T.text },
});
