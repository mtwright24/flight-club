(globalThis as { __DEV__?: boolean }).__DEV__ = false;

jest.mock("../../../dev/fcDevFileLogger", () => ({
  fcDevMirrorScheduleLogToFile: jest.fn(),
}));

import {
  buildInjectTbActivityClickNextScript,
  evaluateFramesForPostForm,
  frameUrlsStillOnOtTrade,
  htmlIndicatesOtTradeSelector,
  htmlIndicatesPostRequestFormPopulated,
} from "../flicaTradeBoardPostRequestActivityFlow";

const pad = (s: string) => s + " ".repeat(Math.max(0, 420 - s.length));

describe("htmlIndicatesPostRequestFormPopulated", () => {
  it("returns true when steps present and activity selected", () => {
    const html = pad(`
      Step 1: General Request Information
      Step 2: Pairing Information
      Selected pairing J1010:13MAY
    `);
    expect(htmlIndicatesPostRequestFormPopulated(html)).toBe(true);
  });

  it("returns false when no activity placeholder remains", () => {
    const html = `
      Step 1: General Request Information
      Step 2: Pairing Information
      No activity currently selected
    `;
    expect(htmlIndicatesPostRequestFormPopulated(html)).toBe(false);
  });

  it("returns false when steps missing", () => {
    expect(htmlIndicatesPostRequestFormPopulated("No activity currently selected")).toBe(false);
  });
});

describe("htmlIndicatesOtTradeSelector", () => {
  it("detects ottrade URL in text", () => {
    expect(htmlIndicatesOtTradeSelector("https://x/full/ottrade.cgi?BCID=002")).toBe(true);
  });
});

describe("evaluateFramesForPostForm", () => {
  it("checks body previews across frames", () => {
    expect(
      evaluateFramesForPostForm([
        { bodyPreview: "unrelated" },
        {
          bodyPreview: pad(
            "Step 1: General Request Information\nStep 2: Pairing Information\nJ1010",
          ),
        },
      ]),
    ).toBe(true);
  });
});

describe("buildInjectTbActivityClickNextScript", () => {
  it("prefers goNext before button click", () => {
    const script = buildInjectTbActivityClickNextScript();
    const goNextIdx = script.indexOf("__tbInvokeGoNext");
    const buttonIdx = script.indexOf("__tbClickNextInDoc");
    expect(goNextIdx).toBeGreaterThan(0);
    expect(buttonIdx).toBeGreaterThan(goNextIdx);
  });
});

describe("frameUrlsStillOnOtTrade", () => {
  it("returns true when any URL is ottrade", () => {
    expect(
      frameUrlsStillOnOtTrade([
        "https://x/online/tb_postrequest.cgi",
        "https://x/full/ottrade.cgi?BCID=002",
      ]),
    ).toBe(true);
  });

  it("returns false when all URLs left ottrade", () => {
    expect(frameUrlsStillOnOtTrade(["https://x/online/tb_postrequest.cgi"])).toBe(false);
  });
});
