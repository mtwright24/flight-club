import {
  buildActivityParentFieldRules,
  extractJsFunctionBody,
  extractTbPostRequestActivityScriptBodies,
} from "../flicaTradeBoardPostRequestActivityScript";

const SAMPLE_SCRIPT = `
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

const HTML_WITH_SCRIPTS = `
<html><body>
<form name="frmpost" action="/online/TB_postrequest.cgi?BCID=002.000" method="POST">
<input type="hidden" name="hdnTripListCount" value="0" />
<input type="hidden" name="hdnSchedulePairings" value="" />
<input type="hidden" name="hdnSplitStr" value="" />
<input type="hidden" name="hdnDeleteAfter" value="" />
<input type="hidden" name="PAIRDATE" value="" />
<input type="hidden" name="RemPairCount" value="0" />
<input type="hidden" name="RemPairIndex" value="0" />
<script>${SAMPLE_SCRIPT}</script>
</form>
</body></html>
`;

describe("TB post request activity scripts", () => {
  it("extracts the three activity function bodies", () => {
    const bodies = extractTbPostRequestActivityScriptBodies(HTML_WITH_SCRIPTS);
    expect(bodies.ResetActivityList).toContain("hdnTripListCount.value = '0'");
    expect(bodies.SetAddedItems).toContain("hdnSchedulePairings.value = sched");
    expect(bodies.GetSelectedString).toContain("PAIRDATE.value");
  });

  it("extracts nested brace bodies from inline script", () => {
    const body = extractJsFunctionBody(SAMPLE_SCRIPT, "SetAddedItems");
    expect(body).toContain("for (var i = 0; i < cnt; i++)");
    expect(body).toContain("pairdates += '|'");
  });

  it("infers parent field assignments from SetAddedItems", () => {
    const rules = buildActivityParentFieldRules(
      extractTbPostRequestActivityScriptBodies(HTML_WITH_SCRIPTS),
    );
    expect(rules.assignedInSetAdded).toEqual(
      expect.arrayContaining([
        "hdnTripListCount",
        "hdnSchedulePairings",
        "hdnSplitStr",
        "PAIRDATE",
        "RemPairCount",
        "RemPairIndex",
      ]),
    );
    expect(rules.schedulePairingsDelimiter).toBe("|");
    expect(rules.pairDateUsesColonDate).toBe(true);
  });

});
