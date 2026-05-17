(globalThis as { __DEV__?: boolean }).__DEV__ = false;

jest.mock("../../../dev/fcDevFileLogger", () => ({
  fcDevMirrorScheduleLogToFile: jest.fn(),
}));

jest.mock("../flicaActionsHttp", () => ({
  detectFlicaHtmlState: (html: string) =>
    String(html ?? "").length > 200 ? "ok" : "too_short_or_unknown",
}));

import {
  findTradeBoardPostRequestForm,
  parseTradeboardPostRequestFormFromHtml,
} from "../flicaTradeBoardPostRequestForm";
import { buildTradeboardPostRequestPayload, dryRunTradeboardPostRequest } from "../flicaTradeBoardPostRequestPayload";
import type { TradeboardPostRequestComposerState } from "../flicaTradeBoardPostRequestTypes";

const TB_ACTIVITY_SCRIPTS = `
function ResetActivityList() {
  var f = document.frmpost;
  f.hdnTripListCount.value = '0';
  f.hdnSchedulePairings.value = '';
  f.hdnSplitStr.value = '';
  f.PAIRDATE.value = '';
  f.RemPairCount.value = '0';
  f.RemPairIndex.value = '0';
  f.hdnDeleteAfter.value = '';
}
function SetAddedItems(addedList) {
  var f = document.frmpost;
  var cnt = addedList.length;
  f.hdnTripListCount.value = String(cnt);
  f.RemPairCount.value = String(cnt);
  f.RemPairIndex.value = '0';
  var sched = '';
  var splits = '';
  var pairdates = '';
  for (var i = 0; i < cnt; i++) {
    if (i > 0) { sched += '|'; splits += '|'; pairdates += '|'; }
    sched += addedList[i].pairing + ':' + addedList[i].date;
    splits += addedList[i].split || '';
    pairdates += addedList[i].pairing + ':' + addedList[i].date;
  }
  f.hdnSchedulePairings.value = sched;
  f.hdnSplitStr.value = splits;
  f.PAIRDATE.value = pairdates;
}
function GetSelectedString() {
  return document.frmpost.PAIRDATE.value;
}
`;

const FLICA_DROP_TRIP_HTML = `
<html><body>
<script>${TB_ACTIVITY_SCRIPTS}</script>
<form action="/online/TB_postrequest.cgi?BCID=002.000" method="POST">
<input type="hidden" name="hdnTripListCount" value="0" />
<input type="hidden" name="hdnSchedulePairings" value="" />
<input type="hidden" name="hdnSplitStr" value="" />
<input type="hidden" name="hdnDeleteAfter" value="" />
<input type="hidden" name="thecid" value="999" />
<input type="hidden" name="hdnType" value="" />
<input type="hidden" name="hdnBase" value="" />
<input type="hidden" name="hdnEqp" value="" />
<input type="hidden" name="hdnExtraPos" value="" />
<input type="hidden" name="hdnComments" value="" />
<input type="hidden" name="hdnMessages" value="" />
<input type="hidden" name="hdnFlicaResponse" value="" />
<input type="hidden" name="hdnPairStr" value="" />
<input type="hidden" name="hdnLateDepDate" value="" />
<input type="hidden" name="hdnPickup" value="" />
<input type="hidden" name="hdnPairing0" value="baseline-pair-0" />
<input type="hidden" name="hdnDepDate0" value="20260101" />
<input type="hidden" name="hdnDepDate" value="" />
<input type="hidden" name="hdnDays" value="" />
<input type="hidden" name="hdnDep" value="" />
<input type="hidden" name="hdnArr" value="" />
<input type="hidden" name="hdnBlkHrs" value="" />
<input type="hidden" name="hdnDayStr" value="" />
<input type="hidden" name="hdnDayStrLong" value="" />
<input type="hidden" name="hdnMyDST" value="" />
<input type="hidden" name="hdnMyBlockDate" value="" />
<input type="hidden" name="hdnSubmit" value="" />
<select name="TradeType">
<option value="D">Drop Trip</option>
<option value="T">Trade</option>
</select>
<select name="selBase"><option value="JFK">JFK</option><option value="BOS">BOS</option></select>
<select name="selPos"><option value="FA">FLIGHT ATTENDANT</option></select>
<textarea name="CommentField"></textarea>
<input type="checkbox" name="cbMessages" value="Y" />
<input type="hidden" name="RemPairIndex" value="0" />
<input type="hidden" name="RemPairCount" value="0" />
<input type="hidden" name="PAIRDATE" value="" />
<input type="submit" name="postrequest" value="Post Request" />
</form>
</body></html>
`;

