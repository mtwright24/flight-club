/**
 * Pure parsers for FLICA ottrade.cgi activity selector HTML (TAry + table + handlers).
 */

import type {
  FlicaActivitySelectorAction,
  FlicaActivitySelectorRow,
  FlicaActivitySelectorRowKind,
} from "./flicaTradeBoardActivitySelectorTypes";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const PAIRING_RE = /\b(J[A-Z0-9]{3,5})\b/;
const DATE_LABEL_RE = /\b(\d{1,2})([A-Z]{3})\b/;

export type TaryTaskRecord = {
  taskIndex: number;
  pairingId: string;
  dateLabel: string;
  dateYmd: string;
  days: string;
  reportTime: string;
  departTime: string;
  arriveTime: string;
  blockHrs: string;
  layover: string;
};

export type TaskHandlerRecord = {
  taskIndex: number;
  handlerName: "TradeTask" | "DropTask";
  rawOnclick: string;
  actionLabel: string;
  action: FlicaActivitySelectorAction;
  disabled: boolean;
  selectedOnFlica: boolean;
};

export type ActivitySelectorParseStats = {
  htmlLength: number;
  taskRecordsFound: number;
  tableRowsFound: number;
  tradeTaskHandlersFound: number;
  dropTaskHandlersFound: number;
  eligibleRowsFound: number;
  firstEligible: Array<{
    pairingId: string;
    dateLabel: string;
    dateYmd: string;
    actionLabel: string;
    flicaRowIndex: number;
  }>;
};

