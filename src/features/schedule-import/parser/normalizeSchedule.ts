/**
 * Map parser drafts to API-friendly normalized payload (and future DB inserts).
 */

import type { NormalizedScheduleMonthPayload, ParsedScheduleMonthDraft } from '../types';

export function parsedDraftToNormalizedPayload(draft: ParsedScheduleMonthDraft): NormalizedScheduleMonthPayload {
  return {
    scheduleMonth: {
      crewMemberName: draft.crewMemberName,
      employeeId: draft.employeeId,
      scheduleMonthLabel: draft.scheduleMonthLabel,
      scheduleYear: draft.scheduleYear,
      lastUpdatedAtSource: draft.lastUpdatedAtSource,
      monthlyTotals: draft.monthlyTotals
        ? {
            blockMinutes: draft.monthlyTotals.blockMinutes,
            creditMinutes: draft.monthlyTotals.creditMinutes,
            ytdMinutes: draft.monthlyTotals.ytdMinutes,
            daysOff: draft.monthlyTotals.daysOff,
          }
        : null,
      pairings: draft.pairings.map((p) => ({
        pairingCode: p.pairingCode,
        pairingStartDate: p.pairingStartDate,
        baseCode: p.baseCode,
        baseReportTimeLocal: p.baseReportTimeLocal,
        operatePatternText: p.operatePatternText,
        equipmentSummary: p.equipmentSummary,
        totals: {
          blockMinutes: p.totals.blockMinutes,
          deadheadMinutes: p.totals.deadheadMinutes,
          creditMinutes: p.totals.creditMinutes,
          dutyMinutes: p.totals.dutyMinutes,
          tafbMinutes: p.totals.tafbMinutes,
          tripRigMinutes: p.totals.tripRigMinutes,
        },
        dutyDays: p.dutyDays.map((d) => ({
          date: d.dutyDate,
          dayOfWeek: d.dayOfWeek,
          segments: d.segments.map((s) => ({
            segmentType: s.segmentType,
            flightNumber: s.flightNumber,
            departureStation: s.departureStation,
            arrivalStation: s.arrivalStation,
            departureTimeLocal: s.departureTimeLocal,
            arrivalTimeLocal: s.arrivalTimeLocal,
            blockMinutes: s.blockMinutes,
            isDeadhead: s.isDeadhead,
          })),
          layover:
            d.layovers.length > 0
              ? {
                  stationCode: d.layovers[0].stationCode,
                  hotelName: d.layovers[0].hotelName,
                }
              : null,
        })),
      })),
    },
  };
}
