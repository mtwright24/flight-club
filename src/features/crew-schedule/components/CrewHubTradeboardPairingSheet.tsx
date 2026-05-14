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
  onOpenFlica: (uri: string) => void;
};

function firstIataFromText(s: string): string {
  const m = String(s ?? "").toUpperCase().match(/\b([A-Z]{3})\b/);
  return m?.[1] ?? "";
}

function StatPill({
  label,
  value,
  valueRed,
}: {
  label: string;
  value: string;
  valueRed?: boolean;
}) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statPillLab} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.statPillVal, MONO, valueRed && styles.statPillValRed]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
      </Text>
    </View>
  );
}

export default function CrewHubTradeboardPairingSheet({
  visible,
  post,
  posterFirstName,
  onClose,
  onOpenFlica,
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
  const rpt = post.reportTime?.trim() || "—";
  const dep = post.departTime?.trim() || "—";
  const arr = post.arriveTime?.trim() || "—";
  const blk = post.block?.trim() || "—";
  const cr = post.credit?.trim() || "—";
  const worth = post.worth?.trim() || "—";
  const dutyFdp = `${dep} / ${arr}`;

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
            <Text style={styles.heroDateLine} numberOfLines={2}>
              {[dateLine, daysPart].filter(Boolean).join(META)}
            </Text>
            <Text style={styles.heroDest} numberOfLines={1}>
              {destLarge}
            </Text>
            <Text style={styles.heroRouteSmall} numberOfLines={2}>
              {routeDots || routeSummary || "—"}
            </Text>
            <Text style={styles.heroPosterLine} numberOfLines={1}>
              {posterFirstName}
              {META}
              {typeLine}
            </Text>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyPad} showsVerticalScrollIndicator={false}>
            <View style={styles.statPillRow}>
              <StatPill label="RPT" value={rpt} />
              <StatPill label="T-CREDIT" value={cr} />
              <StatPill label="TAFB" value="—" />
              <StatPill label="DUTY/FDP" value={dutyFdp} />
              <StatPill label="D-END" value={arr} valueRed />
            </View>

            <View style={styles.dividerFaint} />

            <View style={styles.sectionCard}>
              <View style={styles.dayHead}>
                <Text style={styles.dayHeadLeft} numberOfLines={1}>
                  {dateLine.toUpperCase()}
                </Text>
                <Text style={styles.dayHeadRight} numberOfLines={1}>
                  Rpt {rpt}
                </Text>
              </View>
              <View style={styles.legGridHead}>
                <Text style={styles.legHR}>ROUTE</Text>
                <Text style={styles.legHC}>DEP</Text>
                <Text style={styles.legHC}>ARR</Text>
                <Text style={styles.legHC}>BLK</Text>
              </View>
              <View style={styles.legGridRow}>
                <Text style={styles.legR} numberOfLines={2}>
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
                <Text style={styles.layTag}>LAYOVER</Text>
                <Text style={styles.layBody} numberOfLines={4}>
                  {routeDots || post.layover?.trim() || "—"}
                </Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.crewHead}>
                <Text style={styles.crewHeadTitle}>CREW</Text>
                <Text style={styles.crewHeadCount}>1 crew</Text>
              </View>
              <View style={styles.crewRow}>
                <Text style={styles.crewPos}>{post.position?.trim() || "—"}</Text>
                <Text style={styles.crewName} numberOfLines={2}>
                  {post.posterName?.trim() || posterFirstName}
                </Text>
              </View>
              {post.base?.trim() ? (
                <Text style={styles.crewBase} numberOfLines={1}>
                  Base {post.base.trim()}
                </Text>
              ) : null}
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Post details</Text>
              <Text style={styles.panelLine}>
                <Text style={styles.kvK}>Posted </Text>
                {post.postedAtLabel || post.postedAt || "—"}
              </Text>
              {post.responseMethodLabel?.trim() ? (
                <Text style={styles.panelLine}>
                  <Text style={styles.kvK}>Responses </Text>
                  {post.responseMethodLabel.trim()}
                </Text>
              ) : null}
              {post.responseMethods?.trim() ? (
                <Text style={styles.panelLine}>
                  <Text style={styles.kvK}>Methods </Text>
                  {post.responseMethods.trim()}
                </Text>
              ) : null}
              <Text style={styles.panelLine}>
                <Text style={styles.kvK}>Worth </Text>
                <Text style={styles.worthInline}>{worth}</Text>
              </Text>
            </View>

            <View style={styles.comments}>
              <Text style={styles.commentsTitle}>Comments</Text>
              <Text style={[styles.commentsBody, commentsTrim ? null : styles.commentsEmpty, MONO]}>
                {commentsTrim || "No comments on this post."}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.btnPrimary} onPress={() => onOpenFlica(FLICA_NATIVE_URLS.tradeFrame)}>
              <Text style={styles.btnPrimaryText}>Open in FLICA</Text>
            </Pressable>
            <Pressable style={styles.btnGhost} onPress={onClose}>
              <Text style={styles.btnGhostText}>Close</Text>
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
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "94%",
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
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.12)",
    marginTop: 6,
    marginBottom: 4,
  },
  heroWhite: {
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 8,
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
    fontSize: 20,
    fontWeight: "800",
    color: SCHEDULE_MOCK_HEADER_RED,
    letterSpacing: -0.6,
  },
  sourcePill: {
    marginTop: 2,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#fce7f3",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(176, 24, 26, 0.22)",
  },
  sourcePillTxt: { fontSize: 9, fontWeight: "800", color: SCHEDULE_MOCK_HEADER_RED },
  heroDateLine: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: "#57534e",
    lineHeight: 15,
  },
  heroDest: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: "800",
    color: "#0c0a09",
    letterSpacing: -0.8,
  },
  heroRouteSmall: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "700",
    color: "#292524",
    lineHeight: 16,
  },
  heroPosterLine: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "600",
    color: "#78716c",
  },
  body: { maxHeight: 400, backgroundColor: CREW_HUB_SHEET_SURFACE },
  bodyPad: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  statPillRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 5,
  },
  statPill: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#f5f5f4",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e7e5e4",
  },
  statPillLab: {
    fontSize: 7,
    fontWeight: "800",
    color: "#78716c",
    letterSpacing: 0.25,
    textAlign: "center",
  },
  statPillVal: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "800",
    color: "#0c0a09",
    textAlign: "center",
  },
  statPillValRed: { color: SCHEDULE_MOCK_HEADER_RED },
  dividerFaint: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(120, 113, 108, 0.18)",
    marginVertical: 8,
  },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CREW_HUB_CARD_RIM,
  },
  dayHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(120, 113, 108, 0.15)",
  },
  dayHeadLeft: { fontSize: 10, fontWeight: "800", color: "#0c0a09", flex: 1, paddingRight: 6 },
  dayHeadRight: { fontSize: 9, fontWeight: "600", color: "#78716c" },
  legGridHead: {
    flexDirection: "row",
    paddingBottom: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(120, 113, 108, 0.12)",
  },
  legHR: {
    flex: 2.2,
    fontSize: 7,
    fontWeight: "800",
    color: "#78716c",
    letterSpacing: 0.3,
    paddingLeft: 2,
  },
  legHC: {
    flex: 1,
    fontSize: 7,
    fontWeight: "800",
    color: "#78716c",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  legGridRow: { flexDirection: "row", alignItems: "flex-start", paddingTop: 5 },
  legR: {
    flex: 2.2,
    fontSize: 10,
    fontWeight: "700",
    color: "#0c0a09",
    lineHeight: 14,
    paddingRight: 4,
  },
  legC: {
    flex: 1,
    fontSize: 10,
    fontWeight: "700",
    color: "#0c0a09",
    textAlign: "center",
  },
  layCard: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CREW_HUB_CARD_RIM,
  },
  layIcon: { fontSize: 14, marginTop: 2 },
  layTextCol: { flex: 1, minWidth: 0 },
  layTag: { fontSize: 8, fontWeight: "800", color: "#78716c", letterSpacing: 0.4, marginBottom: 2 },
  layBody: { fontSize: 11, fontWeight: "600", color: "#292524", lineHeight: 15 },
  crewHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(120, 113, 108, 0.12)",
  },
  crewHeadTitle: { fontSize: 9, fontWeight: "900", color: "#78716c", letterSpacing: 0.5 },
  crewHeadCount: { fontSize: 9, fontWeight: "800", color: "#78716c" },
  crewRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  crewPos: {
    fontSize: 10,
    fontWeight: "800",
    color: SCHEDULE_MOCK_HEADER_RED,
    minWidth: 28,
  },
  crewName: { flex: 1, fontSize: 11, fontWeight: "700", color: "#0c0a09", lineHeight: 15 },
  crewBase: { marginTop: 4, fontSize: 9, fontWeight: "600", color: "#78716c" },
  panel: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CREW_HUB_CARD_RIM,
    gap: 4,
  },
  panelTitle: { fontSize: 9, fontWeight: "900", color: "#78716c", letterSpacing: 0.5, marginBottom: 2 },
  panelLine: { fontSize: 10, fontWeight: "600", color: "#292524", lineHeight: 14 },
  kvK: { fontWeight: "600", color: "#a8a29e" },
  worthInline: { fontWeight: "800", color: "#15803d" },
  comments: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CREW_HUB_CARD_RIM,
  },
  commentsTitle: { fontSize: 9, fontWeight: "900", color: "#78716c", letterSpacing: 0.45, marginBottom: 6 },
  commentsBody: { fontSize: 10, fontWeight: "500", color: "#1c1917", lineHeight: 15 },
  commentsEmpty: { color: "#a8a29e", fontStyle: "italic" },
  footer: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e7e5e4",
    backgroundColor: "#fafaf9",
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  btnGhost: {
    flex: 1,
    backgroundColor: "#f5f5f4",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CREW_HUB_CARD_RIM,
  },
  btnGhostText: { color: SCHEDULE_MOCK_HEADER_RED, fontSize: 12, fontWeight: "800" },
});
