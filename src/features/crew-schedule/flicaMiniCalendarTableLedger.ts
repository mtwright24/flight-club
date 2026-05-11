/**
 * FLICA calendar views use the Schedule Detail **mini calendar** table (table1/table2) as the
 * source of truth for date / pairing code / city labels. Do **not** rebuild calendar display
 * from pairing legs, route summaries, or duty rows.
 */

export type FlicaCalendarCell = {
  source: "flica";
  monthKey: string;
  isoDate: string;
  dayOfWeekLabel: string;
  dayOfMonth: number;
  rawPairingText: string | null;
  displayCode: string | null;
  displayCity: string | null;
  isAdjacentMonth: boolean;
  isWeekend: boolean;
  rawHtml?: string;
};

export type FlicaCalendarDisplayLedger = {
  monthKey: string;
  cells: FlicaCalendarCell[];
};

const CALENDAR_GRID_DOW2 = new Set(["SU", "MO", "TU", "WE", "TH", "FR", "SA"]);

/** CITY column only: normalize FLICA quirks (e.g. `SFO-` from table markup) without touching pairing column. */
export function sanitizeFlicaLedgerCityText(
  raw: string | null | undefined,
): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s === "-" || s === "—" || s === "–") return "-";
  const trail = s.match(/^([A-Za-z0-9]{2,4})-+$/);
  if (trail) return trail[1]!.toUpperCase();
  return s;
}

function stripHtmlCell(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTdContents(rowHtml: string): string[] {
  const cells: string[] = [];
  const tdRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let m: RegExpExecArray | null;
  while ((m = tdRe.exec(rowHtml)) !== null) {
    cells.push(m[1] ?? "");
  }
  return cells;
}

function normalizeDow(cell: string): string | null {
  const t = stripHtmlCell(cell).replace(/\s+/g, "").toUpperCase();
  if (t.length >= 2 && CALENDAR_GRID_DOW2.has(t.slice(0, 2))) return t.slice(0, 2);
  const map: Record<string, string> = {
    SUN: "SU",
    MON: "MO",
    TUE: "TU",
    WED: "WE",
    THU: "TH",
    FRI: "FR",
    SAT: "SA",
  };
  const k3 = t.slice(0, 3);
  if (map[k3]) return map[k3]!;
  return null;
}

function calendarIso(y: number, m1to12: number, dom: number): string | null {
  if (!Number.isFinite(dom) || dom < 1 || dom > 31) return null;
  const dt = new Date(y, m1to12 - 1, dom, 12, 0, 0, 0);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m1to12 - 1 ||
    dt.getDate() !== dom
  ) {
    return null;
  }
  return `${y}-${String(m1to12).padStart(2, "0")}-${String(dom).padStart(2, "0")}`;
}

function adjustMonth(y: number, m: number, delta: number): { y: number; m: number } {
  let nm = m + delta;
  let ny = y;
  while (nm < 1) {
    nm += 12;
    ny -= 1;
  }
  while (nm > 12) {
    nm -= 12;
    ny += 1;
  }
  return { y: ny, m: nm };
}

