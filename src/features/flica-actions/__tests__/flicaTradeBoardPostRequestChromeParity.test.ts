import {
  applyChromePostRequestOverrides,
  buildChromeExpectedFields,
  computeChromeParityDiffs,
  isIndexedPairingSlotField,
  replaceScalarPayloadField,
} from "../flicaTradeBoardPostRequestChromeParity";

describe("Chrome POST parity", () => {
  it("does not treat indexed pairing slots as scalar", () => {
    expect(isIndexedPairingSlotField("hdnPairing0")).toBe(true);
    expect(isIndexedPairingSlotField("hdnDepDate2")).toBe(true);
    expect(isIndexedPairingSlotField("hdnPairStr")).toBe(false);
  });

  it("preserves duplicate indexed entries when updating unrelated scalars", () => {
    const entries = [
      { name: "hdnPairing0", value: "keep0" },
      { name: "hdnDepDate0", value: "20260101" },
      { name: "hdnPairStr", value: "" },
    ];
    const next = replaceScalarPayloadField(entries, "hdnSubmit", "submitting");
    expect(next.find((e) => e.name === "hdnPairing0")?.value).toBe("keep0");
    expect(next.find((e) => e.name === "hdnDepDate0")?.value).toBe("20260101");
    expect(next.find((e) => e.name === "hdnSubmit")?.value).toBe("submitting");
  });

  it("builds trade trip expected fields from Chrome capture", () => {
    const expected = buildChromeExpectedFields(
      {
        requestType: "T",
        base: "JFK",
        equipment: "ALL",
        position: "FA",
        comments: "test comment",
        flicaResponse: true,
        emailResponse: false,
        emailAddress: "",
        phoneResponse: false,
        phoneNumber: "",
        deleteAfter: "",
        activities: [],
      },
      "T",
      {
        pairingId: "J3379",
        dateYmd: "20260611",
        dateLabel: "11JUN",
        sourceType: "schedule",
        displayLabel: "J3379:11JUN",
      },
      [],
    );
    expect(expected.TradeType).toBe("T");
    expect(expected.hdnType).toBe("T");
    expect(expected.hdnSubmit).toBe("submitting");
    expect(expected.hdnPairStr).toBe("J3379:20260611");
    expect(expected.hdnLateDepDate).toBe("20260611");
    expect(expected.hdnDeleteAfter).toBe("20260611");
    expect(expected.RemPairIndex).toBe("-1");
    expect(expected.RemPairCount).toBe("0");
    expect(expected.PAIRDATE).toBe("");
    expect(expected.hdnTripListCount).toBe("0");
    expect(expected.Month).toBe("202606");
    expect(expected.Day).toBe("11");
  });

  it("applyChromePostRequestOverrides sets submitting and compact type", () => {
    const next = applyChromePostRequestOverrides(
      [{ name: "hdnSubmit", value: "" }, { name: "hdnType", value: "" }],
      {
        requestType: "T",
        base: "JFK",
        equipment: "",
        position: "FA",
        comments: "",
        flicaResponse: false,
        emailResponse: false,
        emailAddress: "",
        phoneResponse: false,
        phoneNumber: "",
        deleteAfter: "",
        activities: [],
      },
      "T",
      null,
    );
    expect(next.find((e) => e.name === "hdnSubmit")?.value).toBe("submitting");
    expect(next.find((e) => e.name === "hdnType")?.value).toBe("T");
  });

  it("computeChromeParityDiffs lists mismatches", () => {
    const diffs = computeChromeParityDiffs(
      [{ name: "hdnSubmit", value: "1" }],
      { hdnSubmit: "submitting" },
    );
    expect(diffs).toEqual([{ field: "hdnSubmit", expected: "submitting", actual: "1" }]);
  });
});
