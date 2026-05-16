import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useRouter, type Href } from "expo-router";
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../lib/supabaseClient";
import {
  crewHubNativeFetchNeedsVerificationSheet,
  logCrewHubAuth,
} from "../crewHubFlicaAuthGate";
import { flicaFetchNeedsWebVerification } from "../../flica-actions/flicaActionsHttp";
import {
  FLICA_NATIVE_URLS,
  nativeFetchTradeBoardAllRequests,
  nativeFetchTradeBoardFavorites,
  nativeFetchTradeBoardMyRequests,
  nativeFetchTradeBoardMyResponses,
} from "../../flica-actions/flicaActionsNativeService";
import FlicaMarketplacePairingDetailSheet from "../components/FlicaMarketplacePairingDetailSheet";
import { CrewHubSwipeActionRail, type CrewHubSwipeRailAction } from "../components/CrewHubSwipeActionRail";
import { CrewHubRefreshToast } from "../components/CrewHubRefreshToast";
import { hubLayoverDisplayForHubListRow } from "../crewHubLayoverDisplay";
import { FlicaCrewHubScheduleSessionRunner } from "../components/FlicaCrewHubScheduleSessionRunner";
import MonthlyStatsStrip from "../components/MonthlyStatsStrip";
import {
  loadTradeboardHubCache,
  upsertTradeboardHubCache,
} from "../crewHubFlicaCache";
import { resolveCrewHubTradeboardPairingDetailUrl } from "../crewHubFlicaDetailUrl";
import { useCrewScheduleHeaderBridge } from "../crewScheduleHeaderBridge";
import { mapTradeboardPostsWithHtmlFallback } from "../flicaCrewHubHtmlFallbackParse";
import { tradeboardDisplayScheduleFields, tradeboardTypeLabel } from "../flicaCrewHubMappers";
import {
  buildCrewHubParseDebugFetchEntry,
  commitTradeboardParseDebugSnapshot,
  type FlicaCrewHubParseDebugPayload,
} from "../flicaCrewHubParseDebug";
import type { TradeboardPost } from "../flicaCrewHubTypes";
import { useCrewScheduleMonthStrip } from "../hooks/useCrewScheduleMonthStrip";
import type { FlicaMarketplacePairingDetail } from "../flicaMarketplacePairingDetailTypes";
import { fetchFlicaMarketplacePairingDetail } from "../openFlicaMarketplacePairingDetail";
import {
  CREW_HUB_CARD_RIM,
  SCHEDULE_MOCK_HEADER_RED,
  SCHEDULE_MOCK_STATS_STRIP_RED,
} from "../scheduleMockPalette";
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

/** Display-only: first given name from FLICA poster cell (e.g. "SMITH, JOHN" → "JOHN"). */
function tradeboardPosterFirstName(posterName: string | null | undefined): string {
  const s = String(posterName ?? "").trim();
  if (!s) return "—";
  const comma = s.indexOf(",");
  if (comma >= 0) {
    const after = s.slice(comma + 1).trim();
    if (!after) return s.slice(0, comma).trim() || "—";
    return after.split(/\s+/)[0] ?? after;
  }
  const parts = s.split(/\s+/).filter(Boolean);
  return parts[0] ?? s;
}

function tradeboardDateGroupKey(p: TradeboardPost): string {
  return (p.pairingDateLabel?.trim() || p.date?.trim() || "Other") as string;
}

/** FLICA-style day + month token (e.g. 01JUN, 12MAY). */
const TRADEBOARD_DDMMM_RE = /\b(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i;

const TRADEBOARD_MONTH_INDEX: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

/** First DDMMM in a label (handles ranges like "12MAY-14MAY"). */
function tradeboardFirstDdMmmToken(s: string): string | null {
  const m = String(s ?? "")
    .trim()
    .toUpperCase()
    .match(TRADEBOARD_DDMMM_RE);
  if (!m) return null;
  return `${m[1]}${m[2]}`;
}

/**
 * Report-date sort key: calendar order from today forward (FLICA Tradeboard order).
 * Picks year in {y-1,y,y+1} so the trip date is on/after today when possible.
 */
function tradeboardReportDateMsFromLabel(labelOrDate: string, now: Date): number {
  const compact = tradeboardFirstDdMmmToken(labelOrDate);
  if (!compact) return Number.MAX_SAFE_INTEGER - 1024;
  const m = compact.match(/^(\d{1,2})([A-Z]{3})$/);
  if (!m) return Number.MAX_SAFE_INTEGER - 1024;
  const day = Number(m[1]);
  const mon = TRADEBOARD_MONTH_INDEX[m[2]!];
  if (!Number.isFinite(day) || mon == null) return Number.MAX_SAFE_INTEGER - 1024;

  const y0 = now.getFullYear();
  const candidates = [y0 - 1, y0, y0 + 1].map((year) => new Date(year, mon, day, 12, 0, 0, 0).getTime());
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const onOrAfter = candidates.filter((t) => t >= startOfToday);
  if (onOrAfter.length) return Math.min(...onOrAfter);
  return Math.max(...candidates);
}

/** FLICA All Requests column order: Pickup → Drop → Trade variants → Swap → unknown. */
function tradeboardFlicaTypeSortRank(t: TradeboardPost["type"]): number {
  switch (t) {
    case "pickup":
      return 0;
    case "drop":
      return 1;
    case "trade":
      return 2;
    case "trade_drop":
      return 3;
    case "swap":
      return 4;
    case "unknown":
    default:
      return 50;
  }
}

const POSTED_MONTHS: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

/**
 * Parse FLICA “posted under name” timestamp (e.g. `May 12, 2026 15:03:05 EDT`) for sort.
 * Oldest first within the same trip date + type bucket.
 */
function tradeboardPostedAtMsFromPost(p: TradeboardPost): number {
  const raw = String(p.postedAtLabel || p.postedAt || "").trim();
  if (raw) {
    const fromLabel = tradeboardParsePostedAtLabelToMs(raw);
    if (fromLabel != null) return fromLabel;
  }
  const line = String(p.rawText || "").trim();
  if (line) {
    const fromLine = tradeboardParsePostedAtLabelToMs(line);
    if (fromLine != null) return fromLine;
  }
  return Number.MAX_SAFE_INTEGER - 512;
}

function tradeboardParsePostedAtLabelToMs(s: string): number | null {
  const t = String(s).replace(/\s+/g, " ").trim();
  if (!t) return null;

  const long = t.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\b/i,
  );
  if (long) {
    const mon = POSTED_MONTHS[String(long[1]).slice(0, 3).toUpperCase()];
    const day = Number(long[2]);
    const year = Number(long[3]);
    const hh = Number(long[4]);
    const mm = Number(long[5]);
    const ss = Number(long[6]);
    if (
      mon == null ||
      !Number.isFinite(day) ||
      !Number.isFinite(year) ||
      !Number.isFinite(hh) ||
      !Number.isFinite(mm) ||
      !Number.isFinite(ss)
    ) {
      return null;
    }
    return new Date(year, mon, day, hh, mm, ss).getTime();
  }

  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?\b/i);
  if (slash) {
    const month = Number(slash[1]) - 1;
    const day = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const hh = Number(slash[4]);
    const mm = Number(slash[5]);
    const ss = slash[6] != null ? Number(slash[6]) : 0;
    if (
      month >= 0 &&
      month <= 11 &&
      day >= 1 &&
      day <= 31 &&
      Number.isFinite(year) &&
      Number.isFinite(hh) &&
      Number.isFinite(mm)
    ) {
      return new Date(year, month, day, hh, mm, Number.isFinite(ss) ? ss : 0).getTime();
    }
  }

  const ts = Date.parse(t);
  return Number.isFinite(ts) ? ts : null;
}

