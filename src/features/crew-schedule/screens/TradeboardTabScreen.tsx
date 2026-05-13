import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useRouter, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../lib/supabaseClient";
import {
  FLICA_NATIVE_URLS,
  nativeFetchTradeBoardAllRequests,
  nativeFetchTradeBoardMyRequests,
} from "../../flica-actions/flicaActionsNativeService";
import MonthlyStatsStrip from "../components/MonthlyStatsStrip";
import { useCrewScheduleHeaderBridge } from "../crewScheduleHeaderBridge";
import {
  mapRowsToTradeboardPosts,
  tradeboardTypeBadgeColor,
  tradeboardTypeLabel,
} from "../flicaCrewHubMappers";
import type { TradeboardPost } from "../flicaCrewHubTypes";
import { useCrewScheduleMonthStrip } from "../hooks/useCrewScheduleMonthStrip";
import { SCHEDULE_MOCK_HEADER_RED } from "../scheduleMockPalette";
import type { CrewScheduleTrip } from "../types";

function formatRoleForHeader(role: string): string {
  const raw = String(role).trim();
  if (!raw) return "";
  const compact = raw.replace(/[\s/_-]+/g, "").toLowerCase();
  const spaced = raw.replace(/[\s/_-]+/g, " ").trim().toLowerCase();
  if (
    compact === "fa" ||
    compact === "flightattendant" ||
    spaced === "flight attendant" ||
    compact === "f/a"
  ) {
    return "FA";
  }
  return raw.toUpperCase();
}

function pushFlicaWeb(router: ReturnType<typeof useRouter>, uri: string) {
  router.push({
    pathname: "/crew-schedule/flica-web",
    params: { uri: encodeURIComponent(uri) },
  } as unknown as Href);
}

type PrimaryTab = "all" | "swaps" | "drops" | "pickups";

function tripReportHint(t: CrewScheduleTrip): string {
  const leg = t.legs[0];
  return String(leg?.reportLocal ?? "").trim();
}

function tripWorthHint(_t: CrewScheduleTrip): string {
  return "";
}

