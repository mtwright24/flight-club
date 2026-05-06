import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import type { Session } from "@supabase/supabase-js";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../../hooks/useAuth";
import {
  readPairingDetailFromMonthCache,
  storeDetailReadyPairingInMonthCaches,
} from "../pairingDetailMonthCache";
import { canSealPairingSurface } from "../pairingDetailReadiness";
import { validateVisibleTripHandoff } from "../pairingHandoff";
import { isExemptFromStrictPairingPaint } from "../pairingRenderableGate";
import {
  buildPairingFirstPaintDecision,
  resolveRenderablePairingSnapshot,
} from "../resolveRenderablePairingSnapshot";
import { monthCalendarKey } from "../scheduleMonthCache";
import { readCommittedMonthSnapshot } from "../scheduleStableSnapshots";
import { scheduleTheme as T } from "../scheduleTheme";
import { shouldRejectWeakerPairingRender } from "../tripDetailNavCache";
import {
  buildTripDetailViewModel,
  getDisplaySpanAndDutyDayCount,
  type TripDayViewModel,
  type TripDetailViewModel,
  type TripStatTile,
} from "../tripDetailViewModel";
import type { CrewScheduleLeg, CrewScheduleTrip } from "../types";

/** Match TripDetailScreen `FC_HOTEL_GREEN` (layover / hotel card). */
const LAYOVER_CARD_BG = "#0E3D2F";
/** Section label "LAYOVERS & STAYS" — light mint, not white. */
const LAYOVER_LABEL = "#A7F3D0";
/** Secondary copy: hotels/cities line, weather, hotel names, chevrons. */
const LAYOVER_MINT = "#86EFAC";
const LAYOVER_WHITE = "#FFFFFF";
/** Horizontal + vertical rules inside the tile. */
const LAYOVER_RULE = "rgba(167, 243, 208, 0.45)";
/** Hotel / building glyph accent (warm, mock “red-orange” highlights). */
const LAYOVER_BUILDING = "#FEC89A";
const WEATHER_SUN = "#FACC15";
/** Partly-cloudy row: off-white cloud tone (v4 mock). */
const WEATHER_PARTLY_ICON = "#F1F5F9";
const ON_TIME_GREEN = "#15803D";

/**
 * Pairing summary: centered modal (blur + dim). v4 layout: route → dates → pairing + Pairing • legs.
 * Data resolution path unchanged.
 */
