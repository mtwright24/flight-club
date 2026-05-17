import {
  INJECT_FLICA_RECORDER_POPUP_SHIM,
  INJECT_FLICA_TB_ACTIVITY_POPUP_SHIM,
} from "../flicaTbActivityPopupShim";

describe("flicaTbActivityPopupShim", () => {
  it("exports capture and recorder inject strings", () => {
    expect(INJECT_FLICA_TB_ACTIVITY_POPUP_SHIM).toContain("__flicaTbPopupShimV2");
    expect(INJECT_FLICA_RECORDER_POPUP_SHIM).toContain("__flicaTbPopupShimV2");
    expect(INJECT_FLICA_TB_ACTIVITY_POPUP_SHIM).toContain("tb_capture");
    expect(INJECT_FLICA_RECORDER_POPUP_SHIM).toContain("recorder");
  });

  it("patches window.open and popup with fake window + frame navigation", () => {
    const inject = INJECT_FLICA_TB_ACTIVITY_POPUP_SHIM;
    expect(inject).toContain("win.open = function");
    expect(inject).toContain("win.popup = function");
    expect(inject).toContain("makeFakeWindow");
    expect(inject).toContain("TB_body");
    expect(inject).toContain("flica_popup_blocked");
    expect(inject).toContain("__flicaCollectHandlerSources");
    expect(inject).toContain("flica_window_open_after");
  });
});
