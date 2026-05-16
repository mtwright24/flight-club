import {
  detectOpenTimeBidPosColumnIndex,
  extractOpenTimeBidPosFromCells,
  extractOpenTimeBidPosFromTaskArgs,
  formatJetBlueFaBidPosition,
  formatJetBlueFaBidPositionsFromSlotField,
  mapRowsToOpenTimeTrips,
  normalizeOpenTimeBidPosition,
  parseJetBlueFlicaPosList,
} from "../flicaCrewHubMappers";

const SRC = "https://flica.test/opentime";

describe("Open Time bid position", () => {
  it("maps JetBlue FA slot index before FA to F3 (live Task shape)", () => {
    const args = [
      "1",
      "J3148",
      "16MAY",
      "20260516",
      "1",
      "10:05",
      "11:05",
      "21:10",
      "0844",
      "",
      "3",
      "FA",
    ];
    expect(extractOpenTimeBidPosFromTaskArgs(args)).toBe("F3");
  });

  it("uses PosList from HTML when slot id maps to label", () => {
    const html =
      "PosList[2]=new PosMap('3','F3');\nTAry[0]=new Task(1,\"J3148\",\"16MAY\",\"20260516\",1,\"10:05\",\"11:05\",\"21:10\",\"0844\",\"&nbsp;\",\"3\",\"FA\");";
    const posList = parseJetBlueFlicaPosList(html);
    expect(formatJetBlueFaBidPosition("3", posList)).toBe("F3");
  });

  it("prefers F3 over trip-day digit 1 when days column precedes bid column", () => {
    const cells = [
      "J3942:16MAY",
      "1",
      "F3",
      "04:25",
      "04:40",
      "06:51",
      "10:37",
      "12:38",
      "BDL",
    ];
    expect(extractOpenTimeBidPosFromCells(cells)).toBe("F3");
    expect(detectOpenTimeBidPosColumnIndex(cells)).toBe(2);

    const trips = mapRowsToOpenTimeTrips([cells], SRC);
    expect(trips).toHaveLength(1);
    expect(trips[0]!.bidPos).toBe("F3");
    expect(trips[0]!.days).toBe(1);
  });

  it("maps standard Pairing | Bid | Days | times layout", () => {
    const cells = [
      "J3942:16MAY",
      "F3",
      "1",
      "04:25",
      "04:40",
      "06:51",
      "10:37",
      "12:38",
      "BDL",
    ];
    const trips = mapRowsToOpenTimeTrips([cells], SRC);
    expect(trips[0]!.bidPos).toBe("F3");
    expect(trips[0]!.days).toBe(1);
  });

  it("rejects layover airport codes (SFO, BDL)", () => {
    expect(normalizeOpenTimeBidPosition("SFO")).toBe("");
    expect(normalizeOpenTimeBidPosition("BDL")).toBe("");
    const cells = [
      "J3942:16MAY",
      "SFO",
      "1",
      "04:25",
      "04:40",
      "06:51",
      "10:37",
      "12:38",
      "BDL STI",
    ];
    expect(extractOpenTimeBidPosFromCells(cells)).toBe("");
    expect(detectOpenTimeBidPosColumnIndex(cells)).toBe(-1);
  });

  it("does not treat bare digit 1 as bid pos outside Task/FA context", () => {
    expect(normalizeOpenTimeBidPosition("1")).toBe("");
    expect(formatJetBlueFaBidPosition("1")).toBe("F1");
  });

  it("expands concatenated slot digits to all open positions (13 → F1 F3)", () => {
    expect(formatJetBlueFaBidPositionsFromSlotField("13")).toBe("F1 F3");
    expect(formatJetBlueFaBidPositionsFromSlotField("123")).toBe("F1 F2 F3");
    expect(normalizeOpenTimeBidPosition("F1 F3")).toBe("F1 F3");

    const j3458Args = [
      "1",
      "J3458",
      "17MAY",
      "20260517",
      "3",
      "05:40",
      "06:30",
      "16:39",
      "1900",
      "RSW HPN",
      "13",
      "FA",
      "223724560",
      "223728054",
      "",
      "13",
    ];
    expect(extractOpenTimeBidPosFromTaskArgs(j3458Args)).toBe("F1 F3");
  });
});