function collapseWs(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function stripTags(s: string): string {
  return collapseWs(String(s ?? "").replace(/<[^>]+>/g, " "));
}

export function labelToYmd(label: string, yearHint?: string): string {
  const m = collapseWs(label).toUpperCase().match(/^(\d{1,2})([A-Z]{3})$/);
  if (!m) return "";
  const day = parseInt(m[1]!, 10);
  const mon = MONTHS.indexOf(m[2]!);
  if (mon < 0) return "";
  const years: number[] = [];
  if (yearHint && /^\d{4}$/.test(yearHint)) {
    years.push(parseInt(yearHint, 10), parseInt(yearHint, 10) - 1, parseInt(yearHint, 10) + 1);
  } else {
    const y0 = new Date().getFullYear();
    years.push(y0 - 1, y0, y0 + 1);
  }
  for (const year of years) {
    const d = new Date(year, mon, day, 12, 0, 0, 0);
    if (d.getMonth() === mon && d.getDate() === day) {
      return `${year}${String(mon + 1).padStart(2, "0")}${String(day).padStart(2, "0")}`;
    }
  }
  return "";
}

function sliceBalancedParenInner(s: string, openParenIndex: number): string | null {
  if (s[openParenIndex] !== "(") return null;
  let depth = 1;
  let i = openParenIndex + 1;
  let inStr: false | '"' | "'" = false;
  while (i < s.length) {
    const c = s[i]!;
    if (inStr) {
      if (c === "\\" && s[i + 1] != null) {
        i += 2;
        continue;
      }
      if (c === inStr) inStr = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      i++;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return s.slice(openParenIndex + 1, i);
    }
    i++;
  }
  return null;
}

function splitJsCallArgs(body: string): string[] {
  const args: string[] = [];
  let buf = "";
  let depthParen = 0;
  let depthBracket = 0;
  let inStr: false | '"' | "'" = false;
  let i = 0;
  while (i < body.length) {
    const c = body[i]!;
    if (inStr) {
      if (c === "\\" && body[i + 1] != null) {
        buf += c + body[i + 1]!;
        i += 2;
        continue;
      }
      if (c === inStr) {
        inStr = false;
        buf += c;
        i++;
        continue;
      }
      buf += c;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      buf += c;
      i++;
      continue;
    }
    if (c === "(") depthParen++;
    else if (c === ")") depthParen--;
    else if (c === "[") depthBracket++;
    else if (c === "]") depthBracket--;
    if (c === "," && depthParen === 0 && depthBracket === 0) {
      args.push(buf.trim());
      buf = "";
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  const tail = buf.trim();
  if (tail.length) args.push(tail);
  return args;
}

function normalizeTaskArg(a: string): string {
  let s = String(a ?? "")
    .replace(/&nbsp;/gi, " ")
    .trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    const q = s[0]!;
    s = s.slice(1, -1).replace(new RegExp(`\\\\${q}`, "g"), q);
  }
  return collapseWs(s);
}

function parseTaskInnerArgs(inner: string): TaryTaskRecord | null {
  const args = splitJsCallArgs(inner).map(normalizeTaskArg);
  let pairingId = "";
  let dateLabel = "";
  let dateYmd = "";

  if (args.length >= 4) {
    const a1 = args[1]!.toUpperCase();
    const a2 = args[2]!.toUpperCase();
    const a3 = args[3]!;
    if (/^J[A-Z0-9]{3,5}$/.test(a1) && DATE_LABEL_RE.test(a2) && /^\d{8}$/.test(a3)) {
      pairingId = a1;
      const dm = DATE_LABEL_RE.exec(a2);
      dateLabel = dm ? `${parseInt(dm[1]!, 10)}${dm[2]!}` : a2;
      dateYmd = a3;
    }
  }
  if (!pairingId && args.length >= 3) {
    const a0 = args[0]!.toUpperCase();
    const a1 = args[1]!.toUpperCase();
    const a2 = args[2]!;
    if (/^J[A-Z0-9]{3,5}$/.test(a0) && DATE_LABEL_RE.test(a1) && /^\d{8}$/.test(a2)) {
      pairingId = a0;
      const dm = DATE_LABEL_RE.exec(a1);
      dateLabel = dm ? `${parseInt(dm[1]!, 10)}${dm[2]!}` : a1;
      dateYmd = a2;
    }
  }
  if (!pairingId.startsWith("J")) return null;

  const times = args.filter((a) => /^\d{1,2}:\d{2}$/.test(a) || /^\d{3,4}$/.test(a.replace(/:/g, "")));
  const hhmmTimes = args.filter((a) => /^\d{3,4}$/.test(a));

  let days = "";
  for (const a of args) {
    if (/^\d{1,2}$/.test(a) && a !== dateYmd.slice(-2)) {
      days = a;
      break;
    }
  }

  const reportTime = times[0] ?? "";
  const departTime = times[1] ?? "";
  const arriveTime = times[2] ?? "";
  const blockHrs = times[3] ?? hhmmTimes[3] ?? "";

  const layover =
    args.find((a) => /^[A-Z]{3}(?:\s+[A-Z]{3})*$/.test(a) && a !== pairingId) ?? "";

  return {
    taskIndex: -1,
    pairingId,
    dateLabel,
    dateYmd,
    days,
    reportTime,
    departTime,
    arriveTime,
    blockHrs,
    layover,
  };
}

export function extractTaryTaskRecords(html: string): TaryTaskRecord[] {
  const src = String(html ?? "");
  const out: TaryTaskRecord[] = [];
  const seen = new Set<number>();
  let pushIndex = 0;

  const indexedRe = /\bTAry\s*\[\s*(\d+)\s*\]\s*=\s*new\s+Task\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = indexedRe.exec(src)) !== null) {
    const taskIndex = parseInt(m[1]!, 10);
    if (!Number.isFinite(taskIndex) || seen.has(taskIndex)) continue;
    const openParen = m.index + m[0].length - 1;
    const inner = sliceBalancedParenInner(src, openParen);
    if (!inner) continue;
    const parsed = parseTaskInnerArgs(inner);
    if (!parsed) continue;
    seen.add(taskIndex);
    out.push({ ...parsed, taskIndex });
    pushIndex = Math.max(pushIndex, taskIndex + 1);
  }

  const pushRe = /\bTAry\s*\[\s*TAry\.length\s*\]\s*=\s*new\s+Task\s*\(/gi;
  while ((m = pushRe.exec(src)) !== null) {
    const openParen = m.index + m[0].length - 1;
    const inner = sliceBalancedParenInner(src, openParen);
    if (!inner) continue;
    const parsed = parseTaskInnerArgs(inner);
    if (!parsed) continue;
    while (seen.has(pushIndex)) pushIndex += 1;
    seen.add(pushIndex);
    out.push({ ...parsed, taskIndex: pushIndex });
    pushIndex += 1;
  }

  const arrayRe = /\bTAry\s*=\s*new\s+Array\s*\(/gi;
  while ((m = arrayRe.exec(src)) !== null) {
    const openParen = m.index + m[0].length - 1;
    const innerArray = sliceBalancedParenInner(src, openParen);
    if (!innerArray) continue;
    const taskRe = /\bnew\s+Task\s*\(/gi;
    let tm: RegExpExecArray | null;
    let idx = 0;
    while ((tm = taskRe.exec(innerArray)) !== null) {
      const op = innerArray.indexOf("(", tm.index);
      if (op < 0) continue;
      const inner = sliceBalancedParenInner(innerArray, op);
      if (!inner) continue;
      const parsed = parseTaskInnerArgs(inner);
      if (!parsed) continue;
      if (!seen.has(idx)) {
        seen.add(idx);
        out.push({ ...parsed, taskIndex: idx });
      }
      idx += 1;
    }
  }

  return out.sort((a, b) => a.taskIndex - b.taskIndex);
}

function actionFromLabel(label: string, handlerName: "TradeTask" | "DropTask"): FlicaActivitySelectorAction {
  const v = collapseWs(label).toLowerCase();
  if (v.includes("undo")) return "undo";
  if (v.includes("drop")) return "drop";
  if (v.includes("trade") || v.includes("swap")) return "trade";
  if (handlerName === "DropTask") return "drop";
  return "trade";
}

function extractButtonLabelNearHandler(ctx: string, handlerOffsetInCtx: number): string {
  const before = ctx.slice(0, Math.max(0, handlerOffsetInCtx));
  const valueMatches = [...before.matchAll(/value\s*=\s*["']([^"']+)["']/gi)];
  if (valueMatches.length) {
    return collapseWs(valueMatches[valueMatches.length - 1]![1]!);
  }
  const tail = ctx.slice(handlerOffsetInCtx, handlerOffsetInCtx + 120);
  const m = />\s*([^<]{2,12})\s*<\s*\/\s*(?:input|button)/i.exec(tail);
  return collapseWs(m?.[1] ?? "");
}

export function extractTaskHandlers(html: string): TaskHandlerRecord[] {
  const src = String(html ?? "");
  const out: TaskHandlerRecord[] = [];
  const seen = new Set<string>();

  const addHandler = (handlerName: "TradeTask" | "DropTask", raw: string, pos: number) => {
    const idxM = new RegExp(
      `${handlerName}\\s*\\(\\s*[^,]*,\\s*(\\d+)\\s*\\)`,
      "i",
    ).exec(raw);
    if (!idxM) return;
    const taskIndex = parseInt(idxM[1]!, 10);
    if (!Number.isFinite(taskIndex)) return;
    const key = `${handlerName}:${taskIndex}:${raw.slice(0, 80)}`;
    if (seen.has(key)) return;
    seen.add(key);

    const ctxStart = Math.max(0, pos - 500);
    const ctxEnd = Math.min(src.length, pos + raw.length + 300);
    const ctx = src.slice(ctxStart, ctxEnd);
    const handlerOffsetInCtx = pos - ctxStart;
    const disabled =
      /\bdisabled\b/i.test(ctx) ||
      /<input[^>]*\bdisabled\b/i.test(ctx) ||
      /<button[^>]*\bdisabled\b/i.test(ctx);

    const actionLabel = extractButtonLabelNearHandler(ctx, handlerOffsetInCtx);
    const action = actionFromLabel(actionLabel, handlerName);

    out.push({
      taskIndex,
      handlerName,
      rawOnclick: collapseWs(raw),
      actionLabel: actionLabel || (handlerName === "DropTask" ? "Drop" : "Trade"),
      action,
      disabled,
      selectedOnFlica: action === "undo",
    });
  };

  const onclickRe = /onclick\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let om: RegExpExecArray | null;
  while ((om = onclickRe.exec(src)) !== null) {
    const raw = om[2] ?? om[3] ?? "";
    if (/TradeTask/i.test(raw)) addHandler("TradeTask", raw, om.index);
    if (/DropTask/i.test(raw)) addHandler("DropTask", raw, om.index);
  }

  const bareRe = /\b(TradeTask|DropTask)\s*\(\s*[^)]+\)/gi;
  let bm: RegExpExecArray | null;
  while ((bm = bareRe.exec(src)) !== null) {
    const name = bm[1] as "TradeTask" | "DropTask";
    addHandler(name, bm[0]!, bm.index);
  }

  return out.sort((a, b) => a.taskIndex - b.taskIndex);
}

function extractCellsFromTr(trInner: string): string[] {
  const cells: string[] = [];
  const re = /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trInner)) !== null) {
    cells.push(stripTags(m[2] ?? ""));
  }
  return cells;
}

