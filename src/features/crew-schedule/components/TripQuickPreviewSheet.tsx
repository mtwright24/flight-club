import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
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
  formatDisplayDateRangeLabelWithDow,
  getDisplaySpanAndDutyDayCount,
  type TripDayViewModel,
  type TripDetailViewModel,
  type TripStatTile,
} from "../tripDetailViewModel";
import type { CrewScheduleLeg, CrewScheduleTrip } from "../types";

/** Dark layover card (compact pairing summary — not glass). */
const LAYOVER_CARD_BG = "#14532D";
const LAYOVER_CARD_TITLE = "#A7F3D0";
const LAYOVER_CARD_MUTED = "#86EFAC";
const LAYOVER_CARD_EMPH = "#ECFDF5";

/**
 * Pairing summary: centered modal over the live schedule (blur + dim). Data path unchanged.
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
  const cardMaxH = Math.min(winH * 0.88, 640 + insets.bottom);
  const scrollMaxH = cardMaxH - (12 + 8 + 44 + 12);

  if (!trip) return null;

  const dutyN =
    paintTrip && vm
      ? getDisplaySpanAndDutyDayCount(paintTrip).dutyDayCount ||
        paintTrip.dutyDays ||
        vm.days.length
      : 0;
  const legCountVm = paintTrip?.legs?.length ?? 0;
  const dateRangeDow =
    vm && paintTrip
      ? formatDisplayDateRangeLabelWithDow(
          getDisplaySpanAndDutyDayCount(paintTrip).displayStartDate,
          getDisplaySpanAndDutyDayCount(paintTrip).displayEndDate,
        )
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
          intensity={Platform.OS === "ios" ? 28 : 20}
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
                shadowOpacity: Platform.OS === "ios" ? 0.12 : 0.08,
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
                  <Text style={styles.pairingMetaLine}>
                    <Text style={styles.pairingAccent}>{vm.pairingCode}</Text>
                    <Text style={styles.pairingMetaRest}>
                      {dutyN > 0 ? ` · ${dutyN}-Day Pairing` : ""}
                    </Text>
                  </Text>

                  <RouteHeadline routeSummary={vm.routeSummary} />

                  <Text style={styles.dateRangeDow}>{dateRangeDow}</Text>
                  <Text style={styles.summaryMicro}>
                    {dutyN > 0 ? `${dutyN} duty day${dutyN === 1 ? "" : "s"}` : ""}
                    {dutyN > 0 && legCountVm > 0 ? " · " : ""}
                    {legCountVm > 0
                      ? `${legCountVm} leg${legCountVm === 1 ? "" : "s"}`
                      : ""}
                  </Text>

                  <MetricsStrip
                    report={reportTimePreview(paintTrip, vm)}
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

                  <LayoverStaysCard trip={paintTrip} preview={vm.layoverHotelPreview} />

                  <Text style={styles.crewLabel}>CREW</Text>
                  <CrewChipsRow members={vm.crewMembers} />

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
      <Text style={styles.primaryBtnText}>Open Full Trip Detail</Text>
      <Ionicons name="chevron-forward" size={18} color="#fff" />
    </Pressable>
  );
}

function tileVal(tiles: TripStatTile[], id: string): string {
  return tiles.find((t) => t.id === id)?.value ?? "—";
}

function RouteHeadline({ routeSummary }: { routeSummary: string }) {
  const parts = splitRouteForDisplay(routeSummary);
  if (parts.length < 2) {
    return (
      <Text style={styles.routeBig} numberOfLines={2}>
        {routeSummary}
      </Text>
    );
  }
  return (
    <Text style={styles.routeBig} numberOfLines={2}>
      {parts.map((p, i) => (
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
  const rail = rightRailLabel(day);

  return (
    <View style={styles.legRowOuter}>
      <View style={styles.timelineCol}>
        <View style={styles.timelineDot} />
        {!isLast ? <View style={styles.timelineStem} /> : null}
      </View>
      <View style={styles.legRowCard}>
        <View style={styles.legRowTop}>
          <View style={styles.dayBadge}>
            <Text style={styles.dayBadgeTitle}>DAY {day.dayIndex}</Text>
            <Text style={styles.dayBadgeSub}>
              {day.dayLabel} {shortDom(day.dateIso)}
            </Text>
          </View>
          <View style={styles.legRowMain}>
            <View style={styles.legRouteRow}>
              <Text style={styles.legRouteTxt}>
                {dep} → {arr}
                {fn ? (
                  <Text style={styles.legFn}>{"  "}{fn}</Text>
                ) : null}
              </Text>
            </View>
            <Text style={styles.legTimeLine}>
              {depT} — {arrT}
              {blockL !== "—" ? ` · ${blockL}` : ""}
            </Text>
          </View>
          <View style={styles.legRowRight}>
            {rail ? (
              <Text
                style={extras > 0 ? styles.railPlus : styles.railMeta}
                numberOfLines={1}
              >
                {rail}
              </Text>
            ) : (
              <Text style={styles.railMeta} numberOfLines={1}>
                {""}
              </Text>
            )}
            <Ionicons
              name="chevron-forward"
              size={14}
              color={T.textSecondary}
              style={styles.legChev}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function shortDom(iso: string): string {
  const s = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = parseInt(s.slice(8, 10), 10);
  return Number.isFinite(d) ? String(d) : "";
}

function LayoverStaysCard({
  trip,
  preview,
}: {
  trip: CrewScheduleTrip;
  preview: TripDetailViewModel["layoverHotelPreview"];
}) {
  const model = layoverCardModel(trip, preview);
  return (
    <View style={styles.layoverCard}>
      <Text style={styles.layoverTitle}>LAYOVERS & STAYS</Text>
      {model ? (
        <>
          <Text style={styles.layoverNights}>{model.nightsLine}</Text>
          <Text style={styles.layoverSub} numberOfLines={2}>
            {model.detailLine}
          </Text>
        </>
      ) : (
        <Text style={styles.layoverSub}>—</Text>
      )}
    </View>
  );
}

function CrewChipsRow({
  members,
}: {
  members: TripDetailViewModel["crewMembers"];
}) {
  if (!members.length) {
    return <Text style={styles.emdash}>—</Text>;
  }
  const cap = members.slice(0, 4);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.crewScroll}
    >
      {cap.map((c, i) => (
        <View key={`${c.position}-${c.name}-${i}`} style={styles.crewChip}>
          <Text style={styles.crewChipPos} numberOfLines={1}>
            F{i + 1}
          </Text>
          <Text style={styles.crewChipName} numberOfLines={1}>
            {c.name?.trim() || "—"}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

/* --- Presentation-only helpers (existing trip / VM fields only) --- */

