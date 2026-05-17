(globalThis as { __DEV__?: boolean }).__DEV__ = false;

jest.mock("../../../dev/fcDevFileLogger", () => ({
  fcDevMirrorScheduleLogToFile: jest.fn(),
}));

jest.mock("../flicaActionsHttp", () => ({
  detectFlicaHtmlState: () => "ok",
  fetchFlicaHtmlUsingWebViewSession: jest.fn(),
  flicaFetchNeedsWebVerification: () => false,
}));

import {
  compactTradeTypeCode,
  isPlaceholderRequestType,
  isValidCompactTradeTypeCode,
  resolveActivityDateYmd,
  resolveOptionTradeCode,
  resolveEffectiveTradeTypeCode,
  resolveTradeTypeValue,
} from "../flicaTradeBoardPostRequestFieldMap";
import { buildTradeboardPostRequestPayload } from "../flicaTradeBoardPostRequestPayload";
import { parseTradeboardPostRequestFormFromHtml } from "../flicaTradeBoardPostRequestForm";
import type { TradeboardPostRequestComposerState } from "../flicaTradeBoardPostRequestTypes";

const PLACEHOLDER_TRADE_HTML = `
<html><body>
<form action="/online/TB_postrequest.cgi?BCID=002.000" method="POST">
<input type="hidden" name="Year" value="2026" />
<input type="hidden" name="Month" value="202606" />
<input type="hidden" name="hdnType" value="Select Type Here" />
<input type="hidden" name="hdnPairStr" value="" />
<input type="hidden" name="hdnLateDepDate" value="" />
<input type="hidden" name="hdnDeleteAfter" value="" />
<input type="hidden" name="hdnSubmit" value="" />
<select name="TradeType">
<option value="Select Type Here" selected>Select Type Here</option>
<option value="Select Type Here">Trade Trip</option>
<option value="Select Type Here">Drop Trip</option>
</select>
<textarea name="CommentField"></textarea>
<input type="checkbox" name="cbMessages" value="Y" checked />
<input type="submit" name="postrequest" value="Post Request" />
</form>
</body></html>
`;

function entry(
  payload: ReturnType<typeof buildTradeboardPostRequestPayload>,
  name: string,
): string {
  return payload.fields.find((f) => f.name === name)?.value ?? "";
}

describe("TradeBoard post request type + date mapping", () => {
  it("treats Select Type Here as placeholder", () => {
    expect(isPlaceholderRequestType("Select Type Here")).toBe(true);
    expect(compactTradeTypeCode("Select Type Here")).toBe("");
    expect(isValidCompactTradeTypeCode("Select Type Here")).toBe(false);
  });

  it("resolves Trade Trip label when option value is placeholder", () => {
    const code = resolveOptionTradeCode({
      value: "Select Type Here",
      label: "Trade Trip",
    });
    expect(code).toBe("T");
    const resolved = resolveTradeTypeValue("Trade Trip", {
      requestTypes: [
        { value: "Select Type Here", label: "Select Type Here", selected: true },
        { value: "Select Type Here", label: "Trade Trip", selected: false },
      ],
      selectedRequestType: "",
      base: "",
      equipment: "",
      position: "",
      comments: "",
      flicaResponseRequired: false,
      flicaResponseChecked: false,
      emailResponse: false,
      emailAddress: "",
      phoneResponse: false,
      phoneNumber: "",
      deleteAfter: "",
      addActivityUrl: "",
      addActivityLabel: "",
      pairingFieldNames: [],
    });
    expect(resolved.tradeTypeValue).toBe("T");
    expect(resolved.hdnTypeValue).toBe("T");
  });

  it("uses FLICA dateYmd on activity and blocks placeholder request type in preview", () => {
    const parsed = parseTradeboardPostRequestFormFromHtml(PLACEHOLDER_TRADE_HTML, {
      requestedUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi",
      finalUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi",
    });
    const composer: TradeboardPostRequestComposerState = {
      requestType: "T",
      base: "JFK",
      equipment: "ALL",
      position: "FA",
      comments: "trade",
      flicaResponse: true,
      emailResponse: false,
      emailAddress: "",
      phoneResponse: false,
      phoneNumber: "",
      deleteAfter: "",
      activities: [
        {
          pairingId: "J1004",
          dateYmd: "20260603",
          dateLabel: "3JUN",
          sourceType: "flica_selector",
          displayLabel: "J1004:3JUN",
          flicaSelectorUrl:
            "https://jetblue.flica.net/full/ottrade.cgi?BCID=002.000&bFromTB=1&VerifyDates=1&act=T",
          flicaRowIndex: 5,
        },
      ],
    };
    const payload = buildTradeboardPostRequestPayload(parsed, composer);
    expect(entry(payload, "TradeType")).toBe("T");
    expect(entry(payload, "hdnType")).toBe("T");
    expect(entry(payload, "hdnPairStr")).toBe("J1004:20260603");
    expect(entry(payload, "hdnLateDepDate")).toBe("20260603");
    expect(entry(payload, "hdnDeleteAfter")).toBe("20260603");
    expect(payload.chromeParityDiffs).toEqual([]);
    expect(resolveActivityDateYmd(composer.activities[0]!, { formYear: "2026" })).toBe(
      "20260603",
    );
  });

  it("does not treat composer Select Type Here as Trade Trip when all option values are placeholder", () => {
    const detected = {
      requestTypes: [
        { value: "Select Type Here", label: "Select Type Here", selected: true },
        { value: "Select Type Here", label: "Trade Trip", selected: false },
        { value: "Select Type Here", label: "Drop Trip", selected: false },
      ],
      selectedRequestType: "",
      base: "",
      equipment: "",
      position: "",
      comments: "",
      flicaResponseRequired: false,
      flicaResponseChecked: false,
      emailResponse: false,
      emailAddress: "",
      phoneResponse: false,
      phoneNumber: "",
      deleteAfter: "",
      addActivityUrl: "",
      addActivityLabel: "",
      pairingFieldNames: [],
    };
    expect(resolveTradeTypeValue("Select Type Here", detected).tradeTypeValue).toBe("");
    expect(resolveEffectiveTradeTypeCode("Select Type Here", detected)).toBe("");
    expect(resolveEffectiveTradeTypeCode("T", detected)).toBe("T");
  });

  it("corrects activity dateYmd year using form Year when TAry year is wrong", () => {
    const activity = {
      pairingId: "J1004",
      dateYmd: "20250603",
      dateLabel: "3JUN",
      sourceType: "flica_selector" as const,
      displayLabel: "J1004:3JUN",
    };
    expect(
      resolveActivityDateYmd(activity, { formYear: "2026", formMonthYyyyMm: "202606" }),
    ).toBe("20260603");
  });

  it("blocks submit when request type is still Select Type Here", () => {
    const parsed = parseTradeboardPostRequestFormFromHtml(PLACEHOLDER_TRADE_HTML, {
      requestedUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi",
      finalUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi",
    });
    const composer: TradeboardPostRequestComposerState = {
      requestType: "Select Type Here",
      base: "JFK",
      equipment: "",
      position: "FA",
      comments: "x",
      flicaResponse: true,
      emailResponse: false,
      emailAddress: "",
      phoneResponse: false,
      phoneNumber: "",
      deleteAfter: "",
      activities: [],
    };
    const payload = buildTradeboardPostRequestPayload(parsed, composer);
    expect(payload.submitBlocked).toBe(true);
    expect(payload.submitBlockers.some((b) => /select type here/i.test(b))).toBe(true);
    expect(payload.submitBlockers.some((b) => /TradeType/i.test(b))).toBe(true);
  });
});
