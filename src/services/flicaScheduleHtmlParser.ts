/**
 * FLICA Schedule HTML parser — canonical `scheduledetail.cgi` import blueprint.
 *
 * Parses FLICA multi-airline `*.flica.net` HTML into `FlicaPairing` / `FlicaLeg` / stats for direct HTTP import,
 * `crew_schedule` snapshots, and structured handoffs from the OCR/screenshot path.
 * Fetch + token flow: see `FLICA_INTEGRATION_SPEC.md` (repo root). Do not duplicate parsing
 * rules elsewhere without updating this file first.
 */

// ─────────────────────────────────────────────
// Data Models
// ─────────────────────────────────────────────

export interface FlicaLeg {
  dayOfWeek: string;      // "TU", "WE", "TH", "FR"
  date: number;           // 14, 15, 16, 17
  flightNumber: string;   // "115", "434", "919"
  route: string;          // "JFK-SFO"
  departLocal: string;    // "1026"
  arriveLocal: string;    // "1358"
  blockTime: string;      // "0632"
  equipment: string;      // "3NS", "32S"
  isDeadhead: boolean;    // true if DH column has "DH"
  layoverCity: string;    // "SFO", "BOS" or ""
  layoverTime: string;    // "1547" or ""
  hotel: string;          // "Pullman San Francisco Bay"
  hotelPhone: string;     // "(650)598-9000"
  nextReportTime: string; // "0600L" from D-END line
}

export interface FlicaCrew {
  position: string;       // "F1", "F2"
  employeeId: string;     // "22632"
  name: string;           // "MORAN, PEDRO"
  status: string;         // "TAL", "SP"
}

export interface FlicaPairing {
  id: string;             // "J4309"
  startDate: string;      // "2026-04-14"
  endDate: string;        // "2026-04-17"
  baseReport: string;     // "0930L"
  daysOfWeek: string;     // "ONLY ON TUE"
  operatingDates: string; // "Apr 14-Apr 21"
  base: string;           // "JFK"
  equipment: string;      // "ALL"
  positions: string;      // "F101F201"
  totalBlock: string;     // "2305"
  totalDeadhead: string;  // "0000"
  totalCredit: string;    // "2358"
  tafb: string;           // "8111"
  legs: FlicaLeg[];
  crewMembers: FlicaCrew[];
}

export interface FlicaMonthStats {
  block: string;    // "118.13"
  credit: string;   // "126.39"
  tafb: string;     // "388.58"
  ytd: string;      // "498.29"
  daysOff: number;  // 8
}

export interface FlicaScheduleMonth {
  month: string;          // "2026-04"
  employeeId: string;     // "50982"
  employeeName: string;   // "WRIGHT, MARCUS"
  stats: FlicaMonthStats;
  pairings: FlicaPairing[];
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

/** Strip all HTML tags and decode basic entities, returning trimmed plain text. */
function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** Extract all <td> cell texts from a single <tr> string. */
function parseTdCells(row: string): string[] {
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const cells: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(row)) !== null) {
    cells.push(stripHtml(m[1]));
  }
  return cells;
}

/**
 * Convert a 3-letter month abbreviation + 2-digit day to an ISO date string.
 * e.g. "14APR" → "2026-04-14"
 */
const MONTH_MAP: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04",
  MAY: "05", JUN: "06", JUL: "07", AUG: "08",
  SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

function parsePairingDate(raw: string, yearPrefix: string): string {
  // raw examples: "14APR", "18APR", "22APR"
  const m = raw.match(/^(\d{1,2})([A-Z]{3})$/);
  if (!m) return "";
  const day = m[1].padStart(2, "0");
  const mon = MONTH_MAP[m[2]] ?? "00";
  return `${yearPrefix}-${mon}-${day}`;
}

/**
 * Given a "viewOperationDates(...)" onclick string, extract the end date.
 * e.g. viewOperationDates('J4309', 20260414, 20260421, 4, '')
 * The 3rd numeric arg is the end date in YYYYMMDD.
 */
