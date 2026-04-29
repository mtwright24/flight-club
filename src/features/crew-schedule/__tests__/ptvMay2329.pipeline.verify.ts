/**
 * Local verification: May 23–29 paid time vacation (PTV) — parser + same status rule as entryGroupToTrip.
 * Does not call FLICA or Supabase. Does not import tripMapper (pulls RN via supabaseClient).
 *
 * Run: npx tsx src/features/crew-schedule/__tests__/ptvMay2329.pipeline.verify.ts
 */
import assert from 'assert';
import { parseFlicaScheduleHtml } from '../../../services/flicaScheduleHtmlParser';

/** Minimal Crewline-shaped table: blue PTV header, no leg rows, Mar–May-style onclick range. */
const MAY_PTV_HTML = `
JBU — 50982
<table cellpadding="0" cellspacing="0" style="width:100%; font-size:8pt;">
<tr>
  <td style="color: #0000ff;">PTV : 23MAY </td>
  <td>ONLY ON FRI</td>
</tr>
<tr><td colspan="2">BSE REPT: 0000L</td></tr>
<tr><td colspan="2"><a href="#" onclick="viewOperationDates('PTV',20260523,20260529,0,'')">Operates: May 23-May 29</a></td></tr>
<tr><td colspan="2">Base/Equip: JFK/ALL</td></tr>
<tr><td noWrap=true>F101F201</td></tr>
</table>
`.trim();

/** Mirrors tripMapper `firstNonContPairing` + `normPairingCode(pairingCode)==='PTV' ? 'ptv'` branch. */
function mockTripStatusFromPtvRows(pairingCodes: (string | null)[]): 'ptv' | string {
  let firstNonCont = '—';
  for (const pc of pairingCodes) {
    const p = String(pc ?? '').trim();
    if (!p) continue;
    if (p.toUpperCase() === 'CONT') continue;
    firstNonCont = p;
    break;
  }
  return firstNonCont.toUpperCase() === 'PTV' ? 'ptv' : `other:${firstNonCont}`;
}

function run() {
  const parsed = parseFlicaScheduleHtml(MAY_PTV_HTML, '2026-05');
  const ptv = parsed.pairings.find((p) => String(p.id).trim().toUpperCase() === 'PTV');
  assert(ptv, 'parser: expected PTV pairing in parsed.pairings');
  assert.strictEqual(ptv!.startDate, '2026-05-23', 'parser: startDate');
  assert.strictEqual(ptv!.endDate, '2026-05-29', 'parser: endDate');
  assert.strictEqual(ptv!.legs.length, 0, 'parser: PTV block has no legs');
  console.log('[verify] Parser OK:', {
    id: ptv!.id,
    startDate: ptv!.startDate,
    endDate: ptv!.endDate,
    legs: ptv!.legs.length,
    totalCredit: ptv!.totalCredit,
    totalBlock: ptv!.totalBlock,
    tafb: ptv!.tafb,
  });

  const mockPtvDays = Array.from({ length: 7 }, (_, i) => `2026-05-${String(23 + i).padStart(2, '0')}`);
  assert.strictEqual(mockPtvDays[0], '2026-05-23');
  assert.strictEqual(mockPtvDays[6], '2026-05-29');

  const pairingCodes = mockPtvDays.map(() => 'PTV' as string | null);
  assert.strictEqual(mockTripStatusFromPtvRows(pairingCodes), 'ptv');
  console.log('[verify] Trip status rule OK: 7× pairing_code PTV + status TRIP => trip status ptv');

  console.log('\nAll local May 23–29 PTV checks passed (fixture HTML + status rule).');
  console.log(
    'Live account: I cannot fetch your FLICA HTML or Supabase from here. If your real May HTML differs (table/font/blue), parser may emit 0 PTV pairings even though Crewline shows the block.',
  );
}

run();