export default function TripQuickPreviewSheet({
  visible,
  trip,
  onClose,
  onOpenFullTrip,
  pairingUuid,
}: {
  visible: boolean;
  trip: CrewScheduleTrip | null;
  onClose: () => void;
  onOpenFullTrip: () => void;
  pairingUuid?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { width: winW, height: winH } = useWindowDimensions();
  const [resolvedTrip, setResolvedTrip] = useState<CrewScheduleTrip | null>(
    null,
  );
  const [resolveSettled, setResolveSettled] = useState(false);
  const previewTargetTripIdRef = useRef<string>("");
  const previewPaintSealedRef = useRef(false);

  const tripRef = useRef(trip);
  tripRef.current = trip;

  useLayoutEffect(() => {
    const tripRow = tripRef.current;
    if (!visible) {
      previewPaintSealedRef.current = false;
      previewTargetTripIdRef.current = "";
      setResolvedTrip(null);
      setResolveSettled(false);
      return;
    }
    if (!tripRow) {
      setResolvedTrip(null);
      setResolveSettled(false);
      return;
    }
    previewTargetTripIdRef.current = tripRow.id;
    if (isExemptFromStrictPairingPaint(tripRow)) {
      previewPaintSealedRef.current = true;
      setResolvedTrip(null);
      setResolveSettled(true);
      return;
    }
    const monthKey = monthCalendarKey(tripRow.year, tripRow.month);
    const rowDate =
      tripRow.startDate && /^\d{4}-\d{2}-\d{2}/.test(tripRow.startDate)
        ? tripRow.startDate.slice(0, 10)
        : null;
    const cached = readPairingDetailFromMonthCache(
      tripRow.id,
      monthKey,
      rowDate,
    );
    if (cached) {
      previewPaintSealedRef.current = true;
      setResolvedTrip(cached);
      setResolveSettled(true);
      return;
    }
    const anchor = rowDate;
    const { pick: instant } = buildPairingFirstPaintDecision(
      tripRow.id,
      anchor,
      tripRow,
    );
    if (instant && canSealPairingSurface(instant.trip)) {
      previewPaintSealedRef.current = true;
      setResolvedTrip(instant.trip);
      setResolveSettled(true);
      return;
    }
    setResolvedTrip(null);
    setResolveSettled(false);
  }, [visible, trip?.id]);

  useEffect(() => {
    if (!visible || !trip || isExemptFromStrictPairingPaint(trip)) {
      return;
    }
    if (previewPaintSealedRef.current) {
      return;
    }
    const targetTripId = trip.id;
    const targetPairing = String(trip.pairingCode ?? "")
      .trim()
      .toUpperCase();
    let cancelled = false;
    void (async () => {
      if (previewPaintSealedRef.current) {
        return;
      }
      try {
        const r = await resolveRenderablePairingSnapshot(
          targetTripId,
          pairingUuid ?? null,
          trip,
        );
        if (cancelled) return;
        if (
          previewTargetTripIdRef.current !== targetTripId ||
          String(trip.pairingCode ?? "")
            .trim()
            .toUpperCase() !== targetPairing
        ) {
          return;
        }
        if (r) {
          setResolvedTrip((prev) => {
            if (
              previewPaintSealedRef.current &&
              prev &&
              canSealPairingSurface(prev)
            ) {
              return prev;
            }
            if (prev && shouldRejectWeakerPairingRender(prev, r.trip)) {
              if (canSealPairingSurface(prev)) {
                previewPaintSealedRef.current = true;
              }
              return prev;
            }
            const seal = canSealPairingSurface(r.trip);
            previewPaintSealedRef.current = seal;
            if (seal) {
              const mk = monthCalendarKey(r.trip.year, r.trip.month);
              const idk =
                readCommittedMonthSnapshot(mk)?.identityKey ??
                "preview-enriched";
              storeDetailReadyPairingInMonthCaches(r.trip, idk, mk);
            }
            return r.trip;
          });
        }
      } finally {
        if (!cancelled) {
          setResolveSettled(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, trip, pairingUuid]);

  const paintTrip = useMemo((): CrewScheduleTrip | null => {
    if (!trip) return null;
    if (isExemptFromStrictPairingPaint(trip)) return trip;
    return resolvedTrip;
  }, [trip, resolvedTrip]);

  const showLoadingShell = Boolean(
    visible && trip && !isExemptFromStrictPairingPaint(trip) && !resolveSettled,
  );

  const showErrorStub = Boolean(
    visible &&
      trip &&
      !isExemptFromStrictPairingPaint(trip) &&
      resolveSettled &&
      !resolvedTrip,
  );

  const vm = useMemo(() => {
    if (!visible || !trip || showLoadingShell || showErrorStub) return null;
    if (!paintTrip) return null;
    if (!paintTrip.id?.trim()) return null;
    if (
      !isExemptFromStrictPairingPaint(trip) &&
      !validateVisibleTripHandoff(paintTrip).ok
    )
      return null;
    return buildTripDetailViewModel(paintTrip);
  }, [visible, trip, paintTrip, showLoadingShell, showErrorStub]);

  const statTiles: TripStatTile[] = useMemo(
    () => (vm ? vm.statTiles : []),
    [vm],
  );

  const cardMaxW = Math.min(380, winW * 0.92);
  const cardMaxH = Math.min(winH * 0.92, 720 + insets.bottom);
  const scrollMaxH = cardMaxH - (12 + 8 + 44 + 12);

  if (!trip) return null;

  const dutyN =
    paintTrip && vm
      ? getDisplaySpanAndDutyDayCount(paintTrip).dutyDayCount ||
        paintTrip.dutyDays ||
        vm.days.length
      : 0;
  const legCountVm = paintTrip?.legs?.length ?? 0;
  const span =
    vm && paintTrip
      ? getDisplaySpanAndDutyDayCount(paintTrip)
      : { displayStartDate: "", displayEndDate: "" };
  const dateRangeFormatted =
    vm && paintTrip
      ? formatPairingPopupDateRange(
          span.displayStartDate,
          span.displayEndDate,
        )
      : "";

  const pairingTail =
    dutyN > 0 && legCountVm > 0
      ? ` · ${dutyN}-Day Pairing • ${legCountVm} leg${legCountVm === 1 ? "" : "s"}`
      : dutyN > 0
        ? ` · ${dutyN}-Day Pairing`
        : legCountVm > 0
          ? ` • ${legCountVm} leg${legCountVm === 1 ? "" : "s"}`
          : "";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      <View style={styles.wrap} pointerEvents="box-none">
        <BlurView
          intensity={Platform.OS === "ios" ? 42 : 32}
          tint="light"
          style={StyleSheet.absoluteFill}
          experimentalBlurMethod={
            Platform.OS === "android" ? "dimezisBlurView" : undefined
          }
        />
        <Pressable
          style={[StyleSheet.absoluteFill, styles.dimVeil]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View
          style={[styles.centerBox, { paddingBottom: insets.bottom + 8 }]}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.card,
              {
                width: cardMaxW,
                maxHeight: cardMaxH,
                paddingTop: 10,
                shadowOpacity: Platform.OS === "ios" ? 0.14 : 0.1,
              },
            ]}
          >
            <View style={styles.grabberWrap}>
              <View style={styles.grabber} />
            </View>
            <Pressable
              onPress={onClose}
              style={styles.closeFab}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close preview"
            >
              <Ionicons name="close" size={18} color={T.textSecondary} />
            </Pressable>

            <ScrollView
              style={{ maxHeight: scrollMaxH }}
              contentContainerStyle={styles.cardScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              bounces={false}
            >
              {showLoadingShell ? (
                <View style={styles.hydrateShell}>
                  <Text style={styles.pairingAccent}>{trip.pairingCode}</Text>
                  <Text style={styles.muted13}>Loading full pairing…</Text>
                  <ActivityIndicator
                    style={styles.hydrateSpinner}
                    color={T.accent}
                  />
                  <PrimaryCta onPress={() => { onClose(); onOpenFullTrip(); }} />
                </View>
              ) : showErrorStub ? (
                <View style={styles.hydrateShell}>
                  <Text style={styles.pairingAccent}>{trip.pairingCode}</Text>
                  <Text style={styles.muted13}>
                    Preview unavailable for this assignment.
                  </Text>
                  <PrimaryCta onPress={() => { onClose(); onOpenFullTrip(); }} />
                </View>
              ) : vm && paintTrip ? (
                <>
                  <View style={styles.modalHeaderCenter}>
                    <RouteHeadline routeSummary={vm.routeSummary} />

                    <Text style={styles.dateRangeDow}>{dateRangeFormatted}</Text>

                    <Text style={styles.pairingMetaLine}>
                      <Text style={styles.pairingAccent}>{vm.pairingCode}</Text>
                      <Text style={styles.pairingMetaRest}>{pairingTail}</Text>
                    </Text>
                  </View>

                  <MetricsStrip
                    report={formatReportForPopup(
                      reportTimePreview(paintTrip, vm),
                    )}
                    block={tileVal(statTiles, "block")}
                    credit={tileVal(statTiles, "credit")}
                    tafb={tileVal(statTiles, "tafb")}
                  />

                  <View style={styles.legList}>
                    {vm.days.map((day, idx) => (
                      <CompactLegPreviewRow
                        key={day.panelId}
                        day={day}
                        isLast={idx === vm.days.length - 1}
                      />
                    ))}
                  </View>

                  <LayoverStaysCard
                    trip={paintTrip}
                    preview={vm.layoverHotelPreview}
                  />

                  <Text style={styles.crewLabel}>CREW</Text>
                  <CrewChipsRow members={vm.crewMembers} session={session} />

                  <PrimaryCta onPress={() => { onClose(); onOpenFullTrip(); }} />
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PrimaryCta({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      style={styles.primaryBtn}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open full trip detail"
    >
      <View style={styles.primaryBtnInner}>
        <View style={styles.primaryBtnSpacer} />
        <Text style={styles.primaryBtnText}>Open Full Trip Detail</Text>
        <View style={styles.primaryBtnSpacer}>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </View>
      </View>
    </Pressable>
  );
}

function tileVal(tiles: TripStatTile[], id: string): string {
  return tiles.find((t) => t.id === id)?.value ?? "—";
}

/** Mock: "Mon, May 4, 2026 → Wed, May 6, 2026" */
function formatPairingPopupDateRange(startIso: string, endIso: string): string {
  const a = String(startIso ?? "").slice(0, 10);
  const b = String(endIso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) {
    return "";
  }
  const o: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  const left = da.toLocaleDateString("en-US", o);
  const right = db.toLocaleDateString("en-US", o);
  if (a === b) return left;
  return `${left} → ${right}`;
}

/** v4 metrics: BLOCK/CREDIT/TAFB as HH:MM from decimal hour strings (e.g. 14.50 → 14:30). */
function formatHoursMetricForPopup(raw: string): string {
  const t = String(raw ?? "").trim();
  if (!t || t === "—") return "—";
  if (/^\d{1,2}:\d{2}$/.test(t)) return t;
  const n = parseFloat(t.replace(/[^\d.+-]/g, ""));
  if (!Number.isFinite(n) || n < 0) return t;
  if (n > 72) return t;
  const totalMin = Math.round(n * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatReportForPopup(raw: string): string {
  const t = String(raw ?? "").trim();
  if (!t || t === "—") return "—";
  if (/^\d{4}$/.test(t)) return `${t.slice(0, 2)}:${t.slice(2)}`;
  return t;
}

/**
 * Pairing-summary convention: omit report base at the start; show layovers + return/base only.
 * E.g. JFK · DUB · JFK → DUB · JFK
 */
function pairingRouteDisplaySegments(routeSummary: string): string[] {
  const parts = splitRouteForDisplay(routeSummary);
  if (parts.length >= 2) return parts.slice(1);
  return parts;
}

function RouteHeadline({ routeSummary }: { routeSummary: string }) {
  const displayParts = pairingRouteDisplaySegments(routeSummary);
  if (displayParts.length === 0) {
    return (
      <Text style={styles.routeBig} numberOfLines={3}>
        {routeSummary.trim() || "—"}
      </Text>
    );
  }
  if (displayParts.length === 1) {
    return (
      <Text style={styles.routeBig} numberOfLines={3}>
        <Text style={styles.routeCity}>{displayParts[0]}</Text>
      </Text>
    );
  }
  return (
    <Text style={styles.routeBig} numberOfLines={3}>
      {displayParts.map((p, i) => (
        <React.Fragment key={`${p}-${i}`}>
          {i > 0 ? <Text style={styles.routeDot}> • </Text> : null}
          <Text style={styles.routeCity}>{p}</Text>
        </React.Fragment>
      ))}
    </Text>
  );
}

function MetricsStrip({
  report,
  block,
  credit,
  tafb,
}: {
  report: string;
  block: string;
  credit: string;
  tafb: string;
}) {
  const cells: { label: string; value: string; valueStyle?: object }[] = [
    { label: "REPORT", value: report, valueStyle: styles.metricValReport },
    { label: "BLOCK", value: block },
    { label: "CREDIT", value: credit, valueStyle: styles.metricValCredit },
    { label: "TAFB", value: tafb },
  ];
  return (
    <View style={styles.metricsRow}>
      {cells.map((c, i) => (
        <React.Fragment key={c.label}>
          {i > 0 ? <View style={styles.metricDivider} /> : null}
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>{c.label}</Text>
            <Text
              style={[styles.metricVal, c.valueStyle]}
              numberOfLines={1}
            >
              {c.value}
            </Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function CompactLegPreviewRow({
  day,
  isLast,
}: {
  day: TripDayViewModel;
  isLast: boolean;
}) {
  const leg = day.legs[0];
  const extras = day.legs.length - 1;
  const dep = leg?.departureAirport?.trim().toUpperCase().slice(0, 4) ?? "—";
  const arr = leg?.arrivalAirport?.trim().toUpperCase().slice(0, 4) ?? "—";
  const depT = clockToUi(leg?.departLocal ?? leg?.reportLocal);
  const arrT = clockToUi(leg?.arriveLocal);
  const blockL = leg ? legBlockDurationLabel(leg) : "—";
  const fn = leg ? flightNoLabel(leg) : "";
  const gateLine = leg ? formatGateSubline(leg) : null;

  return (
    <View style={[styles.legRowWrap, isLast ? styles.legRowWrapLast : null]}>
      <View style={styles.legRowInner}>
        <View style={styles.redRail} />
        <View style={styles.legRowBody}>
          <View style={styles.legRowTop}>
            <View style={styles.dayBadge}>
              <Text style={styles.dayBadgeTitle}>DAY {day.dayIndex}</Text>
              <Text style={styles.dayBadgeSub}>
                {dayBadgeCalendarSubline(day.dateIso)}
              </Text>
            </View>
            <View style={styles.legRowMain}>
              <Text style={styles.legRouteTxt}>
                {dep} → {arr}
                {fn ? <Text style={styles.legFn}>  {fn}</Text> : null}
              </Text>
              <Text style={styles.legTimeLine}>
                {depT} — {arrT}
                {blockL !== "—" ? ` · ${blockL}` : ""}
              </Text>
            </View>
            <View style={styles.legRowRight}>
              <View style={styles.railStack}>
                {extras > 0 ? (
                  <Text style={styles.railPlus} numberOfLines={1}>
                    +{extras} leg{extras === 1 ? "" : "s"}
                  </Text>
                ) : (
                  <Text style={styles.railOnTime} numberOfLines={1}>
                    ON TIME
                  </Text>
                )}
                {extras === 0 && gateLine ? (
                  <Text style={styles.railGate} numberOfLines={2}>
                    {gateLine}
                  </Text>
                ) : null}
              </View>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={T.textSecondary}
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Red badge second line: "MAY 4" (month uppercase + day). */
function dayBadgeCalendarSubline(iso: string): string {
  const s = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(`${s}T12:00:00`);
  const mon = d
    .toLocaleDateString("en-US", { month: "short" })
    .toUpperCase()
    .replace(".", "");
  const dayNum = d.getDate();
  if (!Number.isFinite(dayNum)) return "";
  return `${mon} ${dayNum}`;
}

function LayoverStaysCard({
  trip,
  preview,
}: {
  trip: CrewScheduleTrip;
  preview: TripDetailViewModel["layoverHotelPreview"];
}) {
  const model = layoverCardModelExpanded(trip, preview);
  return (
    <View style={styles.layoverCard}>
      <Text style={styles.layoverSectionTitle}>LAYOVERS & STAYS</Text>

      {model ? (
        <>
          <View style={styles.layoverSummaryRow}>
            <MaterialCommunityIcons
              name="office-building-outline"
              size={20}
              color={LAYOVER_BUILDING}
              style={styles.layoverBuildingIcon}
            />
            <View style={styles.layoverSummaryTextCol}>
              <Text style={styles.layoverNightsHero}>{model.nightsLine}</Text>
              <Text style={styles.layoverHotelsSub} numberOfLines={1}>
                {model.detailLine}
              </Text>
            </View>
          </View>

          <View style={styles.layoverHRule} />

          <View style={styles.layoverCityGrid}>
            {model.columns.length >= 2 ? (
              <>
                <LayoverCityBlock col={model.columns[0]!} />
                <View style={styles.layoverVRule} />
                <LayoverCityBlock col={model.columns[1]!} />
              </>
            ) : (
              <LayoverCityBlock col={model.columns[0]!} wide />
            )}
          </View>
        </>
      ) : (
        <Text style={styles.layoverHotelsSub}>—</Text>
      )}
    </View>
  );
}

function LayoverCityBlock({
  col,
  wide,
}: {
  col: LayoverCol;
  wide?: boolean;
}) {
  return (
    <View
      style={[styles.layoverCityBlock, wide ? styles.layoverCityBlockWide : null]}
    >
      <Text style={styles.layoverCityCode}>{col.code}</Text>
      <View style={styles.layoverWeatherRow}>
        {col.weatherKind === "sunny" ? (
          <MaterialCommunityIcons
            name="weather-sunny"
            size={13}
            color={WEATHER_SUN}
          />
        ) : (
          <MaterialCommunityIcons
            name="weather-partly-cloudy"
            size={13}
            color={WEATHER_PARTLY_ICON}
          />
        )}
        <Text style={styles.layoverWeatherText} numberOfLines={1}>
          {col.weatherText}
        </Text>
      </View>
      <View style={styles.layoverHotelTap}>
        <Text style={styles.layoverHotelText} numberOfLines={1}>
          {col.hotelLine}
          {col.hotelLine.trim().length > 0 ? (
            <Text style={styles.layoverHotelChev}> &gt;</Text>
          ) : null}
        </Text>
      </View>
    </View>
  );
}

function CrewChipsRow({
  members,
  session,
}: {
  members: TripDetailViewModel["crewMembers"];
  session: Session | null;
}) {
  if (!members.length) {
    return <Text style={styles.emdash}>—</Text>;
  }
  const cap = members.slice(0, 4);

  if (cap.length === 1) {
    const c = cap[0]!;
    return (
      <View style={styles.crewGridSingle}>
        <View style={[styles.crewChip, styles.crewChipSolo]}>
          <Text style={styles.crewChipPos} numberOfLines={1}>
            F1
          </Text>
          <Text
            style={styles.crewChipName}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {crewShortNameForChip(c.name, session)}
          </Text>
        </View>
      </View>
    );
  }

  const pairs: (typeof cap)[] = [];
  for (let i = 0; i < cap.length; i += 2) {
    pairs.push(cap.slice(i, i + 2));
  }

  return (
    <View style={styles.crewGrid}>
      {pairs.map((pair, rowIndex) => (
        <View key={`crew-row-${rowIndex}`} style={styles.crewGridRow}>
          {pair.map((c, colIndex) => {
            const i = rowIndex * 2 + colIndex;
            return (
              <View
                key={`${c.position}-${c.name}-${i}`}
                style={styles.crewChip}
              >
                <Text style={styles.crewChipPos} numberOfLines={1}>
                  F{i + 1}
                </Text>
                <Text
                  style={styles.crewChipName}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {crewShortNameForChip(c.name, session)}
                </Text>
              </View>
            );
          })}
          {pair.length === 1 ? <View style={styles.crewGridCellSpacer} /> : null}
        </View>
      ))}
    </View>
  );
}

/** "First L." for chips; "You" when matched to session. */
function crewShortNameForChip(name: string, session: Session | null): string {
  const n = name?.trim() || "—";
  if (isLikelySelf(n, session)) return "You";
  return formatCrewNameFirstLastInitial(n);
}

function titleCaseToken(t: string): string {
  const s = t.trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function formatCrewNameFirstLastInitial(raw: string): string {
  let n = raw.trim();
  if (!n) return "—";
  if (/^.+\s*,\s*.+$/.test(n)) {
    const [last, firstRest] = n.split(",").map((x) => x.trim());
    if (last && firstRest) n = `${firstRest} ${last}`;
  }
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return titleCaseToken(parts[0]!);
  const first = titleCaseToken(parts[0]!);
  const last = parts[parts.length - 1]!;
  const letter = last.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase();
  return letter ? `${first} ${letter}.` : first;
}

function isLikelySelf(crewName: string, session: Session | null): boolean {
  if (!session?.user || !crewName.trim()) return false;
  const meta = session.user.user_metadata as
    | { full_name?: string; name?: string }
    | undefined;
  const full = (meta?.full_name ?? meta?.name ?? "").trim();
  if (!full) return false;
  const a = crewName.trim().toUpperCase();
  const b = full.toUpperCase();
  if (a === b) return true;
  const aTok = a.split(/\s+/).filter(Boolean);
  const bTok = b.split(/\s+/).filter(Boolean);
  const aLast = aTok[aTok.length - 1];
  const bLast = bTok[bTok.length - 1];
  if (aLast && bLast && aLast === bLast) return true;
  if (aTok[0] && bTok[0] && aTok[0] === bTok[0]) return true;
  return false;
}

/* --- Presentation-only helpers --- */

function orderedUniqueLayoverStations(trip: CrewScheduleTrip): string[] {
  const e = trip.layoverStationByDate;
  if (!e) return [];
  const keys = Object.keys(e).sort((a, b) => a.localeCompare(b));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const v = String(e[k] ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function splitRouteForDisplay(routeSummary: string): string[] {
  const raw = routeSummary.trim();
  if (!raw) return [];
  if (/[–-]/.test(raw)) {
    const noSpace = raw.replace(/\s+/g, "");
    if (/^[A-Za-z0-9–\-]+$/i.test(noSpace) && /[–-]/.test(raw)) {
      return raw
        .split(/[\u2013\-]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  const delims = [" · ", " • ", "·", "•", " → ", " - "];
  for (const d of delims) {
    if (raw.includes(d)) {
      return raw
        .split(d)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [raw];
}

function clockToUi(t: string | null | undefined): string {
  if (t == null || !String(t).trim()) return "—";
  const s = String(t).trim();
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2)}`;
  return s;
}

function legBlockDurationLabel(leg: CrewScheduleLeg): string {
  const b = leg.blockTimeLocal?.trim();
  if (!b) return "—";
  if (/^\d{4}$/.test(b)) {
    const h = parseInt(b.slice(0, 2), 10);
    const m = parseInt(b.slice(2), 10);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      return `${h}h ${String(m).padStart(2, "0")}m`;
    }
  }
  const n = Number(b);
  if (Number.isFinite(n)) return `${n.toFixed(1)}h`;
  return b;
}

function reportTimePreview(
  trip: CrewScheduleTrip,
  vm: TripDetailViewModel,
): string {
  const rows = trip.summary?.legs;
  if (rows?.length) {
    const r = rows[0]?.report;
    if (r != null && String(r).trim()) return String(r).trim();
  }
  const first = vm.days[0]?.legs?.[0];
  if (first?.reportLocal) return clockToUi(first.reportLocal);
  if (first?.departLocal) return clockToUi(first.departLocal);
  return "—";
}

function flightNoLabel(leg: CrewScheduleLeg): string {
  const fn = String(leg.flightNumber ?? "")
    .trim()
    .replace(/\s+/g, "");
  if (!fn) return "";
  const digits = fn.replace(/\D/g, "");
  if (digits.length >= 2) return `B6 ${digits}`;
  return fn;
}

function formatGateSubline(leg: CrewScheduleLeg): string | null {
  const dep = leg.departureTerminalGate?.trim();
  const arr = leg.arrivalTerminalGate?.trim();
  const pick = arr || dep;
  if (!pick) return null;
  if (pick.includes("·")) return pick;
  if (/^T\d+/i.test(pick) && /G\d+|Gate/i.test(pick)) {
    return pick.replace(/\s+/g, " ");
  }
  return pick;
}

type LayoverCol = {
  code: string;
  weatherKind: "sunny" | "partly";
  /** v4 mock shape e.g. "62°F · Sunny"; placeholder without weather API. */
  weatherText: string;
  hotelLine: string;
};

function layoverCardModelExpanded(
  trip: CrewScheduleTrip,
  preview: TripDetailViewModel["layoverHotelPreview"],
): {
  nightsLine: string;
  detailLine: string;
  columns: LayoverCol[];
} | null {
  const stationsOrdered = orderedUniqueLayoverStations(trip);
  const sh = trip.summary?.hotel;
  const tripHotel = trip.hotel;
  let hotelCount = 0;
  if (tripHotel?.name?.trim()) hotelCount += 1;
  if (sh?.name?.trim() && sh.name.trim() !== tripHotel?.name?.trim()) {
    hotelCount += 1;
  }

  let nightsLine = "—";
  if (sh?.nights != null && sh.nights > 0) {
    nightsLine = `${sh.nights} Night${sh.nights === 1 ? "" : "s"}`;
  } else if (stationsOrdered.length > 1) {
    nightsLine = `${stationsOrdered.length - 1} Night${stationsOrdered.length === 2 ? "" : "s"}`;
  } else if (stationsOrdered.length === 1) {
    nightsLine = "1 Night";
  }

  const cities =
    stationsOrdered.join(", ") ||
    trip.layoverCity?.trim() ||
    preview?.layoverLine?.trim() ||
    "";

  const hotelBits: string[] = [];
  if (hotelCount > 0) {
    hotelBits.push(`${hotelCount} Hotel${hotelCount === 1 ? "" : "s"}`);
  }
  if (cities) hotelBits.push(cities);
  let detailLine = hotelBits.join(" · ");
  if (!detailLine && preview?.hotelLine?.trim()) {
    detailLine = preview.hotelLine.trim();
  }

  const hotelName =
    tripHotel?.name?.trim() ||
    sh?.name?.trim() ||
    (preview?.hotelLine ? preview.hotelLine.split("·")[0]!.trim() : "");
  const hotelCity =
    tripHotel?.city?.trim() || sh?.city?.trim() || "";

  const hotelLineParts =
    preview?.hotelLine
      ?.split(/\s*·\s*/)
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const columns: LayoverCol[] = [];
  const codes = stationsOrdered.slice(0, 2);
  if (codes.length === 0 && cities) {
    const firstCity = cities.split(",")[0]!.trim().slice(0, 3).toUpperCase();
    if (firstCity) {
      columns.push({
        code: firstCity,
        weatherKind: "sunny",
        weatherText: "— · —",
        hotelLine:
          hotelLineParts[0] ??
          hotelName ??
          preview?.hotelLine?.trim() ??
          "",
      });
    }
  } else {
    codes.forEach((code, idx) => {
      const short = code.slice(0, 3).toUpperCase();
      const line =
        hotelLineParts[idx] ??
        (idx === 0
          ? hotelName
          : hotelLineParts[0]
            ? hotelLineParts[hotelLineParts.length - 1] ?? ""
            : hotelName || hotelCity || "");
      columns.push({
        code: short,
        weatherKind: idx === 0 ? "sunny" : "partly",
        weatherText: "— · —",
        hotelLine: line,
      });
    });
  }

  if (!detailLine && !cities && nightsLine === "—" && columns.length === 0) {
    return preview?.layoverLine || preview?.hotelLine
      ? {
          nightsLine: "Layover",
          detailLine:
            [preview.layoverLine, preview.hotelLine].filter(Boolean).join(" · "),
          columns: preview.hotelLine
            ? [
                {
                  code: "LAY",
                  weatherKind: "sunny",
                  weatherText: "— · —",
                  hotelLine: preview.hotelLine.trim(),
                },
              ]
            : [],
        }
      : null;
  }

  return {
    nightsLine,
    detailLine: detailLine || "—",
    columns: columns.length
      ? columns
      : [
          {
            code: "—",
            weatherKind: "sunny",
            weatherText: "— · —",
            hotelLine: "",
          },
        ],
  };
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  dimVeil: {
    backgroundColor: "rgba(15, 23, 42, 0.36)",
  },
  centerBox: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: T.surface,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 12,
  },
  grabberWrap: { alignItems: "center", paddingBottom: 4, marginTop: 2 },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.line,
  },
  closeFab: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: T.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
  },
  cardScrollContent: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  modalHeaderCenter: {
    alignSelf: "stretch",
    alignItems: "center",
  },
  hydrateShell: {
    paddingVertical: 8,
  },
  hydrateSpinner: { marginVertical: 20 },
  pairingAccent: {
    fontSize: 15,
    fontWeight: "800",
    color: T.accent,
    letterSpacing: -0.2,
  },
  pairingMetaLine: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
  },
  pairingMetaRest: {
    color: T.textSecondary,
    fontWeight: "600",
    fontSize: 13,
  },
  routeBig: {
    marginTop: 2,
    fontSize: 19,
    fontWeight: "800",
    color: T.text,
    letterSpacing: -0.35,
    lineHeight: 24,
  },
  routeCity: { fontWeight: "800", color: T.text },
  routeDot: { fontWeight: "900", color: T.accent, fontSize: 14 },
  dateRangeDow: {
    marginTop: 7,
    fontSize: 11,
    fontWeight: "600",
    color: T.textSecondary,
    opacity: 0.88,
    lineHeight: 15,
    textAlign: "center",
    alignSelf: "stretch",
  },
  muted13: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    color: T.textSecondary,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 2,
    backgroundColor: T.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: T.line,
    marginVertical: 0,
  },
  metricCell: {
    flex: 1,
    paddingHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  metricLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: T.textSecondary,
    letterSpacing: 0.35,
    marginBottom: 2,
  },
  metricVal: {
    fontSize: 12,
    fontWeight: "800",
    color: T.text,
  },
  metricValReport: {
    color: "#C2410C",
  },
  metricValCredit: {
    color: T.importReview.good,
  },
  legList: {
    marginTop: 6,
  },
  legRowWrap: {
    marginBottom: 6,
  },
  legRowWrapLast: {
    marginBottom: 0,
  },
  legRowInner: {
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: T.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  redRail: {
    width: 3,
    backgroundColor: T.accent,
    alignSelf: "stretch",
  },
  legRowBody: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  legRowTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  dayBadge: {
    backgroundColor: T.accent,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
    marginRight: 8,
    minWidth: 48,
    alignItems: "flex-start",
  },
  dayBadgeTitle: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  dayBadgeSub: {
    marginTop: 2,
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  legRowMain: { flex: 1, minWidth: 0 },
  legRouteTxt: {
    fontSize: 12,
    fontWeight: "800",
    color: T.text,
  },
  legFn: {
    fontSize: 11,
    fontWeight: "800",
    color: "#2563EB",
  },
  legTimeLine: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "600",
    color: T.textSecondary,
  },
  legRowRight: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 4,
    maxWidth: 88,
    gap: 4,
  },
  railStack: {
    alignItems: "flex-end",
    flexShrink: 1,
  },
  railPlus: {
    fontSize: 10,
    fontWeight: "800",
    color: "#2563EB",
    textAlign: "right",
  },
  railOnTime: {
    fontSize: 9,
    fontWeight: "800",
    color: ON_TIME_GREEN,
    textAlign: "right",
  },
  railGate: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "600",
    color: T.textSecondary,
    textAlign: "right",
  },
  layoverCard: {
    marginTop: 8,
    marginHorizontal: 0,
    backgroundColor: LAYOVER_CARD_BG,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  layoverSectionTitle: {
    fontSize: 7,
    fontWeight: "600",
    color: LAYOVER_LABEL,
    letterSpacing: 0.65,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  layoverSummaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  layoverBuildingIcon: {
    marginTop: 0,
    marginRight: 8,
  },
  layoverSummaryTextCol: {
    flex: 1,
    minWidth: 0,
  },
  layoverNightsHero: {
    fontSize: 16,
    fontWeight: "600",
    color: LAYOVER_WHITE,
    letterSpacing: -0.35,
    lineHeight: 19,
  },
  layoverHotelsSub: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "400",
    color: LAYOVER_MINT,
    lineHeight: 13,
  },
  layoverHRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: LAYOVER_RULE,
    marginTop: 6,
    marginBottom: 6,
  },
  layoverCityGrid: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  layoverVRule: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: LAYOVER_RULE,
    marginHorizontal: 6,
    alignSelf: "stretch",
  },
  layoverCityBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  layoverCityBlockWide: {
    flex: 1,
    paddingRight: 0,
  },
  layoverCityCode: {
    fontSize: 11,
    fontWeight: "600",
    color: LAYOVER_WHITE,
    letterSpacing: 0.25,
  },
  layoverWeatherRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
    gap: 4,
  },
  layoverWeatherText: {
    flex: 1,
    fontSize: 9,
    fontWeight: "400",
    color: LAYOVER_MINT,
    minWidth: 0,
  },
  layoverHotelTap: {
    marginTop: 3,
  },
  layoverHotelText: {
    fontSize: 10,
    fontWeight: "500",
    color: LAYOVER_MINT,
    lineHeight: 13,
  },
  layoverHotelChev: {
    fontSize: 10,
    fontWeight: "300",
    color: LAYOVER_MINT,
  },
  crewLabel: {
    marginTop: 10,
    fontSize: 9,
    fontWeight: "800",
    color: T.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  crewGrid: {
    width: "100%",
    alignSelf: "stretch",
    gap: 8,
  },
  crewGridRow: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    gap: 8,
  },
  crewGridCellSpacer: {
    flex: 1,
    minWidth: 0,
  },
  crewGridSingle: {
    flexDirection: "row",
    justifyContent: "center",
    alignSelf: "stretch",
    width: "100%",
  },
  crewChipSolo: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: "auto",
    alignSelf: "center",
    maxWidth: "96%",
  },
  crewChip: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: T.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  crewChipPos: {
    fontSize: 11,
    fontWeight: "900",
    color: T.accent,
    lineHeight: 14,
  },
  crewChipName: {
    fontSize: 10,
    fontWeight: "600",
    color: T.text,
    lineHeight: 14,
    flex: 1,
    minWidth: 0,
  },
  primaryBtn: {
    marginTop: 10,
    backgroundColor: T.accent,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  primaryBtnSpacer: {
    width: 22,
    alignItems: "flex-end",
  },
  primaryBtnText: {
    flex: 1,
    textAlign: "center",
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  emdash: {
    fontSize: 12,
    fontWeight: "700",
    color: T.textSecondary,
  },
});
