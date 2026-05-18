(globalThis as { __DEV__?: boolean }).__DEV__ = false;

jest.mock("../../../dev/fcDevFileLogger", () => ({
  fcDevMirrorScheduleLogToFile: jest.fn(),
}));

import {
  extractAllMyRequestsDesktopRowBlocks,
  extractMyRequestsDesktopRowLine,
  parseMyRequestsCompactDesktopRow,
} from "../flicaTradeBoardMyRequestsCompactRow";
import { LOG_MULTIROW, LOG_TAB_ISOLATION } from "../flicaTradeBoardMyRequestsMultirow";
import { mapTradeboardPostsWithHtmlFallback } from "../../crew-schedule/flicaCrewHubHtmlFallbackParse";
import {
  finalizeMyRequestsPostsForHub,
  isCompleteMyRequestsPost,
  parseTradeboardMyRequestsPage,
} from "../flicaTradeBoardMyRequestsRowParse";
import { fcDevMirrorScheduleLogToFile } from "../../../dev/fcDevFileLogger";

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

const DUAL_ROW_PLAIN = `
Edit Delete Trade J3379:11JUN JFK FA A 3 05:00 05:15 07:00 14:00 15:00 BDL trade comment
May 16, 2026 11:00:00 EDT Email: crew@jetblue.com
Edit Delete Drop J3379:11JUN JFK FA A 3 04:25 04:40 06:51 14:21 15:21 BDL STI drop comment
May 16, 2026 10:22:11 EDT Email: crew@jetblue.com
`;

const DUAL_ROW_HTML = `
<html><body>
<input type="button" value="Edit" onclick="EditRequest(28504708)" />
<input type="button" value="Delete" onclick="DeleteRequest(28504708, 0)" />
<input type="button" value="Edit" onclick="EditRequest(28504611)" />
<input type="button" value="Delete" onclick="DeleteRequest(28504611, 0)" />
${DUAL_ROW_PLAIN}
</body></html>
`;

describe("My Requests desktop compact row", () => {
  it("extracts desktop row line from plain text", () => {
    const line = extractMyRequestsDesktopRowLine(DESKTOP_HTML);
    expect(line).toBeTruthy();
    expect(line).toMatch(/Edit\s+Delete\s+Drop\s+J3379:11JUN/i);
    expect(line).toMatch(/04:25/);
  });

  it("extracts all desktop row blocks when Trade and Drop share pairing", () => {
    const blocks = extractAllMyRequestsDesktopRowBlocks(DUAL_ROW_HTML);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatch(/Edit\s+Delete\s+Trade\s+J3379:11JUN/i);
    expect(blocks[1]).toMatch(/Edit\s+Delete\s+Drop\s+J3379:11JUN/i);
    expect(parseMyRequestsCompactDesktopRow(blocks[0]!, "https://jetblue.flica.net/online/TB_MyRequests.cgi")?.type).toBe(
      "trade",
    );
    expect(parseMyRequestsCompactDesktopRow(blocks[1]!, "https://jetblue.flica.net/online/TB_MyRequests.cgi")?.type).toBe(
      "drop",
    );
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

  it("parseTradeboardMyRequestsPage returns both Trade and Drop rows with distinct reqIds", () => {
    const parsed = parseTradeboardMyRequestsPage(
      DUAL_ROW_HTML,
      "https://jetblue.flica.net/online/TB_MyRequests.cgi",
    );
    expect(parsed.posts).toHaveLength(2);
    const reqIds = parsed.posts.map((p) => p.reqId).sort();
    expect(reqIds).toEqual(["28504611", "28504708"]);
    const types = parsed.posts.map((p) => p.type).sort();
    expect(types).toEqual(["drop", "trade"]);
    for (const row of parsed.posts) {
      expect(row.canEdit).toBe(true);
      expect(row.canDelete).toBe(true);
      expect(row.pairingId).toBe("J3379");
      expect(row.pairingDateLabel).toBe("11JUN");
    }
    expect(fcDevMirrorScheduleLogToFile).toHaveBeenCalledWith(
      LOG_MULTIROW,
      expect.objectContaining({
        renderedRowCount: 2,
        suppressedRowCount: 0,
        reqIds: expect.arrayContaining(["28504611", "28504708"]),
      }),
    );
    expect(fcDevMirrorScheduleLogToFile).toHaveBeenCalledWith(
      LOG_TAB_ISOLATION,
      expect.objectContaining({
        sourceTab: "my_requests",
        renderedRowCount: 2,
        syntheticRowCount: 0,
        dedupedRowCount: 0,
      }),
    );
  });

  it("parseTradeboardMyRequestsPage attaches reqId from page HTML", () => {
    const parsed = parseTradeboardMyRequestsPage(DESKTOP_HTML, "https://jetblue.flica.net/online/TB_MyRequests.cgi");
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

  it("mapTradeboardPostsWithHtmlFallback uses multi-row parse not legacy fallback", () => {
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
      expect.arrayContaining(["my_requests_isolated:1"]),
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

  it("finalize keeps both rows when desktop has Trade and Drop", () => {
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
      DUAL_ROW_HTML,
      "https://jetblue.flica.net/online/TB_MyRequests.cgi",
    );
    expect(finalized).toHaveLength(2);
    expect(finalized.map((p) => p.reqId).sort()).toEqual(["28504611", "28504708"]);
    expect(finalized.map((p) => p.type).sort()).toEqual(["drop", "trade"]);
  });
});
