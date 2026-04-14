import type { CrewScheduleTrip } from './types';

/**
 * Build router params for `/crew-exchange/create-post` so Crew Exchange
 * opens with dates, route, pairing line, credit/block/TAFB, report time, and notes prefilled.
 */
export function tradePostPrefillParams(t: CrewScheduleTrip): Record<string, string> {
  const firstLeg = t.legs[0];
  let reportHHMM = '';
  if (firstLeg?.reportLocal) {
    const m = String(firstLeg.reportLocal).match(/(\d{1,2}):(\d{2})/);
    if (m) {
      const hh = String(parseInt(m[1], 10)).padStart(2, '0');
      reportHHMM = `${hh}:${m[2]}`;
    }
  }

  const creditH = t.pairingCreditHours ?? t.creditHours;

  const out: Record<string, string> = {
    prefillStart: t.startDate,
    prefillEnd: t.endDate,
    prefillPairing: t.pairingCode ?? '',
    prefillRoute: t.routeSummary ?? '',
    prefillFrom: (t.origin ?? firstLeg?.departureAirport ?? '').trim(),
    prefillTo: (t.destination ?? firstLeg?.arrivalAirport ?? '').trim(),
    prefillBase: t.base ?? '',
    prefillTripId: t.id,
  };

  if (creditH != null && !Number.isNaN(Number(creditH))) {
    out.prefillCreditHours = String(creditH);
  }
  if (t.pairingBlockHours != null) out.prefillBlockHours = String(t.pairingBlockHours);
  if (t.pairingTafbHours != null) out.prefillTafbHours = String(t.pairingTafbHours);
  if (reportHHMM) out.prefillReportTime = reportHHMM;
  if (t.tripLayoverTotalMinutes != null) {
    out.prefillLayoverMinutes = String(t.tripLayoverTotalMinutes);
  }

  return out;
}
