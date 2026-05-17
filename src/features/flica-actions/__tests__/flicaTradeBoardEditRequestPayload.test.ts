(globalThis as { __DEV__?: boolean }).__DEV__ = false;

jest.mock("../../../dev/fcDevFileLogger", () => ({
  fcDevMirrorScheduleLogToFile: jest.fn(),
}));

jest.mock("../flicaActionsHttp", () => ({
  detectFlicaHtmlState: () => "ok",
  fetchFlicaHtmlUsingWebViewSession: jest.fn(),
}));

import { buildTradeboardEditRequestPayload } from "../flicaTradeBoardEditRequestPayload";
import { parseTradeboardEditRequestFormFromHtml } from "../flicaTradeBoardEditRequestForm";
import type { TradeboardPostRequestComposerState } from "../flicaTradeBoardPostRequestTypes";

const EDIT_HTML = `
<form name="editForm" action="TB_EditRequest.cgi?reqId=99" method="POST">
<input type="hidden" name="hdnAction" value="0" />
<input type="hidden" name="hdnType" value="T" />
<input type="hidden" name="hdnResPairStr" value="J3379:20260611" />
<input type="hidden" name="hdnPairingString" value="J3379:20260611" />
<input type="hidden" name="hdnSplitStr" value="" />
<input type="hidden" name="hdnBase" value="JFK" />
<select name="TradeType"><option value="T" selected>Trade Trip</option></select>
<textarea name="CommentField">note</textarea>
<input type="checkbox" name="cbMessages" checked />
</form>
`;

function entry(payload: ReturnType<typeof buildTradeboardEditRequestPayload>, name: string) {
  return payload.fields.find((f) => f.name === name)?.value ?? "";
}

describe("TradeBoard edit request payload", () => {
  it("applies UPDATE_ALL overrides for edit submit", () => {
    const parsed = parseTradeboardEditRequestFormFromHtml(EDIT_HTML, {
      requestedUrl: "https://jetblue.flica.net/online/TB_EditRequest.cgi?reqId=99",
      finalUrl: "https://jetblue.flica.net/online/TB_EditRequest.cgi?reqId=99",
      reqId: "99",
    });
    const composer: TradeboardPostRequestComposerState = {
      requestType: "T",
      base: "JFK",
      equipment: "ALL",
      position: "FA",
      comments: "updated",
      flicaResponse: true,
      emailResponse: false,
      emailAddress: "",
      phoneResponse: false,
      phoneNumber: "",
      deleteAfter: "",
      activities: [
        {
          pairingId: "J3379",
          dateYmd: "20260611",
          dateLabel: "11JUN",
          sourceType: "flica_selector",
          displayLabel: "J3379:11JUN",
        },
      ],
      reqId: "99",
    };
    const payload = buildTradeboardEditRequestPayload(parsed, composer);
    expect(payload.actionUrl).toContain("reqId=99");
    expect(entry(payload, "hdnAction")).toBe("3");
    expect(entry(payload, "hdnType")).toBe("T");
    expect(entry(payload, "hdnResPairStr")).toBe("J3379:20260611");
    expect(entry(payload, "hdnPairingString")).toBe("J3379:20260611");
    expect(entry(payload, "hdnSubmit")).toBe("submitting");
    expect(entry(payload, "hdnAutoSubmit")).toBe("true");
    expect(payload.submitBlocked).toBe(false);
  });
});