const SAMPLE_HTML = `
<html><body>
<form action="/online/TB_postrequest.cgi?BCID=002.000" method="POST">
<input type="hidden" name="thecid" value="999" />
<input type="hidden" name="reqId" value="" />
<select name="TradeType">
<option value="D">Drop</option>
<option value="T" selected>Trade</option>
<option value="P">Pickup</option>
</select>
<select name="selBase"><option value="BOS" selected>BOS</option></select>
<select name="selPos"><option value="FA" selected>FA</option></select>
<textarea name="CommentField">Hello crew</textarea>
<input type="checkbox" name="cbMessages" value="Y" checked />
<input type="radio" name="rFLiCA" value="Y" checked />
<input type="checkbox" name="cbemail" value="Y" />
<input type="text" name="email" value="crew@test.com" />
<input type="hidden" name="RemPairIndex" value="0" />
<input type="hidden" name="RemPairCount" value="0" />
<input type="hidden" name="PAIRDATE" value="" />
<input type="hidden" name="Day" value="" />
<input type="hidden" name="Month" value="" />
<input type="submit" name="postrequest" value="Post Request" />
</form>
<a href="/full/ottrade.cgi?BCID=002.000&bFromTB=1&VerifyDates=1&act=D">Add Activity</a>
</body></html>
`;

