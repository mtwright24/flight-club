import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ModernHeaderMetric } from "../modernClassic/modernClassicHeaderMetrics";
import { SCHEDULE_MOCK_STATS_STRIP_RED } from "../scheduleMockPalette";

type Props = { values: ModernHeaderMetric[] };

/** Darker-red band directly under the crew schedule tab header (not inside the header). */
export default function MonthlyStatsStrip({ values }: Props) {
  return (
    <View style={styles.strip} accessibilityRole="summary">
      <View style={styles.row}>
        {values.map((m) => (
          <View key={m.id} style={styles.cell}>
            <Text style={styles.label} numberOfLines={1}>
              {m.label}
            </Text>
            <Text style={styles.value} numberOfLines={1}>
              {m.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    width: "100%",
    backgroundColor: SCHEDULE_MOCK_STATS_STRIP_RED,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 2,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
  label: {
    fontSize: 7,
    fontWeight: "300",
    color: "rgba(255,255,255,0.88)",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  value: {
    fontSize: 10,
    fontWeight: "400",
    color: "#FFFFFF",
  },
});
