import {
  buildOpenTimePairingDetailUrl,
  buildTradeboardPairingDetailUrl,
  parseFlicaPairOnclick,
  resolveFlicaPairingDetailUrl,
} from "../flicaPairingDetailUrl";

describe("flicaPairingDetailUrl", () => {
  it("parses FLICA pair() onclick", () => {
    expect(parseFlicaPairOnclick('pair("J3B47","20260613",0,0,"",0,"FA")')).toEqual({
      pid: "J3B47",
      dateYmd: "20260613",
    });
  });

  it("builds Open Time rbcpair.cgi URL", () => {
    expect(buildOpenTimePairingDetailUrl("J3B47", "20260613")).toBe(
      "https://jetblue.flica.net/full/rbcpair.cgi?DCOR=7&cfg=7&PID=J3B47&DATE=20260613",
    );
  });

  it("builds Tradeboard RBCPair.cgi URL", () => {
    expect(buildTradeboardPairingDetailUrl("J3B47", "20260613")).toBe(
      "https://jetblue.flica.net/full/RBCPair.cgi?PID=J3B47&DATE=20260613&Splits=",
    );
  });

  it("resolves javascript:void(0) via pair() for Open Time", () => {
    const r = resolveFlicaPairingDetailUrl({
      source: "opentime",
      href: "javascript:void(0)",
      onclick: 'pair("J3B47","20260613",0,0,"",0,"FA")',
    });
    expect(r?.absoluteUrl).toBe(
      "https://jetblue.flica.net/full/rbcpair.cgi?DCOR=7&cfg=7&PID=J3B47&DATE=20260613",
    );
    expect(r?.href).not.toMatch(/^javascript:/i);
  });

  it("resolves javascript:void(0) via pair() for Tradeboard", () => {
    const r = resolveFlicaPairingDetailUrl({
      source: "tradeboard",
      href: "javascript:void(0)",
      onclick: 'pair("J3B47","20260613",0,0,"",0,"FA")',
    });
    expect(r?.absoluteUrl).toBe(
      "https://jetblue.flica.net/full/RBCPair.cgi?PID=J3B47&DATE=20260613&Splits=",
    );
  });
});
