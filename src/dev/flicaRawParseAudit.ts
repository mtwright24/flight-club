/**
 * TEMPORARY diagnostics only. Logs parsed FLICA HTML + pre-persistence duty ISO resolution.
 *
 * Enable: set `EXPO_PUBLIC_FLICA_PARSE_AUDIT=1` and run a dev build; import as usual.
 * Disable: unset the variable (default). No logs, no extra work.
 *
 * Runs on every import that invokes `runFlicaRawParseAuditIfEnabled` (no session / one-time guard).
 * Detailed pairing logs use canonical `YYYY-MM` so April (`2026-4` vs `2026-04`) is not skipped.
 *
 * Optional: mirrors the same lines to a plain-text file under Expo `cacheDirectory` when available.
 *
 * Does not persist to app DB, change import/parsing, or mutate caches. Safe to delete this file
 * and the two `runFlicaRawParseAuditIfEnabled` call sites when done.
 */

import {
  cacheDirectory,
  makeDirectoryAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";

import {
  enumerateIsoInclusive,
  resolveFlicaPersistLegDutyIso,
} from "../features/crew-schedule/flicaDutyDateResolve";
import {
  isFlicaNonFlyingActivityId,
  parseFlicaScheduleHtml,
  type FlicaLeg,
  type FlicaPairing,
  type FlicaScheduleMonth,
} from "../services/flicaScheduleHtmlParser";

const TAG_BASE = "[FLICA_RAW_PARSE_AUDIT]";
const HTML_TAG_BASE = "[FLICA_RAW_HTML_FULL_DUMP]";
const HTML_CHUNK_TAG_BASE = "[FLICA_RAW_HTML_FULL_DUMP_CHUNK]";

/** Stay under typical JS/console single-line limits (Metro, RN). */
const HTML_CHUNK_CHARS = 7000;

const APRIL_2026_PAIRING_CODES = new Set([
  "J1007",
  "J4173",
  "J4309",
  "J4041A",
  "J3H95",
  "J3C58",
  "J4195",
]);

const MAY_2026_PAIRING_CODES = new Set([
  "J4195",
  "J1012",
  "J1015",
  "J1010",
  "J1002",
]);

const PTV_AUDIT_WINDOW = { start: "2026-05-23", end: "2026-05-29" } as const;

/** `true` only in dev when explicitly enabled — never in production bundles unless flag is set at bundle time. */
export function isFlicaRawParseAuditEnabled(): boolean {
  return (
    typeof __DEV__ !== "undefined" &&
    __DEV__ === true &&
    process.env.EXPO_PUBLIC_FLICA_PARSE_AUDIT?.trim() === "1"
  );
}

function isFileAuditCaptureAvailable(): boolean {
  try {
    const dir = cacheDirectory;
    return typeof dir === "string" && dir.length > 0;
  } catch {
    return false;
  }
}

function canonicalMonthKeyForAuditTargets(monthKey: string): string {
  const t = monthKey.trim();
  const m = t.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return t;
  return `${m[1]}-${m[2].padStart(2, "0")}`;
}

function countPlannedHtmlChunks(html: string): number {
  if (html.length === 0) return 1;
  if (html.length <= HTML_CHUNK_CHARS) return 1;
  return Math.ceil(html.length / HTML_CHUNK_CHARS);
}

function normPairingKey(s: string | undefined | null): string {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function pairingCodesForMatch(p: FlicaPairing): string[] {
  const raw = new Set<string>();
  const id = normPairingKey(p.id);
  const apply = normPairingKey(p.applyPairingCode);
  if (id) raw.add(id);
  if (apply) raw.add(apply);
  return [...raw];
}

function ptvHint(p: FlicaPairing): boolean {
  const id = String(p.id ?? "").trim();
  const apply = String(p.applyPairingCode ?? "").trim();
  const label = String(p.rawScheduleLabel ?? "");
  return (
    /^PTV\b/i.test(id) ||
    /^PTV\b/i.test(apply) ||
    /PTV/i.test(label) ||
    id.toUpperCase().includes("PTV") ||
    apply.toUpperCase().includes("PTV")
  );
}

function isoRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(aStart) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(aEnd) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(bStart) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(bEnd)
  ) {
    return false;
  }
  return aStart <= bEnd && aEnd >= bStart;
}

/**
 * Crewline cross-check rows for Apr/May 2026. Other months: skip detailed pairing logs (HTML + session still run).
 */
