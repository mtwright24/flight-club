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
import {
  CREW_HUB_CARD_RIM,
  CREW_HUB_SHEET_SURFACE,
  SCHEDULE_MOCK_HEADER_RED,
  SCHEDULE_MOCK_STATS_STRIP_RED,
} from "../scheduleMockPalette";
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

  const statPairs: [string, string][] = [
    ["RPT", trip.reportTime?.trim() || "—"],
    ["DEP", trip.departTime?.trim() || "—"],
    ["ARR", trip.arriveTime?.trim() || "—"],
    ["BLK", trip.block?.trim() || "—"],
    ["CR", trip.credit?.trim() || "—"],
    ["WORTH", trip.worth?.trim() || "—"],
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grab} />
          <LinearGradient
            colors={["#5c1018", SCHEDULE_MOCK_HEADER_RED, SCHEDULE_MOCK_STATS_STRIP_RED]}
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
            <Text style={styles.heroLay} numberOfLines={2}>
              Layover {hubLayoverDisplayWithDots(trip.layover)}
            </Text>
          </LinearGradient>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyPad} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionEyebrow}>PAIRING STATS</Text>
            <View style={styles.statRow}>
              {statPairs.map(([lab, val]) => (
                <View key={lab} style={styles.statTile}>
                  <Text style={styles.statLab}>{lab}</Text>
                  <Text
                    style={[styles.statVal, (lab === "WORTH" || lab === "CR") && styles.statAccent, MONO]}
                    numberOfLines={1}
                  >
                    {val}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Bid & pairing</Text>
              <Text style={styles.panelLine}>
                <Text style={styles.kvK}>Bid position </Text>
                {bid}
              </Text>
              <Text style={styles.panelLine}>
                <Text style={styles.kvK}>Days </Text>
                {daysLabel(trip.days)}
              </Text>
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Layover</Text>
              <Text style={[styles.panelBody, MONO]}>{hubLayoverDisplayText(trip.layover)}</Text>
            </View>

            {trip.legalityStatus?.trim() ? (
              <View style={styles.legalPanel}>
                <Text style={styles.legalTitle}>Legality</Text>
                <Text style={styles.legalBody}>{trip.legalityStatus.trim()}</Text>
              </View>
            ) : null}
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
    backgroundColor: "rgba(28, 25, 23, 0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: CREW_HUB_SHEET_SURFACE,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "88%",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#1c0708",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.22,
        shadowRadius: 18,
      },
      android: { elevation: 14 },
      default: {},
    }),
  },
  grab: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginTop: 8,
    marginBottom: 4,
  },
  heroGrad: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  heroPair: { fontSize: 20, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  srcPill: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  srcPillText: { fontSize: 10, fontWeight: "900", color: "#fff" },
  heroSub: { marginTop: 6, fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.9)", lineHeight: 15 },
  heroLay: { marginTop: 8, fontSize: 12, fontWeight: "700", color: "#fff", lineHeight: 16 },
  body: { maxHeight: 400 },
  bodyPad: { paddingHorizontal: 14, paddingBottom: 14 },
  sectionEyebrow: {
    fontSize: 8,
    fontWeight: "900",
    color: "#a8a29e",
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 2,
  },
  statRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  statTile: {
    flexGrow: 1,
    minWidth: "29%",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: CREW_HUB_CARD_RIM,
    ...Platform.select({
      ios: {
        shadowColor: "#2a0a0c",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  statLab: { fontSize: 8, fontWeight: "800", color: "#78716c", letterSpacing: 0.5 },
  statVal: { marginTop: 4, fontSize: 11, fontWeight: "800", color: "#1c1917" },
  statAccent: { color: "#15803d" },
  panel: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: CREW_HUB_CARD_RIM,
    gap: 6,
  },
  panelTitle: { fontSize: 9, fontWeight: "900", color: "#78716c", letterSpacing: 0.75, marginBottom: 2 },
  panelBody: { fontSize: 12, fontWeight: "600", color: "#292524", lineHeight: 17 },
  panelLine: { fontSize: 11, fontWeight: "600", color: "#44403c", lineHeight: 16 },
  kvK: { fontWeight: "600", color: "#a8a29e" },
  legalPanel: {
    marginTop: 12,
    backgroundColor: "rgba(22, 101, 52, 0.08)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.2)",
  },
  legalTitle: { fontSize: 9, fontWeight: "900", color: "#166534", letterSpacing: 0.6, marginBottom: 6 },
  legalBody: { fontSize: 11, fontWeight: "600", color: "#14532d", lineHeight: 16 },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: CREW_HUB_CARD_RIM,
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  btnPrimary: {
    flex: 1,
    minWidth: 100,
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  btnPrimaryText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  btnGhost: {
    flex: 1,
    minWidth: 100,
    backgroundColor: "#fff",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CREW_HUB_CARD_RIM,
  },
  btnGhostText: { color: SCHEDULE_MOCK_HEADER_RED, fontSize: 13, fontWeight: "900" },
  btnSecondary: {
    flexBasis: "100%",
    alignItems: "center",
    paddingVertical: 6,
  },
  btnSecondaryText: { color: SCHEDULE_MOCK_HEADER_RED, fontSize: 12, fontWeight: "800" },
});
