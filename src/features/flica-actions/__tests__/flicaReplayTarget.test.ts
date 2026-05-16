import {
  findClickedPairingLink,
  resolveReplayTarget,
} from "../flicaReplayTarget";
import type { CapturedFlicaPairingLink } from "../flicaActionRecorderTypes";

const TB_PAIRING: CapturedFlicaPairingLink = {
  source: "tradeboard",
  pairingId: "J3B47:13JUN",
  absoluteUrl:
    "https://jetblue.flica.net/full/RBCPair.cgi?PID=J3B47&DATE=20260613&Splits=",
  href:
    "https://jetblue.flica.net/full/RBCPair.cgi?PID=J3B47&DATE=20260613&Splits=",
  capturedAt: "2026-01-01T00:00:00.000Z",
};

describe("resolveReplayTarget", () => {
  it("prefers popup URL over parent page", () => {
    const t = resolveReplayTarget({
      popupAbsoluteUrl: "https://jetblue.flica.net/full/RBCPair.cgi?PID=J3B47&DATE=20260613&Splits=",
      pairingLinks: [TB_PAIRING],
      currentUrl: "https://jetblue.flica.net/online/tb_otherrequests.cgi?bcid=002.000",
    });
    expect(t.reason).toBe("popupUrl");
    expect(t.url).toContain("RBCPair.cgi");
  });

  it("prefers pairing link over tb_otherrequests href", () => {
    const t = resolveReplayTarget({
      pairingLinks: [TB_PAIRING],
      clickedText: "J3B47:13JUN",
      href: "javascript:void(0)",
      currentUrl: "https://jetblue.flica.net/online/tb_otherrequests.cgi?bcid=002.000",
    });
    expect(t.reason).toBe("pairingLink");
    expect(t.url).toContain("RBCPair.cgi");
  });

  it("findClickedPairingLink matches onclick pair()", () => {
    const link = findClickedPairingLink([TB_PAIRING], {
      onclick: 'pair("J3B47","20260613",0,0,"",0,"FA")',
    });
    expect(link?.absoluteUrl).toContain("PID=J3B47");
  });
});
