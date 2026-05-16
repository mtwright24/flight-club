import React from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View, type TextStyle } from "react-native";
import type { TradeboardPost } from "../flicaCrewHubTypes";
import { tradeboardDisplayScheduleFields, tradeboardTypeLabel } from "../flicaCrewHubMappers";
import { CREW_HUB_CARD_RIM, CREW_HUB_SHEET_SURFACE, SCHEDULE_MOCK_HEADER_RED } from "../scheduleMockPalette";
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
  onOpenNativeDetail?: () => void;
  nativeDetailLoading?: boolean;
};

function firstIataFromText(s: string): string {
  const m = String(s ?? "").toUpperCase().match(/\b([A-Z]{3})\b/);
  return m?.[1] ?? "";
}

export default function CrewHubTradeboardPairingSheet({
  visible,
  post,
  posterFirstName,
  onClose,
  onOpenNativeDetail,
  nativeDetailLoading = false,
}: Props) {
  if (!post) return null;
  const typeLine = tradeboardTypeLabel(post.type);
  const dateLine = post.pairingDateLabel?.trim() || post.date?.trim() || "—";
  const daysPart = post.days?.trim() ? `${post.days.trim()} days` : "";
  const routeDots = hubLayoverDisplayWithDots(post.layover);
  const routeSummary = post.routeSummary?.trim() || "";
  const destLarge =
    firstIataFromText(routeSummary) ||
    firstIataFromText(routeDots) ||
    firstIataFromText(post.layover) ||
    routeSummary.slice(0, 3).toUpperCase() ||
    "—";
  const legRoute = routeSummary || routeDots || "—";
  const commentsTrim = post.comments?.trim() ?? "";
  const tm = tradeboardDisplayScheduleFields(post);
  const rpt = tm.reportTime;
  const dep = tm.departTime;
  const arr = tm.arriveTime;
  const blk = tm.block;
  const cr = tm.credit;
  const worth = post.worth?.trim() || "—";

  const statPairs: [string, string][] = [
    ["R", rpt],
    ["D", dep],
    ["A", arr],
    ["B", blk],
    ["C", cr],
    ["$", worth],
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grab} />

          <View style={styles.heroWhite}>
            <View style={styles.heroTopRow}>
              <Text style={styles.heroPairingId} numberOfLines={1}>
                {post.pairingId}
              </Text>
              <View style={styles.sourcePill}>
                <Text style={styles.sourcePillTxt}>Tradeboard</Text>
              </View>
            </View>
            <Text style={styles.heroDateLine} numberOfLines={1}>
              {[dateLine, daysPart].filter(Boolean).join(META)}
            </Text>
            <Text style={styles.heroDest} numberOfLines={1}>
              {destLarge}
            </Text>
            <Text style={styles.heroRouteSmall} numberOfLines={1}>
              {routeDots || routeSummary || "—"}
            </Text>
            <Text style={styles.heroPosterLine} numberOfLines={1}>
              {posterFirstName}
              {META}
              {typeLine}
            </Text>
          </View>

          <View style={styles.body}>
            <Text style={styles.sectionEyebrow}>STATS</Text>
            <View style={styles.statRow}>
              {statPairs.map(([lab, val]) => (
                <View key={lab} style={styles.statTile}>
                  <Text style={styles.statLab}>{lab}</Text>
                  <Text
                    style={[
                      styles.statVal,
                      MONO,
                      (lab === "$" || lab === "C") && styles.statAccent,
                      lab === "A" && styles.statValRed,
                    ]}
                    numberOfLines={1}
                  >
                    {val}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.dayHead}>
                <Text style={styles.dayHeadLeft} numberOfLines={1}>
                  {dateLine.toUpperCase()}
                </Text>
                <Text style={[styles.dayHeadRight, MONO]} numberOfLines={1}>
                  {rpt}
                </Text>
              </View>
              <View style={styles.legGridHead}>
                <Text style={styles.legHR}>RT</Text>
                <Text style={styles.legHC}>D</Text>
                <Text style={styles.legHC}>A</Text>
                <Text style={styles.legHC}>B</Text>
              </View>
              <View style={styles.legGridRow}>
                <Text style={styles.legR} numberOfLines={1}>
                  {legRoute}
                </Text>
                <Text style={[styles.legC, MONO]} numberOfLines={1}>
                  {dep}
                </Text>
                <Text style={[styles.legC, MONO]} numberOfLines={1}>
                  {arr}
                </Text>
                <Text style={[styles.legC, MONO]} numberOfLines={1}>
                  {blk}
                </Text>
              </View>
            </View>

            <View style={styles.layCard}>
              <Text style={styles.layIcon}>🛏</Text>
              <View style={styles.layTextCol}>
                <Text style={styles.layTag}>LAY</Text>
                <Text style={styles.layBody} numberOfLines={1}>
                  {routeDots || post.layover?.trim() || "—"}
                </Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.crewHead}>
                <Text style={styles.crewHeadTitle}>CREW</Text>
                <Text style={styles.crewHeadCount}>1</Text>
              </View>
              <View style={styles.crewRow}>
                <Text style={styles.crewPos}>{post.position?.trim() || "—"}</Text>
                <Text style={styles.crewName} numberOfLines={1}>
                  {post.posterName?.trim() || posterFirstName}
                </Text>
              </View>
              {post.base?.trim() ? (
                <Text style={styles.crewBase} numberOfLines={1}>
                  {post.base.trim()}
                </Text>
              ) : null}
            </View>

            <View style={styles.comments}>
              <Text style={styles.commentsTitle}>Notes</Text>
              <Text
                style={[styles.commentsBody, commentsTrim ? null : styles.commentsEmpty, MONO]}
                numberOfLines={3}
              >
                {commentsTrim || "—"}
              </Text>
            </View>
          </View>

          <View style={styles.footer}>
            {onOpenNativeDetail ? (
              <Pressable
                style={[styles.btnSecondary, nativeDetailLoading && styles.btnDisabled]}
                onPress={() => void onOpenNativeDetail()}
                disabled={nativeDetailLoading}
              >
                <Text style={styles.btnSecondaryText}>
                  {nativeDetailLoading ? "Loading…" : "Full pairing detail"}
                </Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.btnPrimary} onPress={onClose}>
              <Text style={styles.btnPrimaryText}>Close</Text>
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
    backgroundColor: "rgba(28, 25, 23, 0.42)",
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "82%",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#1c1917",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 14,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  grab: {
    alignSelf: "center",
    width: 28,
    height: 2,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.12)",
    marginTop: 4,
    marginBottom: 2,
  },
  heroWhite: {
    paddingHorizontal: 10,
    paddingTop: 0,
    paddingBottom: 5,
    backgroundColor: "#fff",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  heroPairingId: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: SCHEDULE_MOCK_HEADER_RED,
    letterSpacing: -0.5,
  },
  sourcePill: {
    marginTop: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#fce7f3",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(176, 24, 26, 0.22)",
  },
  sourcePillTxt: { fontSize: 8, fontWeight: "800", color: SCHEDULE_MOCK_HEADER_RED },
  heroDateLine: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: "#57534e",
    lineHeight: 13,
  },
  heroDest: {
    marginTop: 2,
    fontSize: 19,
    fontWeight: "800",
    color: "#0c0a09",
    letterSpacing: -0.5,
  },
  heroRouteSmall: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "700",
    color: "#292524",
    lineHeight: 13,
  },
  heroPosterLine: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "600",
    color: "#78716c",
  },
  body: {
    backgroundColor: CREW_HUB_SHEET_SURFACE,
    paddingHorizontal: 10,
    paddingTop: 5,
    paddingBottom: 6,
  },
  sectionEyebrow: {
    fontSize: 7,
    fontWeight: "900",
    color: "#a8a29e",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  statRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  statTile: {
    flexGrow: 1,
    minWidth: "30%",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CREW_HUB_CARD_RIM,
  },
  statLab: { fontSize: 7, fontWeight: "800", color: "#78716c", letterSpacing: 0.2 },
  statVal: { marginTop: 2, fontSize: 10, fontWeight: "800", color: "#0c0a09" },
  statAccent: { color: "#15803d" },
  statValRed: { color: SCHEDULE_MOCK_HEADER_RED },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 6,
    marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CREW_HUB_CARD_RIM,
  },
  dayHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    paddingBottom: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(120, 113, 108, 0.15)",
  },
  dayHeadLeft: { fontSize: 9, fontWeight: "800", color: "#0c0a09", flex: 1, paddingRight: 4 },
  dayHeadRight: { fontSize: 9, fontWeight: "700", color: "#0f172a" },
  legGridHead: {
    flexDirection: "row",
    paddingBottom: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(120, 113, 108, 0.12)",
  },
  legHR: {
    flex: 2.2,
    fontSize: 6,
    fontWeight: "800",
    color: "#78716c",
    letterSpacing: 0.2,
    paddingLeft: 1,
  },
  legHC: {
    flex: 1,
    fontSize: 6,
    fontWeight: "800",
    color: "#78716c",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  legGridRow: { flexDirection: "row", alignItems: "flex-start", paddingTop: 3 },
  legR: {
    flex: 2.2,
    fontSize: 9,
    fontWeight: "700",
    color: "#0c0a09",
    lineHeight: 12,
    paddingRight: 3,
  },
  legC: {
    flex: 1,
    minWidth: 34,
    fontSize: 9,
    fontWeight: "700",
    color: "#0c0a09",
    textAlign: "center",
  },
  layCard: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 5,
    marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CREW_HUB_CARD_RIM,
  },
  layIcon: { fontSize: 11, marginTop: 1 },
  layTextCol: { flex: 1, minWidth: 0 },
  layTag: { fontSize: 7, fontWeight: "800", color: "#78716c", letterSpacing: 0.3, marginBottom: 1 },
  layBody: { fontSize: 10, fontWeight: "600", color: "#292524", lineHeight: 13 },
  crewHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    paddingBottom: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(120, 113, 108, 0.12)",
  },
  crewHeadTitle: { fontSize: 8, fontWeight: "900", color: "#78716c", letterSpacing: 0.4 },
  crewHeadCount: { fontSize: 8, fontWeight: "800", color: "#78716c" },
  crewRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  crewPos: {
    fontSize: 9,
    fontWeight: "800",
    color: SCHEDULE_MOCK_HEADER_RED,
    minWidth: 24,
  },
  crewName: { flex: 1, fontSize: 10, fontWeight: "700", color: "#0c0a09", lineHeight: 13 },
  crewBase: { marginTop: 2, fontSize: 8, fontWeight: "600", color: "#78716c" },
  comments: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CREW_HUB_CARD_RIM,
  },
  commentsTitle: { fontSize: 8, fontWeight: "900", color: "#78716c", letterSpacing: 0.35, marginBottom: 3 },
  commentsBody: { fontSize: 9, fontWeight: "500", color: "#1c1917", lineHeight: 12 },
  commentsEmpty: { color: "#a8a29e", fontStyle: "italic" },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e7e5e4",
    backgroundColor: "#fafaf9",
  },
  btnDisabled: { opacity: 0.55 },
  btnSecondary: {
    flexBasis: "100%",
    backgroundColor: "#fff",
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SCHEDULE_MOCK_HEADER_RED,
  },
  btnSecondaryText: {
    color: SCHEDULE_MOCK_HEADER_RED,
    fontSize: 11,
    fontWeight: "900",
  },
  btnPrimary: {
    flex: 1,
    minWidth: 120,
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontSize: 11, fontWeight: "900" },
});