function pickPairingFromCells(cells: string[]): string {
  for (const c of cells) {
    const m = PAIRING_RE.exec(c.toUpperCase());
    if (m) return m[1]!.toUpperCase();
  }
  return "";
}

function pickDateLabelFromCells(cells: string[], rowText: string): string {
  for (const c of cells) {
    const m = DATE_LABEL_RE.exec(c.toUpperCase());
    if (m) return `${parseInt(m[1]!, 10)}${m[2]!}`;
  }
  const m = DATE_LABEL_RE.exec(rowText.toUpperCase());
  if (m) return `${parseInt(m[1]!, 10)}${m[2]!}`;
  return "";
}

function classifyRowKind(
  cells: string[],
  rowText: string,
  pairingId: string,
): FlicaActivitySelectorRowKind {
  const nonEmpty = cells.filter((c) => c.length > 0);
  if (!pairingId) {
    const t = rowText.toUpperCase();
    if (!t || /^[\s\-–—|]+$/.test(t)) return "blank";
    if (DATE_LABEL_RE.test(t) && nonEmpty.length <= 2) return "date_header";
    if (nonEmpty.length <= 1 && DATE_LABEL_RE.test(nonEmpty[0] ?? "")) return "date_header";
    return "carryover";
  }
  return "trip";
}