function extractTable2Inner(html: string): string | null {
  const m = html.match(
    /<table\s+name=['"]table2['"][^>]*>([\s\S]*?)<\/table>\s*<!--\s*close\s+table2\s*-->/i,
  );
  return m?.[1] ?? null;
}

function isStatsOrSeparatorRow(rowHtml: string, plainCells: string[]): boolean {
  if (/colspan\s*=\s*['"]?4/i.test(rowHtml)) return true;
  if (/<hr\b/i.test(rowHtml)) return true;
  const joined = plainCells.join(" ").toLowerCase();
  if (/\bblock\b/i.test(joined) && /\d/.test(joined)) return true;
  if (/\bcredit\b/i.test(joined)) return true;
  if (/\btaclag\b/i.test(joined)) return true;
  if (/\bytd\b/i.test(joined)) return true;
  if (/\bdays?\s*off\b/i.test(joined)) return true;
  return false;
}

function parseTrBgColor(rowHtml: string): string {
  const m = rowHtml.match(/bgcolor\s*=\s*['"]?([^'">\s]+)/i);
  return (m?.[1] ?? "").trim();
}

type ParsedRawRow = {
  dow: string;
  dom: number;
  codeRaw: string;
  cityRaw: string;
  isAdjacentMonth: boolean;
  isWeekendStripe: boolean;
  rawHtml: string;
};

/**
 * Parse FLICA Schedule Detail HTML → ordered mini-calendar rows with ISO dates.
 * HTML scope: inner `table2` of `table1` only (not blue pairing blocks).
 */
export function buildFlicaCalendarDisplayLedgerFromHtml(
  html: string,
  monthKey: string,
): FlicaCalendarDisplayLedger {
  const y = parseInt(monthKey.slice(0, 4), 10);
  const viewM = parseInt(monthKey.slice(5, 7), 10);
  if (!Number.isFinite(y) || !Number.isFinite(viewM) || viewM < 1 || viewM > 12) {
    return { monthKey, cells: [] };
  }

  const inner = extractTable2Inner(html);
  if (!inner) {
    return { monthKey, cells: [] };
  }

  const rawRows: ParsedRawRow[] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tm: RegExpExecArray | null;
  while ((tm = trRe.exec(inner)) !== null) {
    const rowHtml = tm[0];
    const innerCells = tm[1] ?? "";
    const tdContents = parseTdContents(innerCells);
    if (tdContents.length !== 4) continue;
    const plain = tdContents.map(stripHtmlCell);
    if (isStatsOrSeparatorRow(rowHtml, plain)) continue;

    const dow = normalizeDow(tdContents[0] ?? "");
    if (!dow) continue;
    const domStr = plain[1] ?? "";
    const dom = parseInt(domStr.replace(/\D/g, ""), 10);
    if (!Number.isFinite(dom) || dom < 1 || dom > 31) continue;

    const codeCell = stripHtmlCell(tdContents[2] ?? "");
    const cityCell = stripHtmlCell(tdContents[3] ?? "");

    const bg = parseTrBgColor(rowHtml);
    const bgLower = bg.toLowerCase();
    const isAdjacentMonth = bgLower.includes("696969");
    const isWeekendStripe = /lightsteelblue/i.test(bg);

    rawRows.push({
      dow,
      dom,
      codeRaw: codeCell,
      cityRaw: cityCell,
      isAdjacentMonth,
      isWeekendStripe,
      rawHtml: rowHtml,
    });
  }

  const idxNonGray = rawRows
    .map((r, i) => (r.isAdjacentMonth ? -1 : i))
    .filter((i) => i >= 0);
  const firstNonGray = idxNonGray.length ? Math.min(...idxNonGray) : -1;
  const lastNonGray = idxNonGray.length ? Math.max(...idxNonGray) : -1;

  const cells: FlicaCalendarCell[] = [];
  let lastDomMiddle: number | null = null;
  let curY = y;
  let curM = viewM;

  for (let i = 0; i < rawRows.length; i += 1) {
    const r = rawRows[i]!;
    let iso: string | null = null;

    if (r.isAdjacentMonth) {
      if (firstNonGray >= 0 && i < firstNonGray) {
        const pm = adjustMonth(y, viewM, -1);
        iso = calendarIso(pm.y, pm.m, r.dom);
      } else if (lastNonGray >= 0 && i > lastNonGray) {
        const nm = adjustMonth(y, viewM, 1);
        iso = calendarIso(nm.y, nm.m, r.dom);
      } else {
        iso = calendarIso(y, viewM, r.dom);
      }
    } else {
      if (lastDomMiddle !== null && r.dom < lastDomMiddle) {
        const nm = adjustMonth(curY, curM, 1);
        curY = nm.y;
        curM = nm.m;
      }
      lastDomMiddle = r.dom;
      iso = calendarIso(curY, curM, r.dom);
    }

    if (!iso) continue;

    const displayCode = r.codeRaw ? r.codeRaw : null;
    const displayCityRaw = r.cityRaw.length ? r.cityRaw : null;
    const displayCity = displayCityRaw
      ? sanitizeFlicaLedgerCityText(stripHtmlCell(displayCityRaw)) || null
      : null;
    const dowWeekend = r.dow === "SA" || r.dow === "SU";
    const isWeekend = dowWeekend || r.isWeekendStripe;

    cells.push({
      source: "flica",
      monthKey,
      isoDate: iso,
      dayOfWeekLabel: r.dow,
      dayOfMonth: r.dom,
      rawPairingText: displayCode,
      displayCode,
      displayCity,
      isAdjacentMonth: r.isAdjacentMonth,
      isWeekend,
      rawHtml: r.rawHtml,
    });
  }

  return { monthKey, cells };
}
