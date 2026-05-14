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
import type { TradeboardPost } from "../flicaCrewHubTypes";
import { tradeboardTypeLabel } from "../flicaCrewHubMappers";
import { SCHEDULE_MOCK_HEADER_RED } from "../scheduleMockPalette";
import { hubLayoverDisplayWithDots } from "../crewHubLayoverDisplay";

const META = " · ";

const MONO: TextStyle = Platform.select<TextStyle>({
  ios: { fontFamily: "Menlo" },
  android: { fontFamily: "monospace" },
  default: { fontFamily: "monospace" },
});

type Props = {
  visible: boolean;
  post: TradeboardPost | null;
  posterFirstName: string;
  onClose: () => void;
  onOpenFlica: (uri: string) => void;
};

export default function CrewHubTradeboardPairingSheet({
  visible,
  post,
  posterFirstName,
  onClose,
  onOpenFlica,
}: Props) {
  if (!post) return null;
  const typeLine = tradeboardTypeLabel(post.type);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grab} />
          <LinearGradient
            colors={["#1e3a5f", "#334155", "#1e293b"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGrad}
          >
            <Text style={styles.typeCaps}>{typeLine}</Text>
            <Text style={styles.heroPair}>{post.pairingId}</Text>
            <Text style={styles.heroSub} numberOfLines={2}>
              {posterFirstName}
              {META}
              {post.pairingDateLabel || post.date || "—"}
            </Text>
          </LinearGradient>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyPad} showsVerticalScrollIndicator={false}>
            <View style={styles.statRow}>
              {(
                [
                  ["RPT", post.reportTime],
                  ["DEP", post.departTime],
                  ["ARR", post.arriveTime],
                  ["CR", post.credit],
                  ["$", post.worth ?? "—"],
                ] as const
              ).map(([lab, val]) => (
                <View key={lab} style={styles.statTile}>
                  <Text style={styles.statLab}>{lab}</Text>
                  <Text
                    style={[styles.statVal, lab === "$" && styles.statWorth, MONO]}
                    numberOfLines={1}
                  >
                    {val?.trim() ? String(val).trim() : "—"}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Layover</Text>
              <Text style={styles.panelBody}>{hubLayoverDisplayWithDots(post.layover)}</Text>
            </View>

            <View style={styles.kv}>
              <Text style={styles.kvLine}>
                <Text style={styles.kvK}>Base </Text>
                {post.base?.trim() || "—"}
              </Text>
              <Text style={styles.kvLine}>
                <Text style={styles.kvK}>Position </Text>
                {post.position?.trim() || "—"}
              </Text>
              <Text style={styles.kvLine}>
                <Text style={styles.kvK}>Posted </Text>
                {post.postedAtLabel || post.postedAt || "—"}
              </Text>
              {post.responseMethodLabel?.trim() ? (
                <Text style={styles.kvLine}>
                  <Text style={styles.kvK}>Responses </Text>
                  {post.responseMethodLabel.trim()}
                </Text>
              ) : null}
            </View>

            {post.comments?.trim() ? (
              <View style={styles.comments}>
                <Text style={styles.commentsTitle}>Comments</Text>
                <Text style={styles.commentsBody}>{post.comments.trim()}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={styles.btnPrimary}
              onPress={() => onOpenFlica(FLICA_NATIVE_URLS.tradeFrame)}
            >
              <Text style={styles.btnPrimaryText}>Open in FLICA</Text>
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
    maxHeight: "90%",
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
  heroGrad: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 },
  typeCaps: { fontSize: 9, fontWeight: "900", color: "rgba(255,255,255,0.75)", letterSpacing: 1 },
  heroPair: { marginTop: 4, fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  heroSub: { marginTop: 6, fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.9)" },
  body: { maxHeight: 400 },
  bodyPad: { paddingHorizontal: 14, paddingBottom: 12 },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  statTile: {
    flexGrow: 1,
    minWidth: "28%",
    backgroundColor: "#fff",
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
  comments: {
    marginTop: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.06)",
  },
  commentsTitle: { fontSize: 10, fontWeight: "800", color: "#64748b", letterSpacing: 0.6, marginBottom: 8 },
  commentsBody: { fontSize: 12, fontWeight: "500", color: "#1e293b", lineHeight: 18 },
  footer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(15,23,42,0.08)",
    backgroundColor: "#f4f4f5",
    gap: 8,
  },
  btnPrimary: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  btnSecondary: { alignItems: "center", paddingVertical: 6 },
  btnSecondaryText: { color: SCHEDULE_MOCK_HEADER_RED, fontSize: 12, fontWeight: "700" },
});