function mapCellsToFields(cells: string[], pairingId: string): {
  days: string;
  report: string;
  depart: string;
  arrive: string;
  blockHrs: string;
  layover: string;
} {
  const dataCells = cells.filter((c) => {
    const u = c.toUpperCase();
    if (!c) return false;
    if (PAIRING_RE.test(u) && u.replace(PAIRING_RE, "").trim().length < 3) return false;
    if (DATE_LABEL_RE.test(u) && u.length < 8) return false;
    return true;
  });

  const timeLike = (s: string) => /^\d{3,4}$/.test(s.replace(/:/g, "")) || /^\d{1,2}:\d{2}$/.test(s);
  const times = dataCells.filter(timeLike);

  let days = "";
  for (const c of dataCells) {
    if (/^\d{1,2}$/.test(c) && !days) {
      days = c;
      continue;
    }
  }

  const layCandidates = dataCells.filter(
    (c) =>
      /^[A-Z]{3}(?:\s+[A-Z]{3})*$/.test(c) &&
      c !== pairingId &&
      !timeLike(c) &&
      !/^\d{1,2}$/.test(c),
  );

  return {
    days,
    report: times[0] ?? "",
    depart: times[1] ?? "",
    arrive: times[2] ?? "",
    blockHrs: times[3] ?? "",
    layover: layCandidates.length ? layCandidates[layCandidates.length - 1]! : "",
  };
}

