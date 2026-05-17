(globalThis as { __DEV__?: boolean }).__DEV__ = false;

jest.mock("../../../dev/fcDevFileLogger", () => ({
  fcDevMirrorScheduleLogToFile: jest.fn(),
}));

import {
  extractMyRequestActionsFromRowHtml,
  extractMyRequestsTableRowRecords,
  parseTradeboardMyRequestsPage,
  stripMyRequestsActionCells,
  tradeboardPostShowsMyRequestActions,
} from "../flicaTradeBoardMyRequestsRowParse";

const SAMPLE_ROW_HTML = `
<tr>
  <td><input type="checkbox" name="del28542564" /></td>
  <td><a href="/online/TB_EditRequest.cgi?BCID=002.000&reqId=28542564">Edit</a>
      <a href="/online/TB_MyRequests.cgi?&bcid=002.000&DeleteMe=28542564&bRestore=0">Delete</a></td>
  <td>Trade Trip</td>
  <td>JFK FA A</td>
  <td>J3379:11JUN</td>
  <td>3</td>
  <td>06:15<br/>08:30<br/>14:22</td>
  <td>05:30<br/>08:45</td>
  <td>JFK</td>
  <td>swap please</td>
  <td>May 16, 2026 10:22:11 EDT</td>
  <td>Email: test@jetblue.com</td>
</tr>
`;

const SAMPLE_PAGE_HTML = `
<html><body><table>
<tr><th>Type</th><th>Trip</th><th>Pairing</th></tr>
${SAMPLE_ROW_HTML}
</table></body></html>
`;

const SCRIPT_ROW_HTML = `
<script>
r[0]=new A("","","","R","","J3379","","11JUN","","","Smith","Jane","swap","May 16, 2026 10:22:11 EDT","","","","06:15","3","05:30","08:45","08:30","14:22","JFK","FA","A","(12345)","","","","","","","","","","","","","","","");
</script>
<a href="/online/TB_EditRequest.cgi?BCID=002.000&reqId=28542564">Edit</a>
<a href="/online/TB_MyRequests.cgi?&bcid=002.000&DeleteMe=28542564&bRestore=0">Delete</a>
J3379:11JUN
`;

describe("TradeBoard My Requests row parse", () => {
  it("extracts reqId from row HTML with Edit/Delete links", () => {
    const actions = extractMyRequestActionsFromRowHtml(SAMPLE_ROW_HTML);
    expect(actions.reqId).toBe("28542564");
    expect(actions.editUrl).toContain("reqId=28542564");
    expect(actions.deleteUrl).toContain("DeleteMe=28542564");
    expect(actions.hasEdit).toBe(true);
    expect(actions.hasDelete).toBe(true);
  });

  it("strips leading action column cells", () => {
    const cells = ["Edit Delete", "Trade Trip", "JFK FA A", "J3379:11JUN"];
    const stripped = stripMyRequestsActionCells(cells);
    expect(stripped[0]).toBe("Trade Trip");
  });

  it("parses unified page rows with fields and actions", () => {
    const records = extractMyRequestsTableRowRecords(SAMPLE_PAGE_HTML);
    expect(records.length).toBeGreaterThanOrEqual(1);

    const parsed = parseTradeboardMyRequestsPage(SAMPLE_PAGE_HTML, "https://jetblue.flica.net/online/TB_MyRequests.cgi");
    expect(parsed.posts.length).toBeGreaterThanOrEqual(1);
    const row = parsed.posts[0]!;
    expect(row.pairingId).toBe("J3379");
    expect(row.pairingDateLabel).toBe("11JUN");
    expect(row.reqId).toBe("28542564");
    expect(row.isMyRequest).toBe(true);
    expect(row.sourceTab).toBe("my_requests");
    expect(row.myRequest?.reqId).toBe("28542564");
    expect(tradeboardPostShowsMyRequestActions(row)).toBe(true);
  });

  it("parses pairing cluster + singleton reqId when no table rows", () => {
    const parsed = parseTradeboardMyRequestsPage(SCRIPT_ROW_HTML, "https://jetblue.flica.net/online/TB_MyRequests.cgi");
    expect(parsed.posts.length).toBeGreaterThanOrEqual(1);
    const row = parsed.posts[0]!;
    expect(row.pairingId).toBe("J3379");
    expect(row.reqId).toBe("28542564");
    expect(tradeboardPostShowsMyRequestActions(row)).toBe(true);
  });
});
