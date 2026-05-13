import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useRouter, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useAuth } from "../../../hooks/useAuth";
import {
  crewHubNativeFetchNeedsVerificationSheet,
  logCrewHubAuth,
} from "../crewHubFlicaAuthGate";
import { flicaFetchNeedsWebVerification } from "../../flica-actions/flicaActionsHttp";
import {
  FLICA_NATIVE_URLS,
  nativeFetchOpenTimeMyRequests,
  nativeFetchOpenTimePot,
} from "../../flica-actions/flicaActionsNativeService";
import { CrewHubRefreshToast } from "../components/CrewHubRefreshToast";
import { FlicaCrewHubScheduleSessionRunner } from "../components/FlicaCrewHubScheduleSessionRunner";
import MonthlyStatsStrip from "../components/MonthlyStatsStrip";
import { loadOpenTimeHubCache, upsertOpenTimeHubCache } from "../crewHubFlicaCache";
import { useCrewScheduleHeaderBridge } from "../crewScheduleHeaderBridge";
import { mapOpenTimeTripsWithHtmlFallback, openTimePageSaysNoPot } from "../flicaCrewHubHtmlFallbackParse";
import {
  buildCrewHubParseDebugFetchEntry,
  commitOpenTimeParseDebugSnapshot,
  type FlicaCrewHubParseDebugPayload,
} from "../flicaCrewHubParseDebug";
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
  const { session } = useAuth();
  const isFocused = useIsFocused();
  const { setCrewScheduleHeaderSubtitle } = useCrewScheduleHeaderBridge();
  const { stripValues, monthTrips, refreshFlicaMonthRow } = useCrewScheduleMonthStrip();

  const [chip, setChip] = useState("All");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [potTrips, setPotTrips] = useState<OpenTimeTrip[]>([]);
  const [detail, setDetail] = useState<OpenTimeTrip | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pullSessionRunnerActive, setPullSessionRunnerActive] = useState(false);
  const pullSessionWaitersRef = useRef<{
    resolve: () => void;
    reject: (e: Error) => void;
  } | null>(null);
  const cacheHydratedForUser = useRef<string | null>(null);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid || cacheHydratedForUser.current === uid) return;
    cacheHydratedForUser.current = uid;
    void loadOpenTimeHubCache(uid).then((c) => {
      if (!c?.trips?.length) return;
      setPotTrips((prev) => (prev.length === 0 ? c.trips : prev));
    });
  }, [session?.user?.id]);

  const settlePullSessionSuccess = useCallback(() => {
    pullSessionWaitersRef.current?.resolve();
    pullSessionWaitersRef.current = null;
    setPullSessionRunnerActive(false);
  }, []);

  const settlePullSessionFailure = useCallback((msg: string) => {
    pullSessionWaitersRef.current?.reject(new Error(msg));
    pullSessionWaitersRef.current = null;
    setPullSessionRunnerActive(false);
  }, []);

  const load = useCallback(async (reason: "focus" | "pull" = "focus") => {
    setLoading(true);
    setError(null);
    try {
      if (reason === "pull") {
        logCrewHubAuth("schedule_import_session_flow_start", { context: "opentime" });
        await new Promise<void>((resolve, reject) => {
          pullSessionWaitersRef.current = { resolve, reject };
          setPullSessionRunnerActive(true);
        });
      }

      let potR: Awaited<ReturnType<typeof nativeFetchOpenTimePot>>;
      let myReqR: Awaited<ReturnType<typeof nativeFetchOpenTimeMyRequests>> | undefined;

      if (__DEV__) {
        [potR, myReqR] = await Promise.all([
          nativeFetchOpenTimePot(),
          nativeFetchOpenTimeMyRequests(),
        ]);
      } else {
        potR = await nativeFetchOpenTimePot();
      }
      logCrewHubAuth("native_fetch_done", {
        context: "opentime",
        phase: "first",
        htmlLen: potR.htmlLength ?? 0,
        htmlState: potR.htmlState,
        rowCount: potR.rowCount ?? 0,
      });

      const potFb = mapOpenTimeTripsWithHtmlFallback(potR.nativeParse?.rows ?? [], potR, potR.url);
      const tripsPre = potFb.trips;

      const fetches = [buildCrewHubParseDebugFetchEntry("Open Time Pot", potR, tripsPre)];
      if (__DEV__ && myReqR) {
        const myFb = mapOpenTimeTripsWithHtmlFallback(
          myReqR.nativeParse?.rows ?? [],
          myReqR,
          myReqR.url,
        );
        const myTrips = myFb.trips;
        fetches.push(
          buildCrewHubParseDebugFetchEntry("Open Time My Requests", myReqR, myTrips),
        );
      }
      const pl: FlicaCrewHubParseDebugPayload = {
        screen: "opentime",
        refreshedAt: new Date().toISOString(),
        loadReason: reason,
        note:
          __DEV__ && myReqR
            ? "__DEV__: Open Time My Requests native fetch included (not run in production)."
            : "Production: only Open Time Pot native fetch.",
        fetches,
        openTimeFallback: potFb.meta,
      };
      commitOpenTimeParseDebugSnapshot(pl);
      if (__DEV__) {
        console.log("[FC_OPENTIME_PARSE_DEBUG]", JSON.stringify(pl));
      }

      const needVerification = crewHubNativeFetchNeedsVerificationSheet(potR);

      if (needVerification) {
        logCrewHubAuth("native_needs_verification", {
          context: "opentime",
          afterPullSession: reason === "pull",
        });
        if (reason === "focus") {
          setError("Pull down to refresh to sign in to FLICA.");
        } else {
          setError(
            potR.error ??
              "FLICA verification still required after sign-in. Try pull to refresh again.",
          );
        }
        return;
      }

      const trips = tripsPre;
      logCrewHubAuth("parse_done", { context: "opentime", mappedRows: trips.length });
      setPotTrips(trips);
      if (flicaFetchNeedsWebVerification(potR.htmlState)) {
        setError(potR.error ?? "FLICA verification still required.");
      } else if (!potR.ok && potR.error) {
        setError(potR.error);
      } else if (
        trips.length === 0 &&
        potFb.meta.markersMissing.length > 0 &&
        !openTimePageSaysNoPot(String(potR.pageHtml ?? ""))
      ) {
        setError(
          `No Open Time trips parsed from FLICA HTML. Missing markers: ${potFb.meta.markersMissing.join(
            "; ",
          )}. Found: ${potFb.meta.markersFound.join("; ") || "(none)"}.`,
        );
      } else {
        setError(null);
      }

      if (potR.ok && !flicaFetchNeedsWebVerification(potR.htmlState) && session?.user?.id) {
        void upsertOpenTimeHubCache(session.user.id, {
          v: 1,
          trips,
          refreshedAt: new Date().toISOString(),
        });
        if (reason === "pull") setToast("Open Time refreshed");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      if (!msg.toLowerCase().includes("cancelled")) {
        setPotTrips([]);
      }
    } finally {
      setLoading(false);
      void refreshFlicaMonthRow();
    }
  }, [refreshFlicaMonthRow, session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load("focus");
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

  /** All trips after chip filter — no extra day-based hiding. */
  const listedTrips = filteredPot;

  const bestDollarPerCreditHour = useMemo(() => {
    let best: OpenTimeTrip | null = null;
    let bestRate = -1;
    for (const t of listedTrips) {
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
  }, [listedTrips]);

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
      <FlicaCrewHubScheduleSessionRunner
        active={pullSessionRunnerActive}
        purposeLabel="Refreshing Open Time"
        onComplete={settlePullSessionSuccess}
        onError={settlePullSessionFailure}
      />
      <CrewHubRefreshToast
        message={toast ?? ""}
        visible={toast != null && toast.length > 0}
        onDismiss={() => setToast(null)}
      />
      <MonthlyStatsStrip values={stripValues} />
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load("pull")} />
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

        {!loading && potTrips.length === 0 ? (
          <Text style={styles.emptyText}>No Open Time trips found. Pull down to refresh.</Text>
        ) : null}

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

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>
              {weekdayShort} {dateShort} · Open Time
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{listedTrips.length}</Text>
            </View>
          </View>
          <View style={styles.potListSheet}>
            <View style={styles.tableHead}>
              <Text style={[styles.th, { flex: 0.85 }]}>PAIRING</Text>
              <Text style={[styles.th, { flex: 1.2 }]}>ROUTE</Text>
              <Text style={[styles.th, { flex: 0.55 }]}>BLOCK</Text>
              <Text style={[styles.th, { flex: 0.5 }]}>CR</Text>
              <Text style={[styles.th, { flex: 0.65 }]}>WORTH</Text>
            </View>
            {loading && listedTrips.length === 0 ? (
              <ActivityIndicator style={{ marginTop: 16 }} color={SCHEDULE_MOCK_HEADER_RED} />
            ) : null}
            {listedTrips.map((t, idx) => {
              const isBest = bestDollarPerCreditHour?.pairingId === t.pairingId;
              const isLast = idx === listedTrips.length - 1;
              return (
                <Pressable
                  key={`${t.pairingId}-${idx}`}
                  style={[styles.row, isLast && styles.rowLast]}
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
        </View>
        <View style={{ height: 28 }} />
      </ScrollView>

      <Modal visible={detail != null} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setDetail(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Open time detail</Text>
            {detail ? (
              <ScrollView style={{ maxHeight: 360 }}>
                <Text style={styles.modalKv}>
                  {detail.pairingId} · {detail.dates || detail.date || "—"}
                </Text>
                {detail.bidPos ? <Text style={styles.modalKv}>Bid pos {detail.bidPos}</Text> : null}
                <Text style={styles.modalKv}>
                  Rpt {detail.reportTime || "—"} · Dep {detail.departTime || "—"} · Arr{" "}
                  {detail.arriveTime || "—"}
                </Text>
                <Text style={styles.modalKv}>
                  Block {detail.block || "—"} · Credit {detail.credit || "—"} · Worth{" "}
                  {detail.worth || "—"}
                </Text>
                {detail.premium ? (
                  <Text style={styles.modalKv}>Premium {detail.premium}</Text>
                ) : null}
                <Text style={styles.modalKv}>Layover {detail.layover || "—"}</Text>
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
  potListSheet: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#c8ced6",
    overflow: "hidden",
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#eef0f3",
    paddingVertical: 5,
    paddingHorizontal: 8,
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(15, 23, 42, 0.18)",
  },
  th: { fontSize: 7, fontWeight: "800", color: "#6b7280" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fff",
    paddingVertical: 9,
    paddingHorizontal: 8,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(15, 23, 42, 0.14)",
  },
  rowLast: {
    borderBottomWidth: 0,
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
  modalKv: { fontSize: 12, color: "#111827", marginBottom: 4, fontWeight: "600" },
  emptyText: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  modalClose: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  modalCloseText: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
