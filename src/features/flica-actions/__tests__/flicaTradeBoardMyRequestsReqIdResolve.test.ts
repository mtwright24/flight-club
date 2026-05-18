(globalThis as { __DEV__?: boolean }).__DEV__ = false;

jest.mock("../../../dev/fcDevFileLogger", () => ({
  fcDevMirrorScheduleLogToFile: jest.fn(),
}));

jest.mock("../flicaActionsNativeService", () => ({
  FLICA_NATIVE_URLS: {
    tradeFrame: "https://jetblue.flica.net/online/tb_frame.cgi",
    tradeMyRequests: "https://jetblue.flica.net/online/TB_MyRequests.cgi?&bcid=002.000",
  },
  refreshTradeboardMyRequestsTargeted: jest.fn(),
}));

jest.mock("../flicaTradeBoardMyRequestsWebViewCaptureBridge", () => ({
  myRequestsHtmlHasActionMarkers: (html: string) => /DeleteMe=\d+/i.test(html),
  requestTbMyRequestsWebViewCapture: jest.fn(),
}));

import {
  applyResolvedReqIdToPost,
  resolveReqIdFromMyRequestsHtml,
} from "../flicaTradeBoardMyRequestsReqIdFromHtml";
import type { TradeboardPost } from "../../crew-schedule/flicaCrewHubTypes";

const SAMPLE_HTML = `
<a href="/online/TB_EditRequest.cgi?BCID=002.000&reqId=28542564">Edit</a>
<a href="/online/TB_MyRequests.cgi?&bcid=002.000&DeleteMe=28542564&bRestore=0">Delete</a>
Drop J3379:11JUN JFK FA A 3 04:25 04:40 06:51
`;

function basePost(): TradeboardPost {
  return {
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
    block: "",
    credit: "15:21",
    worth: null,
    layover: "BDL",
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
}

describe("resolveReqIdFromMyRequestsHtml", () => {
  it("resolves reqId from Edit/Delete links for matching pairing", () => {
    const actions = resolveReqIdFromMyRequestsHtml(basePost(), SAMPLE_HTML, [basePost()]);
    expect(actions?.reqId).toBe("28542564");
    const enriched = applyResolvedReqIdToPost(basePost(), actions!, SAMPLE_HTML);
    expect(enriched.reqId).toBe("28542564");
    expect(enriched.canEdit).toBe(true);
    expect(enriched.canDelete).toBe(true);
    expect(enriched.editUrl).toContain("reqId=28542564");
    expect(enriched.deleteUrl).toContain("DeleteMe=28542564");
    expect(enriched.myRequest?.reqId).toBe("28542564");
  });

  it("resolves singleton reqId when one visible post", () => {
    const html = `<input name="del99988877" /> Drop J9999:12JUL`;
    const post = { ...basePost(), pairingId: "J9999", pairingDateLabel: "12JUL" };
    const actions = resolveReqIdFromMyRequestsHtml(post, html, [post]);
    expect(actions?.reqId).toBe("99988877");
  });
});
