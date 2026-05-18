(globalThis as { __DEV__?: boolean }).__DEV__ = false;

jest.mock("../../../dev/fcDevFileLogger", () => ({
  fcDevMirrorScheduleLogToFile: jest.fn(),
}));

import { mapTradeboardPostsWithHtmlFallback } from "../../crew-schedule/flicaCrewHubHtmlFallbackParse";
import { parseTradeboardMyRequestsActionsFromHtml } from "../flicaTradeBoardMyRequestsActions";
import {
  collectReqIdsFromMyRequestsOnclick,
  extractReqIdFromMyRequestsOnclickHaystack,
} from "../flicaTradeBoardMyRequestsOnclickReqId";
import {
  extractMyRequestActionsFromRowHtml,
  parseTradeboardMyRequestsPage,
} from "../flicaTradeBoardMyRequestsRowParse";
import {
  collectReqIdsFromMyRequestsHtml,
  resolveReqIdFromMyRequestsHtml,
} from "../flicaTradeBoardMyRequestsReqIdFromHtml";
import type { TradeboardPost } from "../../crew-schedule/flicaCrewHubTypes";

const ONCLICK_ROW_HTML = `
<tr>
  <td>
    <a class="XLINK" href="javascript:void(0)" onclick="EditRequest( 28504708 );"><u>Edit</u></a>
    <a class="XLINK" href="javascript:void(0)" onclick="GetNumOfActiveResponses( 28504708 ); DeleteRequest( 28504708, 0 );"><u>Delete</u></a>
  </td>
  <td>Drop</td>
  <td>J3379:11JUN</td>
  <td>JFK FA _ 3</td>
  <td>04:25 04:40 06:51 14:21 15:21</td>
</tr>
`;

const PAGE_HTML = `
<html><body>
${ONCLICK_ROW_HTML}
Drop J3379:11JUN JFK FA _ 3 04:25 04:40 06:51 14:21 15:21 BDL STI
</body></html>
`;

describe("My Requests onclick reqId", () => {
  it("extracts reqId from EditRequest and DeleteRequest onclick", () => {
    expect(extractReqIdFromMyRequestsOnclickHaystack('onclick="EditRequest( 28504708 );"')).toBe(
      "28504708",
    );
    expect(
      extractReqIdFromMyRequestsOnclickHaystack(
        'onclick="GetNumOfActiveResponses( 28504708 ); DeleteRequest( 28504708, 0 );"',
      ),
    ).toBe("28504708");
    expect(collectReqIdsFromMyRequestsOnclick(PAGE_HTML)).toEqual(["28504708"]);
  });

  it("parseTradeboardMyRequestsActionsFromHtml finds row with reqId from onclick", () => {
    const parsed = parseTradeboardMyRequestsActionsFromHtml(PAGE_HTML);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.reqId).toBe("28504708");
    expect(parsed.rows[0]!.editUrl).toContain("reqId=28504708");
    expect(parsed.rows[0]!.deleteUrl).toContain("DeleteMe=28504708");
  });

  it("extractMyRequestActionsFromRowHtml resolves onclick in row window", () => {
    const actions = extractMyRequestActionsFromRowHtml(ONCLICK_ROW_HTML);
    expect(actions.reqId).toBe("28504708");
    expect(actions.hasEdit).toBe(true);
    expect(actions.hasDelete).toBe(true);
    expect(actions.editUrl).toContain("reqId=28504708");
    expect(actions.deleteUrl).toContain("DeleteMe=28504708");
  });

  it("resolveReqIdFromMyRequestsHtml attaches reqId for J3379:11JUN", () => {
    const post: TradeboardPost = {
      id: "tb-test",
      type: "drop",
      typeLabel: "Drop",
      posterName: "",
      pairingId: "J3379",
      pairingDateLabel: "11JUN",
      routeSummary: "J3379:11JUN",
      base: "JFK",
      position: "FA",
      date: "11JUN",
      days: "3",
      reportTime: "04:25",
      departTime: "04:40",
      arriveTime: "06:51",
      block: "14:21",
      credit: "15:21",
      worth: null,
      layover: "",
      comments: "",
      responseMethods: "",
      responseMethodLabel: "",
      postedAt: "",
      postedAtLabel: "",
      canPickup: false,
      canProposeTrade: false,
      matchScore: null,
      legalCompatibility: null,
      sourceUrl: "https://jetblue.flica.net/online/TB_MyRequests.cgi",
      rawCells: [],
      rawText: "Drop J3379:11JUN",
      offerCount: null,
      isMyRequest: true,
      sourceTab: "my_requests",
    };
    expect(collectReqIdsFromMyRequestsHtml(PAGE_HTML)).toContain("28504708");
    const actions = resolveReqIdFromMyRequestsHtml(post, PAGE_HTML, [post]);
    expect(actions?.reqId).toBe("28504708");
  });

  it("mapTradeboardPostsWithHtmlFallback attaches reqId on pull parse", () => {
    const { posts } = mapTradeboardPostsWithHtmlFallback(
      [],
      { pageHtml: PAGE_HTML, htmlLength: PAGE_HTML.length, bodyPreview: "", title: "My Requests" },
      "my_requests",
      "https://jetblue.flica.net/online/TB_MyRequests.cgi?&bcid=002.000",
    );
    expect(posts[0]?.reqId).toBe("28504708");
    expect(posts[0]?.myRequest?.reqId).toBe("28504708");
    expect(posts[0]?.canEdit).toBe(true);
    expect(posts[0]?.canDelete).toBe(true);
  });

  it("parseTradeboardMyRequestsPage attaches onclick reqId to desktop compact row", () => {
    const parsed = parseTradeboardMyRequestsPage(
      PAGE_HTML,
      "https://jetblue.flica.net/online/TB_MyRequests.cgi",
    );
    expect(parsed.posts[0]?.reqId).toBe("28504708");
  });
});
