(globalThis as { __DEV__?: boolean }).__DEV__ = false;

jest.mock("../../../dev/fcDevFileLogger", () => ({
  fcDevMirrorScheduleLogToFile: jest.fn(),
}));

jest.mock("../flicaActionsWebViewSession", () => ({
  getFlicaActionsWebViewSession: jest.fn().mockResolvedValue({ readyAt: "x" }),
}));

jest.mock("../flicaTradeBoardPostRequestActivityWebViewBridge", () => ({
  requestTbPostActivityFlow: jest.fn(),
}));

jest.mock("../flicaActionsNativeService", () => ({
  FLICA_NATIVE_OT_TRADE_BCID: "002.000",
  FLICA_NATIVE_URLS: {
    tradeFrame: "https://jetblue.flica.net/online/tb_frame.cgi?BCID=002.000&dp=mr",
    tradePostRequest: "https://jetblue.flica.net/online/tb_postrequest.cgi?bcid=002.000",
  },
}));

import { requestTbPostActivityFlow } from "../flicaTradeBoardPostRequestActivityWebViewBridge";
import {
  ensureTradeboardPostRequestActivityOnFlica,
  normalizeTradeboardAddActivityUrl,
} from "../flicaTradeBoardPostRequestActivityWebView";
import type { TradeboardPostRequestFormParse } from "../flicaTradeBoardPostRequestTypes";

const mockFlow = requestTbPostActivityFlow as jest.Mock;

function minimalFormParse(addActivityUrl: string): TradeboardPostRequestFormParse {
  return {
    ok: true,
    requestedUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi?bcid=002.000",
    finalUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi?bcid=002.000",
    htmlLength: 5000,
    htmlState: "ok",
    forms: [],
    primaryForm: null,
    capturedSubmit: null,
    detected: {
      requestTypes: [],
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
      addActivityUrl,
      addActivityLabel: "Add Activity",
      pairingFieldNames: [],
    },
    warnings: [],
    missingMappings: [],
  };
}

describe("normalizeTradeboardAddActivityUrl", () => {
  it("forces act=T on ottrade links", () => {
    const out = normalizeTradeboardAddActivityUrl(
      "https://jetblue.flica.net/full/ottrade.cgi?BCID=002.000&bFromTB=1&VerifyDates=1&act=D",
    );
    expect(out).toContain("act=T");
    expect(out).toContain("bFromTB=1");
  });

  it("returns default act=T URL when empty", () => {
    const out = normalizeTradeboardAddActivityUrl("");
    expect(out).toContain("ottrade.cgi");
    expect(out).toContain("act=T");
  });
});

describe("ensureTradeboardPostRequestActivityOnFlica", () => {
  it("resolves when WebView flow returns populated post form", async () => {
    mockFlow.mockResolvedValue({
      ok: true,
      postFormReturned: true,
      selectedRowText: "J1010",
      undoVisible: true,
      nextMethod: "goNext@",
      finalUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi",
    });

    const result = await ensureTradeboardPostRequestActivityOnFlica({
      formParse: minimalFormParse(
        "https://jetblue.flica.net/full/ottrade.cgi?BCID=002.000&act=D",
      ),
      activity: {
        pairingId: "J1010",
        dateYmd: "20260513",
        dateLabel: "13MAY",
        sourceType: "schedule",
        displayLabel: "J1010:13MAY",
      },
    });

    expect(result.ok).toBe(true);
    expect(mockFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        pairingId: "J1010",
        dateLabel: "13MAY",
        addActivityUrl: expect.stringContaining("act=T"),
      }),
    );
  });

  it("fails when Next does not return to post form", async () => {
    mockFlow.mockResolvedValue({
      ok: false,
      postFormReturned: false,
      error: "Next did not return to populated Post Request form.",
    });

    const result = await ensureTradeboardPostRequestActivityOnFlica({
      formParse: minimalFormParse("https://jetblue.flica.net/full/ottrade.cgi?BCID=002"),
      activity: {
        pairingId: "J1010",
        dateYmd: "20260513",
        dateLabel: "13MAY",
        sourceType: "schedule",
        displayLabel: "J1010:13MAY",
      },
    });

    expect(result.ok).toBe(false);
  });
});
