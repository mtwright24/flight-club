import type { FlicaLeg, FlicaPairing } from "../../services/flicaScheduleHtmlParser";
import { flicaCalendarIsoInParserMonth } from "../../services/flicaScheduleHtmlParser";
import type { FlicaMarketplacePairingDetail } from "./flicaMarketplacePairingDetailTypes";

const DOW3_TO_FULL: Record<string, string> = {
  SU: "SUN",
  MO: "MON",
  TU: "TUE",
  WE: "WED",
  TH: "THU",
  FR: "FRI",
  SA: "SAT",
};

const MONTH_SHORT = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

function padTimeDisplay(t: string): string {
  const s = String(t ?? "").trim();
  if (!s) return "";
  if (/L$/i.test(s)) return s.toUpperCase();
  if (/^\d{1,2}:\d{2}$/.test(s)) return s;
  if (/^\d{3,4}$/.test(s) && !/^0000$/.test(s)) {
    const pad = s.length === 3 ? `0${s}` : s;
    return `${pad.slice(0, 2)}:${pad.slice(2)}`;
  }
  return s;
}

function dutyFdpFromRawText(raw: string): string | undefined {
  const u = raw.replace(/\s+/g, " ");
  const m =
    u.match(/\bTDUTY\s*\/\s*FDP\D*(\d{1,2}:\d{2}|\d{3,4}L?)/i) ||
    u.match(/\bTDUTY\s*\/\s*FDP\D*(\d{2}:\d{2}\s*\/\s*\d{2}:\d{2})/i);
  const hit = m?.[1]?.trim();
  return hit || undefined;
}

function finalDEndFromLegs(legs: FlicaLeg[]): string | undefined {
  for (let i = legs.length - 1; i >= 0; i--) {
    const d = String(legs[i]?.dEndLocal ?? "").trim();
    if (d) return d;
  }
  return undefined;
}

function headerDateLabel(p: FlicaPairing): string {
  const raw = String(p.rawScheduleLabel ?? "").trim();
  if (raw) {
    return raw.replace(/\s*:\s*/i, " ").trim();
  }
  if (p.startDate) {
    const pr = p.startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (pr) {
      const mo = Number(pr[2]) - 1;
      const dom = Number(pr[3]);
      if (mo >= 0 && mo < 12) return `${String(dom)}${MONTH_SHORT[mo]}`;
    }
  }
  return p.id;
}

function daysHumanLabel(p: FlicaPairing): string {
  const d = String(p.daysOfWeek ?? "").trim();
  if (d) return d;
  if (p.startDate && p.endDate && p.startDate !== p.endDate) {
    return `${p.startDate} → ${p.endDate}`;
  }
  return "";
}

function groupLegsByCalendarDay(legs: FlicaLeg[], monthKey: string): FlicaLeg[][] {
  if (!legs.length) return [];
  const groups: FlicaLeg[][] = [];
  let curKey = "";
  let bucket: FlicaLeg[] = [];
  for (const leg of legs) {
    const iso =
      flicaCalendarIsoInParserMonth(monthKey, leg.date) ??
      `${monthKey}-${String(leg.date).padStart(2, "0")}`;
    if (iso !== curKey) {
      if (bucket.length) groups.push(bucket);
      bucket = [];
      curKey = iso;
    }
    bucket.push(leg);
  }
  if (bucket.length) groups.push(bucket);
  return groups;
}