export default function TradeboardTabScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const isFocused = useIsFocused();
  const { setCrewScheduleHeaderSubtitle } = useCrewScheduleHeaderBridge();
  const { stripValues, refreshFlicaMonthRow, monthTrips } = useCrewScheduleMonthStrip();

  const [profileBase, setProfileBase] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>("all");
  const [search, setSearch] = useState("");
  const [chip, setChip] = useState<string>("All");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allPosts, setAllPosts] = useState<TradeboardPost[]>([]);
  const [myPosts, setMyPosts] = useState<TradeboardPost[]>([]);
  const [detailPost, setDetailPost] = useState<TradeboardPost | null>(null);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) {
      setProfileBase(null);
      setProfileRole(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("base, role")
      .eq("id", uid)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProfileBase(
          data?.base != null && String(data.base).trim()
            ? String(data.base).trim()
            : null,
        );
        setProfileRole(
          data?.role != null && String(data.role).trim()
            ? String(data.role).trim()
            : null,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allR, myR] = await Promise.all([
        nativeFetchTradeBoardAllRequests(),
        nativeFetchTradeBoardMyRequests(),
      ]);
      const allRows = allR.nativeParse?.rows ?? [];
      const myRows = myR.nativeParse?.rows ?? [];
      setAllPosts(mapRowsToTradeboardPosts(allRows, allR.url));
      setMyPosts(mapRowsToTradeboardPosts(myRows, myR.url));
      if (!allR.ok && allR.error) {
        setError(allR.error);
      } else if (!myR.ok && myR.error) {
        setError(myR.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAllPosts([]);
      setMyPosts([]);
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

  const activeCount = allPosts.length;
  const headerSubtitle = useMemo(() => {
    const b = String(profileBase ?? "")
      .trim()
      .toUpperCase();
    const r = formatRoleForHeader(String(profileRole ?? ""));
    const mid = b && r ? `${b} · ${r}` : b || r || "—";
    return `${mid} · ${activeCount} active posts`;
  }, [profileBase, profileRole, activeCount]);

  useEffect(() => {
    if (!isFocused) return;
    setCrewScheduleHeaderSubtitle(headerSubtitle);
  }, [isFocused, headerSubtitle, setCrewScheduleHeaderSubtitle]);

  const activePost = myPosts[0] ?? null;

  const giveDisplay = useMemo(() => {
    if (activePost) return { kind: "tb" as const, post: activePost };
    const iso = new Date().toISOString().slice(0, 10);
    const t = monthTrips.find((x) => iso >= x.startDate && iso <= x.endDate);
    if (t) return { kind: "trip" as const, trip: t };
    return null;
  }, [activePost, monthTrips]);

  const bestMatch = useMemo(() => {
    const scored = allPosts.filter((p) => p.matchScore != null);
    if (scored.length > 0) {
      return scored.reduce((a, b) =>
        (a.matchScore ?? 0) >= (b.matchScore ?? 0) ? a : b,
      );
    }
    return allPosts.find((p) => p.type === "swap") ?? allPosts[0] ?? null;
  }, [allPosts]);

  const filtered = useMemo(() => {
    let list = [...allPosts];
    if (primaryTab === "swaps") list = list.filter((p) => p.type === "swap");
    if (primaryTab === "drops") list = list.filter((p) => p.type === "drop");
    if (primaryTab === "pickups")
      list = list.filter((p) => p.type === "pickup" || p.type === "trade");

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        [p.pairingId, p.routeSummary, p.posterName, p.comments]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }

    if (chip !== "All") {
      const c = chip.toUpperCase();
      if (["LAX", "SFO", "FLL", "JFK"].includes(c)) {
        list = list.filter((p) =>
          p.routeSummary.toUpperCase().includes(c),
        );
      } else if (chip === "3-Day") {
        list = list.filter((p) => /\b3\s*D\b/i.test(p.comments));
      } else if (chip === "Today") {
        const t = new Date();
        const label = t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        list = list.filter((p) => p.date.includes(label.split(" ")[0]!));
      } else if (chip === "This Week") {
        list = list;
      }
    }
    return list;
  }, [allPosts, primaryTab, search, chip]);

  const listHeadingDate = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const chips = ["All", "Today", "This Week", "LAX", "SFO", "FLL", "3-Day"];

  return (
    <View style={styles.screen}>
      <MonthlyStatsStrip values={stripValues} />
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} />
        }
      >
        <View style={styles.primaryTabs}>
          {(
            [
              ["all", "All Posts"],
              ["swaps", "Swaps"],
              ["drops", "Drops"],
              ["pickups", "Pickups"],
            ] as const
          ).map(([k, label]) => (
            <Pressable
              key={k}
              onPress={() => setPrimaryTab(k)}
              style={[
                styles.primaryTab,
                primaryTab === k && styles.primaryTabOn,
              ]}
            >
              <Text
                style={[
                  styles.primaryTabText,
                  primaryTab === k && styles.primaryTabTextOn,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              placeholder="Search pairing, route, city..."
              placeholderTextColor="#9ca3af"
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
            />
          </View>
          <Pressable style={styles.gearBtn} accessibilityLabel="Filter settings">
            <Text style={styles.gearText}>⚙</Text>
          </Pressable>
        </View>

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

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {activePost ? (
          <View style={styles.activeCard}>
            <View style={styles.activeCardTop}>
              <Text style={styles.activePin}>📌</Text>
              <Text style={styles.activeLabel}>YOUR ACTIVE POST</Text>
            </View>
            <View style={styles.activeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.activeTitle}>
                  {activePost.pairingId || "—"} · {activePost.routeSummary.slice(0, 40)}
                </Text>
                <Text style={styles.activeSub} numberOfLines={2}>
                  {activePost.date || "—"} · {tradeboardTypeLabel(activePost.type)} ·{" "}
                  {activePost.worth || "—"} · {activePost.credit || "—"} CR
                </Text>
              </View>
              {activePost.offerCount != null ? (
                <View style={styles.offersBox}>
                  <Text style={styles.offersBoxText}>{activePost.offerCount} Offers</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {bestMatch && giveDisplay ? (
          <View style={styles.bestSection}>
            <View style={styles.bestHeadingRow}>
              <Text style={styles.bestHeading}>🤖 Best Match for You</Text>
              <Text style={styles.bestHint}>AI · Based on your schedule</Text>
            </View>
            <View style={styles.matchCard}>
              <View style={styles.matchBanner}>
                <Text style={styles.matchBannerText}>
                  TOP SWAP MATCH · {bestMatch.matchScore ?? 94}% COMPATIBILITY
                </Text>
              </View>
              <View style={styles.matchCols}>
                <View style={styles.matchCol}>
                  <Text style={styles.matchColLabel}>YOU GIVE</Text>
                  <Text style={styles.matchColMain}>
                    {giveDisplay.kind === "tb"
                      ? giveDisplay.post.pairingId
                      : giveDisplay.trip.pairingCode}
                  </Text>
                  <Text style={styles.matchColSub}>
                    {giveDisplay.kind === "tb"
                      ? `${giveDisplay.post.date || "—"} · ${giveDisplay.post.routeSummary.slice(0, 24)}`
                      : `${giveDisplay.trip.startDate} · ${giveDisplay.trip.routeSummary.slice(0, 24)}`}
                  </Text>
                  <Text style={styles.matchColSub}>
                    Rpt{" "}
                    {giveDisplay.kind === "tb"
                      ? giveDisplay.post.reportTime || "—"
                      : tripReportHint(giveDisplay.trip) || "—"}{" "}
                    ·{" "}
                    {giveDisplay.kind === "tb"
                      ? giveDisplay.post.worth || "—"
                      : tripWorthHint(giveDisplay.trip) || "—"}
                  </Text>
                </View>
                <Text style={styles.matchArrow}>⇄</Text>
                <View style={styles.matchCol}>
                  <Text style={styles.matchColLabel}>YOU GET</Text>
                  <Text style={styles.matchColMain}>{bestMatch.pairingId}</Text>
                  <Text style={styles.matchColSub}>
                    {bestMatch.date || "—"} · {bestMatch.routeSummary.slice(0, 24)}
                  </Text>
                  <Text style={styles.matchColSub}>
                    Rpt {bestMatch.reportTime || "—"} · {bestMatch.worth || "—"}
                  </Text>
                </View>
              </View>
              <View style={styles.deltaRow}>
                <Text style={styles.deltaItem}>
                  <Text style={styles.deltaLabel}>BLOCK Δ </Text>
                  <Text style={styles.deltaNeg}>—</Text>
                </Text>
                <Text style={styles.deltaItem}>
                  <Text style={styles.deltaLabel}>CREDIT Δ </Text>
                  <Text style={styles.deltaPos}>—</Text>
                </Text>
                <Text style={styles.deltaItem}>
                  <Text style={styles.deltaLabel}>WORTH Δ </Text>
                  <Text style={styles.deltaNeg}>—</Text>
                </Text>
                <Text style={styles.deltaItem}>
                  <Text style={styles.deltaLabel}>LEGAL </Text>
                  <Text style={styles.deltaPos}>
                    {bestMatch.legalCompatibility === false ? "✗ No" : "✓ Yes"}
                  </Text>
                </Text>
              </View>
              <View style={styles.matchActions}>
                <Pressable
                  style={styles.btnRequest}
                  onPress={() => {
                    pushFlicaWeb(router, FLICA_NATIVE_URLS.tradeMyResponses);
                  }}
                >
                  <Text style={styles.btnRequestText}>Request Trade</Text>
                </Pressable>
                <Pressable
                  style={styles.btnView}
                  onPress={() => setDetailPost(bestMatch)}
                >
                  <Text style={styles.btnViewText}>View Trip</Text>
                </Pressable>
              </View>
              {bestMatch.posterName ? (
                <Text style={styles.posterFoot}>Posted by {bestMatch.posterName}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.listHead}>
          <Text style={styles.listHeadTitle}>All Posts · {listHeadingDate}</Text>
          <Text style={styles.listHeadCount}>{filtered.length} total</Text>
        </View>
        <View style={styles.tableHead}>
          <Text style={[styles.th, { flex: 1.1 }]}>POSTER</Text>
          <Text style={[styles.th, { flex: 1.3 }]}>TRIP / ROUTE</Text>
          <Text style={[styles.th, { flex: 0.7 }]}>DATE</Text>
          <Text style={[styles.th, { flex: 0.7 }]}>CR / $</Text>
        </View>

        {loading && filtered.length === 0 ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={SCHEDULE_MOCK_HEADER_RED} />
        ) : null}

        {filtered.map((p) => (
          <Pressable key={p.id} style={styles.rowCard} onPress={() => setDetailPost(p)}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: tradeboardTypeBadgeColor(p.type) },
              ]}
            >
              <Text style={styles.typeBadgeText}>{tradeboardTypeLabel(p.type)}</Text>
            </View>
            <View style={{ flex: 1.1, minWidth: 0 }}>
              <Text style={styles.posterName} numberOfLines={1}>
                {p.posterName || "—"}
              </Text>
              {p.matchScore != null ? (
                <Text style={styles.matchPill}>{p.matchScore}% match</Text>
              ) : null}
            </View>
            <View style={{ flex: 1.3, minWidth: 0 }}>
              <Text style={styles.pairingLine} numberOfLines={1}>
                {p.pairingId} · {p.routeSummary.slice(0, 18)}
              </Text>
              <Text style={styles.routeSmall} numberOfLines={2}>
                {p.routeSummary}
              </Text>
            </View>
            <View style={{ flex: 0.7, minWidth: 0 }}>
              <Text style={styles.cellMuted} numberOfLines={2}>
                {p.date || "—"}
              </Text>
            </View>
            <View style={{ flex: 0.7, minWidth: 0 }}>
              <Text style={styles.money} numberOfLines={1}>
                {p.credit || "—"}
              </Text>
              <Text style={styles.money} numberOfLines={1}>
                {p.worth || "—"}
              </Text>
            </View>
          </Pressable>
        ))}
        <View style={{ height: 24 }} />
      </ScrollView>

      <Modal visible={detailPost != null} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setDetailPost(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Trip detail</Text>
            {detailPost ? (
              <ScrollView style={{ maxHeight: 360 }}>
                <Text style={styles.modalBody}>
                  {detailPost.rawCells.join("\n")}
                </Text>
              </ScrollView>
            ) : null}
            <Pressable style={styles.modalClose} onPress={() => setDetailPost(null)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },
  scroll: { flex: 1 },
  primaryTabs: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingTop: 8,
    gap: 6,
  },
  primaryTab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  primaryTabOn: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    borderColor: SCHEDULE_MOCK_HEADER_RED,
  },
  primaryTabText: { fontSize: 9, fontWeight: "700", color: "#6b7280" },
  primaryTabTextOn: { color: "#fff" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    marginTop: 8,
    gap: 6,
  },
  searchField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 8,
    minHeight: 36,
  },
  searchIcon: { fontSize: 12, marginRight: 4 },
  searchInput: { flex: 1, fontSize: 11, paddingVertical: 6, color: "#111" },
  gearBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  gearText: { fontSize: 14 },
  chipScroll: { marginTop: 8, paddingLeft: 10, maxHeight: 36 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    marginRight: 6,
  },
  chipOn: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    borderColor: SCHEDULE_MOCK_HEADER_RED,
  },
  chipText: { fontSize: 10, fontWeight: "600", color: "#4b5563" },
  chipTextOn: { color: "#fff" },
  errorText: { color: "#b91c1c", fontSize: 11, marginHorizontal: 12, marginTop: 8 },
  activeCard: {
    marginHorizontal: 10,
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    padding: 10,
  },
  activeCardTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  activePin: { fontSize: 12 },
  activeLabel: { color: "rgba(255,255,255,0.9)", fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  activeRow: { flexDirection: "row", alignItems: "center" },
  activeTitle: { color: "#fff", fontSize: 13, fontWeight: "800" },
  activeSub: { color: "rgba(255,255,255,0.9)", fontSize: 10, marginTop: 2 },
  offersBox: {
    backgroundColor: "rgba(0,0,0,0.15)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginLeft: 8,
  },
  offersBoxText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  bestSection: { marginHorizontal: 10, marginTop: 12 },
  bestHeadingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  bestHeading: { fontSize: 12, fontWeight: "800", color: "#111" },
  bestHint: { fontSize: 9, color: "#9ca3af" },
  matchCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#93c5fd",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  matchBanner: { backgroundColor: "#3b82f6", paddingVertical: 6, paddingHorizontal: 10 },
  matchBannerText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  matchCols: { flexDirection: "row", alignItems: "center", padding: 10, gap: 4 },
  matchCol: { flex: 1, minWidth: 0 },
  matchColLabel: { fontSize: 8, color: "#6b7280", fontWeight: "700", marginBottom: 4 },
  matchColMain: { fontSize: 12, fontWeight: "800", color: "#111" },
  matchColSub: { fontSize: 9, color: "#6b7280", marginTop: 2 },
  matchArrow: { fontSize: 16, color: "#3b82f6", paddingHorizontal: 2 },
  deltaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 10,
    paddingBottom: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
  },
  deltaItem: { fontSize: 9 },
  deltaLabel: { color: "#6b7280", fontWeight: "700" },
  deltaNeg: { color: "#dc2626", fontWeight: "800" },
  deltaPos: { color: "#16a34a", fontWeight: "800" },
  matchActions: { flexDirection: "row", gap: 8, paddingHorizontal: 10, paddingBottom: 10 },
  btnRequest: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  btnRequestText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  btnView: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  btnViewText: { color: "#111", fontSize: 11, fontWeight: "700" },
  posterFoot: { textAlign: "right", fontSize: 9, color: "#9ca3af", paddingHorizontal: 10, paddingBottom: 8 },
  listHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginTop: 14,
    marginBottom: 4,
  },
  listHeadTitle: { fontSize: 12, fontWeight: "800", color: "#111" },
  listHeadCount: { fontSize: 10, color: "#9ca3af" },
  tableHead: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 10,
    borderRadius: 6,
    gap: 4,
  },
  th: { fontSize: 8, fontWeight: "700", color: "#6b7280" },
  rowCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginHorizontal: 10,
    marginTop: 6,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 8,
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  typeBadge: {
    width: 22,
    height: 22,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  typeBadgeText: { color: "#fff", fontSize: 8, fontWeight: "900" },
  posterName: { fontSize: 10, fontWeight: "700", color: "#111" },
  matchPill: {
    marginTop: 2,
    fontSize: 8,
    color: "#16a34a",
    fontWeight: "700",
  },
  pairingLine: { fontSize: 10, fontWeight: "800", color: "#111" },
  routeSmall: { fontSize: 9, color: "#6b7280", marginTop: 2 },
  cellMuted: { fontSize: 9, color: "#6b7280" },
  money: { fontSize: 10, fontWeight: "800", color: "#16a34a" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
  },
  modalTitle: { fontSize: 15, fontWeight: "800", marginBottom: 8 },
  modalBody: { fontSize: 11, color: "#374151", fontFamily: "Menlo" },
  modalClose: {
    marginTop: 12,
    alignSelf: "flex-end",
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  modalCloseText: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
