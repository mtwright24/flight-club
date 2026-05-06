import type { ScheduleMonthMetrics } from "../types";

export type ModernHeaderMetric = { id: string; label: string; value: string };

function formatDec(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(1);
}

/** BLOCK, CREDIT, TAFB, YTD, DAYS OFF — mock order. */
export function buildModernHeaderMetrics(
  server: ScheduleMonthMetrics | null | undefined,
): ModernHeaderMetric[] {
  if (server) {
    return [
      { id: "block", label: "BLOCK", value: formatDec(server.blockHours) },
      { id: "credit", label: "CREDIT", value: formatDec(server.creditHours) },
      { id: "tafb", label: "TAFB", value: formatDec(server.monthlyTafbHours) },
      { id: "ytd", label: "YTD", value: formatDec(server.ytdCreditHours) },
      {
        id: "off",
        label: "DAYS OFF",
        value: server.daysOff != null ? String(server.daysOff) : "—",
      },
    ];
  }
  return [
    { id: "block", label: "BLOCK", value: "—" },
    { id: "credit", label: "CREDIT", value: "—" },
    { id: "tafb", label: "TAFB", value: "—" },
    { id: "ytd", label: "YTD", value: "—" },
    { id: "off", label: "DAYS OFF", value: "—" },
  ];
}

/** Progress fraction 0–1 from month credit vs plausible line target (display-only). */
type FlicaStatsLike = {
  block?: string;
  credit?: string;
  tafb?: string;
  ytd?: string;
  daysOff?: number;
};

/** Prefer DB month metrics; fall back to FLICA month stat strings for the strip. */
export function buildMonthlyStatsStripValues(
  metrics: ScheduleMonthMetrics | null | undefined,
  flica: FlicaStatsLike | null | undefined,
): ModernHeaderMetric[] {
  const m = metrics;
  const hasServer =
    m != null &&
    (m.blockHours != null ||
      m.creditHours != null ||
      m.monthlyTafbHours != null ||
      m.ytdCreditHours != null ||
      m.daysOff != null);
  if (hasServer) return buildModernHeaderMetrics(m);

  const f = flica ?? {};
  const pick = (s: unknown) => {
    const t = String(s ?? "").trim();
    return t || "—";
  };
  const off =
    typeof f.daysOff === "number" && Number.isFinite(f.daysOff)
      ? String(f.daysOff)
      : "—";
  return [
    { id: "block", label: "BLOCK", value: pick(f.block) },
    { id: "credit", label: "CREDIT", value: pick(f.credit) },
    { id: "tafb", label: "TAFB", value: pick(f.tafb) },
    { id: "ytd", label: "YTD", value: pick(f.ytd) },
    { id: "off", label: "DAYS OFF", value: off },
  ];
}

export function scheduleProgressFromMetrics(
  metrics: ScheduleMonthMetrics | null | undefined,
): { pct: number; workedH: number; targetH: number } {
  const credit = metrics?.creditHours;
  if (credit == null || Number.isNaN(credit) || credit <= 0) {
    return { pct: 0, workedH: 0, targetH: 120 };
  }
  const targetH = Math.max(120, Math.ceil(credit / 10) * 10);
  const pct = Math.min(1, credit / targetH);
  return { pct, workedH: credit, targetH };
}