function daySectionLabels(
  monthKey: string,
  isoGuess: string | null,
  firstLeg: FlicaLeg,
): { dayLabel: string; dateLabel: string } {
  const iso = isoGuess ?? "";
  const pr = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let dom = firstLeg.date;
  let monIdx = parseInt(monthKey.slice(5, 7), 10) - 1;
  if (pr) {
    dom = Number(pr[3]);
    monIdx = Number(pr[2]) - 1;
  }
  const mon = monIdx >= 0 && monIdx < 12 ? MONTH_SHORT[monIdx] : "";
  const d3 = String(firstLeg.dayOfWeek ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const long = DOW3_TO_FULL[d3] ?? d3;
  return {
    dayLabel: mon ? `${long} ${mon} ${dom}` : `${long} ${dom}`,
    dateLabel: mon ? `${mon} ${dom}` : String(dom),
  };
}

export function flicaPairingToMarketplaceDetail(
  pairing: FlicaPairing,
  source: "tradeboard" | "opentime",
  opts: { monthKey: string; rawHtml?: string },
): FlicaMarketplacePairingDetail {
  const monthKey = opts.monthKey;
  const legs = pairing.legs ?? [];
  const rawText = pairing.rawPairingText ?? "";

  const routeSummary =
    String(pairing.routeSummary ?? "").trim() ||
    legs
      .map((l) => String(l.route ?? "").trim().split(/[-–—]/)[0])
      .filter(Boolean)
      .filter((x, i, a) => a.indexOf(x) === i)
      .join(" • ");

  const legGroups = groupLegsByCalendarDay(legs, monthKey);
  const dutyDays: FlicaMarketplacePairingDetail["dutyDays"] = [];

  for (let gi = 0; gi < legGroups.length; gi++) {
    const group = legGroups[gi]!;
    const first = group[0]!;
    const iso = flicaCalendarIsoInParserMonth(monthKey, first.date);
    const { dayLabel, dateLabel } = daySectionLabels(monthKey, iso, first);

    const mappedLegs = group.map((l) => ({
      isDeadhead: l.isDeadhead,
      deadheadType: l.deadheadType,
      flightNumber: String(l.flightNumber ?? "").trim(),
      route: String(l.route ?? "").trim(),
      departLocal: padTimeDisplay(l.departLocal),
      arriveLocal: padTimeDisplay(l.arriveLocal),
      blockTime: padTimeDisplay(l.blockTime),
      equipment: String(l.equipment ?? "").trim() || undefined,
    }));

    const last = group[group.length - 1]!;
    const layCity = String(last.layoverCity ?? "").trim();
    const layTime = String(last.layoverTime ?? "").trim();
    const hotelName = String(last.hotel ?? "").trim();
    const hotelPhone = String(last.hotelPhone ?? "").trim();
    const nextReportTime = String(last.nextReportTime ?? "").trim();
    const dEndLocal = String(last.dEndLocal ?? "").trim();

    let layover: FlicaMarketplacePairingDetail["dutyDays"][number]["layover"];
    if (layCity || layTime || hotelName || hotelPhone || nextReportTime || dEndLocal) {
      layover = {
        city: layCity,
        duration: layTime,
        hotelName: hotelName || undefined,
        hotelPhone: hotelPhone || undefined,
        nextReportTime: nextReportTime || undefined,
        dEndLocal: dEndLocal || undefined,
      };
    }

    dutyDays.push({
      dayLabel,
      dateLabel,
      reportTime:
        gi === 0 ? String(pairing.baseReport ?? pairing.reportTime ?? "").trim() || undefined : undefined,
      legs: mappedLegs,
      layover,
    });
  }

  return {
    source,
    sourceBadge: source === "tradeboard" ? "Tradeboard" : "Open Time",
    pairingId: pairing.id.trim().toUpperCase(),
    dateLabel: headerDateLabel(pairing),
    dateRangeLabel:
      pairing.startDate && pairing.endDate
        ? `${pairing.startDate}${pairing.endDate !== pairing.startDate ? ` — ${pairing.endDate}` : ""}`
        : pairing.startDate ?? "",
    daysLabel: daysHumanLabel(pairing),
    operatingDates: String(pairing.operatingDates ?? "").trim() || undefined,
    routeSummary,
    base: String(pairing.base ?? "").trim(),
    equipment: String(pairing.equipment ?? "").trim(),
    positions: String(pairing.positions ?? "").trim(),
    reportTime: String(pairing.baseReport ?? pairing.reportTime ?? "").trim(),
    totalCredit: String(pairing.totalCredit ?? "").trim(),
    totalBlock: String(pairing.totalBlock ?? "").trim(),
    tafb: String(pairing.tafb ?? "").trim(),
    dutyFdp: dutyFdpFromRawText(rawText),
    dEnd: finalDEndFromLegs(legs),
    totalDeadhead: String(pairing.totalDeadhead ?? "").trim() || undefined,
    dutyDays,
    crewMembers: (pairing.crewMembers ?? []).map((c) => ({
      position: String(c.position ?? "").trim(),
      employeeId: String(c.employeeId ?? "").trim(),
      name: String(c.name ?? "").trim(),
      status: String(c.status ?? "").trim() || undefined,
    })),
    rawHtml: opts.rawHtml,
    rawText,
  };
}