function shouldLogPairingForCrewlineAudit(
  monthKeyCanonical: string,
  p: FlicaPairing,
): boolean {
  if (monthKeyCanonical === "2026-04") {
    const codes = pairingCodesForMatch(p);
    return codes.some((c) => APRIL_2026_PAIRING_CODES.has(c));
  }
  if (monthKeyCanonical === "2026-05") {
    const codes = pairingCodesForMatch(p);
    if (codes.some((c) => MAY_2026_PAIRING_CODES.has(c))) return true;
    if (
      ptvHint(p) &&
      isoRangesOverlap(p.startDate, p.endDate, PTV_AUDIT_WINDOW.start, PTV_AUDIT_WINDOW.end)
    ) {
      return true;
    }
  }
  return false;
}

type AuditActivityKind = "pairing" | "ptv" | "reserve" | "off" | "other";

function classifyAuditActivity(p: FlicaPairing): AuditActivityKind {
  const id = normPairingKey(p.id);
  const apply = normPairingKey(p.applyPairingCode);
  const label = String(p.rawScheduleLabel ?? "");

  if (ptvHint(p) || id === "PTV" || apply === "PTV") return "ptv";
  if (id === "RSV" || apply === "RSV") return "reserve";

  if (
    /\bOFF\b|\bRDO\b|DAY\s*OFF|DAYS?\s*OFF/i.test(label) ||
    id === "OFF" ||
    apply === "OFF"
  ) {
    return "off";
  }

  if (p.scheduleActivityKind === "non_flying") return "other";
  if (id && !isFlicaNonFlyingActivityId(id)) return "pairing";
  return "other";
}

function splitRouteEnds(route: string): { depCity: string | null; arrCity: string | null } {
  const r = String(route ?? "").trim();
  if (!r) return { depCity: null, arrCity: null };
  const parts = r.split(/\s*-\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return { depCity: null, arrCity: null };
  const dep = parts[0] ?? "";
  const arr = parts[parts.length - 1] ?? "";
  const up = (s: string) => (/^[A-Z0-9]+$/i.test(s) ? s.toUpperCase() : s);
  return { depCity: up(dep) || null, arrCity: up(arr) || null };
}

function pairingDutyDayStats(legs: FlicaLeg[]): {
  pairingDayCountMax: number | null;
  distinctDutyPeriodDayLabels: string[];
} {
  const labels = legs
    .map((l) => String(l.dutyPeriodDay ?? "").trim())
    .filter(Boolean);
  const numeric = labels
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n));
  return {
    pairingDayCountMax: numeric.length ? Math.max(...numeric) : null,
    distinctDutyPeriodDayLabels: [...new Set(labels)],
  };
}

function j4195CarryFlags(
  monthKeyCanonical: string,
  p: FlicaPairing,
): {
  j4195AprilCarryoverFromPriorMonth: boolean | null;
  j4195MayCarryInFromPriorMonth: boolean | null;
} {
  const codes = pairingCodesForMatch(p);
  const isJ4195 = codes.includes("J4195");
  if (!isJ4195) {
    return {
      j4195AprilCarryoverFromPriorMonth: null,
      j4195MayCarryInFromPriorMonth: null,
    };
  }
  return {
    j4195AprilCarryoverFromPriorMonth:
      monthKeyCanonical === "2026-04" && p.startDate < "2026-04-01"
        ? true
        : monthKeyCanonical === "2026-04"
          ? false
          : null,
    j4195MayCarryInFromPriorMonth:
      monthKeyCanonical === "2026-05" && p.startDate < "2026-05-01"
        ? true
        : monthKeyCanonical === "2026-05"
          ? false
          : null,
  };
}

type AuditEmit = (tag: string, level: "log" | "warn", ...args: unknown[]) => void;