function splitRouteForDisplay(routeSummary: string): string[] {
  const raw = routeSummary.trim();
  if (!raw) return [];
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

function rightRailLabel(day: TripDayViewModel): string | null {
  const n = day.legs.length;
  if (n > 1) return `+${n - 1} leg${n - 1 === 1 ? "" : "s"}`;
  const leg = day.legs[0];
  if (!leg) return null;
  const g =
    leg.arrivalTerminalGate?.trim() || leg.departureTerminalGate?.trim();
  if (g) return g;
  return null;
}

function layoverCardModel(
  trip: CrewScheduleTrip,
  preview: TripDetailViewModel["layoverHotelPreview"],
): { nightsLine: string; detailLine: string } | null {
  const stations = trip.layoverStationByDate
    ? Array.from(
        new Set(
          Object.values(trip.layoverStationByDate)
            .map((s) => String(s).trim())
            .filter(Boolean),
        ),
      )
    : [];
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
  } else if (stations.length > 1) {
    nightsLine = `${stations.length - 1} Night${stations.length === 2 ? "" : "s"}`;
  } else if (stations.length === 1) {
    nightsLine = "1 Night";
  }

  const cities =
    stations.join(", ") ||
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

  if (!detailLine && !cities && nightsLine === "—") {
    return preview?.layoverLine || preview?.hotelLine
      ? {
          nightsLine: "Layover",
          detailLine:
            [preview.layoverLine, preview.hotelLine].filter(Boolean).join(" · "),
        }
      : null;
  }

  return { nightsLine, detailLine: detailLine || "—" };
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  dimVeil: {
    backgroundColor: "rgba(15, 23, 42, 0.22)",
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
    paddingHorizontal: 14,
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
    paddingBottom: 6,
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
    marginTop: 2,
    fontSize: 13,
    fontWeight: "700",
  },
  pairingMetaRest: {
    color: T.textSecondary,
    fontWeight: "600",
    fontSize: 13,
  },
  routeBig: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: "800",
    color: T.text,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  routeCity: { fontWeight: "800", color: T.text },
  routeDot: { fontWeight: "900", color: T.accent, fontSize: 14 },
  dateRangeDow: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "700",
    color: T.textSecondary,
    lineHeight: 15,
  },
  summaryMicro: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "600",
    color: T.textSecondary,
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
    paddingHorizontal: 4,
    backgroundColor: T.surfaceMuted,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: T.line,
    marginVertical: 2,
  },
  metricCell: {
    flex: 1,
    paddingHorizontal: 4,
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
    fontSize: 11,
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
    marginTop: 10,
    gap: 0,
  },
  legRowOuter: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  timelineCol: {
    width: 14,
    alignItems: "center",
    paddingTop: 12,
  },
  timelineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: T.accent,
  },
  timelineStem: {
    width: 2,
    marginTop: 2,
    backgroundColor: T.line,
    height: 32,
    borderRadius: 1,
  },
  legRowCard: {
    flex: 1,
    marginLeft: 4,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: T.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  legRowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  dayBadge: {
    backgroundColor: T.accent,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
    marginRight: 8,
    minWidth: 52,
  },
  dayBadgeTitle: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  dayBadgeSub: {
    marginTop: 2,
    color: "rgba(255,255,255,0.92)",
    fontSize: 9,
    fontWeight: "700",
  },
  legRowMain: { flex: 1, minWidth: 0 },
  legRouteRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
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
    alignItems: "flex-end",
    justifyContent: "flex-start",
    marginLeft: 4,
    maxWidth: 72,
  },
  railPlus: {
    fontSize: 10,
    fontWeight: "800",
    color: "#2563EB",
    textAlign: "right",
  },
  railMeta: {
    fontSize: 9,
    fontWeight: "700",
    color: T.textSecondary,
    textAlign: "right",
  },
  legChev: { marginTop: 6 },
  layoverCard: {
    marginTop: 10,
    backgroundColor: LAYOVER_CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  layoverTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: LAYOVER_CARD_TITLE,
    letterSpacing: 0.55,
    marginBottom: 4,
  },
  layoverNights: {
    fontSize: 15,
    fontWeight: "800",
    color: LAYOVER_CARD_EMPH,
  },
  layoverSub: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "600",
    color: LAYOVER_CARD_MUTED,
    lineHeight: 15,
  },
  crewLabel: {
    marginTop: 12,
    fontSize: 9,
    fontWeight: "800",
    color: T.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  crewScroll: {
    flexDirection: "row",
    gap: 6,
    paddingRight: 4,
  },
  crewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: T.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    maxWidth: 140,
  },
  crewChipPos: {
    fontSize: 10,
    fontWeight: "900",
    color: T.accent,
  },
  crewChipName: {
    fontSize: 10,
    fontWeight: "700",
    color: T.text,
    flexShrink: 1,
  },
  primaryBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.accent,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  primaryBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  emdash: {
    fontSize: 12,
    fontWeight: "700",
    color: T.textSecondary,
  },
});
