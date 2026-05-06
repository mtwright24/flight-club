import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildClassicRowsFromDuties,
  fetchScheduleDutiesAndPairingsForMonth,
  type ClassicScheduleRow,
} from "../buildClassicRows";
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
}: {
  trips: CrewScheduleTrip[];
  year: number;
  month: number;
  refreshKey?: number;
  monthMetrics?: ScheduleMonthMetrics | null;
  tripLayerReady: boolean;
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

  useLayoutEffect(() => {
    loadEpochRef.current += 1;
    const epoch = loadEpochRef.current;
    setLoadEpoch(epoch);
    const snap = readScheduleMonthUISnapshot(ymKey);
    if (snap && isScheduleMonthUISnapshotCoherent(snap, year, month)) {
      setClassicCommit({ ymKey, classicRows: snap.classicRows });
      setClassicSettledEpoch(epoch);
    } else {
      setClassicCommit(null);
      setClassicSettledEpoch(0);
    }
  }, [year, month, ymKey]);

  useEffect(() => {
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
  }, [loadEpoch, year, month, ymKey, refreshKey]);

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
  const isReady = dutiesLoaded && tripLayerReady;

  useEffect(() => {
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
  }, [isReady, ymKey, trips, classicCommit, monthMetrics]);

  const viewModelRows = useMemo(
    () =>
      buildClassicDisplayItems(
        isReady,
        classicCommit,
        ymKey,
        mergedTrips,
        year,
        month,
      ),
    [isReady, classicCommit, ymKey, mergedTrips, year, month],
  );

  const rows = useMemo(() => {
    if (!viewModelRows) return null;
    const todayIso = dateToIsoDateLocal(new Date());
    return buildDayRowsFromDisplayItems(viewModelRows, mergedTrips, todayIso);
  }, [viewModelRows, mergedTrips]);

  const emptyMonth = Boolean(
    isReady &&
      !trips.length &&
      (classicCommit?.classicRows.length ?? 0) === 0,
  );

  return { rows, isReady, mergedTrips, emptyMonth };
}
