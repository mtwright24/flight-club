import React, { useCallback, useEffect, useState } from "react";
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CREW_HUB_CARD_RIM, CREW_HUB_SHEET_SURFACE, SCHEDULE_MOCK_HEADER_RED } from "../scheduleMockPalette";
import type { FlicaMarketplacePairingDetail } from "../flicaMarketplacePairingDetailTypes";

const WIN_H = Dimensions.get("window").height;
const SHEET_MAX_H = WIN_H * 0.88;
/** Until header is measured, assume ~this much so ScrollView gets a sane bound on first paint. */
const HEADER_PLACEHOLDER = 168;

const MONO: TextStyle = Platform.select<TextStyle>({
  ios: { fontFamily: "Menlo" },
  android: { fontFamily: "monospace" },
  default: { fontFamily: "monospace" },
});

type Props = {
  visible: boolean;
  detail: FlicaMarketplacePairingDetail | null;
  /** Dismiss by tapping outside the sheet (backdrop). */
  onClose: () => void;
};

function routeLine(summary: string): string {
  const s = String(summary ?? "").trim();
  if (!s) return "—";
  return s
    .split(/\s*[-–—→/|]\s*/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" • ");
}

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  const v = value?.trim() || "—";
  return (
    <View style={chipStyles.wrap}>
      <Text style={chipStyles.lab}>{label}</Text>
      <Text style={[chipStyles.val, MONO, accent && chipStyles.accent]} numberOfLines={2}>
        {v}
      </Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  wrap: {
    minWidth: 56,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(92, 16, 24, 0.1)",
  },
  lab: {
    fontSize: 7,
    fontWeight: "800",
    color: "#78716c",
    letterSpacing: 0.25,
    textTransform: "uppercase",
  },
  val: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "800",
    color: "#0c0a09",
    lineHeight: 14,
  },
  accent: { color: "#15803d" },
});

/**
 * Compact marketplace pairing detail — dismiss via backdrop tap or hardware back.
 */
