(globalThis as { __DEV__?: boolean }).__DEV__ = false;

jest.mock("../../../dev/fcDevFileLogger", () => ({
  fcDevMirrorScheduleLogToFile: jest.fn(),
}));

jest.mock("../flicaActionsHttp", () => ({
  detectFlicaHtmlState: () => "ok",
}));

import {
  activityFromEditFormFields,
  activityFromEditFormHtml,
  parseTradeboardEditRequestFormFromHtml,
} from "../flicaTradeBoardEditRequestForm";

const EDIT_HTML = `
<html><body>
<form name="editForm" action="TB_EditRequest.cgi?reqId=28542564" method="POST">
<input type="hidden" name="hdnAction" value="0" />
<input type="hidden" name="hdnType" value="T" />
<input type="hidden" name="hdnResPairStr" value="J3379:20260611" />
<input type="hidden" name="hdnPairingString" value="J3379:20260611" />
<input type="hidden" name="hdnSplitStr" value="" />
<input type="hidden" name="hdnBase" value="JFK" />
<input type="hidden" name="hdnEqp" value="ALL" />
<input type="hidden" name="hdnPos" value="A" />
<input type="hidden" name="Year" value="2026" />
<input type="hidden" name="Month" value="202606" />
<input type="hidden" name="Day" value="11" />
<select name="TradeType">
<option value="T" selected>Trade Trip</option>
</select>
<textarea name="CommentField">hello</textarea>
<input type="checkbox" name="cbMessages" value="Y" checked />
<input type="submit" name="update" value="Update Request Info" />
</form>
</body></html>
`;

describe("TradeBoard edit request form parse", () => {
  it("parses editForm and activity pair string", () => {
    const parsed = parseTradeboardEditRequestFormFromHtml(EDIT_HTML, {
      requestedUrl: "https://jetblue.flica.net/online/TB_EditRequest.cgi?reqId=28542564",
      finalUrl: "https://jetblue.flica.net/online/TB_EditRequest.cgi?reqId=28542564",
      reqId: "28542564",
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.primaryForm?.actionUrl).toContain("reqId=28542564");
    expect(parsed.detected.comments).toBe("hello");
    expect(parsed.detected.selectedRequestType).toBe("T");
    const activity = activityFromEditFormFields(parsed.primaryForm!.fields);
    expect(activity?.pairingId).toBe("J3379");
    expect(activity?.dateYmd).toBe("20260611");
    expect(parsed.detected.selectedActivity?.pairingId).toBe("J3379");
  });

  it("parses comments from SetCommentTextBox unescape", () => {
    const html = `
<form name="editForm" method="POST">
<select name="TradeType"><option value="T" selected>Trade Trip</option></select>
<textarea name="CommentField"></textarea>
</form>
<script>SetCommentTextBox(unescape('%2Ehello%20world'));</script>`;
    const parsed = parseTradeboardEditRequestFormFromHtml(html, {
      requestedUrl: "https://jetblue.flica.net/online/TB_EditRequest.cgi?reqId=1",
      finalUrl: "https://jetblue.flica.net/online/TB_EditRequest.cgi?reqId=1",
      reqId: "1",
    });
    expect(parsed.detected.comments).toBe(".hello world");
  });

  it("parses activity from resAdded block", () => {
    const html = `
<form name="editForm" method="POST">
<input type="hidden" name="hdnResPairStr" value="" />
<div id="resAdded">J1004:03JUN</div>
</form>`;
    const fields = [{ name: "hdnResPairStr", value: "", type: "hidden" as const }];
    const act = activityFromEditFormHtml(html, fields);
    expect(act?.pairingId).toBe("J1004");
    expect(act?.dateLabel).toBe("03JUN");
  });
});