function extractOperatingEndDate(onclick: string): string {
  const m = onclick.match(/viewOperationDates\([^,]+,\s*\d+,\s*(\d{8})/);
  if (!m) return "";
  const raw = m[1]; // "20260421"
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

/**
 * Extract the operating dates text from a viewOperationDates link
 * by reading the link's inner text, e.g. "Operates: Apr 14-Apr 21".
 * We strip "Operates: " prefix.
 */
function extractOperatingDatesText(linkHtml: string): string {
  const text = stripHtml(linkHtml);
  return text.replace(/^Operates:\s*/i, "").trim();
}

// ─────────────────────────────────────────────
// Core pairing-block splitter
// ─────────────────────────────────────────────

/**
 * Split the full HTML into one chunk per pairing.
 * Each pairing starts at a blue-colored <td> containing the pairing ID.
 * We detect these via the inline style "color: #0000ff".
 */
function splitIntoPairingBlocks(html: string): string[] {
  // The pairing header <table> starts right before the blue td.
  // We split on the opening <table ... font-size: 8pt"> that contains the blue td.
  // Pattern: <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 8pt;">
  const SPLIT_MARKER =
    /<table\s+cellpadding="0"\s+cellspacing="0"\s+style="width:\s*100%;\s*font-size:\s*8pt;">/gi;

  const indices: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = SPLIT_MARKER.exec(html)) !== null) {
    // Only include if the next occurrence of color:#0000ff appears before the next <hr
    const chunk = html.slice(m.index, m.index + 2000);
    if (/color:\s*#0000ff/i.test(chunk)) {
      indices.push(m.index);
    }
  }

  if (indices.length === 0) return [];

  const blocks: string[] = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : html.length;
    blocks.push(html.slice(start, end));
  }
  return blocks;
}

// ─────────────────────────────────────────────
// Pairing header parser
// ─────────────────────────────────────────────

interface PairingHeader {
  id: string;
  startDate: string;
  daysOfWeek: string;
  baseReport: string;
  operatingDates: string;
  endDate: string;
  base: string;
  equipment: string;
  positions: string;
}

function parsePairingHeader(block: string, yearPrefix: string): PairingHeader {
  // ── Pairing ID and start date ────────────────────────────────────────────
  // <td style="...color: #0000ff;">J4309 : 14APR </td>
  const idMatch = block.match(
    /color:\s*#0000ff[^>]*>([\w]+)\s*:\s*(\d{1,2}[A-Z]{3})/i
  );
  const id = idMatch ? idMatch[1].trim() : "";
  const startDate = idMatch ? parsePairingDate(idMatch[2], yearPrefix) : "";

  // ── Days of week ─────────────────────────────────────────────────────────
  // Second <td> in the header row after the blue one, e.g. "ONLY ON TUE"
  const daysMatch = block.match(
    /color:\s*#0000ff[^<]*<\/td>\s*<td[^>]*>(.*?)<\/td>/is
  );
  const daysOfWeek = daysMatch ? stripHtml(daysMatch[1]) : "";

  // ── Base report time ─────────────────────────────────────────────────────
  // "BSE REPT: 0930L" — stop before any HTML tag or newline
  const reptMatch = block.match(/BSE REPT:\s*([0-9A-Za-z]+)/i);
  const baseReport = reptMatch ? reptMatch[1].trim() : "";

  // ── Operating dates (from the link inner text) ───────────────────────────
  const opLinkMatch = block.match(/(<a[^>]*viewOperationDates[^>]*>)(.*?)(<\/a>)/is);
  const operatingDates = opLinkMatch
    ? extractOperatingDatesText(opLinkMatch[2])
    : "";

  // ── End date (from viewOperationDates 3rd arg) ───────────────────────────
  const opOnclickMatch = block.match(/viewOperationDates\([^)]+\)/i);
  const endDate = opOnclickMatch
    ? extractOperatingEndDate(opOnclickMatch[0])
    : startDate;

  // ── Base/Equip: JFK/ALL ──────────────────────────────────────────────────
  const baseEquipMatch = block.match(/Base\/Equip:\s*([A-Z]+)\/([A-Z]+)/i);
  const base = baseEquipMatch ? baseEquipMatch[1] : "";
  const equipment = baseEquipMatch ? baseEquipMatch[2] : "";

  // ── Positions (e.g. "F101F201") ──────────────────────────────────────────
  // It's in a <td noWrap=true> right after Base/Equip td
  const posMatch = block.match(/noWrap=true[^>]*>(F\d[\w]*)<\/td>/i);
  const positions = posMatch ? posMatch[1].trim() : "";

  return {
    id,
    startDate,
    daysOfWeek,
    baseReport,
    operatingDates,
    endDate,
    base,
    equipment,
    positions,
  };
}

