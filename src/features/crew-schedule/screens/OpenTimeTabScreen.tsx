import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useRouter, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  FLICA_NATIVE_URLS,
  nativeFetchOpenTimePot,
} from "../../flica-actions/flicaActionsNativeService";
import MonthlyStatsStrip from "../components/MonthlyStatsStrip";
import { useCrewScheduleHeaderBridge } from "../crewScheduleHeaderBridge";
import { mapRowsToOpenTimeTrips } from "../flicaCrewHubMappers";
import type { OpenTimeTrip } from "../flicaCrewHubTypes";
import { useCrewScheduleMonthStrip } from "../hooks/useCrewScheduleMonthStrip";
import { SCHEDULE_MOCK_HEADER_RED } from "../scheduleMockPalette";
import type { CrewScheduleTrip } from "../types";

function pushFlicaWeb(router: ReturnType<typeof useRouter>, uri: string) {
  router.push({
    pathname: "/crew-schedule/flica-web",
    params: { uri: encodeURIComponent(uri) },
  } as unknown as Href);
}

function formatCreditHours(h?: number | null): string {
  if (h == null || !Number.isFinite(h)) return "";
  const n = Math.max(0, h);
  const hh = Math.floor(n);
  const mm = Math.round((n - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function tripReportHint(t: CrewScheduleTrip): string {
  const leg = t.legs[0];
  return String(leg?.reportLocal ?? "").trim();
}

function parseWorthNumber(w: string): number {
  const m = w.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)/);
  if (!m) return NaN;
  return Number(m[1]);
}

export default function OpenTimeTabScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { setCrewScheduleHeaderSubtitle } = useCrewScheduleHeaderBridge();
  const { stripValues, monthTrips, refreshFlicaMonthRow } = useCrewScheduleMonthStrip();

  const [chip, setChip] = useState("All");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [potTrips, setPotTrips] = useState<OpenTimeTrip[]>([]);
  const [detail, setDetail] = useState<OpenTimeTrip | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await nativeFetchOpenTimePot();
      const rows = r.nativeParse?.rows ?? [];
      setPotTrips(mapRowsToOpenTimeTrips(rows, r.url));
      if (!r.ok && r.error) setError(r.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPotTrips([]);
    } finally {
      setLoading(false);
      void refreshFlicaMonthRow();
    }
  }, [refreshFlicaMonthRow]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => setCrewScheduleHeaderSubtitle(null);
    }, [load, setCrewScheduleHeaderSubtitle]),
  );

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const weekdayShort = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "short",
      }),
    [],
  );
  const dateShort = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    [],
  );

  const tripToday = useMemo(() => {
    return (
      monthTrips.find((t) => todayIso >= t.startDate && todayIso <= t.endDate) ?? null
    );
  }, [monthTrips, todayIso]);

  const headerSubtitle = useMemo(() => {
    return `${dateShort} · ${potTrips.length} available · ${weekdayShort}`;
  }, [dateShort, potTrips.length, weekdayShort]);

  useEffect(() => {
    if (!isFocused) return;
    setCrewScheduleHeaderSubtitle(headerSubtitle);
  }, [isFocused, headerSubtitle, setCrewScheduleHeaderSubtitle]);

  const filteredPot = useMemo(() => {
    let list = [...potTrips];
    if (chip === "Turns") list = list.filter((t) => t.days === 1);
    if (chip === "2 Days") list = list.filter((t) => t.days === 2);
    if (chip === "3 Days") list = list.filter((t) => t.days === 3);
    if (chip === "Red-eye") {
      list = list.filter((t) => {
        const r = t.reportTime;
        const m = r.match(/^(\d{1,2}):(\d{2})/);
        if (!m) return false;
        const hh = Number(m[1]);
        return hh < 6 || hh >= 22;
      });
    }
    if (chip === "≥$1k") {
      list = list.filter((t) => {
        const n = parseWorthNumber(t.worth);
        return Number.isFinite(n) && n >= 1000;
      });
    }
    return list;
  }, [potTrips, chip]);

  const turnsToday = useMemo(
    () => filteredPot.filter((t) => t.days === 1),
    [filteredPot],
  );
  const multiDay = useMemo(
    () => filteredPot.filter((t) => t.days != null && t.days >= 2),
    [filteredPot],
  );

  const featuredTurn = useMemo(() => {
    if (turnsToday.length !== 1) return null;
    return turnsToday[0] ?? null;
  }, [turnsToday]);

  const bestMultiRate = useMemo(() => {
    let best: OpenTimeTrip | null = null;
    let bestRate = -1;
    for (const t of multiDay) {
      const w = parseWorthNumber(t.worth);
      const cr = t.credit || t.block;
      const hm = cr.match(/(\d{1,2}):(\d{2})/);
      let hrs = NaN;
      if (hm) hrs = Number(hm[1]) + Number(hm[2]) / 60;
      if (Number.isFinite(w) && Number.isFinite(hrs) && hrs > 0) {
        const r = w / hrs;
        if (r > bestRate) {
          bestRate = r;
          best = t;
        }
      }
    }
    return best;
  }, [multiDay]);

  const chips = ["All", "Turns", "2 Days", "3 Days", "Red-eye", "≥$1k"];

  const onAdd = (t: OpenTimeTrip) => {
    Alert.alert(
      "Add open time trip?",
      `You will complete this in FLICA. Pairing ${t.pairingId}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => pushFlicaWeb(router, FLICA_NATIVE_URLS.otAddPreview),
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <MonthlyStatsStrip values={stripValues} />
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} />
        }
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {chips.map((c) => (
            <Pressable
              key={c}
              onPress={() => setChip(c)}
              style={[styles.chip, chip === c && styles.chipOn]}
            >
              <Text style={[styles.chipText, chip === c && styles.chipTextOn]} numberOfLines={1}>
                {c}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {tripToday ? (
          <View style={styles.yourTripCard}>
            <Text style={styles.yourTripLabel}>YOUR TRIP TODAY</Text>
            <View style={styles.yourTripRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.yourTripMain} numberOfLines={2}>
                  {tripToday.pairingCode} · {tripToday.routeSummary} ·{" "}
                  {tripReportHint(tripToday) || "—"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.yourTripMeta}>WORTH —</Text>
                <Text style={styles.yourTripMeta}>
                  CR {formatCreditHours(tripToday.pairingCreditHours ?? null) || "—"}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {featuredTurn ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>
                {weekdayShort} {dateShort} · Turns (1-Day)
              </Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>1</Text>
              </View>
            </View>
            <View style={styles.featureCard}>
              <View style={styles.featureBanner}>
                <Text style={styles.featureBannerText}>⭐ ONLY TURN TODAY · BEST $/HR</Text>
              </View>
              <View style={styles.featureTop}>
                <Text style={styles.pairingId}>{featuredTurn.pairingId}</Text>
                <View style={{ flex: 1 }} />
                <Text style={styles.bigMoney}>{featuredTurn.worth || "—"}</Text>
              </View>
              <Text style={styles.bigRoute} numberOfLines={2}>
                {featuredTurn.routeSummary}
              </Text>
              <Text style={styles.featureMeta}>
                {featuredTurn.date || dateShort} · Rpt {featuredTurn.reportTime || "—"} · D-End{" "}
                {featuredTurn.arriveTime || "—"}
              </Text>
              <View style={styles.statGrid}>
                <View style={styles.statCell}>
                  <Text style={styles.statLab}>BLOCK</Text>
                  <Text style={styles.statVal}>{featuredTurn.block || "—"}</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statLab}>CREDIT</Text>
                  <Text style={styles.statVal}>{featuredTurn.credit || "—"}</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statLab}>LAYOVER</Text>
                  <Text style={[styles.statVal, styles.statGreen]}>
                    {featuredTurn.layover || "—"}
                  </Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statLab}>D-END</Text>
                  <Text style={styles.statVal}>{featuredTurn.arriveTime || "—"}</Text>
                </View>
              </View>
              <View style={styles.featureFoot}>
                <Text style={styles.legalText}>✓ Legal · rest available · fits schedule</Text>
                <Pressable style={styles.addBtn} onPress={() => onAdd(featuredTurn)}>
                  <Text style={styles.addBtnText}>Add</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>
              {weekdayShort} {dateShort} · 2–3 Day Trips
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{multiDay.length}</Text>
            </View>
          </View>
          <View style={styles.tableHead}>
            <Text style={[styles.th, { flex: 0.85 }]}>PAIRING</Text>
            <Text style={[styles.th, { flex: 1.2 }]}>ROUTE</Text>
            <Text style={[styles.th, { flex: 0.55 }]}>BLOCK</Text>
            <Text style={[styles.th, { flex: 0.5 }]}>CR</Text>
            <Text style={[styles.th, { flex: 0.65 }]}>WORTH</Text>
          </View>
          {loading && multiDay.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 16 }} color={SCHEDULE_MOCK_HEADER_RED} />
          ) : null}
          {multiDay.map((t, idx) => {
            const isBest = bestMultiRate?.pairingId === t.pairingId;
            return (
              <Pressable
                key={`${t.pairingId}-${idx}`}
                style={styles.row}
                onPress={() => setDetail(t)}
              >
                <View style={{ flex: 0.85, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={styles.rowPairing}>{t.pairingId}</Text>
                    {isBest ? (
                      <View style={styles.bestTag}>
                        <Text style={styles.bestTagText}>BEST</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    ● {t.days ?? "?"}D · {t.layover || "—"}
                  </Text>
                </View>
                <View style={{ flex: 1.2, minWidth: 0 }}>
                  <Text style={styles.rowRoute} numberOfLines={2}>
                    {t.routeSummary}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    Rpt {t.reportTime || "—"} · {t.date || "—"}
                  </Text>
                </View>
                <Text style={[styles.rowCell, { flex: 0.55 }]}>{t.block || "—"}</Text>
                <Text style={[styles.rowCell, { flex: 0.5 }]}>{t.credit || "—"}</Text>
                <View style={{ flex: 0.65, minWidth: 0 }}>
                  <Text style={styles.rowMoney} numberOfLines={1}>
                    {t.worth || "—"}
                  </Text>
                  <Text style={styles.rowPer} numberOfLines={1}>
                    {t.dollarPerCreditHour || ""}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={{ height: 28 }} />
      </ScrollView>

      <Modal visible={detail != null} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setDetail(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Open time detail</Text>
            {detail ? (
              <ScrollView style={{ maxHeight: 360 }}>
                <Text style={styles.modalBody}>{detail.rawCells.join("\n")}</Text>
              </ScrollView>
            ) : null}
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <Pressable style={styles.modalClose} onPress={() => setDetail(null)}>
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
              {detail ? (
                <Pressable
                  style={[styles.modalClose, { backgroundColor: "#2563eb" }]}
                  onPress={() => {
                    setDetail(null);
                    onAdd(detail);
                  }}
                >
                  <Text style={styles.modalCloseText}>Add</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },
  scroll: { flex: 1 },
  chipScroll: { maxHeight: 34, paddingLeft: 10, marginTop: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    marginRight: 6,
  },
  chipOn: { backgroundColor: SCHEDULE_MOCK_HEADER_RED, borderColor: SCHEDULE_MOCK_HEADER_RED },
  chipText: { fontSize: 10, fontWeight: "600", color: "#4b5563" },
  chipTextOn: { color: "#fff" },
  errorText: { color: "#b91c1c", fontSize: 11, marginHorizontal: 12, marginTop: 8 },
  yourTripCard: {
    marginHorizontal: 10,
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: "#7f1d1d",
    padding: 10,
  },
  yourTripLabel: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  yourTripRow: { flexDirection: "row", alignItems: "center" },
  yourTripMain: { color: "#fff", fontSize: 12, fontWeight: "800" },
  yourTripMeta: { color: "#fff", fontSize: 10, fontWeight: "600" },
  section: { marginTop: 12, paddingHorizontal: 10 },
  sectionHead: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  sectionTitle: { flex: 1, fontSize: 12, fontWeight: "800", color: "#111" },
  badge: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  featureCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  featureBanner: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  featureBannerText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  featureTop: { flexDirection: "row", alignItems: "center" },
  pairingId: { fontSize: 12, fontWeight: "900", color: SCHEDULE_MOCK_HEADER_RED },
  bigMoney: { fontSize: 18, fontWeight: "900", color: "#16a34a" },
  bigRoute: { fontSize: 15, fontWeight: "800", color: "#111", marginTop: 4 },
  featureMeta: { fontSize: 10, color: "#6b7280", marginTop: 4 },
  statGrid: { flexDirection: "row", marginTop: 10, gap: 4 },
  statCell: { flex: 1, alignItems: "center" },
  statLab: { fontSize: 8, color: "#9ca3af", fontWeight: "700" },
  statVal: { fontSize: 10, fontWeight: "800", color: "#111", marginTop: 2 },
  statGreen: { color: "#16a34a" },
  featureFoot: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderRadius: 8,
    padding: 8,
    gap: 8,
  },
  legalText: { flex: 1, fontSize: 9, color: "#15803d", fontWeight: "600" },
  addBtn: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  addBtnText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#e5e7eb",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginBottom: 4,
    gap: 2,
  },
  th: { fontSize: 7, fontWeight: "800", color: "#6b7280" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
    gap: 4,
  },
  rowPairing: { fontSize: 11, fontWeight: "900", color: SCHEDULE_MOCK_HEADER_RED },
  bestTag: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  bestTagText: { color: "#fff", fontSize: 7, fontWeight: "900" },
  rowSub: { fontSize: 9, color: "#6b7280", marginTop: 2 },
  rowRoute: { fontSize: 10, fontWeight: "700", color: "#111" },
  rowCell: { fontSize: 10, color: "#374151", fontWeight: "600" },
  rowMoney: { fontSize: 11, fontWeight: "900", color: "#16a34a" },
  rowPer: { fontSize: 8, color: "#6b7280", marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 14, padding: 16 },
  modalTitle: { fontSize: 15, fontWeight: "800", marginBottom: 8 },
  modalBody: { fontSize: 11, color: "#374151", fontFamily: "Menlo" },
  modalClose: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  modalCloseText: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
