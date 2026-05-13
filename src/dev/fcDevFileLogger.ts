/**
 * Dev-only schedule debug log mirror: appends tagged lines to fc-schedule-debug.log under Expo cache.
 * Console logging is done at call sites; this helper handles file I/O only.
 *
 * **Where the file lives at runtime (Expo / `expo-file-system` `cacheDirectory`):**
 * - **iOS:** `file://…/<App UUID>/Library/Caches/fc-schedule-debug.log` inside the app sandbox (Simulator or device).
 * - **Android:** `file://…/cache/fc-schedule-debug.log` under the app’s internal cache directory.
 * - **Web:** `cacheDirectory` is often `null` — file logging is skipped.
 *
 * The exact path string is only stable per install; use `getFcScheduleDebugLogPath()` in dev to read it.
 */

import {
  cacheDirectory,
  readAsStringAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";

const LOG_FILE = "fc-schedule-debug.log";
const MAX_FILE_CHARS = 2_000_000;

export const FC_SCHEDULE_FILE_LOG_TAGS = new Set([
  "FC_CAL_LEDGER_WIRING",
  "FC_CAL_LEDGER_BLOCKED",
  "FC_RAW_HTML_IMPORT_CAPTURED",
  "FC_RAW_HTML_SAVE_CHECK",
  "FC_RAW_HTML_READBACK_CHECK",
  "FC_RAW_HTML_READ_CHECK",
  "FC_HYBRID_CALENDAR_ROWS",
  "FC_HYBRID_ROW_GAPS",
  "FC_LAYOVER_COLUMN_AUDIT",
  "FC_RAW_PAIRING_DETAIL_INDEX_AUDIT",
  "FC_CLASSIC_ROWS_SOURCE",
  "FC_CLASSIC_LIST_SOURCE",
  "FC_SMART_LIST_SOURCE",
  "FC_MODERN_LIST_SOURCE",
  "FC_MODERN_DAY_COUNT_AUDIT",
  "FC_MONTH_GRID_SOURCE",
  "FC_FLICA_ACTIONS_SESSION_TEST",
  "FC_FLICA_ACTIONS_LEFT_MENU_TEST",
  "FC_FLICA_ACTIONS_OPENTIME_TEST",
  "FC_FLICA_ACTIONS_TRADEBOARD_TEST",
  "FC_FLICA_ACTIONS_WEBVIEW_INIT",
  "FC_FLICA_ACTIONS_WEBVIEW_NAV",
  "FC_FLICA_ACTIONS_LINK_CAPTURE",
  "FC_FLICA_ACTIONS_CLICK_CAPTURE",
  "FC_FLICA_ACTIONS_NATIVE_TEST",
]);

let appendChain: Promise<void> = Promise.resolve();

function scheduleLogPath(): string | null {
  const base = cacheDirectory;
  if (!base) return null;
  return `${base}${LOG_FILE}`;
}

/** Absolute `file://…` path to the debug log, or `null` if `cacheDirectory` is unavailable. */
export function getFcScheduleDebugLogPath(): string | null {
  return scheduleLogPath();
}

/** Full log text, or empty string if missing / unreadable. */
export async function readFcScheduleDebugLogText(): Promise<string> {
  const path = scheduleLogPath();
  if (!path) return "";
  try {
    return await readAsStringAsync(path);
  } catch {
    return "";
  }
}

export function fcDevMirrorScheduleLogToFile(
  tag: string,
  payload: Record<string, unknown>,
): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  if (!FC_SCHEDULE_FILE_LOG_TAGS.has(tag)) return;
  const path = scheduleLogPath();
  if (!path) return;

  const line = `${new Date().toISOString()} ${tag} ${JSON.stringify(payload)}\n`;
  appendChain = appendChain
    .then(async () => {
      try {
        let prev = "";
        try {
          prev = await readAsStringAsync(path);
        } catch {
          prev = "";
        }
        const merged =
          prev.length > MAX_FILE_CHARS
            ? prev.slice(prev.length - MAX_FILE_CHARS + line.length) + line
            : prev + line;
        await writeAsStringAsync(path, merged);
      } catch {
        /* ignore */
      }
    })
    .catch(() => {});
}
