import { isAcceptableFlicaHotelCandidate } from "../flicaScheduleHtmlParser";

describe("isAcceptableFlicaHotelCandidate", () => {
  it("rejects T.A.F.B. / DHD duty tail lines", () => {
    expect(
      isAcceptableFlicaHotelCandidate("0706L T.A.F.B.: 5041 DHD: 0100", ""),
    ).toBe(false);
  });

  it("accepts real hotel names with phone", () => {
    expect(
      isAcceptableFlicaHotelCandidate(
        "BDL Sheraton Hartford Hotel",
        "(860) 692-5200",
      ),
    ).toBe(true);
  });

  it("accepts brand hotel name without phone", () => {
    expect(isAcceptableFlicaHotelCandidate("STI Hotel Santiago, Curio Col", "")).toBe(true);
  });
});
