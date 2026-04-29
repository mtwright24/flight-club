/**
 * Pairing detail: extended FlicaPairing fields + crew + route from a minimal FLICA block.
 *
 * Run: npx tsx src/features/crew-schedule/__tests__/flicaPairingDetail.parser.test.ts
 */
import assert from 'assert';
import { parseFlicaScheduleHtml } from '../../../services/flicaScheduleHtmlParser';

function minimalPairingBlock(opts: { id: string; day: string; blueStyle?: string }): string {
  const { id, day, blueStyle = 'color: #0000ff;' } = opts;
  return `
<table cellpadding="0" cellspacing="0" style="width:100%; font-size:8pt;">
<tr>
  <td style="${blueStyle}">${id} : ${day} </td>
  <td>ONLY ON WE</td>
</tr>
<tr><td colspan="2">BSE REPT: 0930L</td></tr>
<tr><td colspan="2">Base/Equip: JFK/ALL</td></tr>
<tr><td noWrap=true>F101F201</td></tr>
<tr class="main"><th>DY</th><th>DD</th><th>DHC</th><th>FLTNO</th><th>DPS-ARS</th><th>DEPL</th><th>ARRL</th><th>BLKT</th><th></th><th></th><th>EQP</th></tr>
<tr class="nowrap"><td>WE</td><td>07</td><td></td><td>123</td><td>JFK-BOS</td><td>1026</td><td>1145</td><td>0119</td><td></td><td></td><td>32S</td></tr>
<tr class="bold"><td>Total:</td><td>2305</td><td>0000</td><td></td><td>2358</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td colspan="11"><strong>Crew:</strong></td></tr>
<tr><td></td><td>CA</td><td>11111</td><td>DOE, JANE (TAL)</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
</table>
`.trim();
}

function run() {
  const html = `
JBU — 50982
${minimalPairingBlock({ id: 'J1015', day: '07MAY' })}
`.trim();

  const parsed = parseFlicaScheduleHtml(html, '2026-05');
  const p = parsed.pairings.find((x) => String(x.id).toUpperCase() === 'J1015');
  assert(p, 'Expected J1015 pairing');
  assert(p.rawPairingHtml != null && p.rawPairingHtml.includes('J1015'), 'rawPairingHtml');
  assert(p.rawPairingText != null && p.rawPairingText.includes('J1015'), 'rawPairingText');
  assert(p.routeSummary != null && p.routeSummary.includes('JFK'), 'routeSummary from legs');
  assert.strictEqual(p.baseCode ?? p.base, 'JFK');
  assert.strictEqual(p.reportTime, '0930L');
  assert(p.crewMembers.some((c) => c.position === 'CA' && c.employeeId === '11111'), 'crew CA');
  assert(
    p.crewMembers.some((c) => c.name.includes('DOE') && (c.roleLabel === 'TAL' || c.status === 'TAL')),
    'crew role TAL',
  );
  assert(p.totalBlockMinutes != null && p.totalBlockMinutes > 0, 'block minutes from bold row');
  assert(p.totalCreditMinutes != null && p.totalCreditMinutes > 0, 'credit minutes');
  console.log('OK: pairing detail fields + crew from minimal block');
  console.log('\nAll pairing-detail parser checks passed.');
}

run();
