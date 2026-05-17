(globalThis as { __DEV__?: boolean }).__DEV__ = false;

jest.mock("../../../dev/fcDevFileLogger", () => ({
  fcDevMirrorScheduleLogToFile: jest.fn(),
}));

jest.mock("../flicaActionsHttp", () => ({
  detectFlicaHtmlState: jest.fn(),
  fetchFlicaHtmlUsingWebViewSession: jest.fn(),
  flicaFetchNeedsWebVerification: jest.fn(),
}));

jest.mock("../flicaActionsWebViewSession", () => ({
  getFlicaActionsWebViewSession: jest.fn().mockResolvedValue(null),
}));

jest.mock("../flicaTradeBoardActivitySelectorWebViewCaptureBridge", () => {
  const actual = jest.requireActual("../flicaTradeBoardActivitySelectorWebViewCaptureBridge");
  return {
    ...actual,
    requestTbActivitySelectorWebViewCapture: jest.fn(),
  };
});

import {
  buildTradeboardActivitySelectorUrl,
  flicaSelectorRowToActivity,
  parseTradeboardActivitySelectorHtml,
} from "../flicaTradeBoardActivitySelector";

function fixtureHtml(extraRows = ""): string {
  const pad = "<!-- ".padEnd(500, "x") + " -->";
  return `${pad}
<table>
<tr><td colspan="9"><b>03JUN</b></td></tr>
<tr>
  <td><input type="button" value="Trade" onclick="TradeTask(this, 5)"></td>
  <td>03JUN</td><td>J1004</td><td>4</td><td>0615</td><td>0730</td><td>1845</td><td>0455</td><td>LAS</td>
</tr>
<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td colspan="9"><b>11JUN</b></td></tr>
<tr>
  <td><input type="button" value="Drop" onclick="TradeTask(this, 12)"></td>
  <td>11JUN</td><td>J3379</td><td>3</td><td>0500</td><td>0612</td><td>2010</td><td>0620</td><td>BOS MCO</td>
</tr>
<tr>
  <td></td>
  <td></td><td>J3379</td><td></td><td></td><td></td><td></td><td></td><td></td>
</tr>
${extraRows}
</table>`;
}

describe("buildTradeboardActivitySelectorUrl", () => {
  it("builds ottrade.cgi selector URL with act=T", () => {
    const url = buildTradeboardActivitySelectorUrl("T");
    expect(url).toContain("/full/ottrade.cgi?");
    expect(url).toContain("BCID=002.000");
    expect(url).toContain("bFromTB=1");
    expect(url).toContain("VerifyDates=1");
    expect(url).toContain("act=T");
  });

  it("maps drop request to act=D", () => {
    expect(buildTradeboardActivitySelectorUrl("D")).toContain("act=D");
  });
});

describe("parseTradeboardActivitySelectorHtml", () => {
  const meta = {
    requestedUrl: "https://jetblue.flica.net/full/ottrade.cgi?act=T",
    finalUrl: "https://jetblue.flica.net/full/ottrade.cgi?act=T",
    act: "T",
  };

  it("parses eligible trip rows with TradeTask index and preserves order", () => {
    const parsed = parseTradeboardActivitySelectorHtml(fixtureHtml(), meta);
    expect(parsed.ok).toBe(true);
    expect(parsed.eligibleRows).toHaveLength(2);

    const trade = parsed.eligibleRows[0]!;
    expect(trade.pairingId).toBe("J1004");
    expect(trade.dateLabel).toBe("3JUN");
    expect(trade.dateYmd).toMatch(/^\d{8}$/);
    expect(trade.dateYmd.slice(4, 6)).toBe("06");
    expect(trade.dateYmd.slice(6, 8)).toBe("03");
    expect(trade.flicaRowIndex).toBe(5);
    expect(trade.actionType).toBe("trade");
    expect(trade.selectable).toBe(true);

    const drop = parsed.eligibleRows[1]!;
    expect(drop.pairingId).toBe("J3379");
    expect(drop.dateLabel).toBe("11JUN");
    expect(drop.flicaRowIndex).toBe(12);
    expect(drop.actionType).toBe("drop");

    const kinds = parsed.rows.map((r) => r.kind);
    expect(kinds.filter((k) => k === "date_header").length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain("carryover");
  });

  it("does not mark rows without TradeTask as selectable", () => {
    const html = fixtureHtml(`
<tr>
  <td></td>
  <td>01MAY</td><td>J9999</td><td>1</td><td>0600</td><td>0700</td><td>1800</td><td>0400</td><td>JFK</td>
</tr>`);
    const parsed = parseTradeboardActivitySelectorHtml(html, meta);
    const j9999 = parsed.rows.find((r) => r.pairingId === "J9999");
    expect(j9999?.selectable).toBe(false);
    expect(parsed.eligibleRows.every((r) => r.pairingId !== "J9999")).toBe(true);
  });

  it("parses TAry Task records with TradeTask handlers when table is empty", () => {
    const pad = "<!-- ".padEnd(500, "x") + " -->";
    const html = `${pad}
<script>
TAry[5]=new Task(1,"J1004","03JUN","20260603",4,"06:15","07:30","18:45","04:55","LAS","","");
TAry[12]=new Task(1,"J3379","11JUN","20260611",3,"05:00","06:12","20:10","06:20","BOS MCO","","");
</script>
<input type="button" value="Trade" onclick="TradeTask(this, 5)">
<input type="button" value="Drop" onclick="DropTask(this, 12)">
`;
    const parsed = parseTradeboardActivitySelectorHtml(html, meta);
    expect(parsed.ok).toBe(true);
    expect(parsed.eligibleRows.length).toBeGreaterThanOrEqual(2);
    expect(parsed.eligibleRows.some((r) => r.pairingId === "J1004")).toBe(true);
    expect(parsed.eligibleRows.some((r) => r.pairingId === "J3379")).toBe(true);
    const j3379 = parsed.eligibleRows.find((r) => r.pairingId === "J3379");
    expect(j3379?.actionType).toBe("drop");
    expect(j3379?.dateYmd).toBe("20260611");
  });

  it("maps selector row to flica_selector activity", () => {
    const parsed = parseTradeboardActivitySelectorHtml(fixtureHtml(), meta);
    const row = parsed.eligibleRows[1]!;
    const activity = flicaSelectorRowToActivity(row, meta.requestedUrl);
    expect(activity.sourceType).toBe("flica_selector");
    expect(activity.pairingId).toBe("J3379");
    expect(activity.dateYmd).toMatch(/^\d{8}$/);
    expect(activity.dateYmd.slice(4, 6)).toBe("06");
    expect(activity.flicaSelectorUrl).toBe(meta.requestedUrl);
    expect(activity.flicaRowIndex).toBe(12);
  });
});
