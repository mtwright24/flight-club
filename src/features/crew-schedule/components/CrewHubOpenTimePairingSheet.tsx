import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";
import { FLICA_NATIVE_URLS } from "../../flica-actions/flicaActionsNativeService";
import type { OpenTimeTrip } from "../flicaCrewHubTypes";
import { SCHEDULE_MOCK_HEADER_RED } from "../scheduleMockPalette";
import { hubLayoverDisplayText, hubLayoverDisplayWithDots } from "../crewHubLayoverDisplay";

const META = " · ";

const MONO: TextStyle = Platform.select<TextStyle>({
  ios: { fontFamily: "Menlo" },
  android: { fontFamily: "monospace" },
  default: { fontFamily: "monospace" },
});

type Props = {
  visible: boolean;
  trip: OpenTimeTrip | null;
  onClose: () => void;
  onOpenFlica: (uri: string) => void;
};

function daysLabel(d: number | null): string {
  if (d == null || !Number.isFinite(d) || d <= 0) return "—";
  return `${d} day${d === 1 ? "" : "s"}`;
}

export default function CrewHubOpenTimePairingSheet({ visible, trip, onClose, onOpenFlica }: Props) {
  if (!trip) return null;
  const dateLine = [trip.date, trip.dates, trip.dateLabel].filter(Boolean).join(META).trim() || "—";
  const bid = trip.bidPos?.trim() || "—";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grab} />
          <LinearGradient
            colors={["#9f1239", SCHEDULE_MOCK_HEADER_RED, "#7f1d1d"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGrad}
          >
            <View style={styles.heroTop}>
              <Text style={styles.heroPair}>{trip.pairingId}</Text>
              <View style={styles.srcPill}>
                <Text style={styles.srcPillText}>Open Time</Text>
              </View>
            </View>
            <Text style={styles.heroSub} numberOfLines={2}>
              {dateLine}
              {META}
              {daysLabel(trip.days)}
            </Text>
            <Text style={styles.heroLay} numberOfLines={3}>
              Layover {hubLayoverDisplayWithDots(trip.layover)}
            </Text>
          </LinearGradient>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyPad} showsVerticalScrollIndicator={false}>
            <View style={styles.statRow}>
              {(
                [
                  ["RPT", trip.reportTime],
                  ["DEP", trip.departTime],
                  ["ARR", trip.arriveTime],
                  ["CR", trip.credit],
                  ["WORTH", trip.worth?.trim() || "—"],
                ] as const
              ).map(([lab, val]) => (
                <View key={lab} style={styles.statTile}>
                  <Text style={styles.statLab}>{lab}</Text>
                  <Text style={[styles.statVal, lab === "WORTH" && styles.statWorth, MONO]} numberOfLines={1}>
                    {val?.trim() ? String(val).trim() : "—"}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Layover</Text>
              <Text style={styles.panelBody}>{hubLayoverDisplayText(trip.layover)}</Text>
            </View>

            <View style={styles.kv}>
              <Text style={styles.kvLine}>
                <Text style={styles.kvK}>Bid position </Text>
                {bid}
              </Text>
              <Text style={styles.kvLine}>
                <Text style={styles.kvK}>Days </Text>
                {daysLabel(trip.days)}
              </Text>
              <Text style={styles.kvLine}>
                <Text style={styles.kvK}>Pairing date </Text>
                {dateLine}
              </Text>
              {trip.legalityStatus?.trim() ? (
                <Text style={styles.kvLegal}>{trip.legalityStatus.trim()}</Text>
              ) : null}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={styles.btnPrimary}
              onPress={() => onOpenFlica(FLICA_NATIVE_URLS.otAddPreview)}
            >
              <Text style={styles.btnPrimaryText}>Add</Text>
            </Pressable>
            <Pressable
              style={styles.btnGhost}
              onPress={() => onOpenFlica(FLICA_NATIVE_URLS.otSwapPreview)}
            >
              <Text style={styles.btnGhostText}>Swap</Text>
            </Pressable>
            <Pressable style={styles.btnSecondary} onPress={onClose}>
              <Text style={styles.btnSecondaryText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fafafa",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "88%",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  grab: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.12)",
    marginTop: 8,
    marginBottom: 4,
  },
  heroGrad: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  heroPair: { fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  srcPill: {
    backgroundColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  srcPillText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  heroSub: { marginTop: 6, fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.88)" },
  heroLay: { marginTop: 8, fontSize: 15, fontWeight: "700", color: "#fff" },
  body: { maxHeight: 360 },
  bodyPad: { paddingHorizontal: 14, paddingBottom: 12 },
  statRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  statTile: {
    flexGrow: 1,
    minWidth: "28%",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.08)",
  },
  statLab: { fontSize: 8, fontWeight: "800", color: "#94a3b8", letterSpacing: 0.6 },
  statVal: { marginTop: 4, fontSize: 12, fontWeight: "700", color: "#0f172a" },
  statWorth: { color: "#15803d" },
  panel: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.06)",
  },
  panelTitle: { fontSize: 9, fontWeight: "800", color: "#94a3b8", letterSpacing: 0.8, marginBottom: 6 },
  panelBody: { fontSize: 13, fontWeight: "600", color: "#1e293b", lineHeight: 18 },
  kv: { marginTop: 12, gap: 6 },
  kvLine: { fontSize: 11, fontWeight: "600", color: "#334155" },
  kvK: { fontWeight: "500", color: "#64748b" },
  kvLegal: { fontSize: 10, fontWeight: "600", color: "#15803d", marginTop: 4 },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(15,23,42,0.08)",
    backgroundColor: "#f4f4f5",
  },
  btnPrimary: {
    flex: 1,
    minWidth: 100,
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  btnGhost: {
    flex: 1,
    minWidth: 100,
    backgroundColor: "#e2e8f0",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  btnGhostText: { color: "#334155", fontSize: 13, fontWeight: "800" },
  btnSecondary: {
    flexBasis: "100%",
    alignItems: "center",
    paddingVertical: 8,
  },
  btnSecondaryText: { color: SCHEDULE_MOCK_HEADER_RED, fontSize: 12, fontWeight: "700" },
});