function extractTaskIndexFromFragment(fragment: string): number | null {
  const hay = String(fragment ?? "");
  const m =
    /TradeTask\s*\(\s*[^,]*,\s*(\d+)\s*\)/i.exec(hay) ??
    /DropTask\s*\(\s*[^,]*,\s*(\d+)\s*\)/i.exec(hay);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

function parseActionFromRow(
  rowHtml: string,
  rowText: string,
  handlerByIndex: Map<number, TaskHandlerRecord>,
): {
  action: FlicaActivitySelectorAction;
  flicaRowIndex: number | null;
  selectedOnFlica: boolean;
  locked: boolean;
  actionLabel: string;
  rawOnclick: string;
} {
  const idx = extractTaskIndexFromFragment(rowHtml);
  const handler = idx != null ? handlerByIndex.get(idx) : undefined;
  if (handler) {
    return {
      action: handler.action,
      flicaRowIndex: handler.taskIndex,
      selectedOnFlica: handler.selectedOnFlica,
      locked: handler.disabled,
      actionLabel: handler.actionLabel,
      rawOnclick: handler.rawOnclick,
    };
  }

  const hay = `${rowHtml} ${rowText}`.toLowerCase();
  const disabled =
    /\bdisabled\b/i.test(rowHtml) ||
    /<input[^>]*disabled/i.test(rowHtml) ||
    /<button[^>]*disabled/i.test(rowHtml);

  const handlerPos = Math.max(
    rowHtml.toLowerCase().indexOf("tradetask"),
    rowHtml.toLowerCase().indexOf("droptask"),
  );
  let btnVal = "";
  if (handlerPos >= 0) {
    const before = rowHtml.slice(0, handlerPos);
    const valueMatches = [...before.matchAll(/value\s*=\s*["']([^"']+)["']/gi)];
    if (valueMatches.length) btnVal = collapseWs(valueMatches[valueMatches.length - 1]![1]!);
  }
  if (!btnVal) {
    const btnM =
      /value\s*=\s*["']([^"']+)["'][^>]*onclick\s*=\s*["'][^"']*(?:TradeTask|DropTask)/i.exec(rowHtml) ??
      /onclick\s*=\s*["'][^"']*(?:TradeTask|DropTask)[^"']*["'][^>]*value\s*=\s*["']([^"']+)["']/i.exec(
        rowHtml,
      );
    btnVal = collapseWs(btnM?.[1] ?? "");
  }
  const rawM = /((?:TradeTask|DropTask)\s*\([^)]*\))/i.exec(rowHtml);
  const rawOnclick = rawM?.[1] ?? "";

  if (btnVal.toLowerCase().includes("undo")) {
    return {
      action: "undo",
      flicaRowIndex: idx,
      selectedOnFlica: true,
      locked: false,
      actionLabel: btnVal || "Undo",
      rawOnclick,
    };
  }
  if (btnVal.toLowerCase().includes("drop") || /DropTask/i.test(rowHtml)) {
    return {
      action: "drop",
      flicaRowIndex: idx,
      selectedOnFlica: false,
      locked: disabled,
      actionLabel: btnVal || "Drop",
      rawOnclick,
    };
  }
  if (btnVal.toLowerCase().includes("trade") || /TradeTask/i.test(rowHtml)) {
    return {
      action: "trade",
      flicaRowIndex: idx,
      selectedOnFlica: false,
      locked: disabled,
      actionLabel: btnVal || "Trade",
      rawOnclick,
    };
  }

  if (idx != null && !disabled) {
    return {
      action: hay.includes("drop") ? "drop" : "trade",
      flicaRowIndex: idx,
      selectedOnFlica: false,
      locked: false,
      actionLabel: btnVal || "Trade",
      rawOnclick,
    };
  }

  if (disabled) {
    return {
      action: "locked",
      flicaRowIndex: idx,
      selectedOnFlica: false,
      locked: true,
      actionLabel: btnVal,
      rawOnclick,
    };
  }

  return {
    action: "none",
    flicaRowIndex: idx,
    selectedOnFlica: false,
    locked: false,
    actionLabel: btnVal,
    rawOnclick,
  };
}

function isSelectableAction(action: FlicaActivitySelectorAction, locked: boolean, idx: number | null): boolean {
  if (locked || idx == null) return false;
  return action === "trade" || action === "drop";
}

function buildTripRow(
  orderIndex: number,
  task: TaryTaskRecord | undefined,
  handler: TaskHandlerRecord | undefined,
  tableFields: ReturnType<typeof mapCellsToFields> | undefined,
  pairingId: string,
  dateLabel: string,
  dateYmd: string,
  sectionDateLabel: string,
  rawRowText: string,
  rawCells: string[],
): FlicaActivitySelectorRow {
  const action = handler?.action ?? "none";
  const locked = handler?.disabled ?? false;
  const flicaRowIndex = handler?.taskIndex ?? task?.taskIndex ?? null;
  const selectable = isSelectableAction(action, locked, flicaRowIndex);

  return {
    orderIndex,
    kind: "trip",
    pairingId: pairingId || task?.pairingId || "",
    dateLabel: dateLabel || task?.dateLabel || "",
    dateYmd: dateYmd || task?.dateYmd || "",
    days: tableFields?.days || task?.days || "",
    report: tableFields?.report || task?.reportTime || "",
    depart: tableFields?.depart || task?.departTime || "",
    arrive: tableFields?.arrive || task?.arriveTime || "",
    blockHrs: tableFields?.blockHrs || task?.blockHrs || "",
    layover: tableFields?.layover || task?.layover || "",
    actionType: action,
    actionLabel: handler?.actionLabel,
    rawOnclick: handler?.rawOnclick,
    flicaRowIndex,
    selectable,
    selectedOnFlica: handler?.selectedOnFlica ?? action === "undo",
    locked,
    sectionDateLabel,
    rawRowText: rawRowText.slice(0, 400),
    rawCells,
  };
}