export default function FlicaMarketplacePairingDetailSheet({ visible, detail, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);

  const onHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setHeaderHeight((prev) => (Math.abs(prev - h) < 1 ? prev : h));
  }, []);

  useEffect(() => {
    if (!detail) return;
    setHeaderHeight(0);
  }, [detail]);

  if (!detail) return null;

  const routeBig = routeLine(detail.routeSummary);
  const metaLine = [detail.dateRangeLabel, detail.daysLabel].filter(Boolean).join(" · ");

  const headerBlock = headerHeight > 0 ? headerHeight : HEADER_PLACEHOLDER;
  const scrollViewportH = Math.max(140, Math.min(WIN_H * 0.72, SHEET_MAX_H - headerBlock - 4));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} accessibilityRole="button" />
        <View style={styles.sheet}>
          <View style={styles.headerMeasure} onLayout={onHeaderLayout}>
            <View style={styles.grab} />

            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <Text style={styles.pairingId} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {detail.pairingId}
                </Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>{detail.sourceBadge}</Text>
                </View>
              </View>
              {metaLine ? (
                <Text style={styles.metaLine} numberOfLines={2}>
                  {metaLine}
                </Text>
              ) : null}
              {detail.operatingDates?.trim() ? (
                <Text style={styles.operatesSub} numberOfLines={1}>
                  {detail.operatingDates.trim()}
                </Text>
              ) : null}
              <Text style={styles.routeLine} numberOfLines={3}>
                {routeBig}
              </Text>
              <Text style={styles.baseMeta} numberOfLines={1}>
                {[detail.base, detail.equipment].filter(Boolean).join(" / ") || "—"}
                {detail.positions?.trim() ? ` · ${detail.positions.trim()}` : ""}
              </Text>
            </View>
          </View>

          <ScrollView
            style={[styles.scroll, { height: scrollViewportH, maxHeight: scrollViewportH }]}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(12, insets.bottom + 10) },
            ]}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            bounces={Platform.OS === "ios"}
            overScrollMode="auto"
          >
            <Text style={styles.sectionEyebrow}>STATS</Text>
            <View style={styles.statChipRow}>
              <StatChip label="RPT" value={detail.reportTime} />
              <StatChip label="T-CREDIT" value={detail.totalCredit} accent />
              <StatChip label="TAFB" value={detail.tafb} />
              <StatChip label="DUTY/FDP" value={detail.dutyFdp ?? "—"} />
            </View>

            {detail.dutyDays.map((d, i) => (
              <View key={`${d.dayLabel}-${i}`} style={styles.dayCard}>
                <Text style={styles.dayHeadText} numberOfLines={1}>
                  {d.dayLabel}
                </Text>
                {d.reportTime?.trim() ? (
                  <Text style={[styles.daySubRpt, MONO]} numberOfLines={1}>
                    RPT {d.reportTime.trim()}
                  </Text>
                ) : null}

                {d.legs.map((leg, li) => (
                  <View key={`leg-${i}-${li}`} style={styles.legBlock}>
                    <View style={styles.legTop}>
                      {leg.isDeadhead ? (
                        <View style={styles.dhPill}>
                          <Text style={styles.dhPillTxt}>{leg.deadheadType === "LIMO" ? "LIMO" : "DH"}</Text>
                        </View>
                      ) : (
                        <View style={styles.dhSpacer} />
                      )}
                      <Text style={styles.legFlight} numberOfLines={1}>
                        {leg.flightNumber}
                        {leg.equipment?.trim() ? (
                          <Text style={styles.legEqDim}> · {leg.equipment.trim()}</Text>
                        ) : null}
                      </Text>
                    </View>
                    <Text style={styles.legRoute} numberOfLines={1}>
                      {leg.route || "—"}
                    </Text>
                    <View style={styles.legGrid}>
                      <Text style={[styles.legCell, MONO]}>{leg.departLocal}</Text>
                      <Text style={styles.legArrowSmall}>→</Text>
                      <Text style={[styles.legCell, MONO]}>{leg.arriveLocal}</Text>
                      <Text style={[styles.legBlk, MONO]} numberOfLines={1}>
                        {leg.blockTime || ""}
                      </Text>
                    </View>
                  </View>
                ))}

                {d.layover &&
                (d.layover.city ||
                  d.layover.duration ||
                  d.layover.hotelName ||
                  d.layover.hotelPhone ||
                  d.layover.nextReportTime ||
                  d.layover.dEndLocal) ? (
                  <View style={styles.layBand}>
                    <Text style={styles.bed}>🛏</Text>
                    <View style={styles.layInner}>
                      <Text style={styles.layTitle} numberOfLines={2}>
                        LAYOVER{d.layover.city?.trim() ? `: ${d.layover.city.trim()}` : ""}
                      </Text>
                      {d.layover.duration?.trim() ? (
                        <Text style={styles.layMeta} numberOfLines={1}>
                          Rest {d.layover.duration.trim()}
                        </Text>
                      ) : null}
                      {d.layover.dEndLocal?.trim() || d.layover.nextReportTime?.trim() ? (
                        <Text style={[styles.layMeta, MONO]} numberOfLines={2}>
                          {[d.layover.dEndLocal?.trim() ? `D-END ${d.layover.dEndLocal.trim()}` : "", d.layover.nextReportTime?.trim() ? `REPT ${d.layover.nextReportTime.trim()}` : ""]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      ) : null}
                      {d.layover.hotelName?.trim() ? (
                        <Text style={styles.hotelTitle} numberOfLines={2}>
                          {d.layover.hotelName.trim()}
                        </Text>
                      ) : null}
                      {d.layover.hotelPhone?.trim() ? (
                        <Text style={[styles.hotelPhone, MONO]} numberOfLines={1}>
                          {d.layover.hotelPhone.trim()}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </View>
            ))}

            <Text style={styles.sectionEyebrow}>CREW</Text>
            <View style={styles.crewCard}>
              {detail.crewMembers.length === 0 ? (
                <Text style={styles.crewEmpty}>—</Text>
              ) : (
                detail.crewMembers.map((c, ci) => (
                  <View key={`${c.employeeId}-${ci}`} style={styles.crewRow}>
                    <Text style={styles.crewPos} numberOfLines={1}>
                      {c.position}
                    </Text>
                    <View style={styles.crewMid}>
                      <Text style={styles.crewName} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Text style={[styles.crewId, MONO]} numberOfLines={1}>
                        {c.employeeId}
                      </Text>
                    </View>
                    {c.status?.trim() ? (
                      <Text style={styles.crewStatus} numberOfLines={1}>
                        {c.status.trim()}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(28, 25, 23, 0.48)",
    justifyContent: "flex-end",
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: SHEET_MAX_H,
    width: "100%",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#1c0708",
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
      },
      android: { elevation: 14 },
      default: {},
    }),
  },
  headerMeasure: {
    flexShrink: 0,
  },
  grab: {
    alignSelf: "center",
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.1)",
    marginTop: 6,
    marginBottom: 2,
  },
  hero: {
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  pairingId: {
    flex: 1,
    fontSize: 26,
    fontWeight: "900",
    color: "#0c0a09",
    letterSpacing: -0.8,
    lineHeight: 30,
  },
  badge: {
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#fff5f5",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(176, 24, 26, 0.25)",
  },
  badgeTxt: { fontSize: 8, fontWeight: "900", color: SCHEDULE_MOCK_HEADER_RED, letterSpacing: 0.2 },
  metaLine: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: "600",
    color: "#57534e",
    lineHeight: 15,
  },
  operatesSub: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "500",
    color: "#a8a29e",
  },
  routeLine: {
    marginTop: 8,
    fontSize: 17,
    fontWeight: "800",
    color: "#0c0a09",
    letterSpacing: -0.35,
    lineHeight: 22,
  },
  baseMeta: { marginTop: 5, fontSize: 10, fontWeight: "600", color: "#78716c" },
  scroll: {
    backgroundColor: CREW_HUB_SHEET_SURFACE,
    flexGrow: 0,
  },
  scrollContent: { paddingHorizontal: 12, paddingTop: 10, flexGrow: 0 },
  sectionEyebrow: {
    fontSize: 8,
    fontWeight: "900",
    color: "#a8a29e",
    letterSpacing: 1,
    marginBottom: 6,
  },
  statChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingBottom: 2,
    marginBottom: 8,
  },
  dayCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: CREW_HUB_CARD_RIM,
  },
  dayHeadText: { fontSize: 12, fontWeight: "900", color: "#0c0a09", marginBottom: 2 },
  daySubRpt: { fontSize: 10, fontWeight: "700", color: "#334155", marginBottom: 6 },
  legBlock: { marginBottom: 8 },
  legTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  dhPill: {
    backgroundColor: "#fef9c3",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(161, 98, 7, 0.35)",
  },
  dhPillTxt: { fontSize: 8, fontWeight: "900", color: "#a16207" },
  dhSpacer: { width: 28 },
  legFlight: { flex: 1, fontSize: 12, fontWeight: "900", color: SCHEDULE_MOCK_HEADER_RED },
  legEqDim: { fontSize: 10, fontWeight: "700", color: "#78716c" },
  legRoute: { marginTop: 1, fontSize: 11, fontWeight: "700", color: "#292524" },
  legGrid: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legCell: { fontSize: 10, fontWeight: "700", color: "#0c0a09", minWidth: 44 },
  legArrowSmall: { fontSize: 10, color: "#cbd5e1" },
  legBlk: { marginLeft: "auto", fontSize: 10, fontWeight: "800", color: "#64748b" },
  layBand: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#fffbeb",
    borderRadius: 10,
    padding: 8,
    marginTop: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(180, 83, 9, 0.2)",
  },
  bed: { fontSize: 13 },
  layInner: { flex: 1, minWidth: 0 },
  layTitle: { fontSize: 10, fontWeight: "900", color: "#78350f", letterSpacing: 0.15 },
  layMeta: { marginTop: 2, fontSize: 10, fontWeight: "600", color: "#451a03", lineHeight: 14 },
  hotelTitle: { marginTop: 4, fontSize: 10, fontWeight: "700", color: "#1c1917", lineHeight: 14 },
  hotelPhone: { marginTop: 2, fontSize: 9, fontWeight: "600", color: "#57534e" },
  crewCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: CREW_HUB_CARD_RIM,
    gap: 6,
  },
  crewEmpty: { fontSize: 11, color: "#a8a29e", fontStyle: "italic" },
  crewRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  crewPos: { fontSize: 9, fontWeight: "900", color: SCHEDULE_MOCK_HEADER_RED, minWidth: 26 },
  crewMid: { flex: 1, minWidth: 0 },
  crewName: { fontSize: 11, fontWeight: "700", color: "#0c0a09" },
  crewId: { fontSize: 9, fontWeight: "600", color: "#78716c", marginTop: 1 },
  crewStatus: { fontSize: 9, fontWeight: "700", color: "#57534e", maxWidth: 72 },
});
