import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fcDevMirrorScheduleLogToFile } from "../../../dev/fcDevFileLogger";
import type { FlicaCalendarListModel } from "../flicaCalendarDisplaySource";
import { tripForFlicaCalendarCell } from "../flicaCalendarLedgerDayRows";
import { sanitizeFlicaLedgerCityText } from "../flicaMiniCalendarTableLedger";
import { legsForDutyDate } from "../modernClassic/modernClassicDayDisplay";
import { scheduleTheme as T } from "../scheduleTheme";
import { stashTripForDetailNavigation } from "../tripDetailNavCache";
import type { CrewScheduleTrip } from "../types";
import TripQuickPreviewSheet from "./TripQuickPreviewSheet";

type Props = {
  trips: CrewScheduleTrip[];
  /** FLICA schedule display source for Smart list (mini-table vs trips vs blocked). */
  flicaCalendarListModel: FlicaCalendarListModel;
  onPressTrip: (trip: CrewScheduleTrip, rowDateIso?: string) => void;
  onPost?: (trip: CrewScheduleTrip) => void;
  onChat?: (trip: CrewScheduleTrip) => void;
  /** Open module Manage (replaces former hotel shortcut). */
  onManageSchedule?: () => void;
  onAlert?: (trip: CrewScheduleTrip) => void;
};

