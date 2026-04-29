/**
 * May PTV: parser must emit a PTV pairing with a real calendar end so persist can write
 * synthetic schedule_entries for Classic (trip status `ptv` from pairing_code PTV).
 *
 * Run: npx tsx src/features/crew-schedule/__tests__/flicaPtvMay.parser.test.ts
 */
import assert from 'assert';
import { parseFlicaScheduleHtml } from '../../../services/flicaScheduleHtmlParser';

function minimalMayScheduleTable(opts: {
  blueStyle: string;
  onclick: string;
  operatesText: string;
}): string {
  const { blueStyle, onclick, operatesText } = opts;
  return `
JBU — 50982
<table cellpadding="0" cellspacing="0" style="width:100%; font-size:8pt;">
<tr>
  <td style="${blueStyle}">PTV : 23MAY </td>
  <td>ONLY ON FRI</td>
</tr>
<tr><td colspan="2">BSE REPT: 0000L</td></tr>
<tr><td colspan="2"><a href="#" onclick="${onclick}">Operates: ${operatesText}</a></td></tr>
<tr><td colspan="2">Base/Equip: JFK/ALL</td></tr>
<tr><td noWrap=true>F101F201</td></tr>
</table>
`.trim();
}

function takePtv(parsed: ReturnType<typeof parseFlicaScheduleHtml>) {
  const ptv = parsed.pairings.find((p) => String(p.id).trim().toUpperCase() === 'PTV');
  return ptv ?? null;
}

function run() {
  // 1) Happy path: onclick carries YYYYMMDD end; blue #0000ff
  const htmlOk = minimalMayScheduleTable({
    blueStyle: 'color: #0000ff;',
    onclick: "viewOperationDates('PTV',20260523,20260529,0,'')",
    operatesText: 'May 23-May 29',
  });
  const parsedOk = parseFlicaScheduleHtml(htmlOk, '2026-05');
  const ptvOk = takePtv(parsedOk);
  assert(ptvOk, 'Expected PTV pairing in parsed.pairings (check splitIntoPairingBlocks + blue header regex)');
  assert.strictEqual(ptvOk!.startDate, '2026-05-23');
  assert.strictEqual(ptvOk!.endDate, '2026-05-29');
  assert.strictEqual(ptvOk!.legs.length, 0, 'PTV vacation block should have no leg rows');
  console.log('OK: May PTV with viewOperationDates end dates');

  // 2) Alternate blue (#00f) — some FLICA builds omit leading zero in hex
  const html00f = minimalMayScheduleTable({
    blueStyle: 'color:#00f;',
    onclick: "viewOperationDates('PTV',20260523,20260529,0,'')",
    operatesText: 'May 23-May 29',
  });
  const ptv00f = takePtv(parseFlicaScheduleHtml(html00f, '2026-05'));
  assert(ptv00f && ptv00f.endDate === '2026-05-29', 'Expected PTV with #00f header style');
  console.log('OK: PTV header with color:#00f');

  // 3) Broken onclick — end date only from "Operates: …" banner (day-first range)
  const htmlBanner = minimalMayScheduleTable({
    blueStyle: 'color: rgb(0, 0, 255);',
    onclick: "viewOperationDates('PTV')",
    operatesText: '23MAY-29MAY',
  });
  const parsedBanner = parseFlicaScheduleHtml(htmlBanner, '2026-05');
  const ptvBanner = takePtv(parsedBanner);
  assert(ptvBanner, 'Expected PTV when onclick omits numeric args');
  assert.strictEqual(ptvBanner!.startDate, '2026-05-23');
  assert.strictEqual(ptvBanner!.endDate, '2026-05-29');
  console.log('OK: PTV end date from Operates banner when onclick has no YYYYMMDD');

  // 4) Failure mode doc: wrong outer table font-size — splitter finds no blocks
  const badTable = `
JBU — 50982
<table cellpadding="0" cellspacing="0" style="width:100%; font-size:9pt;">
<tr><td style="color:#0000ff;">PTV : 23MAY </td><td>X</td></tr>
</table>`;
  const parsedBad = parseFlicaScheduleHtml(badTable, '2026-05');
  assert.strictEqual(
    parsedBad.pairings.length,
    0,
    'Documented: 9pt outer table is ignored by splitIntoPairingBlocks — real May HTML like this would drop PTV',
  );
  console.log('OK: Documented 9pt-table gap (0 pairings)');

  console.log('\nAll May PTV parser checks passed.');
}

run();
