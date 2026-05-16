import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useRouter, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useAuth } from "../../../hooks/useAuth";
import {
  crewHubNativeFetchNeedsVerificationSheet,
  logCrewHubAuth,
} from "../crewHubFlicaAuthGate";
import { flicaFetchNeedsWebVerification } from "../../flica-actions/flicaActionsHttp";
import {
  FLICA_NATIVE_URLS,
  nativeFetchOpenTimeMyRequests,
} from "../../flica-actions/flicaActionsNativeService";
import type { FlicaActionsFetchResult } from "../../flica-actions/flicaActionsTypes";
import FlicaMarketplacePairingDetailSheet from "../components/FlicaMarketplacePairingDetailSheet";
import { CrewHubSwipeActionRail, type CrewHubSwipeRailAction } from "../components/CrewHubSwipeActionRail";
import { CrewHubRefreshToast } from "../components/CrewHubRefreshToast";
import { FlicaCrewHubScheduleSessionRunner } from "../components/FlicaCrewHubScheduleSessionRunner";
import {
  hubLayoverDisplayForHubListRow,
  hubLayoverDisplayWithDots,
} from "../crewHubLayoverDisplay";
import MonthlyStatsStrip from "../components/MonthlyStatsStrip";
import { loadOpenTimeHubCache, upsertOpenTimeHubCache } from "../crewHubFlicaCache";
import {
  openTimeTripHasLiveHubActionContext,
} from "../crewHubFlicaLiveGate";
import {
  fetchAllOpenTimePotContextsMerged,
  flattenOpenTimeMonthBuckets,
  groupOpenTimeTripsIntoMonthBuckets,
  sortOpenTimeMonthBucketsChronologically,
  type OpenTimeMonthBucket,
} from "../flicaOpenTimeLiveRefresh";
import { useCrewScheduleHeaderBridge } from "../crewScheduleHeaderBridge";
import {
  mapOpenTimeTripsWithHtmlFallback,
  openTimePageSaysNoPot,
  type FlicaCrewHubFallbackParseMeta,
} from "../flicaCrewHubHtmlFallbackParse";
import {
  buildCrewHubParseDebugFetchEntry,
  commitOpenTimeParseDebugSnapshot,
  type FlicaCrewHubParseDebugPayload,
} from "../flicaCrewHubParseDebug";
import type { OpenTimeTrip } from "../flicaCrewHubTypes";
import { useCrewScheduleMonthStrip } from "../hooks/useCrewScheduleMonthStrip";
import type { FlicaMarketplacePairingDetail } from "../flicaMarketplacePairingDetailTypes";
import { fetchFlicaMarketplacePairingDetail } from "../openFlicaMarketplacePairingDetail";
import {
  CREW_HUB_CARD_RIM,
  CREW_HUB_DATE_HEADER_BG,
  SCHEDULE_MOCK_HEADER_RED,
} from "../scheduleMockPalette";
import { scheduleTheme as scheduleT } from "../scheduleTheme";
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

const META_DOT = " · ";

/** Same label as modern schedule month navigator (`ScheduleTabScreen` / `ModernScheduleChrome`). */
function openTimeBucketMonthNavLabel(sourceMonthKey: string): string {
  const [ys, ms] = sourceMonthKey.split("-").map((x) => x.trim());
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return "Open Time";
  const mon = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long" });
  return `${mon} ${y}`;
}

/** Same stack as pairing detail stats card values (`TripDetailScreen` STATS_VALUE_FONT). */
const OPEN_TIME_STATS_VALUE_FONT: TextStyle = Platform.select<TextStyle>({
  ios: { fontFamily: "Menlo" },
  android: { fontFamily: "monospace" },
  default: { fontFamily: "monospace" },
});