function formatRange(trip: CrewScheduleTrip): string {
  const a = new Date(trip.startDate + "T12:00:00");
  const b = new Date(trip.endDate + "T12:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (trip.startDate === trip.endDate)
    return a.toLocaleDateString(undefined, opts);
  return `${a.toLocaleDateString(undefined, opts)}–${b.toLocaleDateString(undefined, { day: "numeric" })}`;
}

function formatLedgerRowDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function SmartListView({
  trips,
  flicaCalendarListModel,
  onPressTrip,
  onPost,
  onChat,
  onManageSchedule,
  onAlert,
}: Props) {
  const [previewTrip, setPreviewTrip] = useState<CrewScheduleTrip | null>(null);
  const closePreview = useCallback(() => setPreviewTrip(null), []);
  const openFullFromPreview = useCallback(() => {
    const t = previewTrip;
    setPreviewTrip(null);
    if (t) onPressTrip(t);
  }, [previewTrip, onPressTrip]);

  useEffect(() => {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    const mode = flicaCalendarListModel.mode;
    const payload = {
      listMode: mode,
      ledgerRowCount:
        mode === "flica_mini_table" ? flicaCalendarListModel.cells.length : 0,
      displayMode:
        mode === "flica_mini_table"
          ? "ledger_plus_duty_meta"
          : mode === "flica_blocked"
            ? "flica_blocked_no_fallback"
            : "trip_duty_rows",
      rowCount:
        mode === "flica_mini_table"
          ? flicaCalendarListModel.cells.length
          : mode === "flica_blocked"
            ? 0
            : trips.length,
    };
    console.log("[FC_SMART_LIST_SOURCE]", payload);
    fcDevMirrorScheduleLogToFile("FC_SMART_LIST_SOURCE", payload);
  }, [flicaCalendarListModel, trips.length]);

  const model = flicaCalendarListModel;

  return (
    <View style={styles.wrap}>
      {model.mode === "flica_blocked" ? (
        <View style={styles.card}>
          <Text style={styles.route}>Mini-calendar table unavailable</Text>
          <Text style={styles.meta}>
            This month has no saved FLICA schedule HTML. Smart list uses the FLICA mini calendar only —
            re-import from Manage.
          </Text>
          {typeof __DEV__ !== "undefined" && __DEV__ ? (
            <Text style={styles.devBlocked}>
              [FC_CAL_LEDGER_BLOCKED] {model.reason} {model.visibleMonth}
            </Text>
          ) : null}
          {onManageSchedule ? (
            <Pressable style={styles.manageBtn} onPress={onManageSchedule}>
              <Text style={styles.manageBtnText}>Open Manage</Text>
            </Pressable>
          ) : null}
        </View>
      ) : model.mode === "flica_mini_table" ? (
        model.cells.length ? (
          model.cells.map((cell) => {
            const trip = tripForFlicaCalendarCell(trips, cell);
            const dc = cell.displayCode?.trim() ?? "";
            const dy = sanitizeFlicaLedgerCityText(cell.displayCity);
            const primaryLine =
              dc || dy
                ? `${dc}${dc && dy ? " · " : !dc && dy ? " · " : ""}${dy}`
                : "—";
            const legLine =
              trip &&
              (() => {
                const legs = legsForDutyDate(trip, cell.isoDate);
                if (!legs.length) return "";
                const a = legs[0]?.reportLocal?.trim() ?? "";
                const b =
                  legs[legs.length - 1]?.releaseLocal?.trim() ?? "";
                if (!a && !b) return "";
                return `Rpt ${a || "—"} · D-End ${b || "—"}`;
              })();
            const metaLine =
              [legLine, trip?.pairingCode?.trim()]
                .filter(Boolean)
                .join(" · ") ||
              (trip ? "" : "Tap trip opens when linked");
            return (
              <View
                key={`${cell.isoDate}-${cell.dayOfMonth}-${cell.dayOfWeekLabel}`}
                style={styles.card}
              >
                <Pressable
                  onPress={() => trip && onPressTrip(trip, cell.isoDate)}
                  onLongPress={() => {
                    if (!trip) return;
                    stashTripForDetailNavigation(trip, trips, {
                      visibleMonth: {
                        year: parseInt(cell.isoDate.slice(0, 4), 10),
                        month: parseInt(cell.isoDate.slice(5, 7), 10),
                      },
                      rowDateIso: cell.isoDate,
                    });
                    setPreviewTrip(trip);
                  }}
                  delayLongPress={420}
                  style={({ pressed }) => [pressed && { opacity: 0.92 }]}
                  disabled={!trip}
                >
                  <Text style={styles.range}>{formatLedgerRowDate(cell.isoDate)}</Text>
                  <Text style={styles.route}>{primaryLine}</Text>
                  <Text style={styles.meta}>
                    {metaLine || (trip ? trip.pairingCode : "Tap trip opens when linked")}
                  </Text>
                </Pressable>
              </View>
            );
          })
        ) : (
          <View style={styles.card}>
            <Text style={styles.meta}>No rows parsed from FLICA mini-calendar HTML.</Text>
          </View>
        )
      ) : (
        trips.map((trip) => {
          const leg = trip.legs[0];
          return (
            <View key={trip.id} style={styles.card}>
              <Pressable
                onPress={() => onPressTrip(trip)}
                onLongPress={() => {
                  stashTripForDetailNavigation(trip, trips, {
                    visibleMonth: { year: trip.year, month: trip.month },
                    rowDateIso: trip.startDate,
                  });
                  setPreviewTrip(trip);
                }}
                delayLongPress={420}
                style={({ pressed }) => [pressed && { opacity: 0.92 }]}
                accessibilityHint="Long press for a quick preview of trip details."
              >
                <Text style={styles.range}>{formatRange(trip)}</Text>
                <Text style={styles.route}>{trip.routeSummary}</Text>
                {trip.layoverCity ? (
                  <Text style={styles.lay}>Layover: {trip.layoverCity}</Text>
                ) : null}
                {leg ? (
                  <Text style={styles.times}>
                    Report {leg.reportLocal ?? "—"} • Release{" "}
                    {leg.releaseLocal ?? "—"}
                  </Text>
                ) : null}
                <Text style={styles.meta}>
                  {trip.pairingCreditHours != null
                    ? `${trip.pairingCreditHours.toFixed(2)} CR`
                    : trip.creditHours != null
                      ? `${trip.creditHours} CR`
                      : "— CR"}{" "}
                  • {trip.pairingCode}
                </Text>
              </Pressable>
              <View style={styles.actions}>
                <MiniAction
                  icon="swap-horizontal"
                  label="Post"
                  onPress={() => onPost?.(trip)}
                />
                <MiniAction
                  icon="chatbubbles-outline"
                  label="Chat"
                  onPress={() => onChat?.(trip)}
                />
                <MiniAction
                  icon="options-outline"
                  label="Manage"
                  onPress={() => onManageSchedule?.()}
                />
                <MiniAction
                  icon="alarm-outline"
                  label="Alert"
                  onPress={() => onAlert?.(trip)}
                />
              </View>
            </View>
          );
        })
      )}
      <TripQuickPreviewSheet
        visible={previewTrip != null}
        trip={previewTrip}
        pairingUuid={previewTrip?.schedulePairingId}
        onClose={closePreview}
        onOpenFullTrip={openFullFromPreview}
      />
    </View>
  );
}

function MiniAction({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.mini} hitSlop={6}>
      <Ionicons name={icon} size={16} color={T.accent} />
      <Text style={styles.miniText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingBottom: 12 },
  card: {
    backgroundColor: T.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  range: {
    fontSize: 12,
    fontWeight: "800",
    color: T.textSecondary,
    marginBottom: 4,
  },
  route: { fontSize: 16, fontWeight: "800", color: T.text },
  lay: { fontSize: 13, color: T.text, marginTop: 4 },
  times: { fontSize: 12, color: T.textSecondary, marginTop: 6 },
  meta: { fontSize: 12, color: T.textSecondary, marginTop: 4 },
  devBlocked: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "700",
    color: "#B45309",
  },
  manageBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: T.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  manageBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.line,
  },
  mini: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  miniText: { fontSize: 12, fontWeight: "700", color: T.accent },
});
