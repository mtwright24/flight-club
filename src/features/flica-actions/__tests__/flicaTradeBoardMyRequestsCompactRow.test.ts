(globalThis as { __DEV__?: boolean }).__DEV__ = false;

jest.mock("../../../dev/fcDevFileLogger", () => ({
  fcDevMirrorScheduleLogToFile: jest.fn(),
}));

import {
  extractMyRequestsDesktopRowLine,
  parseMyRequestsCompactDesktopRow,
} from "../flicaTradeBoardMyRequestsCompactRow";
import { mapTradeboardPostsWithHtmlFallback } from "../../crew-schedule/flicaCrewHubHtmlFallbackParse";
import {
  finalizeMyRequestsPostsForHub,
  isCompleteMyRequestsPost,
  parseTradeboardMyRequestsPage,
} from "../flicaTradeBoardMyRequestsRowParse";

const DESKTOP_PLAIN = `
Tradeboard My Requests
Edit Delete Drop J3379:11JUN JFK FA A 3 04:25 04:40 06:51 14:21 15:21 BDL STI swap please
May 16, 2026 10:22:11 EDT Email: crew@jetblue.com
`;

const DESKTOP_HTML = `
<html><body>
<a href="/online/TB_EditRequest.cgi?BCID=002.000&reqId=28542564">Edit</a>
<a href="/online/TB_MyRequests.cgi?&bcid=002.000&DeleteMe=28542564&bRestore=0">Delete</a>
${DESKTOP_PLAIN}
</body></html>
`;

describe("My Requests desktop compact row", () => {
  it("extracts desktop row line from plain text", () => {
    const line = extractMyRequestsDesktopRowLine(DESKTOP_HTML);
    expect(line).toBeTruthy();
    expect(line).toMatch(/Edit\s+Delete\s+Drop\s+J3379:11JUN/i);
    expect(line).toMatch(/04:25/);
  });

  it("parses schedule fields from desktop row", () => {
    const line = extractMyRequestsDesktopRowLine(DESKTOP_HTML)!;
    const post = parseMyRequestsCompactDesktopRow(line, "https://jetblue.flica.net/online/TB_MyRequests.cgi");
    expect(post).not.toBeNull();
    expect(post!.type).toBe("drop");
    expect(post!.pairingId).toBe("J3379");
    expect(post!.pairingDateLabel).toBe("11JUN");
    expect(post!.reportTime).toBe("04:25");
    expect(post!.departTime).toBe("04:40");
    expect(post!.arriveTime).toBe("06:51");
    expect(post!.block).toBe("14:21");
    expect(post!.credit).toBe("15:21");
    expect(post!.layover).toBe("BDL STI");
  });

  it("parseTradeboardMyRequestsPage attaches reqId from page HTML", () => {
    const parsed = parseTradeboardMyRequestsPage(DESKTOP_HTML, "https://jetblue.flica.net/online/TB_MyRequests.cgi");
    expect(parsed.mode).toBe("my_requests_desktop_compact");
    expect(parsed.posts).toHaveLength(1);
    const row = parsed.posts[0]!;
    expect(row.reqId).toBe("28542564");
    expect(row.myRequest?.reqId).toBe("28542564");
    expect(row.canEdit).toBe(true);
    expect(row.canDelete).toBe(true);
    expect(row.type).toBe("drop");
    expect(row.layover).toBe("BDL STI");
    expect(row.reportTime).toBe("04:25");
  });

  it("mapTradeboardPostsWithHtmlFallback uses desktop row not legacy fallback", () => {
    const fetch = {
      pageHtml: DESKTOP_HTML,
      htmlLength: DESKTOP_HTML.length,
      bodyPreview: "",
      title: "My Requests",
      nativeParse: { rows: [["J3379", "11JUN"]] },
    };
    const { posts, meta } = mapTradeboardPostsWithHtmlFallback(
      fetch.nativeParse?.rows ?? [],
      fetch,
      "my_requests",
      "https://jetblue.flica.net/online/TB_MyRequests.cgi",
    );
    expect(meta.fallbackTextParserUsed).toBe(false);
    expect(meta.markersFound).toEqual(
      expect.arrayContaining(["my_requests_desktop_compact"]),
    );
    expect(posts).toHaveLength(1);
    const row = posts[0]!;
    expect(isCompleteMyRequestsPost(row)).toBe(true);
    expect(row.reqId).toBe("28542564");
    expect(row.type).toBe("drop");
    expect(row.layover).toBe("BDL STI");
    expect(row.reportTime).toBe("04:25");
    expect(row.rawText).toMatch(/^Drop\s+J3379:11JUN/i);
  });

  it("finalize drops weak native token row when desktop row is on page", () => {
    const weak = {
      id: "weak",
      type: "drop" as const,
      typeLabel: "Drop",
      posterName: "",
      pairingId: "J3379",
      pairingDateLabel: "11JUN",
      routeSummary: "J3379:11JUN",
      base: "",
      position: "",
      date: "11JUN",
      days: "",
      reportTime: "",
      departTime: "",
      arriveTime: "",
      block: "",
      credit: "",
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
      rawCells: ["J3379", "11JUN"],
      rawText: "J3379:11JUN",
      offerCount: null,
    };
    const finalized = finalizeMyRequestsPostsForHub(
      [weak],
      DESKTOP_HTML,
      "https://jetblue.flica.net/online/TB_MyRequests.cgi",
    );
    expect(finalized).toHaveLength(1);
    expect(isCompleteMyRequestsPost(finalized[0]!)).toBe(true);
    expect(finalized[0]!.reqId).toBe("28542564");
    expect(finalized[0]!.layover).toBe("BDL STI");
    expect(finalized[0]!.reportTime).toBe("04:25");
  });
});
