(globalThis as { __DEV__?: boolean }).__DEV__ = false;

jest.mock("../../../dev/fcDevFileLogger", () => ({
  fcDevMirrorScheduleLogToFile: jest.fn(),
}));

import {
  parseTradeboardMyRequestsActionsFromHtml,
  tradeboardEditRequestUrl,
  tradeboardMyRequestDeleteUrl,
} from "../flicaTradeBoardMyRequestsActions";

const SAMPLE_HTML = `
<html><body>
<table>
<tr>
  <td>J3379:11JUN</td>
  <td>Trade Trip</td>
  <td><a href="/online/TB_EditRequest.cgi?BCID=002.000&reqId=28542564">Edit</a></td>
  <td><a href="/online/TB_MyRequests.cgi?&bcid=002.000&DeleteMe=28542564&bRestore=0">Delete</a></td>
</tr>
</table>
</body></html>
`;

describe("TradeBoard My Requests actions parse", () => {
  it("extracts edit and delete URLs with reqId", () => {
    const parsed = parseTradeboardMyRequestsActionsFromHtml(SAMPLE_HTML);
    expect(parsed.ok).toBe(true);
    expect(parsed.rows).toHaveLength(1);
    const row = parsed.rows[0]!;
    expect(row.reqId).toBe("28542564");
    expect(row.editRequestId).toBe("28542564");
    expect(row.deleteRequestId).toBe("28542564");
    expect(row.editUrl).toContain("TB_EditRequest.cgi");
    expect(row.editUrl).toContain("reqId=28542564");
    expect(row.deleteUrl).toContain("DeleteMe=28542564");
    expect(row.pairingId).toBe("J3379");
    expect(row.dateLabel).toBe("11JUN");
  });

  it("extracts reqId from FLICA del{reqId} checkbox name", () => {
    const html = `
      <tr>
        <td><input type="checkbox" name="del28542564" /></td>
        <td>Drop</td>
        <td>J3379:11JUN</td>
      </tr>
    `;
    const parsed = parseTradeboardMyRequestsActionsFromHtml(html);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.reqId).toBe("28542564");
    expect(parsed.rows[0]!.deleteUrl).toContain("DeleteMe=28542564");
  });

  it("builds canonical edit and delete URLs", () => {
    expect(tradeboardEditRequestUrl("123")).toContain("reqId=123");
    expect(tradeboardMyRequestDeleteUrl("123")).toContain("DeleteMe=123");
    expect(tradeboardMyRequestDeleteUrl("123")).toContain("bRestore=0");
  });
});
