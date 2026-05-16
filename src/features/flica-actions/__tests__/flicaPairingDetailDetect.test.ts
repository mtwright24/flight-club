import {
  detectFlicaPairingDetailHtml,
  parseReplayHtmlAsPairingDetail,
} from "../flicaPairingDetailDetect";

describe("detectFlicaPairingDetailHtml", () => {
  it("detects RBCPair-style markers in HTML body", () => {
    const html = `
      <html><body>
        <div>J3379 : 18MAY</motion>
        <div>Base/Equip: A320</div>
        <motion>BSE REPT: 14:30</div>
        <div>D-END: 22:00</div>
        <div>T.A.F.B. 12:30</div>
        <div>Crew: 12345 SMITH</div>
        <table>DY DD DH C FLTNO DPS-ARS DEPL ARRL BLKT</table>
      </body></html>
    `;
    const d = detectFlicaPairingDetailHtml(html);
    expect(d.isPairingDetail).toBe(true);
    expect(d.sourceHints.length).toBeGreaterThanOrEqual(2);
  });

  it("does not treat bare TradeBoard shell as pairing detail", () => {
    const html = `<html><body><title>FLICA.NET - TradeBoard</title><div>All Requests</motion></body></html>`;
    const d = detectFlicaPairingDetailHtml(html);
    expect(d.isPairingDetail).toBe(false);
  });
});

describe("parseReplayHtmlAsPairingDetail", () => {
  it("returns error when markers insufficient", () => {
    const r = parseReplayHtmlAsPairingDetail("<html><body>TradeBoard</body></html>");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
