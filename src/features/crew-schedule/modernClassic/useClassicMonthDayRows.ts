import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fcDevMirrorScheduleLogToFile } from "../../../dev/fcDevFileLogger";
import type { FlicaCalendarListModel } from "../flicaCalendarDisplaySource";
import {
  buildClassicRowsFromDuties,
  fetchScheduleDutiesAndPairingsForMonth,
  type ClassicScheduleRow,
} from "../buildClassicRows";
import { buildHybridFlicaCalendarRows } from "../flicaHybridCalendarRows";
import { mergeLayoverOntoLegDates } from "../scheduleTime";
import { monthCalendarKey } from "../scheduleMonthCache";
import {
  canSaveScheduleMonthUISnapshot,
  isScheduleMonthUISnapshotCoherent,
  readScheduleMonthUISnapshot,
  writeScheduleMonthUISnapshot,
} from "../scheduleSnapshotCache";
import type { CrewScheduleTrip, ScheduleMonthMetrics } from "../types";
import {
  buildClassicDisplayItems,
  buildDayRowsFromDisplayItems,
  dateToIsoDateLocal,
  type DayRow,
} from "./classicMonthGridCore";

export function useClassicMonthDayRows({
  trips,
  year,
  month,
  refreshKey,
  monthMetrics,
  tripLayerReady,
  flicaCalendarListModel,
}: {
  trips: CrewScheduleTrip[];
  year: number;
  month: number;
  refreshKey?: number;
  monthMetrics?: ScheduleMonthMetrics | null;
  tripLayerReady: boolean;
  /** FLICA `crew_schedule` drives calendar list source when not `trip_derived`. */
  flicaCalendarListModel: FlicaCalendarListModel;
}): {
  rows: DayRow[] | null;
  isReady: boolean;
  mergedTrips: CrewScheduleTrip[];
  emptyMonth: boolean;
} {
  const loadEpochRef = useRef(0);
  const [loadEpoch, setLoadEpoch] = useState(0);
  const [classicCommit, setClassicCommit] = useState<{
    ymKey: string;
    classicRows: ClassicScheduleRow[];
  } | null>(null);
  const [classicSettledEpoch, setClassicSettledEpoch] = useState(0);

  const ymKey = monthCalendarKey(year, month);
  const flicaMode = flicaCalendarListModel.mode;

  useLayoutEffect(() => {
    loadEpochRef.current += 1;
    const epoch = loadEpochRef.current;
    setLoadEpoch(epoch);
    if (
      flicaMode === "trip_derived" ||
      flicaMode === "flica_mini_table"
    ) {
      const snap = readScheduleMonthUISnapshot(ymKey);
      if (snap && isScheduleMonthUISnapshotCoherent(snap, year, month)) {
        setClassicCommit({ ymKey, classicRows: snap.classicRows });
        setClassicSettledEpoch(epoch);
      } else {
        setClassicCommit(null);
        setClassicSettledEpoch(0);
      }
    } else {
      setClassicCommit({ ymKey, classicRows: [] });
      setClassicSettledEpoch(epoch);
    }
  }, [year, month, ymKey, flicaMode]);

  useEffect(() => {
    if (flicaMode !== "trip_derived" && flicaMode !== "flica_mini_table") {
      return;
    }
    const epoch = loadEpochRef.current;
    const y = year;
    const m = month;
    const key = ymKey;
    let cancelled = false;
    void (async () => {
      try {
        const { duties, pairings, pairingLegs } =
          await fetchScheduleDutiesAndPairingsForMonth(y, m);
        if (cancelled || epoch !== loadEpochRef.current) return;
        const rows = buildClassicRowsFromDuties(duties, pairings, pairingLegs);
        setClassicCommit({ ymKey: key, classicRows: rows });
        setClassicSettledEpoch(epoch);
      } catch {
        if (!cancelled && epoch === loadEpochRef.current) {
          const fallback = readScheduleMonthUISnapshot(key);
          if (fallback && isScheduleMonthUISnapshotCoherent(fallback, y, m)) {
            return;
          }
          setClassicCommit({ ymKey: key, classicRows: [] });
          setClassicSettledEpoch(epoch);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadEpoch, year, month, ymKey, refreshKey, flicaMode]);

  const mergedTrips = useMemo(
    () =>
      trips.map((t) => {
        const merged = mergeLayoverOntoLegDates(t);
        return merged ? { ...t, layoverByDate: merged } : t;
      }),
    [trips],
  );

  const classicHydratedForRequest = classicSettledEpoch === loadEpoch;
  const dutiesLoaded = classicCommit?.ymKey === ymKey && classicHydratedForRequest;
  const useFlicaMiniTable = flicaMode === "flica_mini_table";
  const useFlicaBlocked = flicaMode === "flica_blocked";
  const isReady =
    useFlicaBlocked
      ? true
      : dutiesLoaded && tripLayerReady;

  useEffect(() => {
    if (flicaMode !== "trip_derived") return;
    if (!isReady || !classicCommit || classicCommit.ymKey !== ymKey) return;
    const prevSnap = readScheduleMonthUISnapshot(ymKey);
    const metrics = monthMetrics ?? prevSnap?.monthMetrics ?? null;
    if (
      !canSaveScheduleMonthUISnapshot({
        monthKey: ymKey,
        trips,
        classicRows: classicCommit.classicRows,
        monthMetrics: metrics,
      })
    ) {
      return;
    }
    writeScheduleMonthUISnapshot({
      monthKey: ymKey,
      generatedAt: Date.now(),
      trips,
      classicRows: classicCommit.classicRows,
      monthMetrics: metrics,
    });
  }, [isReady, ymKey, trips, classicCommit, monthMetrics, flicaMode]);

  const viewModelRows = useMemo(
    () =>
      useFlicaBlocked
        ? null
        : buildClassicDisplayItems(
            isReady,
            classicCommit,
            ymKey,
            mergedTrips,
            year,
            month,
          ),
    [
      useFlicaBlocked,
      isReady,
      classicCommit,
      ymKey,
      mergedTrips,
      year,
      month,
    ],
  );

  const rows = useMemo(() => {
    if (useFlicaBlocked) {
      return [];
    }
    if (!viewModelRows) return null;
    const todayIso = dateToIsoDateLocal(new Date());
    const tripRows = buildDayRowsFromDisplayItems(
      viewModelRows,
      mergedTrips,
      todayIso,
    );
    if (useFlicaMiniTable) {
      const visibleMonth = `${year}-${String(month).padStart(2, "0")}`;
      return buildHybridFlicaCalendarRows({
        ledgerCells: flicaCalendarListModel.cells,
        tripDerivedRows: tripRows,
        visibleMonth,
        mergedTrips,
        todayIso,
        rawPairingDetailIndex: flicaCalendarListModel.rawPairingDetailIndex,
      });
    }
    return tripRows;
  }, [
    useFlicaMiniTable,
    useFlicaBlocked,
    flicaCalendarListModel,
    mergedTrips,
    viewModelRows,
    year,
    month,
  ]);

  useEffect(() => {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;

    if (useFlicaMiniTable) {
      const payload = {
        path: "flica_ledger_duty_hybrid_rows",
        ymKey,
        isReady,
        rowCount: rows?.length ?? 0,
        first10Rows: (rows ?? []).slice(0, 10).map((r) => ({
          dateIso: r.dateIso,
          pairingText: r.pairingText,
          cityText: r.cityText,
          reportText: r.reportText,
          kind: r.kind,
        })),
      };
      console.log("[FC_CLASSIC_ROWS_SOURCE]", payload);
      fcDevMirrorScheduleLogToFile("FC_CLASSIC_ROWS_SOURCE", payload);
      return;
    }

    if (useFlicaBlocked) {
      const payload = {
        path: "flica_ledger_blocked_empty_rows",
        ymKey,
        reason: flicaCalendarListModel.reason,
        visibleMonth: flicaCalendarListModel.visibleMonth,
        rowCount: 0,
      };
      console.log("[FC_CLASSIC_ROWS_SOURCE]", payload);
      fcDevMirrorScheduleLogToFile("FC_CLASSIC_ROWS_SOURCE", payload);
      return;
    }

    const why: string[] = [];
    if (!tripLayerReady) why.push("trip_layer_not_ready");
    if (!dutiesLoaded) why.push("duties_or_snapshot_not_ready");
    if (!classicCommit || classicCommit.ymKey !== ymKey) {
      why.push("classic_commit_not_coherent");
    }
    if (!viewModelRows) why.push("no_view_model_rows_yet");

    const payload = {
      path: "duty_classic_rows",
      ymKey,
      isReady,
      tripLayerReady,
      why,
      parentLedgerHint:
        "Trip-derived path: no crew_schedule row or emergency fallback. FLICA months use mini-table only.",
      rowCount: rows?.length ?? 0,
      first10Rows: (rows ?? []).slice(0, 10).map((r) => ({
        dateIso: r.dateIso,
        pairingText: r.pairingText,
        cityText: r.cityText,
        kind: r.kind,
      })),
    };
    console.log("[FC_CLASSIC_ROWS_SOURCE]", payload);
    fcDevMirrorScheduleLogToFile("FC_CLASSIC_ROWS_SOURCE", payload);
  }, [
    ymKey,
    isReady,
    useFlicaMiniTable,
    useFlicaBlocked,
    flicaCalendarListModel,
    rows,
    viewModelRows,
    tripLayerReady,
    dutiesLoaded,
    classicCommit,
  ]);

  const emptyMonth = Boolean(
    isReady &&
      flicaMode === "trip_derived" &&
      !trips.length &&
      (classicCommit?.classicRows.length ?? 0) === 0,
  );

  return { rows, isReady, mergedTrips, emptyMonth };
}
