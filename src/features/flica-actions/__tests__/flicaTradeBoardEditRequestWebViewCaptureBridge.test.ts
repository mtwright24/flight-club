jest.mock("../../../dev/fcDevFileLogger", () => ({
  fcDevMirrorScheduleLogToFile: jest.fn(),
}));

import {
  editRequestHtmlHasFormMarkers,
  pickBestEditRequestHtmlFromCapture,
} from "../flicaTradeBoardEditRequestWebViewCaptureBridge";

describe("editRequestHtmlHasFormMarkers", () => {
  it("detects editForm and CommentField", () => {
    const html = `<form name="editForm"><textarea name="CommentField"></textarea></form>`;
    expect(editRequestHtmlHasFormMarkers(html)).toBe(false);
    const long = html.padEnd(500, " ");
    expect(editRequestHtmlHasFormMarkers(long)).toBe(true);
  });

  it("detects Update Request Info label", () => {
    const html = `${"x".repeat(450)}Update Request Info`;
    expect(editRequestHtmlHasFormMarkers(html)).toBe(true);
  });
});

describe("pickBestEditRequestHtmlFromCapture", () => {
  it("prefers frame with editForm markers", () => {
    const picked = pickBestEditRequestHtmlFromCapture({
      type: "tb_edit_request_html_capture",
      url: "https://jetblue.flica.net/full/tbframe.cgi",
      title: "",
      topOuterHtml: "<html>frame shell</html>".repeat(50),
      frameSrcs: ["https://jetblue.flica.net/online/TB_EditRequest.cgi?reqId=9"],
      frameHtmlList: [
        `<form name="editForm">${"y".repeat(500)}<input name="CommentField" /></form>`,
      ],
      ready: true,
    });
    expect(picked.html).toContain("editForm");
    expect(editRequestHtmlHasFormMarkers(picked.html)).toBe(true);
  });
});