// ─────────────────────────────────────────────
// Leg rows parser
// ─────────────────────────────────────────────

/**
 * Extract all <tr> strings from a block of HTML.
 */
function extractRows(html: string): string[] {
  const rows: string[] = [];
  const re = /<tr([^>]*)>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    rows.push(m[0]);
  }
  return rows;
}

/**
 * From a "nowrap" leg row, extract layover city and time.
 * The last <td> may contain an <a> with onclick code=XXX and text "XXX 1547".
 */
function isPlausibleLayoverRestFour(s: string): boolean {
  if (!/^\d{4}$/.test(s)) return false;
  const h = parseInt(s.slice(0, 2), 10);
  const m = parseInt(s.slice(2), 10);
  return h <= 47 && m <= 59;
}

/**
 * Layover city + rest (4-digit) from the leg row; link text is usually `LAS 1236` but sometimes only `1236`.
 */
function parseLayover(row: string): { city: string; time: string } {
  const textFull = stripHtml(row);
  const codeMatch = row.match(/code=([A-Z]{3}).*?['"][^>]*>(.*?)<\/a>/is);
  if (!codeMatch) {
    /**
     * Without the FLICA `code=XXX` anchor we cannot reliably distinguish DEPL/ARRL times from
     * layover rest in the same `<tr>`.
     */
    return { city: '', time: '' };
  }

  const city = codeMatch[1]!;
  const text = stripHtml(codeMatch[2]);
  const timeMatch = text.match(/[A-Z]{3}\s+(\d{4})/);
  if (timeMatch) return { city, time: timeMatch[1]! };
  const tail = text.match(/\b(\d{4})\b/);
  if (tail && isPlausibleLayoverRestFour(tail[1]!)) return { city, time: tail[1]! };
  const inRow = textFull.match(new RegExp(`\\b${city}\\s+(\\d{4})\\b`, 'i'));
  if (inRow && isPlausibleLayoverRestFour(inRow[1]!)) return { city, time: inRow[1]! };
  return { city, time: '' };
}

/**
 * Parse the table of legs inside a pairing block.
 * Returns partially-filled FlicaLeg[] (hotel/nextReport filled in a second pass).
 */
function parseLegsTable(tableHtml: string): FlicaLeg[] {
  const rows = extractRows(tableHtml);
  const legs: FlicaLeg[] = [];

  // We track "pending" leg so we can attach hotel/report from the D-END row
  let pendingLegIndex = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowLower = row.toLowerCase();

    // ── Skip header row ───────────────────────────────────────────────────
    if (/class="main"/i.test(row)) continue;

    // ── Totals row ────────────────────────────────────────────────────────
    if (/class="bold"/i.test(row)) continue;

    // ── Nowrap = flight leg ───────────────────────────────────────────────
    if (/class="nowrap"/i.test(row)) {
      const cells = parseTdCells(row);
      // cells: [DY, DD, DH, C, FLTNO, DPS-ARS, DEPL, ARRL, BLKT, GRNT, OA, EQP, ...]
      if (cells.length < 8) continue;

      const dayOfWeek = cells[0] || "";
      const dateRaw = cells[1] || "";
      const date = parseInt(dateRaw, 10) || 0;
      const dhCell = cells[2] || "";
      // cells[3] = C column
      const flightNumber = cells[4] || "";
      const route = cells[5] || "";
      const departLocal = cells[6] || "";
      const arriveLocal = cells[7] || "";
      const blockTime = cells[8] || "";
      const equipment = cells[11] || "";

      const isDeadhead = dhCell.trim().toUpperCase() === "DH";

      // Skip non-flight rows that sneak through (e.g. blank)
      if (!flightNumber || !route) continue;

      const { city: layoverCity, time: layoverTime } = parseLayover(row);

      const leg: FlicaLeg = {
        dayOfWeek,
        date,
        flightNumber,
        route,
        departLocal,
        arriveLocal,
        blockTime,
        equipment,
        isDeadhead,
        layoverCity,
        layoverTime,
        hotel: "",
        hotelPhone: "",
        nextReportTime: "",
      };

      legs.push(leg);
      pendingLegIndex = legs.length - 1;
      continue;
    }

    // ── D-END row — contains REPT and optionally hotel in same <tr> ──────
    // e.g.: D-END: 1413L (NR  900) REPT: 0600L | Pullman San Francisco Bay | (650)598-9000
    if (/D-END/i.test(row) && pendingLegIndex >= 0) {
      const text = stripHtml(row);

      // Next report time — match "REPT:" followed by a time token like "0600L"
      // The time token is digits optionally followed by a single letter (L/Z)
      const reptMatch = text.match(/REPT:\s*(\d{4}[A-Z]?)/i);
      if (reptMatch) {
        legs[pendingLegIndex].nextReportTime = reptMatch[1];
      }

      // Hotel name — the td with colspan=5 that isn't the D-END td
      // Parse cells and find the hotel name + phone in same row
      const cells = parseTdCells(row);
      const phoneCell = cells.find((c) => /^\(\d{3}\)\d{3}-\d{4}/.test(c));
      const hotelCell = cells.find(
        (c) => c && !/^\(\d{3}\)/.test(c) && !/D-END/i.test(c) && c.trim().length > 5
      );
      if (hotelCell) legs[pendingLegIndex].hotel = hotelCell.trim();
      if (phoneCell) legs[pendingLegIndex].hotelPhone = phoneCell.trim();

      continue;
    }

    // ── Separate hotel row (older format fallback) ────────────────────────
    if (
      pendingLegIndex >= 0 &&
      !legs[pendingLegIndex].hotel &&
      /\(\d{3}\)\d{3}-\d{4}/.test(row)
    ) {
      const cells = parseTdCells(row);
      const hotelCell = cells.find(
        (c) => c && !/^\(\d{3}\)/.test(c) && c.trim().length > 3
      );
      const phoneCell = cells.find((c) => /^\(\d{3}\)\d{3}-\d{4}/.test(c));
      if (hotelCell) legs[pendingLegIndex].hotel = hotelCell.trim();
      if (phoneCell) legs[pendingLegIndex].hotelPhone = phoneCell.trim();
      continue;
    }
  }

  return legs;
}

// ─────────────────────────────────────────────
// Totals parser
// ─────────────────────────────────────────────

interface PairingTotals {
  totalBlock: string;
  totalDeadhead: string;
  totalCredit: string;
  tafb: string;
}

function parsePairingTotals(block: string): PairingTotals {
  // TAFB from "T.A.F.B.: 8111"
  const tafbMatch = block.match(/T\.A\.F\.B\.\s*:\s*(\d+)/i);
  const tafb = tafbMatch ? tafbMatch[1] : "";

  // Totals from <tr class="bold"> row
  // Total: [TBLK] [TDHD] [blank] [TCRD] [TDUTY/FDP]
  const boldRowMatch = block.match(/<tr\s+class="bold"[^>]*>([\s\S]*?)<\/tr>/i);
  let totalBlock = "";
  let totalDeadhead = "";
  let totalCredit = "";

  if (boldRowMatch) {
    const cells = parseTdCells(boldRowMatch[0]);
    // Find "Total:" cell index, then read values after it
    const totalIdx = cells.findIndex((c) => /total/i.test(c));
    if (totalIdx >= 0 && cells.length > totalIdx + 3) {
      totalBlock = cells[totalIdx + 1] || "";
      totalDeadhead = cells[totalIdx + 2] || "";
      // cells[totalIdx+3] is blank column
      totalCredit = cells[totalIdx + 4] || "";
    }
  }

  return { totalBlock, totalDeadhead, totalCredit, tafb };
}

// ─────────────────────────────────────────────
// Crew parser
// ─────────────────────────────────────────────

function parseCrew(block: string): FlicaCrew[] {
  const crew: FlicaCrew[] = [];

  // Find crew table: the table that has <strong>Crew:</strong>
  const crewTableMatch = block.match(
    /<table[^>]*>[\s\S]*?<strong>Crew:<\/strong>[\s\S]*?<\/table>/i
  );
  if (!crewTableMatch) return crew;

  const crewHtml = crewTableMatch[0];
  const rows = extractRows(crewHtml);

  for (const row of rows) {
    const cells = parseTdCells(row);
    // We look for rows with a position marker: "F1", "F2", etc.
    // Row structure: [indent, FN, empId, name_status, ...]
    // May have two crew per row: F1...F2
    for (let i = 0; i < cells.length; i++) {
      const posMatch = cells[i].match(/^(F\d)$/);
      if (posMatch) {
        const position = posMatch[1];
        const empId = cells[i + 1]?.trim() ?? "";
        const nameRaw = cells[i + 2]?.trim() ?? "";

        // nameRaw: "MORAN, PEDRO  (TAL)"  or  "XHOLI, ERJON - LOD  (SP)"
        const nameStatusMatch = nameRaw.match(/^([\w\s,\-]+?)\s*\(([^)]+)\)$/);
        const name = nameStatusMatch
          ? nameStatusMatch[1].trim()
          : nameRaw.replace(/\(.*\)/, "").trim();
        const status = nameStatusMatch ? nameStatusMatch[2].trim() : "";

        if (position && (empId || name)) {
          crew.push({ position, employeeId: empId, name, status });
        }
        i += 2; // skip empId and name cells
      }
    }
  }

  return crew;
}

