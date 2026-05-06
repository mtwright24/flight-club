import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { scheduleTheme as T } from "../scheduleTheme";
import { stashTripForDetailNavigation } from "../tripDetailNavCache";
import type { CrewScheduleTrip } from "../types";
import TripQuickPreviewSheet from "./TripQuickPreviewSheet";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

type Props = {
  year: number;
  month: number; // 1-12
  trips: CrewScheduleTrip[];
  onPressDay: (isoDate: string) => void;
  /** When set, long-press a day with a trip opens a quick preview before full detail. */
  onOpenTrip?: (trip: CrewScheduleTrip, cellIso?: string) => void;
};

function tripsForDay(
  ymd: string,
  trips: CrewScheduleTrip[],
): CrewScheduleTrip[] {
  return trips.filter((t) => ymd >= t.startDate && ymd <= t.endDate);
}

export default function CalendarMonthView({
  year,
  month,
  trips,
  onPressDay,
  onOpenTrip,
}: Props) {
  const [preview, setPreview] = useState<{
    trip: CrewScheduleTrip;
    dateIso: string;
  } | null>(null);
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
    const cells: ({ day: number; inMonth: boolean } | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push({ day: d, inMonth: true });
    while (cells.length % 7 !== 0) cells.push(null);
    while (cells.length < 42) cells.push(null);
    const rowCount = Math.ceil(cells.length / 7);
    return { cells, rowCount };
  }, [year, month]);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <View style={styles.wrap}>
      <View style={styles.dowRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={styles.dowCell}>
            {w}
          </Text>
        ))}
      </View>
      {Array.from({ length: rowCount }).map((_, ri) => (
        <View key={ri} style={styles.weekRow}>
          {cells.slice(ri * 7, ri * 7 + 7).map((cell, ci) => {
            if (!cell || !cell.inMonth) {
              return <View key={ci} style={styles.cellEmpty} />;
            }
            const iso = `${year}-${pad(month)}-${pad(cell.day)}`;
            const dayTrips = tripsForDay(iso, trips);
            const primary = dayTrips[0];
            const label = primary
              ? primary.status === "off"
                ? "OFF"
                : primary.pairingCode.length > 5
                  ? primary.pairingCode.slice(0, 4) + "…"
                  : primary.pairingCode
              : "";
            return (
              <Pressable
                key={iso}
                onPress={() => onPressDay(iso)}
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
                style={styles.cell}
                accessibilityHint={
                  onOpenTrip && primary
                    ? "Long press for trip preview."
                    : undefined
                }
              >
                <Text style={styles.dayNum}>{cell.day}</Text>
                {label ? (
                  <Text style={styles.mini} numberOfLines={2}>
                    {label}
                  </Text>
                ) : (
                  <Text style={styles.miniMuted}> </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
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

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: T.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    overflow: "hidden",
  },
  dowRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
  },
  dowCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "800",
    color: T.textSecondary,
    paddingVertical: 6,
  },
  weekRow: {
    flexDirection: "row",
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
  },
  cell: {
    flex: 1,
    padding: 4,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: T.line,
    backgroundColor: T.surface,
  },
  cellEmpty: {
    flex: 1,
    minHeight: 56,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: T.line,
  },
  dayNum: { fontSize: 12, fontWeight: "800", color: T.text },
  mini: { fontSize: 9, fontWeight: "700", color: T.accent, marginTop: 2 },
  miniMuted: { fontSize: 9, color: T.textSecondary },
});