function groupTradeboardByDate(
  posts: TradeboardPost[],
  now: Date,
): { key: string; items: TradeboardPost[] }[] {
  const labelMsCache = new Map<string, number>();
  const labelMs = (label: string) => {
    const hit = labelMsCache.get(label);
    if (hit !== undefined) return hit;
    const v = tradeboardReportDateMsFromLabel(label, now);
    labelMsCache.set(label, v);
    return v;
  };

  type Row = {
    post: TradeboardPost;
    dateMs: number;
    tr: number;
    posted: number;
    id: string;
  };

  const m = new Map<string, Row[]>();
  for (const p of posts) {
    const k = tradeboardDateGroupKey(p);
    const dateLabel = p.pairingDateLabel?.trim() || p.date?.trim() || "";
    const row: Row = {
      post: p,
      dateMs: labelMs(dateLabel),
      tr: tradeboardFlicaTypeSortRank(p.type),
      posted: tradeboardPostedAtMsFromPost(p),
      id: p.pairingId,
    };
    const arr = m.get(k) ?? [];
    arr.push(row);
    m.set(k, arr);
  }

  const groups = [...m.entries()].map(([key, rows]) => {
    rows.sort((a, b) => {
      if (a.dateMs !== b.dateMs) return a.dateMs < b.dateMs ? -1 : 1;
      if (a.tr !== b.tr) return a.tr - b.tr;
      if (a.posted !== b.posted) return a.posted < b.posted ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
    return { key, items: rows.map((r) => r.post) };
  });

  groups.sort((ga, gb) => {
    const a = labelMs(ga.key);
    const b = labelMs(gb.key);
    if (a !== b) return a < b ? -1 : 1;
    return ga.key.localeCompare(gb.key);
  });

  return groups;
}

type PrimaryTab = "all" | "trade" | "trade_drop" | "drops" | "pickups" | "post_trade";

type TradeFeedTab = "all" | "my" | "responses";

function buildTradeboardFilteredList(
  allPosts: TradeboardPost[],
  myPosts: TradeboardPost[],
  responsePosts: TradeboardPost[],
  tradeFeedTab: TradeFeedTab,
  primaryTab: PrimaryTab,
  search: string,
  chip: string,
): TradeboardPost[] {
  const base =
    tradeFeedTab === "my" ? myPosts : tradeFeedTab === "responses" ? responsePosts : allPosts;
  let list = [...base];
  if (primaryTab === "trade") {
    list = list.filter((p) => p.type === "swap" || p.type === "trade");
  }
  if (primaryTab === "trade_drop") {
    list = list.filter((p) => p.type === "trade_drop");
  }
  if (primaryTab === "drops") list = list.filter((p) => p.type === "drop");
  if (primaryTab === "pickups") list = list.filter((p) => p.type === "pickup");

  const q = search.trim().toLowerCase();
  if (q) {
    list = list.filter((p) =>
      [p.pairingId, p.routeSummary, p.posterName, p.comments, p.layover]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }

  if (chip !== "All") {
    const anchor = new Date();
    if (chip === "Today") {
      const mon = anchor.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
      const day = String(anchor.getDate());
      list = list.filter((p) => {
        const blob = `${p.pairingDateLabel} ${p.date}`.toUpperCase();
        return blob.includes(mon) && blob.includes(day);
      });
    } else if (chip === "This Week") {
      const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()).getTime();
      const end = start + 7 * 24 * 60 * 60 * 1000;
      const tripMsCache = new Map<string, number>();
      const tripMs = (p: TradeboardPost) => {
        const label = p.pairingDateLabel?.trim() || p.date?.trim() || "";
        let v = tripMsCache.get(label);
        if (v === undefined) {
          v = tradeboardReportDateMsFromLabel(label, anchor);
          tripMsCache.set(label, v);
        }
        return v;
      };
      list = list.filter((p) => {
        const ms = tripMs(p);
        return ms >= start && ms <= end;
      });
    } else if (chip === "This Month") {
      const monShort = anchor.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
      list = list.filter((p) => `${p.pairingDateLabel} ${p.date}`.toUpperCase().includes(monShort));
    }
  }
  return list;
}

const TB_DIGITAL = Platform.OS === "ios" ? "Menlo" : "monospace";

/**
 * TYPE / $ fixed. LAY + POSTER + RPT + ARR flex; no trailing chevron column.
 */
const TB_COL = {
  type: 52,
  worth: 19,
} as const;

/** Weighted flex shares — merged schedule column (R·C | D·A stacks). */
const TB_FLEX_LAY = { flexGrow: 15, flexShrink: 1, flexBasis: 0, minWidth: 0 } as const;
const TB_FLEX_POSTER = { flexGrow: 13, flexShrink: 1, flexBasis: 0, minWidth: 0 } as const;
const TB_FLEX_SCHED = { flexGrow: 22, flexShrink: 1, flexBasis: 0, minWidth: 0 } as const;

function tradeboardTypePillLabel(t: TradeboardPost["type"]): string {
  switch (t) {
    case "pickup":
      return "Pickup";
    case "drop":
      return "Drop";
    case "trade":
    case "swap":
      return "Trade";
    case "trade_drop":
      return "T/Drop";
    default:
      return "—";
  }
}

/** Map post type to filter tab so row badge colors match the post-type chips. */
function tradeboardTypeToPrimaryTab(t: TradeboardPost["type"]): PrimaryTab {
  switch (t) {
    case "pickup":
      return "pickups";
    case "drop":
      return "drops";
    case "trade":
      return "trade";
    case "trade_drop":
      return "trade_drop";
    case "swap":
      return "trade";
    default:
      return "all";
  }
}

/** Faint filter pill (mock bar) vs active red. */
function tradeboardFilterPillPalette(
  k: PrimaryTab,
  active: boolean,
): { bg: string; text: string; border: string } {
  if (active && k !== "post_trade") {
    return { bg: SCHEDULE_MOCK_HEADER_RED, text: "#fff", border: SCHEDULE_MOCK_HEADER_RED };
  }
  switch (k) {
    case "pickups":
      return { bg: "#DCFCE7", text: "#166534", border: "rgba(22, 101, 52, 0.18)" };
    case "trade":
      return { bg: "#DBEAFE", text: "#1E40AF", border: "rgba(30, 64, 175, 0.15)" };
    case "trade_drop":
      return { bg: "#EDE9FE", text: "#6D28D9", border: "rgba(109, 40, 217, 0.18)" };
    case "drops":
      return { bg: "#FFEDD5", text: "#C2410C", border: "rgba(194, 65, 12, 0.2)" };
    case "post_trade":
      return { bg: "#FCE7F3", text: "#BE185D", border: "rgba(190, 24, 93, 0.2)" };
    default:
      return { bg: "#F4F4F5", text: "#57534E", border: "#E4E4E7" };
  }
}

function formatTradeboardDatePillHeading(dateKey: string, anchor: Date): string {
  const ms = tradeboardReportDateMsFromLabel(dateKey, anchor);
  if (!Number.isFinite(ms) || ms >= Number.MAX_SAFE_INTEGER - 10_000) return dateKey;
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function tripReportHint(t: CrewScheduleTrip): string {
  const leg = t.legs[0];
  return String(leg?.reportLocal ?? "").trim();
}

function tripWorthHint(_t: CrewScheduleTrip): string {
  return "";
}

function tradeboardFlicaUriForSwipe(type: TradeboardPost["type"]): string {
  if (type === "swap" || type === "trade" || type === "trade_drop") {
    return FLICA_NATIVE_URLS.tradeMyResponses;
  }
  return FLICA_NATIVE_URLS.tradeFrame;
}

function tradeboardSwipePrimaryLabel(type: TradeboardPost["type"]): string {
  if (type === "drop") return "Pickup";
  if (type === "pickup") return "Respond";
  if (type === "swap" || type === "trade" || type === "trade_drop") return "Propose trade";
  return "Open";
}

function TradeboardFeedRowInner({
  p,
  router,
  onOpen,
  onTradeboardMutateWeb,
}: {
  p: TradeboardPost;
  router: ReturnType<typeof useRouter>;
  onOpen: (post: TradeboardPost) => void;
  onTradeboardMutateWeb: (uri: string) => void;
}) {
  const handlePress = useCallback(() => {
    onOpen(p);
  }, [onOpen, p]);
  const primaryUri = tradeboardFlicaUriForSwipe(p.type);
  const rowPal = tradeboardFilterPillPalette(tradeboardTypeToPrimaryTab(p.type), false);
  const pairingIdDisp = p.pairingId?.trim() || "—";
  const daysRaw = String(p.days ?? "").trim();
  const daysLine =
    daysRaw && /\d/.test(daysRaw) ? `${daysRaw} Day` : daysRaw || "—";
  const { reportTime: rpt, departTime: dep, arriveTime: arr, credit: cr } = tradeboardDisplayScheduleFields(p);

  const swipeActions: CrewHubSwipeRailAction[] = [
    {
      key: "primary",
      label: tradeboardSwipePrimaryLabel(p.type),
      onPress: () => onTradeboardMutateWeb(primaryUri),
      variant: "primary",
    },
    ...(p.type === "trade_drop"
      ? [
          {
            key: "pickup",
            label: "Pickup",
            onPress: () => onTradeboardMutateWeb(FLICA_NATIVE_URLS.tradeFrame),
            variant: "secondary",
          } satisfies CrewHubSwipeRailAction,
        ]
      : []),
  ];

  return (
    <Swipeable
      friction={1}
      overshootRight={false}
      rightThreshold={48}
      renderRightActions={(progress) => <CrewHubSwipeActionRail progress={progress} actions={swipeActions} />}
    >
      <Pressable onPress={handlePress} style={styles.tbRowCard}>
        <View style={styles.tbRowInner}>
          <View style={[styles.tbRowCell, { width: TB_COL.type }]}>
            <View style={styles.tbTypeCol}>
              <View
                style={[
                  styles.tbTypePillRow,
                  {
                    backgroundColor: rowPal.bg,
                    borderColor: rowPal.border,
                    borderWidth: StyleSheet.hairlineWidth,
                  },
                ]}
                accessibilityLabel={tradeboardTypeLabel(p.type)}
              >
                <Text
                  style={[styles.tbTypePillRowTxt, { color: rowPal.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.55}
                >
                  {tradeboardTypePillLabel(p.type)}
                </Text>
              </View>
            </View>
          </View>
          <View style={[styles.tbRowCell, TB_FLEX_LAY]}>
            <View style={styles.tbLayCol}>
              <Text
                style={styles.tbLay}
                numberOfLines={3}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {hubLayoverDisplayForHubListRow(p.layover)}
              </Text>
            </View>
          </View>
          <View style={[styles.tbRowCell, TB_FLEX_POSTER]}>
            <View style={styles.tbPosterPairCol}>
              <Text style={styles.tbPairingDaysTop} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.65}>
                {daysLine}
              </Text>
              <Text style={styles.tbPairingIdOnly} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                {pairingIdDisp}
              </Text>
              <Text style={styles.tbPosterName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.68}>
                {tradeboardPosterFirstName(p.posterName)}
              </Text>
            </View>
          </View>
          <View style={[styles.tbRowCell, TB_FLEX_SCHED]}>
            <View style={styles.tbSchedCol}>
              <View style={styles.tbStackPairBox}>
                <View style={styles.tbSchedRow}>
                  <View style={styles.tbPairTim} accessibilityLabel={`Report ${rpt} credit ${cr}`}>
                    <View style={styles.tbTimPairLine}>
                      <Text style={styles.tbTimIni}>R</Text>
                      <Text style={styles.tbTimVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                        {rpt}
                      </Text>
                    </View>
                    <View style={styles.tbHeadStackDividerH} />
                    <View style={styles.tbTimPairLine}>
                      <Text style={styles.tbTimIni}>C</Text>
                      <Text style={styles.tbTimVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                        {cr}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.tbSchedStackDivider} />
                  <View style={styles.tbPairTim} accessibilityLabel={`Depart ${dep} arrive ${arr}`}>
                    <View style={styles.tbTimPairLine}>
                      <Text style={styles.tbTimIni}>D</Text>
                      <Text style={styles.tbTimVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                        {dep}
                      </Text>
                    </View>
                    <View style={styles.tbHeadStackDividerH} />
                    <View style={styles.tbTimPairLine}>
                      <Text style={styles.tbTimIni}>A</Text>
                      <Text style={styles.tbTimVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                        {arr}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>
          <View style={[styles.tbRowCell, styles.tbRowCellLast, { width: TB_COL.worth }]}>
            <View style={styles.tbWorthCol}>
              <Text style={styles.tbWorth} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.55}>
                {p.worth?.trim() ? p.worth : "—"}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}

const TradeboardFeedRow = React.memo(TradeboardFeedRowInner);

type TradeboardDeferredGroupedListProps = {
  allPosts: TradeboardPost[];
  myPosts: TradeboardPost[];
  responsePosts: TradeboardPost[];
  tradeFeedTab: TradeFeedTab;
  primaryTab: PrimaryTab;
  chip: string;
  search: string;
  loading: boolean;
  listHeadingDate: string;
  openTradeboardDetail: (p: TradeboardPost) => void;
  onTradeboardMutateWeb: (uri: string) => void;
};

/**
 * Filter + group work runs off deferred copies of tab/chip/search so type and
 * time pills can paint before reconciling every Swipeable row.
 */
const TradeboardDeferredGroupedList = React.memo(function TradeboardDeferredGroupedList({
  allPosts,
  myPosts,
  responsePosts,
  tradeFeedTab,
  primaryTab,
  chip,
  search,
  loading,
  listHeadingDate,
  openTradeboardDetail,
  onTradeboardMutateWeb,
}: TradeboardDeferredGroupedListProps) {
  const router = useRouter();

  const deferredPrimaryTab = useDeferredValue(primaryTab);
  const deferredChip = useDeferredValue(chip);

  const filtered = useMemo(
    () =>
      buildTradeboardFilteredList(
        allPosts,
        myPosts,
        responsePosts,
        tradeFeedTab,
        deferredPrimaryTab,
        search,
        deferredChip,
      ),
    [allPosts, myPosts, responsePosts, tradeFeedTab, deferredPrimaryTab, search, deferredChip],
  );

  const tbDateGroups = useMemo(() => groupTradeboardByDate(filtered, new Date()), [filtered]);

  return (
    <>
      <View style={styles.listHead}>
        <Text style={styles.listHeadTitle}>Tradeboard · {listHeadingDate}</Text>
        <Text style={styles.listHeadCount}>{filtered.length} total</Text>
      </View>

      {loading && filtered.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={SCHEDULE_MOCK_HEADER_RED} />
      ) : null}

      {tbDateGroups.map((grp) =>
        grp.items.length === 0 ? null : (
          <View key={grp.key} style={styles.tbDateSection}>
            <View style={styles.tbDateHeadRow}>
              <View style={styles.tbDatePill}>
                <Ionicons name="calendar-outline" size={11} color="#FFFFFF" style={styles.tbDatePillIon} />
                <Text style={styles.tbDatePillText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                  {formatTradeboardDatePillHeading(grp.key, new Date())}
                </Text>
              </View>
              <View style={styles.tbDateHeadTrail}>
                <View style={styles.tbDateRule} />
                <Text style={styles.tbDateSectionCount}>
                  {grp.items.length} trip{grp.items.length === 1 ? "" : "s"}
                </Text>
              </View>
            </View>
            <View style={styles.tbCardShell}>
              <View style={styles.tbColHead}>
                <View style={[styles.tbColHeadCell, { width: TB_COL.type }]}>
                  <Text style={styles.tbBarColTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>
                    TYPE
                  </Text>
                </View>
                <View style={[styles.tbColHeadCell, TB_FLEX_LAY]}>
                  <Text style={styles.tbBarColTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>
                    LAYOVER
                  </Text>
                </View>
                <View style={[styles.tbColHeadCell, styles.tbColHeadPoster, TB_FLEX_POSTER]}>
                  <Text style={styles.tbBarColTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                    PAIRING
                  </Text>
                  <View style={styles.tbHeadStackDividerH} />
                  <Text style={styles.tbBarColTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                    POSTER
                  </Text>
                </View>
                <View style={[styles.tbColHeadCell, TB_FLEX_SCHED]}>
                  <View style={styles.tbSchedHeadInset}>
                    <View style={styles.tbSchedHeadRow}>
                      <View style={styles.tbSchedHeadCell}>
                        <Text style={styles.tbBarColTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                          Report
                        </Text>
                        <View style={styles.tbHeadStackDividerH} />
                        <Text style={styles.tbBarColTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                          Credit
                        </Text>
                      </View>
                      <View style={styles.tbSchedHeadColDivider} />
                      <View style={styles.tbSchedHeadCell}>
                        <Text style={styles.tbBarColTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                          Depart
                        </Text>
                        <View style={styles.tbHeadStackDividerH} />
                        <Text style={styles.tbBarColTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                          Arrival
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View style={[styles.tbColHeadCell, styles.tbColHeadCellLast, styles.tbColHeadWorth, { width: TB_COL.worth }]}>
                  <Text style={styles.tbBarColTitle} numberOfLines={1}>
                    $
                  </Text>
                </View>
              </View>
              {grp.items.map((p) => (
                <TradeboardFeedRow
                  key={p.id}
                  p={p}
                  router={router}
                  onOpen={openTradeboardDetail}
                  onTradeboardMutateWeb={onTradeboardMutateWeb}
                />
              ))}
            </View>
          </View>
        ),
      )}
      <View style={{ height: 24 }} />
    </>
  );
});

export default function TradeboardTabScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const isFocused = useIsFocused();
  const { setCrewScheduleHeaderSubtitle, bumpCrewHubSharedDataRefresh } = useCrewScheduleHeaderBridge();
  const { stripValues, monthTrips, year, month } = useCrewScheduleMonthStrip();

  const [profileBase, setProfileBase] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>("all");
  const [search, setSearch] = useState("");
  const [chip, setChip] = useState<string>("All");
  const [loading, setLoading] = useState(false);
  const [allPosts, setAllPosts] = useState<TradeboardPost[]>([]);
  const [myPosts, setMyPosts] = useState<TradeboardPost[]>([]);
  const [responsePosts, setResponsePosts] = useState<TradeboardPost[]>([]);
  const [tradeFeedTab, setTradeFeedTab] = useState<TradeFeedTab>("all");
  const [marketplaceDetail, setMarketplaceDetail] = useState<FlicaMarketplacePairingDetail | null>(null);
  const [hubMarketplaceLoading, setHubMarketplaceLoading] = useState(false);
  const [hubLiveMarketplaceSyncAt, setHubLiveMarketplaceSyncAt] = useState<string | null>(null);

  const tradeboardMonthFallback = useMemo(
    () => `${year}-${String(month).padStart(2, "0")}`,
    [year, month],
  );

  const [toast, setToast] = useState<string | null>(null);
  const [pullSessionRunnerActive, setPullSessionRunnerActive] = useState(false);
  const pullSessionWaitersRef = useRef<{
    resolve: () => void;
    reject: (e: Error) => void;
  } | null>(null);
  const loadRef = useRef<(reason: "pull" | "focus") => Promise<void>>(async () => {});
  const focusLoadGenRef = useRef(0);
  const focusLoadInFlightRef = useRef(false);
  const cacheHydratedRef = useRef<string | null>(null);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid || cacheHydratedRef.current === uid) return;
    cacheHydratedRef.current = uid;
    void loadTradeboardHubCache(uid).then((c) => {
      if (!c) return;
      setAllPosts((prev) => (prev.length === 0 && c.allPosts.length > 0 ? c.allPosts : prev));
      setMyPosts((prev) => (prev.length === 0 && c.myPosts.length > 0 ? c.myPosts : prev));
    });
  }, [session?.user?.id]);

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

  /**
   * Pull: FLICA session runner + toast. Focus: silent background refresh — update list only on success.
   */
  const load = useCallback(async (reason: "pull" | "focus" = "focus") => {
    const focusGen = reason === "focus" ? ++focusLoadGenRef.current : 0;
    if (reason === "focus") {
      if (focusLoadInFlightRef.current) return;
      focusLoadInFlightRef.current = true;
    }
    if (reason === "pull") {
      setLoading(true);
    }
    let didUpdate = false;
    try {
      if (reason === "pull") {
        logCrewHubAuth("schedule_import_session_flow_start", { context: "tradeboard" });
        await new Promise<void>((resolve, reject) => {
          pullSessionWaitersRef.current = { resolve, reject };
          setPullSessionRunnerActive(true);
        });
      }

      let allR: Awaited<ReturnType<typeof nativeFetchTradeBoardAllRequests>>;
      let myR: Awaited<ReturnType<typeof nativeFetchTradeBoardMyRequests>>;
      let favR: Awaited<ReturnType<typeof nativeFetchTradeBoardFavorites>> | undefined;
      let respR: Awaited<ReturnType<typeof nativeFetchTradeBoardMyResponses>>;

      const fetchOpts = {
        base: profileBase,
        position: formatRoleForHeader(profileRole ?? ""),
      };
      if (__DEV__) {
        [allR, myR, favR, respR] = await Promise.all([
          nativeFetchTradeBoardAllRequests(fetchOpts),
          nativeFetchTradeBoardMyRequests(),
          nativeFetchTradeBoardFavorites(),
          nativeFetchTradeBoardMyResponses(),
        ]);
      } else {
        favR = undefined;
        [allR, myR, respR] = await Promise.all([
          nativeFetchTradeBoardAllRequests(fetchOpts),
          nativeFetchTradeBoardMyRequests(),
          nativeFetchTradeBoardMyResponses(),
        ]);
      }
      logCrewHubAuth("native_fetch_done", {
        context: "tradeboard",
        phase: reason,
        allHtmlLen: allR.htmlLength ?? 0,
        myHtmlLen: myR.htmlLength ?? 0,
        allState: allR.htmlState,
        myState: myR.htmlState,
        allRows: allR.rowCount ?? 0,
        myRows: myR.rowCount ?? 0,
      });

      const allFb = mapTradeboardPostsWithHtmlFallback(
        allR.nativeParse?.rows ?? [],
        allR,
        "all_requests",
        allR.url,
      );
      const myFb = mapTradeboardPostsWithHtmlFallback(
        myR.nativeParse?.rows ?? [],
        myR,
        "my_requests",
        myR.url,
      );
      const mappedAllPre = allFb.posts;
      const mappedMyPre = myFb.posts;

      const respFb = mapTradeboardPostsWithHtmlFallback(
        respR.nativeParse?.rows ?? [],
        respR,
        "all_requests",
        respR.url,
      );
      const mappedRespPre = respFb.posts;

      const fetches = [
        buildCrewHubParseDebugFetchEntry("My Requests", myR, mappedMyPre),
        buildCrewHubParseDebugFetchEntry("All Requests", allR, mappedAllPre),
        buildCrewHubParseDebugFetchEntry("My Responses", respR, mappedRespPre),
      ];
      if (__DEV__ && favR) {
        const mappedFav = mapTradeboardPostsWithHtmlFallback(
          favR.nativeParse?.rows ?? [],
          favR,
          "all_requests",
          favR.url,
        ).posts;
        fetches.push(buildCrewHubParseDebugFetchEntry("Favorites", favR, mappedFav));
      }
      const pl: FlicaCrewHubParseDebugPayload = {
        screen: "tradeboard",
        refreshedAt: new Date().toISOString(),
        loadReason: reason,
        note:
          __DEV__ && favR
            ? "__DEV__: Favorites native fetch included (not run in production)."
            : "Production: My Requests + All Requests + My Responses native fetches.",
        fetches,
        tradeboardFallback: {
          allRequests: allFb.meta,
          myRequests: myFb.meta,
        },
      };
      commitTradeboardParseDebugSnapshot(pl);
      if (__DEV__) {
        console.log("[FC_TRADEBOARD_PARSE_DEBUG]", JSON.stringify(pl));
      }

      const needVerification =
        crewHubNativeFetchNeedsVerificationSheet(allR) ||
        crewHubNativeFetchNeedsVerificationSheet(myR) ||
        crewHubNativeFetchNeedsVerificationSheet(respR);

      if (needVerification) {
        logCrewHubAuth("native_needs_verification", {
          context: "tradeboard",
          afterPullSession: reason === "pull",
        });
        return;
      }

      const mappedAll = mappedAllPre;
      const mappedMy = mappedMyPre;
      const refreshOk =
        allR.ok &&
        myR.ok &&
        respR.ok &&
        !flicaFetchNeedsWebVerification(allR.htmlState) &&
        !flicaFetchNeedsWebVerification(myR.htmlState) &&
        !flicaFetchNeedsWebVerification(respR.htmlState);

      if (!refreshOk) {
        return;
      }

      if (reason === "focus" && focusGen !== focusLoadGenRef.current) {
        return;
      }

      setHubLiveMarketplaceSyncAt(new Date().toISOString());
      logCrewHubAuth("parse_done", {
        context: "tradeboard",
        allMappedRows: mappedAll.length,
        myMappedRows: mappedMy.length,
      });
      setAllPosts(mappedAll);
      setMyPosts(mappedMy);
      setResponsePosts(mappedRespPre);
      didUpdate = true;

      if (session?.user?.id) {
        void upsertTradeboardHubCache(session.user.id, {
          v: 1,
          myPosts: mappedMy,
          allPosts: mappedAll,
          refreshedAt: new Date().toISOString(),
        });
      }
      if (reason === "pull") {
        setToast("Tradeboard refreshed");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes("cancelled")) {
        logCrewHubAuth("native_fetch_failed", { context: "tradeboard", phase: reason, message: msg });
      }
    } finally {
      if (reason === "focus") {
        focusLoadInFlightRef.current = false;
      }
      if (reason === "pull") {
        setLoading(false);
      }
      if (didUpdate && reason === "pull") {
        bumpCrewHubSharedDataRefresh();
      }
    }
  }, [bumpCrewHubSharedDataRefresh, session?.user?.id, profileBase, profileRole]);

  loadRef.current = load;

  const runTradeboardMutatingWeb = useCallback(
    (uri: string) => {
      pushFlicaWeb(router, uri);
    },
    [router],
  );

  const openTradeboardMarketplace = useCallback(
    async (p: TradeboardPost) => {
      const url = resolveCrewHubTradeboardPairingDetailUrl(p, year)?.trim();
      if (!url) {
        Alert.alert(
          "Cannot open pairing detail",
          "This row does not have enough pairing and date information to build a FLICA detail link.",
        );
        return;
      }
      console.log(
        "[FC_TRADEBOARD_ROW_TAP_DETAIL]",
        JSON.stringify({
          selectedRowPairingId: p.pairingId,
          selectedRowPairingDetailUrl: p.pairingDetailUrl,
          pairingDetailUrlFromLiveHtml: p.pairingDetailUrlFromLiveHtml,
          finalFetchUrl: url,
        }),
      );
      setHubMarketplaceLoading(true);
      try {
        const d = await fetchFlicaMarketplacePairingDetail(url, "tradeboard", {
          referer: p.sourceUrl?.trim() || undefined,
          monthFallback: tradeboardMonthFallback,
          debugRow: {
            pairingId: p.pairingId,
            date: p.pairingDateLabel,
            pairingDetailUrl: p.pairingDetailUrl,
            dateYmd: p.dateYmd,
            pairingDetailUrlFromLiveHtml: p.pairingDetailUrlFromLiveHtml,
            urlIsSyntheticFallback: !p.pairingDetailUrl?.trim(),
          },
        });
        setMarketplaceDetail(d);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/FLICA_APPLICATION_OR_SESSION_ERROR/i.test(msg)) {
          Alert.alert(
            "Tradeboard detail",
            "This Tradeboard detail needs a fresh FLICA refresh. Pull to refresh and try again.",
            [
              { text: "OK", style: "cancel" },
              { text: "Refresh", onPress: () => void load("pull") },
            ],
          );
        } else {
          Alert.alert("Pairing detail failed", msg);
        }
      } finally {
        setHubMarketplaceLoading(false);
      }
    },
    [load, tradeboardMonthFallback, year],
  );

  const openTradeboardDetail = openTradeboardMarketplace;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const task = InteractionManager.runAfterInteractions(() => {
        if (!cancelled) void loadRef.current("focus");
      });
      return () => {
        cancelled = true;
        task.cancel();
        focusLoadGenRef.current += 1;
        setCrewScheduleHeaderSubtitle(null);
      };
    }, [setCrewScheduleHeaderSubtitle]),
  );

  const activeCount = myPosts.length;
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
    const t = monthTrips.find((x: CrewScheduleTrip) => iso >= x.startDate && iso <= x.endDate);
    if (t) return { kind: "trip" as const, trip: t };
    return null;
  }, [activePost, monthTrips]);

  const bestMatch = useMemo(() => {
    const candidates = allPosts.filter(
      (p) => p.type === "swap" || p.type === "trade" || p.type === "trade_drop",
    );
    return candidates[0] ?? null;
  }, [allPosts]);

  const listHeadingDate = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const chips = ["All", "Today", "This Week", "This Month"];

  return (
    <View style={styles.screen}>
      <FlicaCrewHubScheduleSessionRunner
        active={pullSessionRunnerActive}
        purposeLabel="Refreshing Tradeboard"
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
        removeClippedSubviews={Platform.OS === "android"}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load("pull")} />
        }
      >
        <View style={styles.tbSubnavShell}>
          <View style={styles.tbSubnavRow}>
            {(
              [
                ["my", "My Requests", "person-outline" as const],
                ["all", "All Requests", "list-outline" as const],
                ["responses", "My Responses", "chatbubbles-outline" as const],
              ] as const
            ).map(([k, label, icon]) => {
              const on = tradeFeedTab === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setTradeFeedTab(k)}
                  style={[styles.tbSeg, on && styles.tbSegOn]}
                >
                  <Ionicons name={icon} size={14} color={on ? SCHEDULE_MOCK_HEADER_RED : "#64748b"} />
                  <Text style={[styles.tbSegTxt, on && styles.tbSegTxtOn]} numberOfLines={2}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              style={styles.tbSeg}
              onPress={() => runTradeboardMutatingWeb(FLICA_NATIVE_URLS.tradePostRequest)}
            >
              <Ionicons name="add-circle-outline" size={14} color="#64748b" />
              <Text style={styles.tbSegTxt} numberOfLines={2}>
                Post a Request
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.tbTypePillsRow}>
          {(
            [
              ["all", "All"],
              ["pickups", "Pickup"],
              ["trade", "Trade"],
              ["trade_drop", "T/Drop"],
              ["drops", "Drop"],
              ["post_trade", "Propose"],
            ] as const
          ).map(([k, label]) => {
            const active = primaryTab === k;
            const pal = tradeboardFilterPillPalette(k, active);
            return (
              <Pressable
                key={k}
                accessibilityLabel={
                  k === "post_trade"
                    ? "Propose trade"
                    : k === "trade_drop"
                      ? "Trade/Drop"
                      : label
                }
                onPress={() => {
                  if (k === "post_trade") {
                    runTradeboardMutatingWeb(FLICA_NATIVE_URLS.tradePostRequest);
                    return;
                  }
                  setPrimaryTab(k);
                }}
                style={[
                  styles.tbTypeFilterPill,
                  {
                    backgroundColor: pal.bg,
                    borderColor: pal.border,
                  },
                ]}
              >
                <Text
                  style={[styles.tbTypeFilterPillTxt, { color: pal.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              placeholder="Search pairing, layover, poster..."
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

        <View style={styles.timePillsRow}>
          {chips.map((c) => (
            <Pressable
              key={c}
              onPress={() => setChip(c)}
              style={[styles.timePill, chip === c && styles.timePillOn]}
            >
              <Text
                style={[styles.timePillTxt, chip === c && styles.timePillTxtOn]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {c}
              </Text>
            </Pressable>
          ))}
        </View>

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
                  {activePost.date || "—"} · {activePost.typeLabel} ·{" "}
                  {activePost.worth ?? "—"} · {activePost.credit || "—"} CR
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
                  {bestMatch.matchScore != null
                    ? `TOP SWAP MATCH · ${bestMatch.matchScore}% COMPATIBILITY`
                    : "TOP SWAP MATCH"}
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
                      ? giveDisplay.post.worth ?? "—"
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
                    Rpt {bestMatch.reportTime || "—"} · {bestMatch.worth ?? "—"}
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
                    runTradeboardMutatingWeb(FLICA_NATIVE_URLS.tradeMyResponses);
                  }}
                >
                  <Text style={styles.btnRequestText}>Request Trade</Text>
                </Pressable>
                <Pressable
                  style={styles.btnView}
                  onPress={() => openTradeboardDetail(bestMatch)}
                >
                  <Text style={styles.btnViewText}>View Trip</Text>
                </Pressable>
              </View>
              {bestMatch.posterName ? (
                <Text style={styles.posterFoot}>
                  Posted by {tradeboardPosterFirstName(bestMatch.posterName)}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <TradeboardDeferredGroupedList
          allPosts={allPosts}
          myPosts={myPosts}
          responsePosts={responsePosts}
          tradeFeedTab={tradeFeedTab}
          primaryTab={primaryTab}
          chip={chip}
          search={search}
          loading={loading}
          listHeadingDate={listHeadingDate}
          openTradeboardDetail={openTradeboardDetail}
          onTradeboardMutateWeb={runTradeboardMutatingWeb}
        />
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
  hubMarketplaceLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.72)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  scroll: { flex: 1 },
  tbTypePillsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    marginHorizontal: 8,
    marginTop: 8,
    gap: 3,
  },
  tbTypeFilterPill: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    maxHeight: 28,
  },
  tbTypeFilterPillTxt: { fontSize: 7, fontWeight: "800", letterSpacing: -0.35, textAlign: "center" },
  timePillsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 8,
    marginTop: 5,
    gap: 4,
  },
  timePill: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: "#F4F4F5",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E4E4E7",
    alignItems: "center",
    justifyContent: "center",
    maxHeight: 28,
  },
  timePillOn: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    borderColor: SCHEDULE_MOCK_HEADER_RED,
  },
  timePillTxt: { fontSize: 7, fontWeight: "800", color: "#78716c", textAlign: "center" },
  timePillTxtOn: { color: "#fff" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    marginTop: 6,
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
  tbSubnavShell: {
    marginHorizontal: 10,
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e7e5e4",
    paddingVertical: 6,
    paddingHorizontal: 4,
    ...Platform.select({
      ios: {
        shadowColor: "#57534e",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  tbSubnavRow: { flexDirection: "row", alignItems: "stretch" },
  tbSeg: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    gap: 3,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tbSegOn: { borderBottomColor: SCHEDULE_MOCK_HEADER_RED },
  tbSegTxt: {
    fontSize: 8,
    fontWeight: "700",
    color: "#64748b",
    textAlign: "center",
    lineHeight: 10,
  },
  tbSegTxtOn: { color: SCHEDULE_MOCK_HEADER_RED, fontWeight: "800" },
  tbDateSection: {
    marginTop: 18,
    paddingHorizontal: 10,
    alignSelf: "stretch",
    ...Platform.select({
      ios: {
        shadowColor: "#78716c",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  tbDateHeadRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  tbDatePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    backgroundColor: SCHEDULE_MOCK_STATS_STRIP_RED,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    maxWidth: "70%",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    ...Platform.select({
      ios: {
        shadowColor: "#2a0a0c",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.14,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  tbDatePillIon: { marginRight: -1 },
  /** Same size/weight as column titles (`tbBarColTitle`); color only differs on pill. */
  tbDatePillText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    flexShrink: 1,
    letterSpacing: 0.2,
    lineHeight: 14,
    textAlign: "center",
    textTransform: "uppercase",
  },
  tbDateHeadTrail: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 12,
    minWidth: 0,
  },
  tbDateRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    minHeight: 1,
    backgroundColor: "rgba(176, 24, 26, 0.2)",
  },
  tbDateSectionCount: {
    marginLeft: 10,
    fontSize: 12,
    fontWeight: "400",
    letterSpacing: 0,
    color: "#94a3b8",
    textAlign: "right",
    flexShrink: 0,
  },
  tbCardShell: {
    alignSelf: "stretch",
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.16)",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  tbColHead: {
    flexDirection: "row",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    gap: 0,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: "#F4F4F5",
  },
  tbColHeadCell: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    minWidth: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(120, 113, 108, 0.32)",
  },
  tbColHeadCellLast: {
    borderRightWidth: 0,
  },
  tbColHeadWorth: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 0,
    flexShrink: 0,
  },
  tbColHeadPoster: {
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
    minWidth: 0,
  },
  /** One typographic style for every label in the grey column title bar. */
  tbBarColTitle: {
    width: "100%",
    fontSize: 8,
    fontWeight: "800",
    color: "#57534E",
    letterSpacing: 0.2,
    textAlign: "center",
    textTransform: "uppercase",
    lineHeight: 11,
  },
  tbHeadStackDividerH: {
    height: StyleSheet.hairlineWidth,
    minHeight: 1,
    width: "88%",
    maxWidth: 56,
    backgroundColor: "rgba(120, 113, 108, 0.32)",
    marginVertical: 2,
    alignSelf: "center",
  },
  tbSchedHeadRow: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    minWidth: 0,
    gap: 0,
  },
  /** Matches `tbStackPairBox` padding so schedule header vertical rule lines up with rows. */
  tbSchedHeadInset: {
    width: "100%",
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  tbSchedHeadCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    paddingHorizontal: 0,
  },
  tbSchedHeadColDivider: {
    width: StyleSheet.hairlineWidth,
    minWidth: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(120, 113, 108, 0.32)",
    marginVertical: 3,
  },
  tbRowCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(176, 24, 26, 0.1)",
  },
  tbRowInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    alignSelf: "stretch",
    width: "100%",
    gap: 0,
    paddingVertical: 5,
    paddingHorizontal: 4,
    minHeight: 50,
  },
  tbRowCell: {
    justifyContent: "flex-start",
    alignItems: "stretch",
    paddingHorizontal: 3,
    minWidth: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(120, 113, 108, 0.32)",
  },
  tbRowCellLast: {
    borderRightWidth: 0,
  },
  tbTypeCol: {
    justifyContent: "flex-start",
    alignItems: "stretch",
    paddingTop: 1,
    width: "100%",
    alignSelf: "stretch",
  },
  tbTypePillRow: {
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 3,
    minHeight: 19,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: "100%",
  },
  tbTypePillRowTxt: {
    fontSize: 5.75,
    fontWeight: "800",
    letterSpacing: -0.35,
    textAlign: "center",
  },
  tbLayCol: {
    justifyContent: "flex-start",
    paddingRight: 0,
    alignItems: "center",
    alignSelf: "stretch",
    paddingTop: 1,
    width: "100%",
  },
  tbLay: {
    fontSize: 8,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 12,
    writingDirection: "ltr",
    textAlign: "center",
    alignSelf: "stretch",
    width: "100%",
  },
  tbPosterPairCol: {
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 0,
    paddingTop: 1,
    alignSelf: "stretch",
    width: "100%",
  },
  tbPairingDaysTop: {
    fontSize: 8,
    fontWeight: "900",
    color: "#0f172a",
    lineHeight: 12,
    textAlign: "center",
    width: "100%",
  },
  tbPosterName: {
    marginTop: 2,
    fontSize: 7,
    fontWeight: "500",
    color: "#0f172a",
    letterSpacing: 0.08,
    textTransform: "uppercase",
    lineHeight: 10,
    textAlign: "center",
    width: "100%",
  },
  tbPairingIdOnly: {
    marginTop: 2,
    fontSize: 7,
    fontWeight: "500",
    color: "#64748b",
    letterSpacing: -0.05,
    lineHeight: 10,
    textAlign: "center",
    width: "100%",
  },
  tbSchedCol: {
    justifyContent: "flex-start",
    alignItems: "stretch",
    paddingHorizontal: 0,
    paddingTop: 1,
    width: "100%",
    alignSelf: "stretch",
    flex: 1,
    minWidth: 0,
  },
  tbStackPairBox: {
    alignSelf: "stretch",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(28, 25, 23, 0.12)",
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
    backgroundColor: "#fafaf9",
  },
  tbSchedRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 0,
  },
  tbSchedStackDivider: {
    width: StyleSheet.hairlineWidth,
    minWidth: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(120, 113, 108, 0.32)",
    marginHorizontal: 0,
    marginVertical: 1,
  },
  tbPairTim: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingVertical: 1,
    alignItems: "center",
  },
  tbTimPairLine: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 14,
    gap: 3,
    alignSelf: "stretch",
    width: "100%",
  },
  tbTimIni: {
    width: 9,
    fontSize: 7,
    fontWeight: "800",
    color: "#64748b",
    textAlign: "center",
    fontFamily: TB_DIGITAL,
    fontVariant: ["tabular-nums"],
  },
  tbTimVal: {
    flex: 1,
    minWidth: 0,
    fontSize: 9,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.15,
    fontFamily: TB_DIGITAL,
    fontVariant: ["tabular-nums"],
  },
  tbWorthCol: {
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 0,
    paddingTop: 1,
    flexShrink: 0,
    width: "100%",
    alignSelf: "stretch",
  },
  tbWorth: {
    fontSize: 6.5,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    width: "100%",
    fontVariant: ["tabular-nums"],
    fontFamily: TB_DIGITAL,
    lineHeight: 11,
  },
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
    borderWidth: 1,
    borderColor: CREW_HUB_CARD_RIM,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#2a0a0c",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  matchBanner: { backgroundColor: SCHEDULE_MOCK_STATS_STRIP_RED, paddingVertical: 6, paddingHorizontal: 10 },
  matchBannerText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  matchCols: { flexDirection: "row", alignItems: "center", padding: 10, gap: 4 },
  matchCol: { flex: 1, minWidth: 0 },
  matchColLabel: { fontSize: 8, color: "#78716c", fontWeight: "700", marginBottom: 4 },
  matchColMain: { fontSize: 12, fontWeight: "800", color: "#1c1917" },
  matchColSub: { fontSize: 9, color: "#78716c", marginTop: 2 },
  matchArrow: { fontSize: 16, color: SCHEDULE_MOCK_HEADER_RED, paddingHorizontal: 2 },
  deltaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 10,
    paddingBottom: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(92, 16, 24, 0.1)",
    paddingTop: 8,
    backgroundColor: "rgba(250, 250, 249, 0.9)",
  },
  deltaItem: { fontSize: 9 },
  deltaLabel: { color: "#78716c", fontWeight: "700" },
  deltaNeg: { color: "#b91c1c", fontWeight: "800" },
  deltaPos: { color: "#15803d", fontWeight: "800" },
  matchActions: { flexDirection: "row", gap: 8, paddingHorizontal: 10, paddingBottom: 10 },
  btnRequest: {
    flex: 1,
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
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
    borderColor: CREW_HUB_CARD_RIM,
  },
  btnViewText: { color: SCHEDULE_MOCK_HEADER_RED, fontSize: 11, fontWeight: "800" },
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
  modalKv: { fontSize: 12, color: "#111827", marginBottom: 4, fontWeight: "600" },
  modalBody: { fontSize: 11, color: "#374151" },
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