// ─────────────────────────────────────────────
// Month-level stats parser
// ─────────────────────────────────────────────

function pickStatDecimal(plain: string, labelRe: RegExp): string {
  const m = plain.match(labelRe);
  return m && m[1] ? m[1] : "";
}

function parseMonthStats(html: string): FlicaMonthStats {
  // The stats live in a summary table (label cell / value cell) or as plain text after strip.
  const blockMatch = html.match(/BLOCK[^<]*<\/td>\s*<td[^>]*>([\d.]+)/i);
  const creditMatch = html.match(/CREDIT[^<]*<\/td>\s*<td[^>]*>([\d.]+)/i);
  const tafbMatch = html.match(/TAFB[^<]*<\/td>\s*<td[^>]*>([\d.]+)/i);
  const ytdMatch = html.match(/YTD[^<]*<\/td>\s*<td[^>]*>([\d.]+)/i);
  const daysOffMatch = html.match(/DAYS\s+OFF[^<]*<\/td>\s*<td[^>]*>(\d+)/i);

  const plain = stripHtml(html).replace(/\s+/g, " ");

  // Fallback: scheduledetail often uses a single-line or stacked labels — match after keyword.
  const block = blockMatch?.[1] ?? pickStatDecimal(plain, /BLOCK[^0-9A-Z]{0,24}(\d{2,3}\.\d{2})/i);
  const credit = creditMatch?.[1] ?? pickStatDecimal(plain, /CREDIT[^0-9A-Z]{0,24}(\d{2,3}\.\d{2})/i);
  const tafb = tafbMatch?.[1] ?? pickStatDecimal(plain, /T\.?\s*A\.?\s*F\.?\s*B[^0-9A-Z]{0,24}(\d{2,3}\.\d{2})/i);
  const tafbAlt = tafb || pickStatDecimal(plain, /TAFB[^0-9A-Z]{0,24}(\d{2,3}\.\d{2})/i);
  const ytd = ytdMatch?.[1] ?? pickStatDecimal(plain, /YTD[^0-9A-Z]{0,24}(\d{2,3}\.\d{2})/i);
  const daysOffStr = daysOffMatch?.[1] ?? pickStatDecimal(plain, /DAYS?\s*OFF[^0-9A-Z]{0,24}(\d{1,2})/i);
  const daysOff = daysOffStr ? parseInt(daysOffStr, 10) : 0;

  return {
    block,
    credit,
    tafb: tafbAlt,
    ytd,
    daysOff: Number.isFinite(daysOff) ? daysOff : 0,
  };
}