function createAuditEmit(
  auditRunId: string,
  fileLines: string[] | null,
): AuditEmit {
  return (tagBase: string, level: "log" | "warn", ...args: unknown[]) => {
    const tag = `[${auditRunId}] ${tagBase}`;
    if (level === "log") console.log(tag, ...args);
    else console.warn(tag, ...args);
    if (!fileLines) return;
    const text = args
      .map((a) => {
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ");
    fileLines.push(`${tag} ${text}\n`);
  };
}

function logRawHtmlChunks(
  monthKey: string,
  html: string,
  emit: AuditEmit,
): number {
  let chunksEmitted = 0;
  emit(HTML_TAG_BASE, "log", { monthKey, htmlLength: html.length });
  if (html.length === 0) {
    emit(
      HTML_CHUNK_TAG_BASE,
      "log",
      `monthKey=${monthKey} chunk=1/1`,
      "",
    );
    chunksEmitted = 1;
    return chunksEmitted;
  }
  if (html.length <= HTML_CHUNK_CHARS) {
    emit(
      HTML_CHUNK_TAG_BASE,
      "log",
      `monthKey=${monthKey} chunk=1/1`,
      html,
    );
    chunksEmitted = 1;
    return chunksEmitted;
  }
  const n = Math.ceil(html.length / HTML_CHUNK_CHARS);
  for (let i = 0; i < n; i++) {
    const slice = html.slice(
      i * HTML_CHUNK_CHARS,
      (i + 1) * HTML_CHUNK_CHARS,
    );
    emit(
      HTML_CHUNK_TAG_BASE,
      "log",
      `monthKey=${monthKey} chunk=${i + 1}/${n}`,
      slice,
    );
    chunksEmitted += 1;
  }
  return chunksEmitted;
}

function scheduleOptionalAuditFileWrite(
  auditRunId: string,
  fileLines: string[] | null,
  fileCaptureRequested: boolean,
): void {
  if (!fileLines?.length || !fileCaptureRequested) return;
  const base = cacheDirectory;
  if (!base) return;

  const safeId = auditRunId.replace(/[^\dA-Za-z._-]/g, "_");
  const dir = `${base}flica-parse-audit/`;
  const path = `${dir}flica-raw-parse-audit-${safeId}.log`;

  void (async () => {
    try {
      await makeDirectoryAsync(dir, { intermediates: true });
      await writeAsStringAsync(path, fileLines.join(""));
      console.log(
        `[${auditRunId}] ${TAG_BASE}`,
        "audit_file_written",
        { path },
      );
    } catch (e) {
      console.warn(
        `[${auditRunId}] ${TAG_BASE}`,
        "audit_file_write_skipped",
        { message: e instanceof Error ? e.message : String(e) },
      );
    }
  })();
}

/**
 * Logs parser output for the same HTML string used on import. Optional `parsed` avoids a second parse.
 */
export function runFlicaRawParseAuditIfEnabled(
  html: string,
  monthKey: string,
  parsed?: FlicaScheduleMonth,
): void {
  if (!isFlicaRawParseAuditEnabled()) return;

  const auditRunId = `${monthKey}-${Date.now()}`;
  const monthKeyCanonical = canonicalMonthKeyForAuditTargets(monthKey);
  const fileCaptureRequested = isFileAuditCaptureAvailable();
  const fileLines = fileCaptureRequested ? ([] as string[]) : null;
  const emit = createAuditEmit(auditRunId, fileLines);

  const plannedHtmlChunks = countPlannedHtmlChunks(html);

  emit(TAG_BASE, "log", "audit_start_instructions", {
    auditRunId,
    monthKey,
    monthKeyCanonicalForTargets: monthKeyCanonical,
    fileCaptureEnabled: fileCaptureRequested,
    plannedHtmlChunks,
    note:
      "Counts: htmlChunksEmitted should match plannedHtmlChunks; crewlineDetailedPairingsLogged is in session_end (2026-04 / 2026-05 target codes only).",
  });

  const htmlChunksEmitted = logRawHtmlChunks(monthKey, html, emit);

  try {
    const schedule = parsed ?? parseFlicaScheduleHtml(html, monthKey);
    emit(TAG_BASE, "log", "session", {
      auditRunId,
      monthKey,
      monthKeyCanonicalForTargets: monthKeyCanonical,
      htmlLength: html.length,
      employeeId: schedule.employeeId,
      employeeName: schedule.employeeName,
      stats: schedule.stats,
      pairingCount: schedule.pairings.length,
      calendarActivityRawHitCount: schedule.calendarActivityRawHitCount ?? 0,
    });

    let detailedLogCount = 0;
    for (const p of schedule.pairings) {
      if (!shouldLogPairingForCrewlineAudit(monthKeyCanonical, p)) continue;
      detailedLogCount += 1;

      const nonFlyingId = isFlicaNonFlyingActivityId(String(p.id ?? ""));
      const legs = p.legs ?? [];
      const { pairingDayCountMax, distinctDutyPeriodDayLabels } =
        pairingDutyDayStats(legs);
      const auditActivityKind = classifyAuditActivity(p);

      let prevIso: string | null = null;
      const dutyRows = legs.map((leg, i) => {
        const resolvedDutyIsoBeforePersistence = resolveFlicaPersistLegDutyIso(
          { startDate: p.startDate, endDate: p.endDate, id: p.id },
          leg,
          monthKey,
          prevIso,
        );
        prevIso = resolvedDutyIsoBeforePersistence;
        const { depCity, arrCity } = splitRouteEnds(leg.route);
        const reportForRow =
          i === 0
            ? (p.reportTime ?? p.baseReport ?? "").trim() || null
            : null;
        return {
          rowIndex: i,
          dutyDayIndex: leg.dutyPeriodDay?.trim() || null,
          dutyRowDate: {
            dayOfWeek: leg.dayOfWeek,
            dayOfMonth: leg.date,
            dutyPeriodDayOfMonth: leg.dutyPeriodDate,
          },
          resolvedIsoDateBeforePersistence: resolvedDutyIsoBeforePersistence,
          report: reportForRow,
          city: {
            routeDep: depCity,
            routeArr: arrCity,
            layoverCity: leg.layoverCity?.trim() || null,
          },
          dEndLocal: leg.dEndLocal?.trim() || null,
          layover: {
            time: leg.layoverTime?.trim() || null,
            city: leg.layoverCity?.trim() || null,
          },
          flightNumber: leg.flightNumber,
          route: leg.route,
          deadhead: leg.isDeadhead,
          depl: leg.departLocal,
          arrl: leg.arriveLocal,
          block: leg.blockTime,
          dutyOffTime: leg.dutyOffTime?.trim() || null,
          nextReport: leg.nextReportTime?.trim() || null,
          hotel: leg.hotel?.trim() || null,
        };
      });

      const allResolvedIsos = dutyRows.map((r) => r.resolvedIsoDateBeforePersistence);
      const allDutyDomRows = dutyRows.map((r) => r.dutyRowDate);

      const textLen = p.rawPairingText?.length ?? 0;
      const carry = j4195CarryFlags(monthKeyCanonical, p);
      const operateSpanIsos = enumerateIsoInclusive(p.startDate, p.endDate);

      emit(TAG_BASE, "log", "pairing", {
        auditActivityKind,
        rawPairingActivityCode: p.id,
        applyPairingCode: p.applyPairingCode ?? null,
        rawStartDate: p.startDate,
        rawEndDate: p.endDate,
        rawOperateDatesBanner: p.operatingDates,
        base: p.base,
        baseReport: p.baseReport,
        reportTime: p.reportTime,
        daysOfWeek: p.daysOfWeek,
        routeSummaryFromLegs: p.routeSummary ?? null,
        scheduleActivityKind: p.scheduleActivityKind ?? null,
        nonFlyingByActivityTable: nonFlyingId,
        ptvRowHint: ptvHint(p),
        rawScheduleLabel: p.rawScheduleLabel ?? null,
        legCount: legs.length,
        pairingDutyDayIndexMax: pairingDayCountMax,
        pairingOperateSpanDayCount: operateSpanIsos.length || null,
        distinctDutyPeriodDayLabels,
        dutyRowDatesAll: allDutyDomRows,
        resolvedIsoDatesBeforePersistenceAll: allResolvedIsos,
        dutyRows,
        hotelsParsed: (p.hotels ?? []).map((h) => ({
          dutyDateIso: h.dutyDateIso,
          layoverCity: h.layoverCity,
          hotelName: h.hotelName,
          nights: h.nights,
        })),
        rawPairingTextChars: textLen,
        j4195AprilCarryoverFromPriorMonth: carry.j4195AprilCarryoverFromPriorMonth,
        j4195MayCarryInFromPriorMonth: carry.j4195MayCarryInFromPriorMonth,
      });
    }

    emit(TAG_BASE, "log", "session_end", {
      auditRunId,
      monthKey,
      monthKeyCanonicalForTargets: monthKeyCanonical,
      htmlChunksEmitted,
      plannedHtmlChunks,
      crewlineDetailedPairingsLogged: detailedLogCount,
      fileCaptureEnabled: fileCaptureRequested,
      fileWriteAsync:
        fileCaptureRequested && fileLines && fileLines.length > 0,
    });

    scheduleOptionalAuditFileWrite(auditRunId, fileLines, fileCaptureRequested);
  } catch (e) {
    emit(TAG_BASE, "warn", "audit_failed", { monthKey, e });
    scheduleOptionalAuditFileWrite(auditRunId, fileLines, fileCaptureRequested);
  }
}