describe("TradeBoard post request form", () => {
  it("parses primary form and detected fields", () => {
    const parsed = parseTradeboardPostRequestFormFromHtml(SAMPLE_HTML, {
      requestedUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi?bcid=002.000",
      finalUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi?bcid=002.000",
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.primaryForm?.method).toBe("POST");
    expect(parsed.detected.selectedRequestType).toBe("T");
    expect(parsed.detected.base).toBe("BOS");
    expect(parsed.detected.position).toBe("FA");
    expect(parsed.detected.comments).toBe("Hello crew");
    expect(parsed.detected.flicaResponseChecked).toBe(true);
    expect(parsed.detected.addActivityUrl).toContain("ottrade.cgi");
    expect(parsed.capturedSubmit?.actionResolved).toContain("TB_postrequest.cgi");
    expect(parsed.capturedSubmit?.submitButton?.name).toBe("postrequest");
    expect(parsed.detected.pairingFieldNames).toEqual(
      expect.arrayContaining(["RemPairIndex", "PAIRDATE", "Day", "Month"]),
    );
  });

  it("builds dry-run payload preserving hidden fields", () => {
    const parsed = parseTradeboardPostRequestFormFromHtml(SAMPLE_HTML, {
      requestedUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi",
      finalUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi",
    });
    const composer: TradeboardPostRequestComposerState = {
      requestType: "D",
      base: "BOS",
      equipment: "",
      position: "FA",
      comments: "Trade this trip",
      flicaResponse: true,
      emailResponse: true,
      emailAddress: "crew@test.com",
      phoneResponse: false,
      phoneNumber: "",
      deleteAfter: "",
      activities: [
        {
          pairingId: "J3306",
          dateYmd: "20260601",
          dateLabel: "01JUN",
          sourceType: "schedule",
          displayLabel: "J3306:01JUN",
        },
      ],
    };
    const payload = buildTradeboardPostRequestPayload(parsed, composer);
    const dry = dryRunTradeboardPostRequest(payload);
    expect(dry.actionUrl).toContain("TB_postrequest.cgi");
    expect(dry.body).toContain("TradeType=D");
    expect(dry.body).toContain("CommentField=");
    expect(dry.body).toContain("Trade+this+trip");
    expect(dry.fields.some((f) => f.name === "thecid" && f.value === "999")).toBe(true);
    const picked = findTradeBoardPostRequestForm(
      SAMPLE_HTML,
      "https://jetblue.flica.net/online/tb_postrequest.cgi?bcid=002.000",
    );
    expect(picked?.form.fields.length).toBeGreaterThan(5);
    expect(picked?.form.actionUrl).toContain("TB_postrequest.cgi");
  });

  it("logs activity script bodies on parse", () => {
    const parsed = parseTradeboardPostRequestFormFromHtml(FLICA_DROP_TRIP_HTML, {
      requestedUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi",
      finalUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi",
    });
    expect(parsed.activityScriptBodies?.SetAddedItems).toContain("hdnSchedulePairings");
    expect(parsed.activityParentFieldRules?.assignedInSetAdded).toContain("hdnTripListCount");
  });

  it("maps Trade Trip to Chrome POST field pattern", () => {
    const parsed = parseTradeboardPostRequestFormFromHtml(FLICA_DROP_TRIP_HTML, {
      requestedUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi",
      finalUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi",
    });
    const composer: TradeboardPostRequestComposerState = {
      requestType: "T",
      base: "JFK",
      equipment: "ALL",
      position: "FA",
      comments: "trade this",
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
          sourceType: "schedule",
          displayLabel: "J3379:11JUN",
        },
      ],
    };
    const payload = buildTradeboardPostRequestPayload(parsed, composer);
    expect(entry(payload, "TradeType")).toBe("T");
    expect(entry(payload, "hdnType")).toBe("T");
    expect(entry(payload, "hdnSubmit")).toBe("submitting");
    expect(entry(payload, "hdnPairStr")).toBe("J3379:20260611");
    expect(entry(payload, "hdnLateDepDate")).toBe("20260611");
    expect(entry(payload, "hdnDeleteAfter")).toBe("20260611");
    expect(entry(payload, "RemPairIndex")).toBe("-1");
    expect(entry(payload, "RemPairCount")).toBe("0");
    expect(entry(payload, "PAIRDATE")).toBe("");
    expect(entry(payload, "hdnTripListCount")).toBe("0");
    expect(entry(payload, "Month")).toBe("202606");
    expect(entry(payload, "Day")).toBe("11");
    expect(payload.chromeParityDiffs).toEqual([]);
  });

  it("maps Drop Trip composer values into FLICA hdn* fields", () => {
    const parsed = parseTradeboardPostRequestFormFromHtml(FLICA_DROP_TRIP_HTML, {
      requestedUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi",
      finalUrl: "https://jetblue.flica.net/online/tb_postrequest.cgi",
    });
    const composer: TradeboardPostRequestComposerState = {
      requestType: "D",
      base: "JFK",
      equipment: "",
      position: "FLIGHT ATTENDANT",
      comments: ".hello",
      flicaResponse: true,
      emailResponse: false,
      emailAddress: "",
      phoneResponse: false,
      phoneNumber: "",
      deleteAfter: "",
      activities: [
        {
          pairingId: "J1015",
          dateYmd: "20260507",
          dateLabel: "7MAY",
          sourceType: "flica_selector",
          displayLabel: "J1015:7MAY",
          depAirport: "JFK",
          arrAirport: "JFK",
          blockHrs: "0950",
          layovers: "LAS",
          flicaSelectorUrl: "https://jetblue.flica.net/full/ottrade.cgi?act=D",
          flicaRowIndex: 3,
        },
      ],
    };
    const payload = buildTradeboardPostRequestPayload(parsed, composer);
    expect(entry(payload, "hdnType")).toBe("D");
    expect(entry(payload, "hdnSubmit")).toBe("submitting");
    expect(entry(payload, "hdnBase")).toBe("JFK");
    expect(entry(payload, "hdnEqp")).toBe("ALL");
    expect(entry(payload, "hdnComments")).toBe(".hello");
    expect(entry(payload, "hdnFlicaResponse")).toBe("true");
    expect(entry(payload, "hdnPairStr")).toBe("J1015:20260507");
    expect(entry(payload, "hdnLateDepDate")).toBe("20260507");
    expect(entry(payload, "hdnDeleteAfter")).toBe("20260507");
    expect(entry(payload, "PAIRDATE")).toBe("");
    expect(entry(payload, "hdnTripListCount")).toBe("0");
    expect(entry(payload, "RemPairCount")).toBe("0");
    expect(entry(payload, "RemPairIndex")).toBe("-1");
    expect(entry(payload, "hdnPairing0")).toBe("baseline-pair-0");
    expect(entry(payload, "hdnDepDate0")).toBe("20260101");
    expect(entry(payload, "hdnDep")).toBe("JFK");
    expect(entry(payload, "hdnArr")).toBe("JFK");
    expect(entry(payload, "hdnBlkHrs")).toBe("0950");
    expect(payload.activitySource?.label).toBe("FLICA activity selector");
    expect(payload.chromeParityDiffs).toEqual([]);
    expect(payload.capturedSubmit?.actionResolved).toContain("TB_postrequest.cgi");
    expect(payload.submitBlocked).toBe(false);
    expect(payload.submitBlockers).not.toContain("captured_form_action_missing");
    expect(payload.blankCriticalFields).not.toContain("hdnType");
    expect(payload.blankCriticalFields).not.toContain("hdnComments");
    expect(payload.blankCriticalFields).not.toContain("hdnDep");
    expect(payload.blankCriticalFields).not.toContain("hdnArr");
    expect(payload.blankCriticalFields).not.toContain("hdnBlkHrs");
  });
});

function entry(
  payload: ReturnType<typeof buildTradeboardPostRequestPayload>,
  name: string,
): string {
  return payload.fields.find((f) => f.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}
