import { useCallback, useEffect, useMemo, useState } from "react";
import type { FlicaMonthStats } from "../../../services/flicaScheduleHtmlParser";
import { buildMonthlyStatsStripValues } from "../modernClassic/modernClassicHeaderMetrics";
import {
  fetchCrewScheduleFlicaForMonth,
  type CrewScheduleFlicaRow,
} from "../scheduleApi";
import {
  clampYearMonthToScheduleWindow,
} from "../scheduleMonthWindow";
import { loadLastMonthCursor, saveLastMonthCursor } from "../scheduleViewStorage";
import { useScheduleTripsForMonth } from "./useScheduleTripsForMonth";
import { useCrewScheduleHeaderBridge } from "../crewScheduleHeaderBridge";

/**
 * Month metrics strip (BLOCK / TAFB / …) aligned with Schedule tab — for Tradeboard / Open Time headers.
 */
export function useCrewScheduleMonthStrip() {
  const { crewHubSharedRefreshGeneration } = useCrewScheduleHeaderBridge();
  const seed = useMemo(() => {
    const d = new Date();
    return clampYearMonthToScheduleWindow(d.getFullYear(), d.getMonth() + 1, d);
  }, []);
  const [year, setYear] = useState(seed.year);
  const [month, setMonth] = useState(seed.month);
  const [flicaRow, setFlicaRow] = useState<CrewScheduleFlicaRow | null>(null);

  useEffect(() => {
    void loadLastMonthCursor().then((c) => {
      if (!c) return;
      const d = new Date();
      const cl = clampYearMonthToScheduleWindow(c.year, c.month, d);
      setYear(cl.year);
      setMonth(cl.month);
    });
  }, []);

  const requestedKey = useMemo(
    () => `${year}-${String(month).padStart(2, "0")}`,
    [year, month],
  );

  const loadFlica = useCallback(async () => {
    const mk = requestedKey;
    try {
      const row = await fetchCrewScheduleFlicaForMonth(year, month);
      const cur = `${year}-${String(month).padStart(2, "0")}`;
      if (cur !== mk) return;
      setFlicaRow(row?.month_key === mk ? row : null);
    } catch {
      setFlicaRow(null);
    }
  }, [year, month, requestedKey]);

  useEffect(() => {
    void loadFlica();
  }, [loadFlica, crewHubSharedRefreshGeneration]);

  const { trips, monthMetrics, loading } = useScheduleTripsForMonth(year, month);

  const visibleFlicaRow = useMemo(
    () => (flicaRow?.month_key === requestedKey ? flicaRow : null),
    [flicaRow, requestedKey],
  );

  const flicaStats: FlicaMonthStats = useMemo(() => {
    const raw = (visibleFlicaRow?.stats ?? {}) as Partial<FlicaMonthStats>;
    return {
      block: raw.block ?? "",
      credit: raw.credit ?? "",
      tafb: raw.tafb ?? "",
      ytd: raw.ytd ?? "",
      daysOff: typeof raw.daysOff === "number" ? raw.daysOff : 0,
    };
  }, [visibleFlicaRow]);

  const stripValues = useMemo(
    () => buildMonthlyStatsStripValues(monthMetrics, flicaStats),
    [monthMetrics, flicaStats],
  );

  const persistYm = (y: number, m: number) => {
    const d = new Date();
    const c = clampYearMonthToScheduleWindow(y, m, d);
    setYear(c.year);
    setMonth(c.month);
    void saveLastMonthCursor(c.year, c.month);
  };

  const monthLabelShort = useMemo(() => {
    const names = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${names[month - 1] ?? ""} ${year}`.trim();
  }, [year, month]);

  return {
    year,
    month,
    setYearMonth: persistYm,
    stripValues,
    stripLoading: loading,
    monthLabelShort,
    monthTrips: trips,
    monthMetrics,
    refreshFlicaMonthRow: loadFlica,
  };
}