function creditMinutesFromDisplay(s: string): number {
  const m = String(s ?? "").trim().match(/^(\d+):(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function openTimeTripLooksLikeToday(t: OpenTimeTrip, monthShort: string, dayNum: number): boolean {
  const blob = `${t.date ?? ""} ${t.dates ?? ""} ${t.dateLabel ?? ""}`.toUpperCase();
  const ms = monthShort.toUpperCase();
  if (blob.includes(`${ms} ${dayNum}`)) return true;
  if (blob.includes(`${ms} ${dayNum},`)) return true;
  return false;
}

function tripDedupeKey(t: OpenTimeTrip): string {
  return `${t.sourceBcid ?? ""}|${t.pairingId}|${t.date ?? ""}|${t.reportTime ?? ""}`;
}

function pickFeaturedOpenTimeTrip(
  trips: OpenTimeTrip[],
  monthShort: string,
  dayNum: number,
): { trip: OpenTimeTrip | null; reason: string } {
  if (!trips.length) return { trip: null, reason: "none" };
  const todayT = trips.filter((t) => openTimeTripLooksLikeToday(t, monthShort, dayNum));
  const pool = todayT.length ? todayT : trips;
  const sorted = [...pool].sort((a, b) => {
    const wA = parseWorthNumber(a.worth);
    const wB = parseWorthNumber(b.worth);
    const hasA = Number.isFinite(wA) && wA > 0;
    const hasB = Number.isFinite(wB) && wB > 0;
    if (hasB !== hasA) return Number(hasB) - Number(hasA);
    if (hasB && hasA && wB !== wA) return wB - wA;
    const cB = creditMinutesFromDisplay(b.credit);
    const cA = creditMinutesFromDisplay(a.credit);
    if (cB !== cA) return cB - cA;
    return creditMinutesFromDisplay(b.block) - creditMinutesFromDisplay(a.block);
  });
  const best = sorted[0]!;
  const reason = todayT.some((x) => tripDedupeKey(x) === tripDedupeKey(best))
    ? "today"
    : Number.isFinite(parseWorthNumber(best.worth)) && parseWorthNumber(best.worth) > 0
      ? "worth"
      : creditMinutesFromDisplay(best.credit) > 0
        ? "credit"
        : "block";
  return { trip: best, reason };
}

function openTimeBucketKey(t: OpenTimeTrip): string {
  return (t.dateLabel?.trim() || t.date?.trim() || t.dates?.trim() || "Other") as string;
}

/** Preserve FLICA list order: first-seen date section keys, rows appended in trip order (no alphabetical resort). */
function groupOpenTimeByBucketPreserveOrder(trips: OpenTimeTrip[]): { key: string; items: OpenTimeTrip[] }[] {
  const m = new Map<string, OpenTimeTrip[]>();
  const keyOrder: string[] = [];
  for (const t of trips) {
    const k = openTimeBucketKey(t);
    if (!m.has(k)) keyOrder.push(k);
    const arr = m.get(k) ?? [];
    arr.push(t);
    m.set(k, arr);
  }
  return keyOrder.map((key) => ({ key, items: m.get(key)! }));
}

const OT_HUB_AIRPORT_RE =
  /^(JFK|LAX|BOS|FLL|MCO|MIA|ATL|SEA|SLC|DEN|ORD|DFW|PHX|LAS|SAN|PDX|BUR|PBI|STT|SJU)$/i;

function openTimeRowBidPosLooksValid(s: string): boolean {
  const x = String(s ?? "").trim().toUpperCase();
  if (!x || x.length > 6) return false;
  if (/^\d{1,2}[A-Z]{3}$/.test(x)) return false;
  if (/^J[A-Z0-9]{3,5}/.test(x)) return false;
  if (OT_HUB_AIRPORT_RE.test(x)) return false;
  if (/^\d{1,2}:\d{2}$/.test(x)) return false;
  if (/^\d{3,4}$/.test(x)) return false;
  if (/^\$/.test(x)) return false;
  if (/^[1-9]$/.test(x)) return false;
  return /^[A-Z0-9]{2,6}$/.test(x);
}

function openTimeRowBidPos(t: OpenTimeTrip): string {
  const direct = t.bidPos?.trim();
  if (direct && openTimeRowBidPosLooksValid(direct)) return direct.toUpperCase();
  const cells = t.rawCells ?? [];
  if (cells.length >= 3) {
    const c2 = cells[2]?.trim() ?? "";
    if (openTimeRowBidPosLooksValid(c2)) return c2.toUpperCase();
  }
  const line = cells.join(" ");
  const m = line.match(/\b(?:BID|POS)\s*[:\s]+([A-Z0-9]{2,6})\b/i);
  if (m?.[1] && openTimeRowBidPosLooksValid(m[1])) return m[1].toUpperCase();
  for (const c of cells) {
    const x = c.trim();
    if (openTimeRowBidPosLooksValid(x)) return x.toUpperCase();
  }
  return "";
}

function openTimeRowTripDays(t: OpenTimeTrip): number | null {
  if (t.days != null && Number.isFinite(t.days) && t.days > 0) return t.days;
  const cells = t.rawCells ?? [];
  if (cells.length >= 4) {
    const c3 = cells[3]?.trim() ?? "";
    const n = parseInt(c3.replace(/\D/g, ""), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 14) return n;
  }
  for (const c of cells) {
    const x = c.trim();
    if (/^[1-9]$/.test(x)) return parseInt(x, 10);
    const dm = x.match(/^(\d{1,2})\s*D(?:AY)?S?$/i);
    if (dm) {
      const n = parseInt(dm[1]!, 10);
      if (n >= 1 && n <= 14) return n;
    }
  }
  const line = cells.join(" ");
  const dm = line.match(/\bDays\s*[:\s]+\s*(\d{1,2})\b/i);
  if (dm) {
    const n = Number(dm[1]);
    if (n >= 1 && n <= 14) return n;
  }
  const m = line.match(/\b(\d)\s*D\b/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 9) return n;
  }
  return null;
}

/** Row subline under pairing id: bid position + trip length only (date lives in section header). */
function openTimeRowSubline(t: OpenTimeTrip): string {
  const parts: string[] = [];
  const bid = openTimeRowBidPos(t);
  if (bid) parts.push(`Bid ${bid}`);
  const d = openTimeRowTripDays(t);
  if (d != null) parts.push(`${d}D`);
  return parts.join(META_DOT) || "—";
}

function dollarPerHourLabel(t: OpenTimeTrip): string {
  const d = t.dollarPerCreditHour?.trim();
  if (d) return d;
  const w = parseWorthNumber(t.worth);
  const crMin = creditMinutesFromDisplay(t.credit);
  if (!Number.isFinite(w) || w <= 0 || crMin <= 0) return "";
  const hr = crMin / 60;
  const n = Math.round(w / hr);
  return `$${n}/hr`;
}

type FeaturedPlacardVariant = "turns_section" | "pot_global";

type TurnFeaturedCardProps = {
  trip: OpenTimeTrip;
  onAdd: (t: OpenTimeTrip) => void;
  variant: FeaturedPlacardVariant;
  isOnlyTurnInSection?: boolean;
};

function OpenTimeFeaturedPlacard({ trip, onAdd, variant, isOnlyTurnInSection }: TurnFeaturedCardProps) {
  const worthLine = trip.worth?.trim() ? trip.worth : "—";
  const perHr = dollarPerHourLabel(trip);
  const layDots = hubLayoverDisplayWithDots(trip.layover);
  const legal = trip.legalityStatus?.trim();
  const legalLine = legal ? `✓ ${legal}` : "✓ Legal 10h rest available · Fits schedule";
  const bannerLabel =
    variant === "pot_global"
      ? "FEATURED PICK · BEST $/HR"
      : isOnlyTurnInSection
        ? "ONLY TURN TODAY · BEST $/HR"
        : "BEST TURN · BEST $/HR";

  return (
    <View style={tc.cardShadowWrap}>
      <View style={tc.cardOuter}>
        <View style={tc.banner}>
          <Text style={tc.bannerStar}>★</Text>
          <Text style={tc.bannerText}>{bannerLabel}</Text>
        </View>
        <View style={tc.body}>
          <View style={tc.heroRow}>
            <View style={tc.heroLeft}>
              <Text style={tc.heroPairing} numberOfLines={1}>
                {trip.pairingId}
              </Text>
            </View>
            <View style={tc.heroRouteWrap}>
              <Text style={tc.heroRoute} numberOfLines={2}>
                {layDots}
              </Text>
              <Text style={tc.heroMeta} numberOfLines={1}>
                {[
                  trip.date || trip.dates || trip.dateLabel,
                  trip.bidPos?.trim() ? `Bid ${trip.bidPos.trim()}` : "",
                  trip.days != null && Number.isFinite(trip.days) && trip.days > 0 ? `${trip.days} days` : "",
                ]
                  .filter(Boolean)
                  .join(META_DOT)}
              </Text>
            </View>
            <View style={tc.heroWorthCol}>
              <Text style={tc.heroWorth}>{worthLine}</Text>
              {perHr ? <Text style={tc.heroPerHr}>{perHr}</Text> : null}
            </View>
          </View>
          <View style={tc.statGrid}>
            <View style={tc.statCell}>
              <Text style={tc.statLab}>DAYS</Text>
              <Text style={tc.statVal}>
                {trip.days != null && Number.isFinite(trip.days) && trip.days > 0 ? String(trip.days) : "—"}
              </Text>
            </View>
            <View style={tc.statCell}>
              <Text style={tc.statLab}>CREDIT</Text>
              <Text style={tc.statVal}>{trip.credit || "—"}</Text>
            </View>
            <View style={tc.statCell}>
              <Text style={tc.statLab}>ARR</Text>
              <Text style={tc.statVal}>{trip.arriveTime?.trim() || "—"}</Text>
            </View>
            <View style={tc.statCell}>
              <Text style={tc.statLab}>WORTH</Text>
              <Text style={[tc.statVal, tc.statWorthMono]}>{worthLine}</Text>
            </View>
          </View>
          <View style={[tc.footerRow, tc.footerTint]}>
            <Text style={tc.legalOk} numberOfLines={2}>
              {legalLine}
            </Text>
            <Pressable style={tc.addBtn} onPress={() => onAdd(trip)}>
              <Text style={tc.addBtnText}>Add</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const tc = StyleSheet.create({
  cardShadowWrap: {
    marginBottom: 10,
    marginTop: 6,
    borderRadius: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 5,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  cardOuter: {
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SCHEDULE_MOCK_HEADER_RED,
    backgroundColor: "#fff",
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
  },
  bannerStar: { color: "#d4af37", fontSize: 10, fontWeight: "900" },
  bannerText: {
    flex: 1,
    color: "#fff",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.35,
  },
  body: {
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 10,
  },
  heroLeft: { flexShrink: 0, width: 72, paddingRight: 2 },
  heroPairing: {
    fontSize: 14,
    fontWeight: "500",
    color: SCHEDULE_MOCK_HEADER_RED,
  },
  heroRouteWrap: { flex: 1, minWidth: 0, alignItems: "center", paddingHorizontal: 4 },
  heroRoute: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
    textAlign: "center",
    lineHeight: 16,
    letterSpacing: -0.2,
  },
  heroMeta: {
    marginTop: 4,
    fontSize: 7,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "center",
    lineHeight: 10,
  },
  heroWorthCol: {
    flexShrink: 0,
    width: 76,
    alignItems: "flex-end",
    paddingLeft: 2,
  },
  heroWorth: { fontSize: 15, fontWeight: "900", color: "#15803d", fontVariant: ["tabular-nums"] },
  heroPerHr: { fontSize: 8, fontWeight: "600", color: "#64748b", marginTop: 3, fontVariant: ["tabular-nums"] },
  statGrid: {
    flexDirection: "row",
    backgroundColor: "#eef0f3",
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 0,
  },
  statCell: { flex: 1, alignItems: "center", paddingHorizontal: 2 },
  statLab: { fontSize: 7, fontWeight: "800", color: "#64748b", marginBottom: 4 },
  statVal: {
    fontSize: 11,
    fontWeight: "900",
    color: "#0f172a",
    fontVariant: ["tabular-nums"],
  },
  statLay: { color: "#15803d" },
  statWorthMono: { color: "#15803d", fontVariant: ["tabular-nums"] },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 0,
    marginHorizontal: -12,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 9,
  },
  footerTint: { backgroundColor: "rgba(45, 138, 91, 0.1)" },
  legalOk: { flex: 1, fontSize: 8, fontWeight: "700", color: "#2d8654", lineHeight: 11 },
  addBtn: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addBtnText: { color: "#fff", fontSize: 10, fontWeight: "900" },
});

function HubOtNumCell({ lab, val, narrow }: { lab: string; val: string; narrow?: boolean }) {
  return (
    <View style={[styles.hubCell, narrow ? styles.hubCellNarrow : null]}>
      <Text style={styles.hubCellLab}>{lab}</Text>
      <Text style={[styles.hubCellVal, OPEN_TIME_STATS_VALUE_FONT]} numberOfLines={1}>
        {val}
      </Text>
    </View>
  );
}

function OpenTimeHubRow({
  t,
  isLast,
  showBestTag,
  onAdd,
  onOpenDetail,
  onMutateSwap,
}: {
  t: OpenTimeTrip;
  isLast: boolean;
  showBestTag: boolean;
  onAdd: (x: OpenTimeTrip) => void;
  onOpenDetail: (x: OpenTimeTrip) => void;
  onMutateSwap: (x: OpenTimeTrip) => void;
}) {
  const per = dollarPerHourLabel(t);
  const tripDays = openTimeRowTripDays(t);
  const daysVal = tripDays != null ? String(tripDays) : "—";

  const swipeActions: CrewHubSwipeRailAction[] = [
    {
      key: "add",
      label: "Add",
      onPress: () => onAdd(t),
      variant: "primary",
    },
    {
      key: "swap",
      label: "Swap",
      onPress: () => onMutateSwap(t),
      variant: "secondary",
    },
  ];

  return (
    <Swipeable
      friction={1}
      overshootRight={false}
      rightThreshold={48}
      renderRightActions={(progress) => <CrewHubSwipeActionRail progress={progress} actions={swipeActions} />}
    >
      <Pressable
        onPress={() => onOpenDetail(t)}
        style={[styles.hubRowCard, isLast && styles.hubRowLast]}
      >
        <View style={styles.hubRowInner}>
          <View style={styles.hubColPair}>
            <View style={styles.hubIdRow}>
              <Text style={styles.hubPid}>{t.pairingId}</Text>
              {showBestTag ? (
                <View style={styles.bestTag}>
                  <Text style={styles.bestTagText}>BEST</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.hubSubMeta} numberOfLines={2}>
              {openTimeRowSubline(t)}
            </Text>
          </View>
          <View style={styles.hubColLay}>
            <Text style={styles.hubFieldCap}>Layover</Text>
            <Text style={styles.hubLayover} numberOfLines={2}>
              {hubLayoverDisplayForHubListRow(t.layover)}
            </Text>
          </View>
          <View style={styles.hubMetrics}>
            <HubOtNumCell lab="DAYS" val={daysVal} narrow />
            <HubOtNumCell lab="RPT" val={t.reportTime?.trim() || "—"} />
            <HubOtNumCell lab="DEP" val={t.departTime?.trim() || "—"} />
            <HubOtNumCell lab="ARR" val={t.arriveTime?.trim() || "—"} />
            <HubOtNumCell lab="CR" val={t.credit?.trim() || "—"} narrow />
            <View style={styles.hubCellWorth}>
              <Text style={styles.hubWorthLab}>WORTH</Text>
              <Text style={[styles.hubWorthVal, OPEN_TIME_STATS_VALUE_FONT]} numberOfLines={1}>
                {t.worth?.trim() ? t.worth : "—"}
              </Text>
              {per ? (
                <Text style={[styles.hubWorthPer, OPEN_TIME_STATS_VALUE_FONT]} numberOfLines={1}>
                  {per}
                </Text>
              ) : null}
            </View>
          </View>
          <Text style={styles.hubChev}>›</Text>
        </View>
      </Pressable>
    </Swipeable>
  );
}

export default function OpenTimeTabScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const isFocused = useIsFocused();
  const { setCrewScheduleHeaderSubtitle, bumpCrewHubSharedDataRefresh } = useCrewScheduleHeaderBridge();
  const { stripValues, monthTrips, year, month } = useCrewScheduleMonthStrip();

  const [chip, setChip] = useState("All");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openTimeBuckets, setOpenTimeBuckets] = useState<OpenTimeMonthBucket[]>([]);
  const [openTimePotIndex, setOpenTimePotIndex] = useState(0);
  const [marketplaceDetail, setMarketplaceDetail] = useState<FlicaMarketplacePairingDetail | null>(null);
  const [hubMarketplaceLoading, setHubMarketplaceLoading] = useState(false);
  /** ISO time of last successful native Open Time hub refresh (used for mutating FLICA actions). */
  const [hubLiveMarketplaceSyncAt, setHubLiveMarketplaceSyncAt] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pullSessionRunnerActive, setPullSessionRunnerActive] = useState(false);
  const pullSessionWaitersRef = useRef<{
    resolve: () => void;
    reject: (e: Error) => void;
  } | null>(null);
  const cacheHydratedForUser = useRef<string | null>(null);
  const selectedOtMonthKeyRef = useRef<string | null>(null);
  /** `${sourceMonthKey}|${sourceBcid}|${sourceOpenTimePotUrl}` — preserves exact pot after refresh when possible. */
  const selectedOpenTimeBucketKeyRef = useRef<string | null>(null);
  const openTimePotIndexRef = useRef(0);

  const monthFallback = useMemo(() => `${year}-${String(month).padStart(2, "0")}`, [year, month]);

  const potTrips = useMemo(
    () => openTimeBuckets[openTimePotIndex]?.trips ?? [],
    [openTimeBuckets, openTimePotIndex],
  );

  const totalOpenTimeRows = useMemo(
    () => openTimeBuckets.reduce((n, b) => n + b.trips.length, 0),
    [openTimeBuckets],
  );

  useEffect(() => {
    openTimePotIndexRef.current = openTimePotIndex;
  }, [openTimePotIndex]);

  useEffect(() => {
    const b = openTimeBuckets[openTimePotIndex];
    if (b) {
      selectedOtMonthKeyRef.current = b.sourceMonthKey;
      selectedOpenTimeBucketKeyRef.current = `${b.sourceMonthKey}|${b.sourceBcid}|${b.sourceOpenTimePotUrl}`;
    }
  }, [openTimeBuckets, openTimePotIndex]);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid || cacheHydratedForUser.current === uid) return;
    cacheHydratedForUser.current = uid;
    void loadOpenTimeHubCache(uid).then((c) => {
      if (!c?.trips?.length) return;
      setOpenTimeBuckets((prev) => {
        if (prev.length > 0) return prev;
        return groupOpenTimeTripsIntoMonthBuckets(c.trips, monthFallback);
      });
      setHubLiveMarketplaceSyncAt((was) => {
        if (was) return was;
        return c.trips.some((t) => openTimeTripHasLiveHubActionContext(t)) ? c.refreshedAt : null;
      });
    });
  }, [session?.user?.id, monthFallback]);

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

      let myReqR: Awaited<ReturnType<typeof nativeFetchOpenTimeMyRequests>> | undefined;
      let agg: Awaited<ReturnType<typeof fetchAllOpenTimePotContextsMerged>>;
      if (__DEV__) {
        [agg, myReqR] = await Promise.all([
          fetchAllOpenTimePotContextsMerged(monthFallback),
          nativeFetchOpenTimeMyRequests(),
        ]);
      } else {
        agg = await fetchAllOpenTimePotContextsMerged(monthFallback);
      }

      const potR: FlicaActionsFetchResult =
        agg.primaryPotResult ?? {
          ok: false,
          url: FLICA_NATIVE_URLS.otFrameView,
          requestedUrl: FLICA_NATIVE_URLS.otFrameView,
          error: agg.diag.errors.join("; ") || "Open Time pot unavailable",
          htmlLength: agg.diag.seedFrameHtmlLen,
        };

      logCrewHubAuth("native_fetch_done", {
        context: "opentime",
        phase: "first",
        htmlLen: potR.htmlLength ?? agg.diag.seedFrameHtmlLen,
        htmlState: potR.htmlState,
        rowCount: agg.diag.rowsTotal,
        multiBcid: Object.keys(agg.diag.rowsCountPerBcid).length,
      });

      const tripsPre = agg.trips;
      const potFb: { trips: OpenTimeTrip[]; meta: FlicaCrewHubFallbackParseMeta } =
        agg.primaryPotResult
          ? mapOpenTimeTripsWithHtmlFallback(
              agg.primaryPotResult.nativeParse?.rows ?? [],
              agg.primaryPotResult,
              agg.primaryPotResult.url,
            )
          : {
              trips: tripsPre,
              meta: {
                htmlLength: agg.diag.seedFrameHtmlLen,
                rawRowsCount: 0,
                fallbackTextParserUsed: false,
                extractedPostCount: 0,
                extractedTripCount: tripsPre.length,
                firstExtractedRawBlock: JSON.stringify(agg.diag.sampleRows).slice(0, 400),
                markersFound: ["open_time_multi_bcid_refresh"],
                markersMissing: agg.diag.errors.length ? agg.diag.errors : [],
              },
            };

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
        setHubLiveMarketplaceSyncAt(null);
        setOpenTimeBuckets([]);
        setOpenTimePotIndex(0);
        if (reason === "focus") {
          setError(null);
        } else {
          setError(potR.error ?? "FLICA verification still required.");
        }
        return;
      }

      const trips = tripsPre;
      setHubLiveMarketplaceSyncAt(agg.diag.refreshedAt);

      const bucketsSorted = sortOpenTimeMonthBucketsChronologically(agg.monthBuckets);
      const bucketKey = selectedOpenTimeBucketKeyRef.current;
      const preservedKey = selectedOtMonthKeyRef.current;
      let nextIdx = -1;
      if (bucketKey) {
        const i = bucketsSorted.findIndex(
          (b) => `${b.sourceMonthKey}|${b.sourceBcid}|${b.sourceOpenTimePotUrl}` === bucketKey,
        );
        if (i >= 0) nextIdx = i;
      }
      if (nextIdx < 0 && preservedKey) {
        const i = bucketsSorted.findIndex((b) => b.sourceMonthKey === preservedKey);
        if (i >= 0) nextIdx = i;
      }
      if (nextIdx < 0) {
        nextIdx = Math.min(openTimePotIndexRef.current, Math.max(0, bucketsSorted.length - 1));
      }
      setOpenTimeBuckets(bucketsSorted);
      setOpenTimePotIndex(nextIdx);

      logCrewHubAuth("parse_done", { context: "opentime", mappedRows: trips.length });
      if (flicaFetchNeedsWebVerification(potR.htmlState)) {
        setError(potR.error ?? "FLICA verification still required.");
      } else if (!potR.ok && potR.error && trips.length === 0) {
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

      if (
        !flicaFetchNeedsWebVerification(potR.htmlState) &&
        session?.user?.id &&
        trips.length > 0
      ) {
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
        setOpenTimeBuckets([]);
        setOpenTimePotIndex(0);
        setHubLiveMarketplaceSyncAt(null);
      }
    } finally {
      setLoading(false);
      bumpCrewHubSharedDataRefresh();
    }
  }, [bumpCrewHubSharedDataRefresh, session?.user?.id, monthFallback]);

  const openOpenTimeMarketplace = useCallback(
    async (trip: OpenTimeTrip) => {
      const fetchUrl = trip.pairingDetailUrl?.trim();
      if (!fetchUrl) {
        Alert.alert(
          "Cannot open pairing detail",
          "This row does not have a FLICA pairing detail URL. Pull to refresh Open Time and try again.",
        );
        return;
      }
      const refererExact = trip.sourceOpenTimePotUrl?.trim() || undefined;
      const debugRow = {
        pairingId: trip.pairingId,
        date: [trip.date, trip.dates, trip.dateLabel].filter(Boolean).join(" · ") || undefined,
        pairingDetailUrl: trip.pairingDetailUrl,
        dateYmd: trip.dateYmd,
        sourceBcid: trip.sourceBcid,
        sourceOpenTimePotUrl: trip.sourceOpenTimePotUrl,
        sourceOtFrameUrl: trip.sourceOtFrameUrl,
        pairingDetailUrlFromLiveHtml: trip.pairingDetailUrlFromLiveHtml,
        urlIsSyntheticFallback: !trip.pairingDetailUrl?.trim(),
      };

      console.log(
        "[FC_OPENTIME_ROW_TAP_DETAIL]",
        JSON.stringify({
          selectedRowPairingId: trip.pairingId,
          selectedRowDateYmd: trip.dateYmd,
          selectedRowSourceBcid: trip.sourceBcid,
          selectedRowSourceOpenTimePotUrl: trip.sourceOpenTimePotUrl,
          selectedRowPairingDetailUrl: trip.pairingDetailUrl,
          pairingDetailUrlFromLiveHtml: trip.pairingDetailUrlFromLiveHtml,
          finalFetchUrl: fetchUrl,
        }),
      );

      setHubMarketplaceLoading(true);
      let didRetry = false;
      try {
        const runFetch = async (): Promise<FlicaMarketplacePairingDetail> => {
          try {
            return await fetchFlicaMarketplacePairingDetail(fetchUrl, "opentime", {
              referer: refererExact,
              monthFallback,
              debugRow,
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const retryable =
              Boolean(trip.sourceBcid?.trim()) &&
              !didRetry &&
              /FLICA_APPLICATION_OR_SESSION_ERROR|InitializeSessionData|Application\s+Error/i.test(msg);
            if (!retryable) throw e;
            didRetry = true;
            const agg2 = await fetchAllOpenTimePotContextsMerged(monthFallback);
            const buckets2 = sortOpenTimeMonthBucketsChronologically(agg2.monthBuckets);
            setOpenTimeBuckets(buckets2);
            setHubLiveMarketplaceSyncAt(agg2.diag.refreshedAt);
            const flat2 = flattenOpenTimeMonthBuckets(buckets2);
            const fresh =
              flat2.find(
                (x) =>
                  x.pairingId === trip.pairingId &&
                  x.dateYmd === trip.dateYmd &&
                  x.sourceBcid === trip.sourceBcid,
              ) ??
              flat2.find((x) => x.pairingId === trip.pairingId && x.dateYmd === trip.dateYmd) ??
              null;
            const mergedTrip = fresh ? ({ ...trip, ...fresh } as OpenTimeTrip) : trip;
            const u2 = mergedTrip.pairingDetailUrl?.trim();
            if (!u2) throw e;
            const ref2 = mergedTrip.sourceOpenTimePotUrl?.trim() || undefined;
            console.log("[FC_OPENTIME_ROW_TAP_DETAIL_RETRY]", JSON.stringify({ finalFetchUrl: u2 }));
            return await fetchFlicaMarketplacePairingDetail(u2, "opentime", {
              referer: ref2,
              monthFallback,
              debugRow: {
                ...debugRow,
                pairingDetailUrl: mergedTrip.pairingDetailUrl,
                dateYmd: mergedTrip.dateYmd,
                sourceBcid: mergedTrip.sourceBcid,
                sourceOpenTimePotUrl: mergedTrip.sourceOpenTimePotUrl,
                sourceOtFrameUrl: mergedTrip.sourceOtFrameUrl,
              },
            });
          }
        };
        setMarketplaceDetail(await runFetch());
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert("Pairing detail failed", msg);
      } finally {
        setHubMarketplaceLoading(false);
      }
    },
    [monthFallback],
  );

  const goPrevOpenTimeMonth = useCallback(() => {
    setOpenTimePotIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNextOpenTimeMonth = useCallback(() => {
    setOpenTimePotIndex((i) => {
      const max = Math.max(0, openTimeBuckets.length - 1);
      return Math.min(max, i + 1);
    });
  }, [openTimeBuckets.length]);

  const canPrevOpenTimeMonth = openTimeBuckets.length > 0 && openTimePotIndex > 0;
  const canNextOpenTimeMonth =
    openTimeBuckets.length > 0 && openTimePotIndex < openTimeBuckets.length - 1;

  const activeOpenTimeMonthTitle = useMemo(() => {
    const smk = openTimeBuckets[openTimePotIndex]?.sourceMonthKey;
    return smk ? openTimeBucketMonthNavLabel(smk) : "Open Time";
  }, [openTimeBuckets, openTimePotIndex]);

  const openTimeMonthSwipePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 28 && Math.abs(g.dx) > Math.abs(g.dy) + 12,
        /** Steal clearly horizontal drags from nested touchables (chevrons / stats) so month swipe works like Schedule. */
        onMoveShouldSetPanResponderCapture: (_, g) =>
          Math.abs(g.dx) > 22 && Math.abs(g.dx) > Math.abs(g.dy) + 10,
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, g) => {
          const minDist = 56;
          const minVel = 0.4;
          if (g.dx < -minDist || g.vx < -minVel) {
            if (canNextOpenTimeMonth) goNextOpenTimeMonth();
          } else if (g.dx > minDist || g.vx > minVel) {
            if (canPrevOpenTimeMonth) goPrevOpenTimeMonth();
          }
        },
      }),
    [canNextOpenTimeMonth, canPrevOpenTimeMonth, goNextOpenTimeMonth, goPrevOpenTimeMonth],
  );

  const canMutateOpenTimeRow = useCallback(
    (t: OpenTimeTrip): boolean => {
      if (!hubLiveMarketplaceSyncAt) {
        Alert.alert(
          "Sync live FLICA first",
          "Pull to refresh Open Time so FLICA actions use a current session.",
        );
        return false;
      }
      if (!openTimeTripHasLiveHubActionContext(t)) {
        Alert.alert(
          "Sync live FLICA first",
          "This row does not have a current live FLICA action context. Pull to refresh Open Time and try again.",
        );
        return false;
      }
      return true;
    },
    [hubLiveMarketplaceSyncAt],
  );

  const onMutateSwap = useCallback(
    (t: OpenTimeTrip) => {
      if (!canMutateOpenTimeRow(t)) return;
      pushFlicaWeb(router, FLICA_NATIVE_URLS.otSwapPreview);
    },
    [canMutateOpenTimeRow, router],
  );

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
  const todayMonthShort = useMemo(
    () => new Date().toLocaleDateString("en-US", { month: "short" }),
    [],
  );
  const todayDayNum = useMemo(() => new Date().getDate(), []);

  const tripToday = useMemo(() => {
    return (
      monthTrips.find((t) => todayIso >= t.startDate && todayIso <= t.endDate) ?? null
    );
  }, [monthTrips, todayIso]);

  const headerSubtitle = useMemo(() => {
    return `${dateShort} · ${totalOpenTimeRows} available · ${weekdayShort}`;
  }, [dateShort, totalOpenTimeRows, weekdayShort]);

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

  const featuredPick = useMemo(
    () => pickFeaturedOpenTimeTrip(listedTrips, todayMonthShort, todayDayNum),
    [listedTrips, todayMonthShort, todayDayNum],
  );

  const turnList = useMemo(() => listedTrips.filter((t) => t.days === 1), [listedTrips]);

  const bestTurnTrip = useMemo(
    () => pickFeaturedOpenTimeTrip(turnList, todayMonthShort, todayDayNum).trip,
    [turnList, todayMonthShort, todayDayNum],
  );

  const best234Trip = useMemo(
    () =>
      pickFeaturedOpenTimeTrip(
        listedTrips.filter((t) => t.days === 2 || t.days === 3),
        todayMonthShort,
        todayDayNum,
      ).trip,
    [listedTrips, todayMonthShort, todayDayNum],
  );

  const excludedRowKeys = useMemo(() => {
    const s = new Set<string>();
    if (bestTurnTrip && turnList.length > 0) s.add(tripDedupeKey(bestTurnTrip));
    if (featuredPick.trip && turnList.length === 0) s.add(tripDedupeKey(featuredPick.trip));
    return s;
  }, [bestTurnTrip, turnList.length, featuredPick.trip]);

  const dateGroups = useMemo(() => {
    const rows = listedTrips.filter((t) => !excludedRowKeys.has(tripDedupeKey(t)));
    return groupOpenTimeByBucketPreserveOrder(rows);
  }, [listedTrips, excludedRowKeys]);

  useEffect(() => {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    for (const t of potTrips.slice(0, 50)) {
      console.log("[FLICA_OPENTIME_ROW_FIELDS]", {
        pairingId: t.pairingId,
        dateLabel: t.dateLabel ?? t.date,
        bidPosition: t.bidPos ?? "",
        days: t.days,
        reportTime: t.reportTime,
        departTime: t.departTime,
        arriveTime: t.arriveTime,
        block: t.block,
        credit: t.credit,
        layover: t.layover,
        worth: t.worth,
      });
    }
    if (featuredPick.trip) {
      console.log("[FLICA_OPENTIME_FEATURED_PICK]", {
        pairingId: featuredPick.trip.pairingId,
        reason: featuredPick.reason,
        credit: featuredPick.trip.credit,
        block: featuredPick.trip.block,
        worth: featuredPick.trip.worth,
      });
    }
  }, [potTrips, featuredPick]);

  const chips = ["All", "Turns", "2 Days", "3 Days", "Red-eye", "≥$1k"];

  const onAdd = (t: OpenTimeTrip) => {
    if (!canMutateOpenTimeRow(t)) return;
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
      <View {...openTimeMonthSwipePan.panHandlers} collapsable={false} style={styles.otMonthSwipeChrome}>
        <MonthlyStatsStrip values={stripValues} />
        {openTimeBuckets.length > 0 || loading ? (
          <View
            style={styles.otMonthRow}
            accessibilityLabel="Open Time month — swipe left or right to change month"
          >
            <Pressable
              onPress={goPrevOpenTimeMonth}
              disabled={!canPrevOpenTimeMonth}
              style={[styles.otMonthCircleNav, !canPrevOpenTimeMonth && styles.otMonthCircleNavOff]}
              accessibilityLabel="Previous Open Time month"
              accessibilityState={{ disabled: !canPrevOpenTimeMonth }}
            >
              <Ionicons
                name="chevron-back"
                size={16}
                color={canPrevOpenTimeMonth ? scheduleT.text : scheduleT.line}
              />
            </Pressable>
            <Text style={styles.otMonthNavTitle} numberOfLines={1}>
              {activeOpenTimeMonthTitle}
            </Text>
            <Pressable
              onPress={goNextOpenTimeMonth}
              disabled={!canNextOpenTimeMonth}
              style={[styles.otMonthCircleNav, !canNextOpenTimeMonth && styles.otMonthCircleNavOff]}
              accessibilityLabel="Next Open Time month"
              accessibilityState={{ disabled: !canNextOpenTimeMonth }}
            >
              <Ionicons
                name="chevron-forward"
                size={16}
                color={canNextOpenTimeMonth ? scheduleT.text : scheduleT.line}
              />
            </Pressable>
          </View>
        ) : null}
      </View>
      <ScrollView
        style={styles.scroll}
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load("pull")} />
        }
      >
        <View style={styles.otFilterShell}>
          <Text style={styles.otFilterEyebrow}>QUICK FILTERS</Text>
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
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!loading && totalOpenTimeRows === 0 ? (
          <Text style={styles.emptyText}>No Open Time trips found.</Text>
        ) : null}

        {tripToday ? (
          <View style={styles.yourTripCard}>
            <Text style={styles.yourTripLabel}>YOUR TRIP TODAY</Text>
            <View style={styles.yourTripRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.yourTripMain} numberOfLines={3}>
                  {tripToday.pairingCode}
                  {META_DOT}
                  {tripToday.routeSummary?.trim() || "—"}
                  {META_DOT}
                  {tripReportHint(tripToday) || "—"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", marginLeft: 8 }}>
                <Text style={styles.yourTripMeta}>WORTH —</Text>
                <Text style={styles.yourTripMeta}>
                  CR{" "}
                  {formatCreditHours(
                    tripToday.pairingCreditHours ?? tripToday.creditHours ?? null,
                  ) || "—"}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {featuredPick.trip && listedTrips.length > 0 && turnList.length === 0 ? (
          <View style={styles.placardWrap}>
            <OpenTimeFeaturedPlacard trip={featuredPick.trip} variant="pot_global" onAdd={onAdd} />
          </View>
        ) : null}

        {bestTurnTrip && turnList.length > 0 ? (
          <View style={styles.placardWrap}>
            <OpenTimeFeaturedPlacard
              trip={bestTurnTrip}
              variant="turns_section"
              isOnlyTurnInSection={turnList.length <= 1}
              onAdd={onAdd}
            />
          </View>
        ) : null}

        {chip !== "All" && potTrips.length > 0 ? (
          <Text style={styles.filterHint}>
            Showing {listedTrips.length} of {potTrips.length}
          </Text>
        ) : null}

        {listedTrips.length === 0 && !loading && potTrips.length > 0 ? (
          <Text style={styles.filterEmpty}>No trips match this filter.</Text>
        ) : null}

        {loading && listedTrips.length === 0 && potTrips.length === 0 ? (
          <ActivityIndicator style={{ marginTop: 14 }} color={SCHEDULE_MOCK_HEADER_RED} />
        ) : null}

        {dateGroups.map((grp) => {
          if (grp.items.length === 0) return null;
          return (
            <View key={grp.key} style={styles.otDateSection}>
              <View style={styles.otDateHeadRow}>
                <View style={styles.otDatePill}>
                  <Text style={styles.otDatePillIcon}>📅</Text>
                  <Text style={styles.otDatePillText} numberOfLines={1}>
                    {grp.key}
                  </Text>
                </View>
                <View style={styles.otDateHeadTrail}>
                  <View style={styles.otDateRule} />
                  <Text style={styles.otDateSectionCount}>
                    {grp.items.length} trip{grp.items.length === 1 ? "" : "s"}
                  </Text>
                </View>
              </View>
              <View style={styles.otCardShell}>
                <View style={styles.otColHead}>
                  <Text style={[styles.otColH, { flex: 1.12 }]}>PAIRING</Text>
                  <Text style={[styles.otColH, { flex: 0.95 }]}>LAYOVER</Text>
                  <Text style={[styles.otColH, { width: 24 }]}>DAYS</Text>
                  <Text style={[styles.otColH, { width: 30 }]}>RPT</Text>
                  <Text style={[styles.otColH, { width: 30 }]}>DEP</Text>
                  <Text style={[styles.otColH, { width: 30 }]}>ARR</Text>
                  <Text style={[styles.otColH, { width: 28 }]}>CR</Text>
                  <Text style={[styles.otColH, { width: 40, textAlign: "right" }]}>$</Text>
                </View>
                {grp.items.map((t, idx) => (
                  <OpenTimeHubRow
                    key={`${grp.key}-${tripDedupeKey(t)}-${idx}`}
                    t={t}
                    isLast={idx === grp.items.length - 1}
                    showBestTag={
                      best234Trip != null && tripDedupeKey(t) === tripDedupeKey(best234Trip)
                    }
                    onAdd={onAdd}
                    onOpenDetail={openOpenTimeMarketplace}
                    onMutateSwap={onMutateSwap}
                  />
                ))}
              </View>
            </View>
          );
        })}

        <View style={{ height: 28 }} />
      </ScrollView>

      {hubMarketplaceLoading ? (
        <View style={styles.hubMarketplaceLoading} pointerEvents="auto">
          <ActivityIndicator size="large" color={SCHEDULE_MOCK_HEADER_RED} />
        </View>
      ) : null}

      <FlicaMarketplacePairingDetailSheet
        visible={marketplaceDetail != null}
        detail={marketplaceDetail}
        onClose={() => setMarketplaceDetail(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f1f0f0" },
  /** Month swipe PanResponder lives here (above ScrollView) so it is not blocked by the list scroll view or row Swipeables. */
  otMonthSwipeChrome: {
    marginBottom: 0,
  },
  hubMarketplaceLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.72)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  scroll: { flex: 1 },
  /** Matches `ModernScheduleChrome` month navigator (no card background). */
  otMonthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 14,
  },
  otMonthCircleNav: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
  },
  otMonthCircleNavOff: { opacity: 0.45 },
  otMonthNavTitle: { fontSize: 14, fontWeight: "500", color: scheduleT.text },
  otFilterShell: {
    marginHorizontal: 10,
    marginTop: 6,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CREW_HUB_CARD_RIM,
    paddingTop: 6,
    paddingBottom: 4,
  },
  otFilterEyebrow: {
    fontSize: 7,
    fontWeight: "900",
    color: "#a8a29e",
    letterSpacing: 0.9,
    paddingHorizontal: 10,
    marginBottom: 2,
  },
  chipScroll: { maxHeight: 28, paddingLeft: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    marginRight: 5,
  },
  chipOn: { backgroundColor: SCHEDULE_MOCK_HEADER_RED, borderColor: SCHEDULE_MOCK_HEADER_RED },
  chipText: { fontSize: 8, fontWeight: "700", color: "#374151" },
  chipTextOn: { color: "#fff" },
  errorText: { color: "#b91c1c", fontSize: 10, marginHorizontal: 12, marginTop: 6 },
  filterHint: {
    fontSize: 9,
    color: "#6b7280",
    marginHorizontal: 12,
    marginTop: 4,
    fontWeight: "600",
  },
  filterEmpty: {
    fontSize: 10,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 8,
  },
  yourTripCard: {
    marginHorizontal: 10,
    marginTop: 6,
    borderRadius: 10,
    backgroundColor: "#7f1d1d",
    padding: 8,
  },
  yourTripLabel: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  yourTripRow: { flexDirection: "row", alignItems: "flex-start" },
  yourTripMain: { color: "#fff", fontSize: 10, fontWeight: "600", lineHeight: 13 },
  yourTripMeta: { color: "#fff", fontSize: 8, fontWeight: "700" },
  placardWrap: { marginHorizontal: 10, marginTop: 6 },
  otDateSection: { marginTop: 18, paddingHorizontal: 10 },
  otDateHeadRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  otDatePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    backgroundColor: CREW_HUB_DATE_HEADER_BG,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    maxWidth: "72%",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    ...Platform.select({
      ios: {
        shadowColor: "#2a0a0c",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 5,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  otDatePillIcon: { fontSize: 12 },
  otDatePillText: { fontSize: 12, fontWeight: "800", color: "#fff7f7", flexShrink: 1, letterSpacing: 0.2 },
  otDateHeadTrail: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 12,
    minWidth: 0,
  },
  otDateRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    minHeight: 1,
    backgroundColor: "rgba(92, 16, 24, 0.2)",
  },
  otDateSectionCount: {
    marginLeft: 10,
    fontSize: 12,
    fontWeight: "400",
    letterSpacing: 0,
    color: "#94a3b8",
    textAlign: "right",
    flexShrink: 0,
  },
  otCardShell: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CREW_HUB_CARD_RIM,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#2a0a0c",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  otColHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 5,
    backgroundColor: "rgba(176, 24, 26, 0.06)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(92, 16, 24, 0.12)",
  },
  otColH: { fontSize: 6, fontWeight: "800", color: "#78716c", letterSpacing: 0.25 },
  hubRowCard: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15, 23, 42, 0.08)",
  },
  hubRowLast: { borderBottomWidth: 0 },
  hubRowInner: { flexDirection: "row", alignItems: "stretch", paddingVertical: 5, paddingHorizontal: 4 },
  hubColPair: { flex: 1.12, minWidth: 0, paddingRight: 3 },
  hubColLay: { flex: 0.95, minWidth: 0, paddingRight: 2, justifyContent: "flex-start" },
  hubFieldCap: {
    fontSize: 6,
    fontWeight: "900",
    color: "#a8a29e",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  hubIdRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  hubPid: { fontSize: 10, fontWeight: "800", color: SCHEDULE_MOCK_HEADER_RED },
  hubLayover: { fontSize: 9, fontWeight: "600", color: "#44403c", lineHeight: 12 },
  hubSubMeta: { marginTop: 3, fontSize: 7, fontWeight: "600", color: "#78716c", lineHeight: 10 },
  hubMetrics: { flexDirection: "row", alignItems: "flex-end", flexShrink: 0, paddingBottom: 1 },
  hubCell: { width: 30, alignItems: "center" },
  hubCellNarrow: { width: 22 },
  hubCellLab: { fontSize: 6, fontWeight: "800", color: "#78716c", marginBottom: 2 },
  hubCellVal: { fontSize: 8, fontWeight: "700", color: "#1c1917" },
  hubCellWorth: { width: 40, alignItems: "flex-end", marginLeft: 1 },
  hubWorthLab: { fontSize: 6, fontWeight: "800", color: "#78716c", marginBottom: 2 },
  hubWorthVal: { fontSize: 8, fontWeight: "700", color: "#15803d" },
  hubWorthPer: { fontSize: 6, fontWeight: "500", color: "#78716c", marginTop: 1 },
  hubChev: { alignSelf: "center", fontSize: 12, color: "#d6d3d1", paddingLeft: 1, fontWeight: "300" },
  bestTag: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  bestTagText: { color: "#fff", fontSize: 6, fontWeight: "900" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 12 },
  modalTitle: { fontSize: 13, fontWeight: "800", marginBottom: 6, color: "#111827" },
  modalPairing: {
    fontSize: 15,
    fontWeight: "900",
    color: SCHEDULE_MOCK_HEADER_RED,
    marginBottom: 4,
  },
  modalKv: { fontSize: 10, color: "#1f2937", marginBottom: 3, fontWeight: "600", lineHeight: 14 },
  modalKvSmall: { fontSize: 9, color: "#64748b", marginBottom: 3 },
  emptyText: {
    fontSize: 11,
    color: "#6b7280",
    textAlign: "center",
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
  },
  modalGhost: {
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  modalGhostText: { color: "#374151", fontWeight: "700", fontSize: 11 },
  modalPrimary: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  modalPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 11 },
});