export function parseActivitySelectorRowsFromHtml(html: string): {
  rows: FlicaActivitySelectorRow[];
  stats: Omit<ActivitySelectorParseStats, "eligibleRowsFound" | "firstEligible">;
  taskByIndex: Map<number, TaryTaskRecord>;
  handlerByIndex: Map<number, TaskHandlerRecord>;
} {
  const safeHtml = String(html ?? "");
  const taskRecords = extractTaryTaskRecords(safeHtml);
  const handlers = extractTaskHandlers(safeHtml);
  const taskByIndex = new Map(taskRecords.map((t) => [t.taskIndex, t]));
  const handlerByIndex = new Map<number, TaskHandlerRecord>();
  for (const h of handlers) {
    const prev = handlerByIndex.get(h.taskIndex);
    if (!prev) {
      handlerByIndex.set(h.taskIndex, h);
      continue;
    }
    const preferNew =
      (h.handlerName === "DropTask" && prev.handlerName === "TradeTask") ||
      (h.actionLabel.toLowerCase().includes("drop") &&
        !prev.actionLabel.toLowerCase().includes("drop")) ||
      (h.action === "drop" && prev.action === "trade");
    if (preferNew) handlerByIndex.set(h.taskIndex, h);
  }

  const tradeTaskHandlersFound = handlers.filter((h) => h.handlerName === "TradeTask").length;
  const dropTaskHandlersFound = handlers.filter((h) => h.handlerName === "DropTask").length;

  const rows: FlicaActivitySelectorRow[] = [];
  let sectionDateLabel = "";
  let yearHint = "";
  let orderIndex = 0;
  let tableRowsFound = 0;

  const trRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  let trM: RegExpExecArray | null;

  while ((trM = trRe.exec(safeHtml)) !== null) {
    tableRowsFound += 1;
    const trAttrs = trM[1] ?? "";
    const trInner = trM[2] ?? "";
    const rowHtml = `${trAttrs} ${trInner}`;
    const rowText = stripTags(trInner);
    const cells = extractCellsFromTr(trInner);
    let pairingId = pickPairingFromCells(cells);
    const dateLabel =
      pickDateLabelFromCells(cells, rowText) ||
      (sectionDateLabel && pairingId ? sectionDateLabel : "");
    const kind = classifyRowKind(cells, rowText, pairingId);

    if (kind === "date_header") {
      const dl = pickDateLabelFromCells(cells, rowText) || collapseWs(rowText).toUpperCase();
      if (dl) sectionDateLabel = dl;
      const y = labelToYmd(dl, yearHint);
      if (y.length >= 4) yearHint = y.slice(0, 4);
      rows.push({
        orderIndex,
        kind,
        pairingId: "",
        dateLabel: dl,
        dateYmd: y,
        days: "",
        report: "",
        depart: "",
        arrive: "",
        blockHrs: "",
        layover: "",
        actionType: "none",
        flicaRowIndex: null,
        selectable: false,
        selectedOnFlica: false,
        locked: false,
        sectionDateLabel: dl,
        rawRowText: rowText.slice(0, 400),
        rawCells: cells,
      });
      orderIndex += 1;
      continue;
    }

    if (kind !== "trip") {
      rows.push({
        orderIndex,
        kind,
        pairingId: "",
        dateLabel: "",
        dateYmd: "",
        days: "",
        report: "",
        depart: "",
        arrive: "",
        blockHrs: "",
        layover: "",
        actionType: "none",
        flicaRowIndex: null,
        selectable: false,
        selectedOnFlica: false,
        locked: false,
        sectionDateLabel,
        rawRowText: rowText.slice(0, 400),
        rawCells: cells,
      });
      orderIndex += 1;
      continue;
    }

    const actionBits = parseActionFromRow(rowHtml, rowText, handlerByIndex);
    const taskIdx = actionBits.flicaRowIndex;
    const task = taskIdx != null ? taskByIndex.get(taskIdx) : undefined;
    if (!pairingId && task) pairingId = task.pairingId;

    const fields = mapCellsToFields(cells, pairingId);
    const effectiveDateLabel = dateLabel || task?.dateLabel || sectionDateLabel;
    const dateYmd =
      task?.dateYmd || labelToYmd(effectiveDateLabel, yearHint) || labelToYmd(effectiveDateLabel);

    const handler = taskIdx != null ? handlerByIndex.get(taskIdx) : undefined;
    rows.push(
      buildTripRow(
        orderIndex,
        task,
        handler ?? (actionBits.flicaRowIndex != null
          ? {
              taskIndex: actionBits.flicaRowIndex,
              handlerName: /DropTask/i.test(actionBits.rawOnclick) ? "DropTask" : "TradeTask",
              rawOnclick: actionBits.rawOnclick,
              actionLabel: actionBits.actionLabel,
              action: actionBits.action,
              disabled: actionBits.locked,
              selectedOnFlica: actionBits.selectedOnFlica,
            }
          : undefined),
        fields,
        pairingId,
        effectiveDateLabel,
        dateYmd,
        sectionDateLabel,
        rowText,
        cells,
      ),
    );
    orderIndex += 1;
  }

  const tripRowIndices = new Set(
    rows.filter((r) => r.kind === "trip" && r.flicaRowIndex != null).map((r) => r.flicaRowIndex!),
  );

  for (const handler of handlers) {
    if (tripRowIndices.has(handler.taskIndex)) continue;
    const task = taskByIndex.get(handler.taskIndex);
    if (!task && handler.disabled) continue;

    const pairingId = task?.pairingId ?? "";
    if (!pairingId && handler.action !== "trade" && handler.action !== "drop") continue;

    const dateLabel = task?.dateLabel ?? "";
    const dateYmd = task?.dateYmd ?? labelToYmd(dateLabel, yearHint);

    rows.push(
      buildTripRow(
        orderIndex,
        task,
        handler,
        undefined,
        pairingId,
        dateLabel,
        dateYmd,
        sectionDateLabel,
        task ? `${task.pairingId} ${task.dateLabel}` : handler.rawOnclick,
        task ? [task.pairingId, task.dateLabel, task.days, task.reportTime, task.departTime, task.arriveTime, task.blockHrs, task.layover] : [],
      ),
    );
    orderIndex += 1;
  }

  if (rows.filter((r) => r.kind === "trip").length === 0 && taskRecords.length > 0) {
    let lastDate = "";
    for (const task of taskRecords) {
      const handler = handlerByIndex.get(task.taskIndex);
      if (task.dateLabel && task.dateLabel !== lastDate) {
        const dl = task.dateLabel;
        const y = labelToYmd(dl, yearHint);
        if (y.length >= 4) yearHint = y.slice(0, 4);
        rows.push({
          orderIndex,
          kind: "date_header",
          pairingId: "",
          dateLabel: dl,
          dateYmd: y,
          days: "",
          report: "",
          depart: "",
          arrive: "",
          blockHrs: "",
          layover: "",
          actionType: "none",
          flicaRowIndex: null,
          selectable: false,
          selectedOnFlica: false,
          locked: false,
          sectionDateLabel: dl,
          rawRowText: dl,
          rawCells: [dl],
        });
        orderIndex += 1;
        lastDate = dl;
        sectionDateLabel = dl;
      }

      rows.push(
        buildTripRow(
          orderIndex,
          task,
          handler,
          undefined,
          task.pairingId,
          task.dateLabel,
          task.dateYmd || labelToYmd(task.dateLabel, yearHint),
          sectionDateLabel,
          `${task.pairingId} ${task.dateLabel}`,
          [task.pairingId, task.dateLabel, task.days, task.reportTime, task.departTime, task.arriveTime, task.blockHrs, task.layover],
        ),
      );
      orderIndex += 1;
    }
  }

  rows.sort((a, b) => a.orderIndex - b.orderIndex);

  return {
    rows,
    stats: {
      htmlLength: safeHtml.length,
      taskRecordsFound: taskRecords.length,
      tableRowsFound,
      tradeTaskHandlersFound,
      dropTaskHandlersFound,
    },
    taskByIndex,
    handlerByIndex,
  };
}

export function collectEligibleActivityRows(rows: FlicaActivitySelectorRow[]): FlicaActivitySelectorRow[] {
  return rows.filter((r) => r.kind === "trip" && r.selectable && r.pairingId && r.flicaRowIndex != null);
}