// ─────────────────────────────────────────────
// Employee name / ID extractor
// ─────────────────────────────────────────────

function parseEmployeeInfo(
  html: string,
  targetId: string
): { employeeId: string; employeeName: string } {
  // e.g. "50982" followed by "WRIGHT, MARCUS"
  const re = new RegExp(
    `${targetId}[^<]*<\\/td>\\s*<td[^>]*>\\s*([A-Z][A-Z ,]+?)\\s*(?:&nbsp;|\\(|<)`,
    "i"
  );
  const m = html.match(re);
  const employeeName = m ? m[1].trim() : "";
  return { employeeId: targetId, employeeName };
}

/** Best-effort: JetBlue line number in HTML (falls back to legacy sample id if not found). */
function inferPrimaryEmployeeId(html: string): string {
  const jbu = html.match(/JBU\s*[—\-]?\s*(\d{5})/i);
  if (jbu?.[1]) return jbu[1];
  const cellPair = html.match(
    /<td[^>]*>\s*(\d{5})\s*<\/td>\s*<td[^>]*>\s*([A-Z][A-Z ,]+)/i
  );
  if (cellPair?.[1]) return cellPair[1];
  return "50982";
}

// ─────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────

export function parseFlicaScheduleHtml(
  html: string,
  monthKey: string // e.g. "2026-04"
): FlicaScheduleMonth {
  const yearPrefix = monthKey.slice(0, 4); // "2026"

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = parseMonthStats(html);

  // ── Employee info ────────────────────────────────────────────────────────
  const empId = inferPrimaryEmployeeId(html);
  const { employeeId, employeeName } = parseEmployeeInfo(html, empId);

  // ── Split into per-pairing blocks ─────────────────────────────────────────
  const blocks = splitIntoPairingBlocks(html);

  const pairings: FlicaPairing[] = blocks.map((block) => {
    // Header
    const header = parsePairingHeader(block, yearPrefix);

    // Find the legs sub-table: the inner <table ... font-size: 8pt"> that
    // contains the <tr class="main"> header row.
    const legsTableMatch = block.match(
      /<table[^>]*font-size:\s*8pt[^>]*>([\s\S]*?)<\/table>/i
    );
    const legs = legsTableMatch ? parseLegsTable(legsTableMatch[0]) : [];

    // Totals
    const totals = parsePairingTotals(block);

    // Crew
    const crewMembers = parseCrew(block);

    // Derive end date from last leg's date
    const lastLeg = legs[legs.length - 1];
    let endDate = header.endDate;
    if (!endDate && lastLeg) {
      const mon = monthKey.slice(5, 7);
      // Handle month rollover (date < startDate date means next month)
      const startDay = parseInt(header.startDate.slice(8), 10);
      const endDay = lastLeg.date;
      const endMon = endDay < startDay ? String(parseInt(mon) + 1).padStart(2, "0") : mon;
      endDate = `${yearPrefix}-${endMon}-${String(endDay).padStart(2, "0")}`;
    }

    return {
      id: header.id,
      startDate: header.startDate,
      endDate,
      baseReport: header.baseReport,
      daysOfWeek: header.daysOfWeek,
      operatingDates: header.operatingDates,
      base: header.base,
      equipment: header.equipment,
      positions: header.positions,
      totalBlock: totals.totalBlock,
      totalDeadhead: totals.totalDeadhead,
      totalCredit: totals.totalCredit,
      tafb: totals.tafb,
      legs,
      crewMembers,
    };
  });

  return {
    month: monthKey,
    employeeId,
    employeeName,
    stats,
    pairings,
  };
}

/** @deprecated Use `parseFlicaScheduleHtml` — kept for docs / older snippets. */
export function parseFlicaScheduledetailHtml(html: string, monthKey: string): FlicaScheduleMonth {
  return parseFlicaScheduleHtml(html, monthKey);
}
