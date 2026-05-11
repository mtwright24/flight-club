import React, { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import type { FlicaCalendarListModel } from "../flicaCalendarDisplaySource";
import { type DayRow } from "../modernClassic/classicMonthGridCore";
import {
    additionalLegsSummary,
    primaryDayRoute,
    tripCreditDisplay,
} from "../modernClassic/modernClassicDayDisplay";
import {
    buildModernDayCountAudit,
    type ModernRowDayMeta,
} from "../modernClassic/modernListPairingSequence";
import {
    ModernPairingRailBridge,
    ModernPairingRailColumn,
} from "../modernClassic/ModernPairingRailColumn";
import { computeModernPairingRailLayout } from "../modernClassic/modernPairingRailLayout";
import { useClassicMonthDayRows } from "../modernClassic/useClassicMonthDayRows";
import { SCHEDULE_MOCK_HEADER_RED } from "../scheduleMockPalette";
import { scheduleTheme as T } from "../scheduleTheme";
import {
    PAIRING_DETAIL_STAT_DIGIT_TRACKING,
    PAIRING_DETAIL_STAT_DIGIT_TYPE,
} from "../scheduleTileNumerals";
import { mergeLayoverOntoLegDates } from "../scheduleTime";
import { stashTripForDetailNavigation } from "../tripDetailNavCache";
import type { CrewScheduleTrip, ScheduleMonthMetrics } from "../types";
import TripQuickPreviewSheet from "./TripQuickPreviewSheet";

/** Pairing row: avoid "800" — on Android default sans-serif often ignores light weights. */
const PAIRING_CODE_TYPE = Platform.select({
  android: { fontFamily: "sans-serif-light", fontWeight: "normal" as const },
  ios: { fontWeight: "500" as const },
  default: { fontWeight: "500" as const },
});
const PAIRING_DAY_TYPE = Platform.select({
  android: { fontFamily: "sans-serif-thin", fontWeight: "normal" as const },
  ios: { fontWeight: "400" as const },
  default: { fontWeight: "400" as const },
});
const ROUTE_TYPE = Platform.select({
  android: { fontFamily: "sans-serif-light", fontWeight: "normal" as const },
  ios: { fontWeight: "500" as const },
  default: { fontWeight: "500" as const },
});

/** Compact duty time for mock (e.g. 1930L). */
function fmtDutyClock(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  const dup = s.match(/^(\d{4})L+$/i);
  if (dup) return `${dup[1]}L`;
  if (/^\d{4}$/.test(s)) return `${s}L`;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hh = m[1]!.padStart(2, "0");
    const mm = m[2]!;
    return `${hh}${mm}L`;
  }
  if (/L$/i.test(s)) return s.replace(/l$/i, "L");
  return `${s}L`;
}

function modernNonEmptyLabel(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "-" && text !== "—" && text !== "–") return text;
  }
  return "";
}

const MODERN_DOW = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function modernIsoDateFromLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function modernMonthDates(year: number, month: number): string[] {
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return Array.from(
    { length: last },
    (_, i) => `${year}-${mm}-${String(i + 1).padStart(2, "0")}`,
  );
}

function modernEmptyDayRow(dateIso: string, todayIso: string): DayRow {
  const d = new Date(`${dateIso}T12:00:00`);
  const dayIdx = d.getDay();
  return {
    id: `modern-empty:${dateIso}`,
    dateIso,
    kind: "off",
    trip: null,
    dayCode: MODERN_DOW[dayIdx] ?? "",
    dayNum: d.getDate(),
    isWeekend: dayIdx === 0 || dayIdx === 6,
    pairingText: "",
    reportText: "",
    cityText: "",
    dEndText: "",
    layoverText: "",
    wxText: "",
    statusText: "",
    reportMinutes: null,
    releaseMinutes: null,
    isToday: dateIso === todayIso,
    groupedWithPrev: false,
    groupedWithNext: false,
  };
}

function ensureModernVisibleMonthDateRows(
  rows: DayRow[],
  year: number,
  month: number,
): DayRow[] {
  const visibleYm = `${year}-${String(month).padStart(2, "0")}`;
  const present = new Set(
    rows
      .map((row) => row.dateIso.slice(0, 10))
      .filter((dateIso) => dateIso.slice(0, 7) === visibleYm),
  );
  const todayIso = modernIsoDateFromLocalDate(new Date());
  const additions = modernMonthDates(year, month)
    .filter((dateIso) => !present.has(dateIso))
    .map((dateIso) => modernEmptyDayRow(dateIso, todayIso));
  if (!additions.length) return rows;

  const originalOrder = new Map(rows.map((row, idx) => [row.id, idx]));
  return [...rows, ...additions].sort((a, b) => {
    const da = a.dateIso.slice(0, 10);
    const db = b.dateIso.slice(0, 10);
    if (da !== db) return da.localeCompare(db);
    return (originalOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (originalOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER);
  });
}

function modernPairingCodeForRenderedSpan(row: DayRow): string {
  const fromRow = String(row.pairingText ?? "")
    .trim()
    .toUpperCase()
    .split("·")[0]
    ?.trim() ?? "";
  if (fromRow && fromRow !== "-" && fromRow !== "—" && fromRow !== "–" && fromRow !== "CONT") {
    return fromRow;
  }
  const fromTrip = String(row.trip?.pairingCode ?? "")
    .trim()
    .toUpperCase()
    .split("·")[0]
    ?.trim() ?? "";
  if (fromTrip && fromTrip !== "-" && fromTrip !== "—" && fromTrip !== "–" && fromTrip !== "CONT") {
    return fromTrip;
  }
  return "";
}

function modernRenderedDatesBetween(first: string, last: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || !/^\d{4}-\d{2}-\d{2}$/.test(last)) {
    return [];
  }
  if (last < first) return [];
  const out: string[] = [];
  const cur = new Date(`${first}T12:00:00`);
  const end = new Date(`${last}T12:00:00`);
  while (cur <= end) {
    out.push(modernIsoDateFromLocalDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function modernRenderedRailPosition(
  dayNumber: number,
  totalDays: number,
): ModernRowDayMeta["railSegmentPosition"] {
  if (totalDays <= 0 || dayNumber <= 0) return null;
  if (totalDays === 1) return "single";
  if (dayNumber === 1) return "start";
  if (dayNumber === totalDays) return "end";
  return "middle";
}

function modernRenderedDayDiff(first: string, second: string): number {
  const a = new Date(`${first}T12:00:00`);
  const b = new Date(`${second}T12:00:00`);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / 864e5);
}

function modernRenderedAddDays(first: string, days: number): string {
  const d = new Date(`${first}T12:00:00`);
  d.setDate(d.getDate() + days);
  return modernIsoDateFromLocalDate(d);
}

function modernRouteCity(row: DayRow): string {
  return String(row.cityText ?? "").trim().toUpperCase();
}

function modernTripBase(row: DayRow, meta: ModernRowDayMeta | undefined): string {
  return String(row.trip?.base ?? meta?.linkedTrip?.base ?? "JFK")
    .trim()
    .toUpperCase();
}

function shouldStartNewSameCodeOccurrence(
  previous: DayRow,
  current: DayRow,
  previousMeta: ModernRowDayMeta | undefined,
  currentMeta: ModernRowDayMeta | undefined,
): boolean {
  const base = modernTripBase(previous, previousMeta) || modernTripBase(current, currentMeta);
  const prevCity = modernRouteCity(previous);
  const currCity = modernRouteCity(current);
  if (!base || !prevCity || !currCity) return false;
  if (prevCity !== base) return false;
  if (currCity === base || currCity === "-" || currCity === "—" || currCity === "–") {
    return false;
  }
  return true;
}

function overrideModernRenderedPairingSpans(
  rows: DayRow[],
  source: Map<string, ModernRowDayMeta>,
): Map<string, ModernRowDayMeta> {
  const next = new Map(source);
  const explicitStartsByCode = new Map<string, string[]>();
  const codedRowsByCode = new Map<
    string,
    Array<{ iso: string; city: string; base: string }>
  >();
  const occurrenceLengthByCode = new Map<string, number>();
  const displayTemplateByCodeDay = new Map<
    string,
    {
      routeText: string;
      reportText: string;
      dEndText: string;
      layoverText: string;
    }
  >();
  for (const row of rows) {
    const code = String(row.pairingText ?? "")
      .trim()
      .toUpperCase()
      .split("·")[0]
      ?.trim() ?? "";
    if (!code || code === "-" || code === "—" || code === "–" || code === "CONT") {
      continue;
    }
    const meta = next.get(row.id);
    if (meta?.totalDays && meta.totalDays >= 2 && meta.totalDays <= 7) {
      occurrenceLengthByCode.set(code, meta.totalDays);
      if (meta.dayNumber >= 1 && meta.dayNumber <= meta.totalDays) {
        const key = `${code}:${meta.dayNumber}`;
        if (!displayTemplateByCodeDay.has(key)) {
          displayTemplateByCodeDay.set(key, {
            routeText: String(row.cityText ?? "").trim(),
            reportText: String(row.reportText ?? "").trim(),
            dEndText: String(row.dEndText ?? "").trim(),
            layoverText: String(row.layoverText ?? "").trim(),
          });
        }
      }
    }
    if (
      meta?.chosenSource === "trip_span" &&
      meta.linkedTrip &&
      meta.totalDays >= 2 &&
      meta.totalDays <= 7
    ) {
      continue;
    }
    const base = modernTripBase(row, meta);
    const city = modernRouteCity(row);
    const codeRows = codedRowsByCode.get(code) ?? [];
    codeRows.push({ iso: row.dateIso.slice(0, 10), city, base });
    codedRowsByCode.set(code, codeRows);
    if (city && city !== base && city !== "-" && city !== "—" && city !== "–") {
      const arr = explicitStartsByCode.get(code) ?? [];
      arr.push(row.dateIso.slice(0, 10));
      explicitStartsByCode.set(code, arr);
    }
  }

  const inferredStartByDate = new Map<string, { code: string; first: string; totalDays: number }>();
  const inferredRowIds = new Set<string>();
  for (const [code, startsRaw] of explicitStartsByCode) {
    const starts = [...new Set(startsRaw)].sort();
    const codedRows = (codedRowsByCode.get(code) ?? []).sort((a, b) =>
      a.iso.localeCompare(b.iso),
    );
    for (const first of starts) {
      const endRow = codedRows.find((rowInfo) => {
        const diff = modernRenderedDayDiff(first, rowInfo.iso);
        return (
          diff >= 1 &&
          diff <= 6 &&
          rowInfo.city === rowInfo.base
        );
      });
      if (!endRow) continue;
      const totalDaysFromEnd = modernRenderedDayDiff(first, endRow.iso) + 1;
      if (totalDaysFromEnd < 2 || totalDaysFromEnd > 7) continue;
      for (let d = 0; d < totalDaysFromEnd; d += 1) {
        const dateIso = modernRenderedAddDays(first, d);
        inferredStartByDate.set(dateIso, {
          code,
          first,
          totalDays: totalDaysFromEnd,
        });
      }
    }

    const totalDays = occurrenceLengthByCode.get(code);
    if (!totalDays || totalDays < 2) continue;
    for (const first of starts) {
      for (let d = 0; d < totalDays; d += 1) {
        const dateIso = modernRenderedAddDays(first, d);
        inferredStartByDate.set(dateIso, { code, first, totalDays });
      }
    }
    for (let i = 0; i < starts.length - 1; i += 1) {
      const first = starts[i]!;
      const nextStart = starts[i + 1]!;
      const gap = modernRenderedDayDiff(first, nextStart);
      if (gap <= totalDays || gap % totalDays !== 0) continue;
      for (let offset = totalDays; offset < gap; offset += totalDays) {
        const inferredFirst = modernRenderedAddDays(first, offset);
        for (let d = 0; d < totalDays; d += 1) {
          const dateIso = modernRenderedAddDays(inferredFirst, d);
          inferredStartByDate.set(dateIso, { code, first: inferredFirst, totalDays });
        }
      }
    }
  }

  for (const row of rows) {
    const dateIso = row.dateIso.slice(0, 10);
    const inferred = inferredStartByDate.get(dateIso);
    if (!inferred) continue;
    const rowCode = modernPairingCodeForRenderedSpan(row);
    if (rowCode && rowCode !== inferred.code) continue;
    const current = next.get(row.id);
    if (!current) continue;
    const dayNumber = modernRenderedDayDiff(inferred.first, dateIso) + 1;
    if (dayNumber < 1 || dayNumber > inferred.totalDays) continue;
    const orderedDates = modernRenderedDatesBetween(
      inferred.first,
      modernRenderedAddDays(inferred.first, inferred.totalDays - 1),
    );
    const dayLine = `Day ${dayNumber} of ${inferred.totalDays}`;
    const template = displayTemplateByCodeDay.get(`${inferred.code}:${dayNumber}`);
    next.set(row.id, {
      ...current,
      canonicalSequenceId: `rendered:${inferred.code}:${inferred.first}:${orderedDates[orderedDates.length - 1]!}`,
      linkedTrip: current.linkedTrip ?? row.trip ?? null,
      pairingCodeUsed: inferred.code,
      pairingDisplay: inferred.code,
      dayNumber,
      totalDays: inferred.totalDays,
      orderedTripDates: orderedDates,
      tripSpanDates: orderedDates,
      chosenSource: "row_span",
      railSegmentPosition: modernRenderedRailPosition(dayNumber, inferred.totalDays),
      dayLine,
      renderAsPairingCard: true,
      renderAsMiscCard: false,
      isDayOff: false,
      renderedTitle: `${inferred.code} · ${dayLine}`,
      reasonIfNoDayCount: null,
      displayRouteText: template?.routeText,
      displayReportText: template?.reportText,
      displayDEndText: template?.dEndText,
      displayLayoverText: template?.layoverText,
    });
    inferredRowIds.add(row.id);
  }

  let blockCode = "";
  let blockRows: DayRow[] = [];

  const applyBlock = () => {
    if (!blockCode || blockRows.length < 2) {
      blockRows = [];
      return;
    }
    const first = blockRows[0]!.dateIso.slice(0, 10);
    const last = blockRows[blockRows.length - 1]!.dateIso.slice(0, 10);
    const orderedDates = modernRenderedDatesBetween(first, last);
    if (orderedDates.length < 2) {
      blockRows = [];
      return;
    }
    const sequenceId = `rendered:${blockCode}:${first}:${last}`;
    for (const row of blockRows) {
      const dateIso = row.dateIso.slice(0, 10);
      const idx = orderedDates.indexOf(dateIso);
      if (idx < 0) continue;
      const dayNumber = idx + 1;
      const totalDays = orderedDates.length;
      const dayLine = `Day ${dayNumber} of ${totalDays}`;
      const current = next.get(row.id);
      if (!current || current.isDayOff) continue;
      next.set(row.id, {
        ...current,
        canonicalSequenceId: sequenceId,
        pairingCodeUsed: blockCode,
        pairingDisplay: blockCode,
        dayNumber,
        totalDays,
        orderedTripDates: orderedDates,
        tripSpanDates: orderedDates,
        chosenSource: "row_span",
        railSegmentPosition: modernRenderedRailPosition(dayNumber, totalDays),
        dayLine,
        renderAsPairingCard: true,
        renderAsMiscCard: false,
        isDayOff: false,
        renderedTitle: `${blockCode} · ${dayLine}`,
        reasonIfNoDayCount: null,
      });
    }
    blockRows = [];
  };

  for (const row of rows) {
    const meta = next.get(row.id);
    const code = meta?.isDayOff || inferredRowIds.has(row.id)
      ? ""
      : modernPairingCodeForRenderedSpan(row);
    if (!code) {
      applyBlock();
      blockCode = "";
      continue;
    }
    const previous = blockRows[blockRows.length - 1];
    if (
      blockCode &&
      (code !== blockCode ||
        (previous &&
          shouldStartNewSameCodeOccurrence(
            previous,
            row,
            next.get(previous.id),
            meta,
          )))
    ) {
      applyBlock();
      blockCode = code;
      blockRows = [row];
      continue;
    }
    if (!blockCode) blockCode = code;
    blockRows.push(row);
  }
  applyBlock();

  return next;
}

type ListSeg =
  | { kind: "week"; key: string; week: number }
  | { kind: "row"; key: string; row: DayRow };

type Props = {
  year: number;
  month: number;
  refreshKey?: number;
  trips: CrewScheduleTrip[];
  monthMetrics?: ScheduleMonthMetrics | null;
  tripLayerReady: boolean;
  onOpenFullTrip: (trip: CrewScheduleTrip, rowDateIso?: string) => void;
  onOpenManage?: () => void;
  /** FLICA `crew_schedule` display source (mini-table vs trip-derived vs blocked). */
  flicaCalendarListModel: FlicaCalendarListModel;
};

export default function ModernClassicListView({
  year,
  month,
  refreshKey,
  trips,
  monthMetrics,
  tripLayerReady,
  onOpenFullTrip,
  onOpenManage,
  flicaCalendarListModel,
}: Props) {
  const [previewTrip, setPreviewTrip] = useState<CrewScheduleTrip | null>(null);
  const [previewDateIso, setPreviewDateIso] = useState<string | null>(null);
  const { rows, isReady, emptyMonth } = useClassicMonthDayRows({
    trips,
    year,
    month,
    refreshKey,
    monthMetrics,
    tripLayerReady,
    flicaCalendarListModel,
  });

  const visibleMonth = `${year}-${String(month).padStart(2, "0")}`;

  const mergedTripsForModern = useMemo(
    () =>
      trips.map((t) => {
        const merged = mergeLayoverOntoLegDates(t);
        return merged ? { ...t, layoverByDate: merged } : t;
      }),
    [trips],
  );

  const rawPairingDetailIndex =
    flicaCalendarListModel.mode === "flica_mini_table"
      ? flicaCalendarListModel.rawPairingDetailIndex
      : null;
  const todayIso = modernIsoDateFromLocalDate(new Date());

  const renderRows = useMemo(
    () =>
      rows
        ? ensureModernVisibleMonthDateRows(rows, year, month)
        : rows,
    [rows, year, month],
  );

  const modernMetaByRowId = useMemo(() => {
    if (!renderRows?.length) {
      return new Map<string, ModernRowDayMeta>();
    }
    const { metaByRowId } = buildModernDayCountAudit(
      renderRows,
      mergedTripsForModern,
      visibleMonth,
      rawPairingDetailIndex,
    );
    return overrideModernRenderedPairingSpans(renderRows, metaByRowId);
  }, [renderRows, visibleMonth, mergedTripsForModern, rawPairingDetailIndex]);

  const activePairingSequenceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const meta of modernMetaByRowId.values()) {
      const sequenceDates = meta.orderedTripDates.length
        ? meta.orderedTripDates
        : meta.tripSpanDates;
      if (
        meta.renderAsPairingCard &&
        meta.canonicalSequenceId &&
        sequenceDates.includes(todayIso)
      ) {
        ids.add(meta.canonicalSequenceId);
      }
    }
    return ids;
  }, [modernMetaByRowId, todayIso]);

  const listData = useMemo((): ListSeg[] => {
    if (!renderRows?.length) return [];
    return renderRows.map((row) => ({ kind: "row", key: row.id, row }));
  }, [renderRows]);

  const modernPairingRailByRowId = useMemo(
    () => computeModernPairingRailLayout(listData, modernMetaByRowId),
    [listData, modernMetaByRowId],
  );

  const openPairingSummary = useCallback(
    (trip: CrewScheduleTrip, rowDateIso?: string) => {
      stashTripForDetailNavigation(trip, trips, {
        visibleMonth: { year, month },
        rowDateIso: rowDateIso ?? null,
      });
      setPreviewTrip(trip);
      setPreviewDateIso(rowDateIso ?? null);
    },
    [trips, year, month],
  );

  const closePreview = useCallback(() => {
    setPreviewTrip(null);
    setPreviewDateIso(null);
  }, []);

  const openFullFromPreview = useCallback(() => {
    const trip = previewTrip;
    const rowDateIso = previewDateIso ?? undefined;
    setPreviewTrip(null);
    setPreviewDateIso(null);
    if (trip) onOpenFullTrip(trip, rowDateIso);
  }, [onOpenFullTrip, previewDateIso, previewTrip]);

  if (emptyMonth && (!renderRows || renderRows.length === 0)) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyTitle}>No schedule for this month</Text>
        <Text style={styles.emptyBody}>
          Import and view options are in Manage.
        </Text>
        {onOpenManage ? (
          <Pressable style={styles.importBtn} onPress={onOpenManage}>
            <Text style={styles.importBtnText}>Open Manage</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (flicaCalendarListModel.mode === "flica_blocked") {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyTitle}>Mini-calendar table unavailable</Text>
        <Text style={styles.emptyBody}>
          This month has no saved FLICA schedule HTML in Flight Club. Re-import
          from Manage — list and calendar views use the FLICA mini calendar only
          (not pairing legs).
        </Text>
        {typeof __DEV__ !== "undefined" && __DEV__ ? (
          <Text style={styles.devBlockedHint}>
            [FC_CAL_LEDGER_BLOCKED] {flicaCalendarListModel.reason}{" "}
            {flicaCalendarListModel.visibleMonth}
          </Text>
        ) : null}
        {onOpenManage ? (
          <Pressable style={styles.importBtn} onPress={onOpenManage}>
            <Text style={styles.importBtnText}>Open Manage</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (!isReady || !renderRows) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={SCHEDULE_MOCK_HEADER_RED} size="small" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={listData}
        keyExtractor={(i) => i.key}
        scrollEnabled={false}
        removeClippedSubviews={false}
        renderItem={({ item }) => {
          if (item.kind === "week") {
            return <Text style={styles.weekLabel}>{`WEEK ${item.week}`}</Text>;
          }
          const row = item.row;
          const meta = modernMetaByRowId.get(row.id)!;
          const rowIso = row.dateIso.slice(0, 10);
          const isPastDate = rowIso < todayIso;
          const isActivePairingTile = Boolean(
            meta.canonicalSequenceId &&
              activePairingSequenceIds.has(meta.canonicalSequenceId),
          );
          const isOff = meta.isDayOff;
          const renderDayOffTile = () => (
            <View style={styles.nonPairingDayTileRowWrap}>
              <View
                style={[
                  styles.offCardOuter,
                  row.isToday && styles.tileOutlineToday,
                  isPastDate && styles.pastDayTile,
                ]}
              >
                <View style={styles.offCardInner}>
                  <View style={styles.offLeftSpacerRail} />
                  <View style={styles.offDateRail}>
                    <Text style={styles.tripDow}>
                      {row.dayCode.slice(0, 2)}
                    </Text>
                    <Text
                      style={[
                        styles.tripDom,
                        row.isToday && styles.tripDomToday,
                        PAIRING_DETAIL_STAT_DIGIT_TYPE,
                        PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                      ]}
                    >
                      {row.dayNum}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.offDivider,
                      row.isToday && styles.railDividerToday,
                    ]}
                  />
                  <View style={styles.offCenter}>
                    <View style={styles.offPill}>
                      <Text style={styles.offPillText}>DAY OFF</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          );

          if (isOff) {
            return renderDayOffTile();
          }

          if (meta.renderAsPairingCard) {
            const trip = meta.linkedTrip;
            const route = meta.displayRouteText?.trim() ||
              (row.useFlicaLedgerLabels
              ? String(row.cityText ?? "").trim() || "—"
              : trip
                ? primaryDayRoute(trip, row.dateIso, row.cityText)
                : String(row.cityText ?? "").trim() || "—");
            const extra =
              trip && !row.useFlicaLedgerLabels
                ? additionalLegsSummary(trip, row.dateIso)
                : null;
            const dayLine = meta.dayLine;
            const showTripCredit = meta.dayNumber === 1;
            const credit = showTripCredit && meta.displayCreditText
              ? { main: meta.displayCreditText, plus: null as string | null }
              : trip && showTripCredit
                ? tripCreditDisplay(trip)
                : { main: "", plus: null as string | null };

            const pairing = meta.pairingDisplay || "—";

            const lay = String(meta.displayLayoverText ?? row.layoverText ?? "").trim();
            const rpt = fmtDutyClock(meta.displayReportText ?? row.reportText);
            const dend = fmtDutyClock(meta.displayDEndText ?? row.dEndText);
            const canOpenTrip = Boolean(trip);

            const pairingRail = modernPairingRailByRowId.get(row.id);
            const showPairingRail = Boolean(
              meta.canonicalSequenceId && pairingRail?.railPosition,
            );
            const collapsePairingGapAbove = Boolean(
              showPairingRail && pairingRail?.collapseGapAbove,
            );
            const collapsePairingGapBelow = Boolean(
              showPairingRail && pairingRail?.collapseGapBelow,
            );
            const needsTopDotClearance = Boolean(
              showPairingRail &&
                !collapsePairingGapAbove &&
                !pairingRail?.suppressTopCap &&
                (pairingRail?.railPosition === "start" ||
                  pairingRail?.railPosition === "single"),
            );
            const needsBottomDotClearance = Boolean(
              showPairingRail &&
                !collapsePairingGapBelow &&
                !pairingRail?.suppressBottomCap &&
                (pairingRail?.railPosition === "end" ||
                  pairingRail?.railPosition === "single"),
            );

            return (
              <View
                style={[
                  styles.dayTileRowWrap,
                  needsTopDotClearance && styles.dayTileRowWrapTopDotClearance,
                  needsBottomDotClearance &&
                    styles.dayTileRowWrapBottomDotClearance,
                  collapsePairingGapAbove && styles.dayTileRowWrapNoTopGap,
                  collapsePairingGapBelow && styles.dayTileRowWrapNoBottomGap,
                ]}
              >
                <View style={styles.pairingRailRowAnchor}>
                  {showPairingRail && pairingRail!.bridgeAbove > 0 ? (
                    <View
                      style={[
                        styles.pairingRailBridgeAbove,
                        {
                          left: MODERN_PAIRING_RAIL_SLOT_LEFT,
                          height: pairingRail!.bridgeAbove + 10,
                        },
                      ]}
                    >
                      <ModernPairingRailBridge
                        color={SCHEDULE_MOCK_HEADER_RED}
                        height={pairingRail!.bridgeAbove + 10}
                      />
                    </View>
                  ) : null}
                  <Pressable
                    onPress={
                      canOpenTrip
                        ? () => onOpenFullTrip(trip!, row.dateIso)
                        : undefined
                    }
                    onLongPress={
                      canOpenTrip
                        ? () => openPairingSummary(trip!, row.dateIso)
                        : undefined
                    }
                    delayLongPress={420}
                    disabled={!canOpenTrip}
                    style={({ pressed }) => [
                      pressed && canOpenTrip && styles.cardStackPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      canOpenTrip
                        ? `Open pairing ${pairing}`
                        : `Schedule ${pairing} ${row.dateIso}`
                    }
                    accessibilityHint="Opens pairing detail. Long press for pairing summary."
                  >
                    <View
                      style={[
                        styles.tripCardMain,
                        extra ? styles.tripCardMainNoBottomRadius : null,
                        isActivePairingTile && styles.activePairingTile,
                        row.isToday && styles.tileOutlineToday,
                        showPairingRail && styles.tripCardMainRailVisible,
                        isPastDate && styles.pastDayTile,
                      ]}
                    >
                      <View style={styles.offLeftSpacerRail} />
                      <View style={styles.tripDateRail}>
                        <Text style={styles.tripDow}>
                          {row.dayCode.slice(0, 2)}
                        </Text>
                        <Text
                          style={[
                            styles.tripDom,
                            row.isToday && styles.tripDomToday,
                            PAIRING_DETAIL_STAT_DIGIT_TYPE,
                            PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                          ]}
                        >
                          {row.dayNum}
                        </Text>
                      </View>
                      {showPairingRail ? (
                        <ModernPairingRailColumn
                          color={SCHEDULE_MOCK_HEADER_RED}
                          railPosition={pairingRail!.railPosition!}
                          suppressTopCap={pairingRail!.suppressTopCap}
                          suppressBottomCap={pairingRail!.suppressBottomCap}
                          centerBottomCapInGap={
                            pairingRail!.centerBottomCapInGap
                          }
                        />
                      ) : null}
                      <View
                        style={[
                          styles.tripDivider,
                          row.isToday && styles.railDividerToday,
                        ]}
                      />
                      <View style={styles.tripMid}>
                        <Text style={styles.pairingRow} numberOfLines={1}>
                          <Text style={[styles.pairingCode, PAIRING_CODE_TYPE]}>
                            {pairing}
                          </Text>
                          {dayLine ? (
                            <Text
                              style={[styles.pairingDayPart, PAIRING_DAY_TYPE]}
                            >
                              {` · ${dayLine}`}
                            </Text>
                          ) : null}
                        </Text>
                        <Text
                          style={[styles.routeLine, ROUTE_TYPE]}
                          numberOfLines={1}
                        >
                          {route}
                        </Text>
                        <Text style={styles.reportLine} numberOfLines={1}>
                          <Text
                            style={[
                              styles.rptStrong,
                              PAIRING_DETAIL_STAT_DIGIT_TYPE,
                              PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                            ]}
                          >
                            Rpt {rpt}
                          </Text>
                          <Text
                            style={[
                              styles.rptRest,
                              PAIRING_DETAIL_STAT_DIGIT_TYPE,
                              PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                            ]}
                          >
                            {" "}
                            · D-End {dend}
                            {lay ? ` · Layover ${lay}` : ""}
                          </Text>
                        </Text>
                      </View>
                      <View style={styles.tripRight}>
                        <Text
                          style={[
                            styles.creditTop,
                            PAIRING_DETAIL_STAT_DIGIT_TYPE,
                            PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                          ]}
                          numberOfLines={1}
                        >
                          {credit.main || " "}
                        </Text>
                        <Text style={styles.wxEmoji} numberOfLines={1}>
                          {row.wxText || "—"}
                        </Text>
                      </View>
                    </View>
                    {extra ? (
                      <View
                        style={[
                          styles.continuationAttached,
                          isActivePairingTile &&
                            styles.activePairingContinuation,
                          isPastDate && styles.pastDayTile,
                        ]}
                      >
                        <View style={styles.continuationDot} />
                        <Text style={styles.continuationText} numberOfLines={2}>
                          {extra}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                  {showPairingRail && pairingRail!.bridgeBelow > 0 ? (
                    <View
                      style={[
                        styles.pairingRailBridgeBelow,
                        {
                          left: MODERN_PAIRING_RAIL_SLOT_LEFT,
                          height: pairingRail!.bridgeBelow + 10,
                        },
                      ]}
                    >
                      <ModernPairingRailBridge
                        color={SCHEDULE_MOCK_HEADER_RED}
                        height={pairingRail!.bridgeBelow + 10}
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            );
          }

          if (meta.renderAsMiscCard) {
            const label = modernNonEmptyLabel(row.pairingText, row.cityText);
            const showDayOff = !label && !row.trip;
            if (showDayOff) return renderDayOffTile();
            return (
              <View style={styles.nonPairingDayTileRowWrap}>
                <Pressable
                  onPress={
                    row.trip
                      ? () => onOpenFullTrip(row.trip!, row.dateIso)
                      : undefined
                  }
                  onLongPress={
                    row.trip
                      ? () => openPairingSummary(row.trip!, row.dateIso)
                      : undefined
                  }
                  delayLongPress={420}
                  disabled={!row.trip}
                  accessibilityHint="Opens pairing detail. Long press for pairing summary."
                  style={({ pressed }) => [
                    styles.emptyDayCardOuter,
                    pressed && row.trip && styles.cardStackPressed,
                    isPastDate && styles.pastDayTile,
                  ]}
                >
                  <View style={styles.emptyDayCardInner}>
                    <View style={styles.offLeftSpacerRail} />
                    <View style={styles.tripDateRail}>
                      <Text style={styles.tripDow}>
                        {row.dayCode.slice(0, 2)}
                      </Text>
                      <Text
                        style={[
                          styles.tripDom,
                          row.isToday && styles.tripDomToday,
                          PAIRING_DETAIL_STAT_DIGIT_TYPE,
                          PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                        ]}
                      >
                        {row.dayNum}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.tripDivider,
                        row.isToday && styles.railDividerToday,
                      ]}
                    />
                    <View style={styles.emptyDayCenter}>
                      <Text style={styles.miscText} numberOfLines={2}>
                        {label}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </View>
            );
          }
          const label = modernNonEmptyLabel(row.pairingText, row.cityText);
          const showDayOff = !label && !row.trip;
          if (showDayOff) return renderDayOffTile();
          return (
            <View style={styles.nonPairingDayTileRowWrap}>
              <View
                style={[
                  styles.emptyDayCardOuter,
                  row.isToday && styles.tileOutlineToday,
                  isPastDate && styles.pastDayTile,
                ]}
              >
                <View style={styles.emptyDayCardInner}>
                  <View style={styles.offLeftSpacerRail} />
                  <View style={styles.tripDateRail}>
                    <Text style={styles.tripDow}>{row.dayCode.slice(0, 2)}</Text>
                    <Text
                      style={[
                        styles.tripDom,
                        row.isToday && styles.tripDomToday,
                        PAIRING_DETAIL_STAT_DIGIT_TYPE,
                        PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                      ]}
                    >
                      {row.dayNum}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.tripDivider,
                      row.isToday && styles.railDividerToday,
                    ]}
                  />
                  <View style={styles.emptyDayCenter}>
                    <Text style={styles.miscText} numberOfLines={2}>
                      {label}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          );
        }}
      />
      <TripQuickPreviewSheet
        visible={previewTrip != null}
        trip={previewTrip}
        pairingUuid={previewTrip?.schedulePairingId}
        onClose={closePreview}
        onOpenFullTrip={openFullFromPreview}
      />
    </View>
  );
}
/*
                  style={[
                    styles.offCardOuter,
                    row.isToday && styles.tileOutlineToday,
                  ]}
                >
                  <View style={styles.offCardInner}>
                    <View style={styles.offLeftSpacerRail} />
                    <View style={styles.offDateRail}>
                      <Text style={styles.tripDow}>
                        {row.dayCode.slice(0, 2)}
                      </Text>
                      <Text
                        style={[
                          styles.tripDom,
                          row.isToday && styles.tripDomToday,
                          PAIRING_DETAIL_STAT_DIGIT_TYPE,
                          PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                        ]}
                      >
                        {row.dayNum}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.offDivider,
                        row.isToday && styles.railDividerToday,
                      ]}
                    />
                    <View style={styles.offCenter}>
                      <View style={styles.offPill}>
                        <Text style={styles.offPillText}>DAY OFF</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            );
          }

          if (meta.renderAsPairingCard) {
            const trip = meta.linkedTrip;
            const route = row.useFlicaLedgerLabels
              ? String(row.cityText ?? "").trim() || "—"
              : trip
                ? primaryDayRoute(trip, row.dateIso, row.cityText)
                : String(row.cityText ?? "").trim() || "—";
            const extra =
              trip && !row.useFlicaLedgerLabels
                ? additionalLegsSummary(trip, row.dateIso)
                : null;
            const dayLine = meta.dayLine;
            const credit = trip
              ? dailyCreditDisplay(trip, row.dateIso)
              : { main: "—", plus: null as string | null };

            const pairing = meta.pairingDisplay || "—";

            const lay = String(row.layoverText ?? "").trim();
            const rpt = fmtDutyClock(row.reportText);
            const dend = fmtDutyClock(row.dEndText);
            const canOpenTrip = Boolean(trip);

            const pairingRail = modernPairingRailByRowId.get(row.id);
            const showPairingRail = Boolean(
              meta.canonicalSequenceId && pairingRail?.railPosition,
            );
            const collapsePairingGapAbove = Boolean(
              showPairingRail && pairingRail?.collapseGapAbove,
            );
            const collapsePairingGapBelow = Boolean(
              showPairingRail && pairingRail?.collapseGapBelow,
            );

            return (
              <View
                style={[
                  styles.dayTileRowWrap,
                  collapsePairingGapAbove && styles.dayTileRowWrapNoTopGap,
                  collapsePairingGapBelow && styles.dayTileRowWrapNoBottomGap,
                ]}
              >
                <View style={styles.pairingRailRowAnchor}>
                  {showPairingRail && pairingRail!.bridgeAbove > 0 ? (
                    <View
                      style={[
                        styles.pairingRailBridgeAbove,
                        {
                          left: MODERN_PAIRING_RAIL_SLOT_LEFT,
                          height: pairingRail!.bridgeAbove,
                        },
                      ]}
                    >
                      <ModernPairingRailBridge
                        color={SCHEDULE_MOCK_HEADER_RED}
                        height={pairingRail!.bridgeAbove}
                      />
                    </View>
                  ) : null}
                  <Pressable
                    onPress={
                      canOpenTrip
                        ? () => onOpenFullTrip(trip!, row.dateIso)
                        : undefined
                    }
                    disabled={!canOpenTrip}
                    style={({ pressed }) => [
                      pressed && canOpenTrip && styles.cardStackPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      canOpenTrip
                        ? `Open pairing ${pairing}`
                        : `Schedule ${pairing} ${row.dateIso}`
                    }
                  >
                    <View
                      style={[
                        styles.tripCardMain,
                        extra ? styles.tripCardMainNoBottomRadius : null,
                        row.isToday && styles.tileOutlineToday,
                        showPairingRail && styles.tripCardMainRailVisible,
                      ]}
                    >
                      <View style={styles.offLeftSpacerRail} />
                      <View style={styles.tripDateRail}>
                        <Text style={styles.tripDow}>
                          {row.dayCode.slice(0, 2)}
                        </Text>
                        <Text
                          style={[
                            styles.tripDom,
                            row.isToday && styles.tripDomToday,
                            PAIRING_DETAIL_STAT_DIGIT_TYPE,
                            PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                          ]}
                        >
                          {row.dayNum}
                        </Text>
                      </View>
                      {showPairingRail ? (
                        <ModernPairingRailColumn
                          color={SCHEDULE_MOCK_HEADER_RED}
                          railPosition={pairingRail!.railPosition!}
                        />
                      ) : null}
                      <View
                        style={[
                          styles.tripDivider,
                          row.isToday && styles.railDividerToday,
                        ]}
                      />
                      <View style={styles.tripMid}>
                        <Text style={styles.pairingRow} numberOfLines={1}>
                          <Text style={[styles.pairingCode, PAIRING_CODE_TYPE]}>
                            {pairing}
                          </Text>
                          {dayLine ? (
                            <Text
                              style={[styles.pairingDayPart, PAIRING_DAY_TYPE]}
                            >
                              {` · ${dayLine}`}
                            </Text>
                          ) : null}
                        </Text>
                        <Text
                          style={[styles.routeLine, ROUTE_TYPE]}
                          numberOfLines={1}
                        >
                          {route}
                        </Text>
                        <Text style={styles.reportLine} numberOfLines={1}>
                          <Text
                            style={[
                              styles.rptStrong,
                              PAIRING_DETAIL_STAT_DIGIT_TYPE,
                              PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                            ]}
                          >
                            Rpt {rpt}
                          </Text>
                          <Text
                            style={[
                              styles.rptRest,
                              PAIRING_DETAIL_STAT_DIGIT_TYPE,
                              PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                            ]}
                          >
                            {" "}
                            · D-End {dend}
                            {lay ? ` · ${lay}` : ""}
                          </Text>
                        </Text>
                      </View>
                      <View style={styles.tripRight}>
                        <Text
                          style={[
                            styles.creditTop,
                            PAIRING_DETAIL_STAT_DIGIT_TYPE,
                            PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                          ]}
                          numberOfLines={1}
                        >
                          {credit.main}
                        </Text>
                        <Text
                          style={[
                            styles.creditPlus,
                            PAIRING_DETAIL_STAT_DIGIT_TYPE,
                            PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                          ]}
                          numberOfLines={1}
                        >
                          {credit.plus ?? " "}
                        </Text>
                        <Text style={styles.wxEmoji} numberOfLines={1}>
                          {row.wxText || "—"}
                        </Text>
                      </View>
                    </View>
                    {extra ? (
                      <View style={styles.continuationAttached}>
                        <View style={styles.continuationDot} />
                        <Text style={styles.continuationText} numberOfLines={2}>
                          {extra}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                  {showPairingRail && pairingRail!.bridgeBelow > 0 ? (
                    <View
                      style={[
                        styles.pairingRailBridgeBelow,
                        {
                          left: MODERN_PAIRING_RAIL_SLOT_LEFT,
                          height: pairingRail!.bridgeBelow,
                        },
                      ]}
                    >
                      <ModernPairingRailBridge
                        color={SCHEDULE_MOCK_HEADER_RED}
                        height={pairingRail!.bridgeBelow}
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            );
          }

          if (meta.renderAsMiscCard) {
            const label = modernNonEmptyLabel(row.pairingText, row.cityText);
            const showDayOff = !label && !row.trip;
            return (
              <View style={styles.dayTileRowWrap}>
                <Pressable
                  onPress={
                    row.trip
                      ? () => onOpenFullTrip(row.trip!, row.dateIso)
                      : undefined
                  }
                  onLongPress={
                    row.trip
                      ? () => openPairingSummary(row.trip!, row.dateIso)
                      : undefined
                  }
                  delayLongPress={420}
                  disabled={!row.trip}
                  accessibilityHint="Opens pairing detail. Long press for pairing summary."
                  style={({ pressed }) => [
                    styles.emptyDayCardOuter,
                    pressed && row.trip && styles.cardStackPressed,
                  ]}
                >
                  <View style={styles.emptyDayCardInner}>
                    <View style={styles.offLeftSpacerRail} />
                    <View style={styles.tripDateRail}>
                      <Text style={styles.tripDow}>
                        {row.dayCode.slice(0, 2)}
                      </Text>
                      <Text
                        style={[
                          styles.tripDom,
                          row.isToday && styles.tripDomToday,
                          PAIRING_DETAIL_STAT_DIGIT_TYPE,
                          PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                        ]}
                      >
                        {row.dayNum}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.tripDivider,
                        row.isToday && styles.railDividerToday,
                      ]}
                    />
                    <View style={styles.emptyDayCenter}>
                      {showDayOff ? (
                        <View style={styles.offPill}>
                          <Text style={styles.offPillText}>DAY OFF</Text>
                        </View>
                      ) : label ? (
                        <Text style={styles.miscText} numberOfLines={2}>
                          {label}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              </View>
            );
          }
          const label = modernNonEmptyLabel(row.pairingText, row.cityText);
          const showDayOff = !label && !row.trip;
          return (
            <View style={styles.dayTileRowWrap}>
              <View
                style={[
                  styles.emptyDayCardOuter,
                  row.isToday && styles.tileOutlineToday,
                ]}
              >
                <View style={styles.emptyDayCardInner}>
                  <View style={styles.offLeftSpacerRail} />
                  <View style={styles.tripDateRail}>
                    <Text style={styles.tripDow}>{row.dayCode.slice(0, 2)}</Text>
                    <Text
                      style={[
                        styles.tripDom,
                        row.isToday && styles.tripDomToday,
                        PAIRING_DETAIL_STAT_DIGIT_TYPE,
                        PAIRING_DETAIL_STAT_DIGIT_TRACKING,
                      ]}
                    >
                      {row.dayNum}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.tripDivider,
                      row.isToday && styles.railDividerToday,
                    ]}
                  />
                  <View style={styles.emptyDayCenter}>
                    {showDayOff ? (
                      <View style={styles.offPill}>
                        <Text style={styles.offPillText}>DAY OFF</Text>
                      </View>
                    ) : label ? (
                      <Text style={styles.miscText} numberOfLines={2}>
                        {label}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

*/
const CARD_RADIUS = 10;
const CARD_BORDER = "#E2E8F0";
/** Vertical rule between date rail and trip body — matches calendar grid weight. */
const DAY_RAIL_DIVIDER = "#D2DAE6";
/**
 * Vertical gap between calendar day tiles — split as margin above and below each card
 * so spacing matches the mock (breathing room top + bottom).
 */
const TILE_STACK_GAP = 12;

/** Bridge slot is centered on the date/body divider: spacer + date rail - half bridge width. */
const MODERN_PAIRING_RAIL_SLOT_LEFT = 3 + 36 - 5;

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 18,
    backgroundColor: T.bg,
    overflow: "visible",
  },
  weekLabel: {
    marginTop: 6,
    marginBottom: 3,
    marginLeft: 2,
    fontSize: 9,
    fontWeight: "800",
    color: T.textSecondary,
    letterSpacing: 0.4,
  },
  /** Pairing row gap stays small so rail continuity remains tight. */
  dayTileRowWrap: {
    marginVertical: TILE_STACK_GAP / 2,
    overflow: "visible",
  },
  nonPairingDayTileRowWrap: {
    marginVertical: TILE_STACK_GAP / 2,
    overflow: "visible",
  },
  dayTileRowWrapNoTopGap: {
    marginTop: 0,
  },
  dayTileRowWrapNoBottomGap: {
    marginBottom: 0,
  },
  dayTileRowWrapTopDotClearance: {
    marginTop: 10,
  },
  dayTileRowWrapBottomDotClearance: {
    marginBottom: 10,
  },
  pairingRailRowAnchor: {
    position: "relative",
    overflow: "visible",
  },
  pairingRailBridgeAbove: {
    position: "absolute",
    bottom: "100%",
    width: 10,
    alignItems: "center",
    zIndex: 3,
    overflow: "visible",
  },
  pairingRailBridgeBelow: {
    position: "absolute",
    top: "100%",
    width: 10,
    alignItems: "center",
    zIndex: 3,
    overflow: "visible",
  },
  cardStackPressed: { opacity: 0.92 },
  /* —— Day off —— */
  /** Today-only: full card outline in schedule red. */
  tileOutlineToday: {
    borderColor: SCHEDULE_MOCK_HEADER_RED,
    borderWidth: 2,
  },
  activePairingTile: {
    backgroundColor: "#FFF7F7",
    borderColor: "rgba(181, 22, 30, 0.55)",
    shadowColor: SCHEDULE_MOCK_HEADER_RED,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  activePairingContinuation: {
    backgroundColor: "#FFF1F2",
    borderColor: "rgba(181, 22, 30, 0.38)",
  },
  pastDayTile: {
    opacity: 0.62,
  },
  /** Today-only: vertical rule between date rail and body/route column. */
  railDividerToday: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    width: 2,
  },
  offCardOuter: {
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  offCardInner: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 54,
    overflow: "hidden",
    borderRadius: CARD_RADIUS,
  },
  offLeftSpacerRail: {
    width: 3,
    alignSelf: "stretch",
    backgroundColor: "transparent",
  },
  offDateRail: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  offDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: DAY_RAIL_DIVIDER,
  },
  offCenter: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingLeft: 8,
    paddingRight: 8,
    paddingVertical: 5,
  },
  offPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
  },
  offPillText: {
    fontSize: 8,
    fontWeight: "800",
    color: T.textSecondary,
    lineHeight: 10,
  },
  /* —— Trip —— */
  tripCardMain: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#fff",
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    minHeight: 54,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tripCardMainRailVisible: {
    overflow: "visible",
  },
  tripCardMainNoBottomRadius: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  tripDateRail: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  tripDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: DAY_RAIL_DIVIDER,
  },
  tripDow: { fontSize: 7, fontWeight: "600", color: T.textSecondary },
  tripDom: {
    fontSize: 11,
    fontWeight: "500",
    color: T.text,
    marginTop: 1,
  },
  tripDomToday: {
    color: SCHEDULE_MOCK_HEADER_RED,
  },
  tripMid: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 0,
  },
  pairingRow: {
    fontSize: 10,
    color: SCHEDULE_MOCK_HEADER_RED,
  },
  pairingCode: {
    color: SCHEDULE_MOCK_HEADER_RED,
  },
  pairingDayPart: {
    fontSize: 8,
    lineHeight: 11,
    color: SCHEDULE_MOCK_HEADER_RED,
  },
  routeLine: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 12,
    color: T.text,
    letterSpacing: -0.15,
  },
  reportLine: { marginTop: 3, fontSize: 9, lineHeight: 12 },
  rptStrong: { fontWeight: "800", color: T.textSecondary },
  rptRest: { fontWeight: "500", color: T.textSecondary },

  continuationAttached: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FEF2F2",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#FDE8E8",
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#F9D5D5",
    paddingVertical: 5,
    paddingHorizontal: 8,
    gap: 6,
  },
  continuationDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    marginTop: 3,
  },
  continuationText: {
    flex: 1,
    fontSize: 8,
    fontWeight: "700",
    color: SCHEDULE_MOCK_HEADER_RED,
    lineHeight: 11,
  },

  tripRight: {
    width: 54,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 7,
    paddingVertical: 4,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "#D2DAE6",
  },
  creditTop: { fontSize: 10, fontWeight: "800", color: "#16A34A" },
  creditPlus: {
    fontSize: 8,
    fontWeight: "800",
    color: SCHEDULE_MOCK_HEADER_RED,
    marginTop: 2,
  },
  wxEmoji: { fontSize: 10, marginTop: 3 },

  emptyDayCardOuter: {
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  emptyDayCardInner: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 54,
    overflow: "hidden",
    borderRadius: CARD_RADIUS,
  },
  emptyDayCenter: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 0,
  },
  miscText: { fontSize: 10, color: T.textSecondary },
  loadingBox: {
    paddingVertical: 24,
    alignItems: "center",
    backgroundColor: T.bg,
  },
  emptyBox: {
    marginHorizontal: 12,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: T.text },
  emptyBody: { marginTop: 6, fontSize: 12, color: T.textSecondary },
  devBlockedHint: {
    marginTop: 10,
    fontSize: 11,
    color: "#B45309",
    fontWeight: "600",
  },
  importBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  importBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
