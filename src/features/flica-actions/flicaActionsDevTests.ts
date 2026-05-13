import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import {
  FLICA_ACTIONS_URLS,
  fetchFlicaHtml,
  detectFlicaHtmlState,
  prepareFlicaActionsSession,
} from "./flicaActionsHttp";
import {
  extractHtmlTitle,
  extractTokenFromHtml,
  extractAllHrefsAndActions,
  extractAllLinks,
  countHtmlTableRows,
  sanitizedBodyPreview,
  detectFlicaActionPage,
} from "./flicaActionsParser";
import type { FlicaActionsFetchResult } from "./flicaActionsTypes";

const TRADEBOARD_SUCCESS_MARKERS = [
  "tradeboard",
  "trades btwn crewmembers",
  "my requests",
  "all requests",
  "pickup trip",
  "drop",
];

const OPENTIME_POT_SUCCESS_MARKERS = [
  "opentime pot",
  "pairing",
  "dates",
  "report",
  "d-end",
  "credit",
  "layover",
];

function hasMarkers(html: string, markers: string[], minCount = 2): boolean {
  const lower = String(html ?? "").toLowerCase();
  let count = 0;
  for (const m of markers) {
    if (lower.includes(m)) count++;
  }
  return count >= minCount;
}

export async function testFlicaSession(): Promise<FlicaActionsFetchResult> {
  const url = `${FLICA_ACTIONS_URLS.MAIN_MENU}${Date.now()}`;
  try {
    const { status, html, url: finalUrl } = await fetchFlicaHtml(url);
    const title = extractHtmlTitle(html);
    const htmlState = detectFlicaHtmlState(html);
    const ok = status === 200 && htmlState === "ok";
    const preview = sanitizedBodyPreview(html);

    const result: FlicaActionsFetchResult = {
      ok,
      url: finalUrl,
      status,
      htmlState,
      htmlLength: html.length,
      title,
      bodyPreview: preview,
      error: ok
        ? undefined
        : `Session state: ${htmlState}. ${title ? `Title: ${title}` : ""}`,
    };

    fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_SESSION_TEST", {
      ok,
      status,
      htmlState,
      htmlLength: html.length,
      title,
      bodyPreview: preview,
      url: finalUrl,
    });

    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_SESSION_TEST", {
      ok: false,
      error: msg,
      url,
    });
    return { ok: false, url, error: msg };
  }
}

export async function fetchFlicaLeftMenuTest(): Promise<FlicaActionsFetchResult> {
  try {
    const prep = await prepareFlicaActionsSession();

    if (!prep.ok) {
      fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_LEFT_MENU_TEST", {
        ok: false,
        reason: prep.reason,
        debug: prep.debug,
      });
      return {
        ok: false,
        url: FLICA_ACTIONS_URLS.LEFT_MENU,
        status: prep.debug.leftMenuStatus ?? prep.debug.mainMenuStatus,
        htmlState: prep.debug.leftMenuHtmlState ?? prep.debug.mainMenuHtmlState,
        htmlLength: prep.debug.leftMenuLength ?? prep.debug.mainMenuLength,
        title: prep.debug.leftMenuTitle ?? prep.debug.mainMenuTitle,
        bodyPreview: prep.leftMenuHtml
          ? sanitizedBodyPreview(prep.leftMenuHtml)
          : undefined,
        error: prep.reason,
      };
    }

    const html = prep.leftMenuHtml!;
    const title = extractHtmlTitle(html);
    const htmlState = detectFlicaHtmlState(html);
    const allLinks = extractAllLinks(html);
    const detectedLinks = allLinks.map((l) => `${l.text} → ${l.href}`);
    const preview = sanitizedBodyPreview(html);

    const result: FlicaActionsFetchResult = {
      ok: true,
      url: FLICA_ACTIONS_URLS.LEFT_MENU,
      status: prep.debug.leftMenuStatus,
      htmlState,
      htmlLength: html.length,
      title,
      detectedLinks,
      bodyPreview: preview,
    };

    fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_LEFT_MENU_TEST", {
      ok: true,
      status: prep.debug.leftMenuStatus,
      htmlState,
      htmlLength: html.length,
      title,
      linkCount: allLinks.length,
      detectedLinks: detectedLinks.slice(0, 30),
      bodyPreview: preview,
    });

    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_LEFT_MENU_TEST", {
      ok: false,
      error: msg,
    });
    return { ok: false, url: FLICA_ACTIONS_URLS.LEFT_MENU, error: msg };
  }
}

export async function fetchFlicaOpenTimeTest(): Promise<FlicaActionsFetchResult> {
  const frameUrl = FLICA_ACTIONS_URLS.OPENTIME_FRAME;
  try {
    const { status: frameStatus, html: frameHtml, url: frameFinalUrl } =
      await fetchFlicaHtml(frameUrl);
    const frameTitle = extractHtmlTitle(frameHtml);
    const frameState = detectFlicaHtmlState(frameHtml);

    if (frameStatus !== 200 || frameState !== "ok") {
      const preview = sanitizedBodyPreview(frameHtml);
      fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_OPENTIME_TEST", {
        ok: false,
        step: "frame",
        status: frameStatus,
        htmlState: frameState,
        htmlLength: frameHtml.length,
        title: frameTitle,
        bodyPreview: preview,
        url: frameFinalUrl,
      });
      return {
        ok: false,
        url: frameFinalUrl,
        status: frameStatus,
        htmlState: frameState,
        htmlLength: frameHtml.length,
        title: frameTitle,
        bodyPreview: preview,
        error: `OpenTime frame state: ${frameState}. Title: ${frameTitle ?? "(none)"}`,
      };
    }

    const token = extractTokenFromHtml(frameHtml);
    if (!token) {
      const allUrls = extractAllHrefsAndActions(frameHtml);
      const preview = sanitizedBodyPreview(frameHtml);
      fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_OPENTIME_TEST", {
        ok: false,
        step: "token_extract",
        htmlLength: frameHtml.length,
        title: frameTitle,
        allUrls: allUrls.slice(0, 20),
        bodyPreview: preview,
        url: frameFinalUrl,
      });
      return {
        ok: false,
        url: frameFinalUrl,
        status: frameStatus,
        htmlState: frameState,
        htmlLength: frameHtml.length,
        title: frameTitle,
        detectedLinks: allUrls.slice(0, 15),
        bodyPreview: preview,
        error:
          "OpenTime frame loaded but token not found. All hrefs/actions logged.",
      };
    }

    const potUrl = `${FLICA_ACTIONS_URLS.OPENTIME_POT}?token=${encodeURIComponent(token)}&BCID=029.054&ViewOT=1&CC=J_A&BASE=JFK`;
    const { status: potStatus, html: potHtml, url: potFinalUrl } =
      await fetchFlicaHtml(potUrl, { referer: frameFinalUrl });
    const potTitle = extractHtmlTitle(potHtml);
    const potState = detectFlicaHtmlState(potHtml);
    const rowCount = countHtmlTableRows(potHtml);
    const pageFlags = detectFlicaActionPage(potHtml);
    const preview = sanitizedBodyPreview(potHtml);
    const ok =
      potStatus === 200 &&
      potState === "ok" &&
      hasMarkers(potHtml, OPENTIME_POT_SUCCESS_MARKERS);

    const result: FlicaActionsFetchResult = {
      ok,
      url: potFinalUrl,
      status: potStatus,
      htmlState: potState,
      htmlLength: potHtml.length,
      title: potTitle,
      rowCount,
      detectedLinks: [`token=${token.slice(0, 8)}…`, `pot URL: ${potUrl}`],
      bodyPreview: preview,
      error: ok ? undefined : `OpenTime pot state: ${potState}`,
    };

    fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_OPENTIME_TEST", {
      ok,
      step: "pot",
      status: potStatus,
      htmlState: potState,
      htmlLength: potHtml.length,
      title: potTitle,
      rowCount,
      pageFlags,
      tokenFound: true,
      tokenPreview: token.slice(0, 8),
      bodyPreview: preview,
      url: potFinalUrl,
    });

    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_OPENTIME_TEST", {
      ok: false,
      error: msg,
    });
    return { ok: false, url: frameUrl, error: msg };
  }
}

export async function fetchFlicaTradeboardTest(): Promise<FlicaActionsFetchResult> {
  const frameUrl = FLICA_ACTIONS_URLS.TRADEBOARD_FRAME;
  try {
    const { status: frameStatus, html: frameHtml, url: frameFinalUrl } =
      await fetchFlicaHtml(frameUrl);
    const frameTitle = extractHtmlTitle(frameHtml);
    const frameState = detectFlicaHtmlState(frameHtml);

    if (frameStatus !== 200 || frameState !== "ok") {
      const preview = sanitizedBodyPreview(frameHtml);
      fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_TRADEBOARD_TEST", {
        ok: false,
        step: "frame",
        status: frameStatus,
        htmlState: frameState,
        htmlLength: frameHtml.length,
        title: frameTitle,
        bodyPreview: preview,
        url: frameFinalUrl,
      });
      return {
        ok: false,
        url: frameFinalUrl,
        status: frameStatus,
        htmlState: frameState,
        htmlLength: frameHtml.length,
        title: frameTitle,
        bodyPreview: preview,
        error: `TradeBoard frame state: ${frameState}. Title: ${frameTitle ?? "(none)"}`,
      };
    }

    const allUrl = FLICA_ACTIONS_URLS.TRADEBOARD_ALL;
    const { status: allStatus, html: allHtml, url: allFinalUrl } =
      await fetchFlicaHtml(allUrl, { referer: frameFinalUrl });
    const allTitle = extractHtmlTitle(allHtml);
    const allState = detectFlicaHtmlState(allHtml);
    const rowCount = countHtmlTableRows(allHtml);
    const pageFlags = detectFlicaActionPage(allHtml);
    const preview = sanitizedBodyPreview(allHtml);
    const ok =
      allStatus === 200 &&
      allState === "ok" &&
      hasMarkers(allHtml, TRADEBOARD_SUCCESS_MARKERS);

    const result: FlicaActionsFetchResult = {
      ok,
      url: allFinalUrl,
      status: allStatus,
      htmlState: allState,
      htmlLength: allHtml.length,
      title: allTitle,
      rowCount,
      detectedLinks: [
        `frame: ${frameFinalUrl} (${frameHtml.length} chars)`,
        `all: ${allFinalUrl}`,
      ],
      bodyPreview: preview,
      error: ok ? undefined : `TradeBoard all-requests state: ${allState}`,
    };

    fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_TRADEBOARD_TEST", {
      ok,
      step: "all_requests",
      frameStatus,
      frameHtmlLength: frameHtml.length,
      frameState,
      allStatus,
      allHtmlLength: allHtml.length,
      allState,
      title: allTitle,
      rowCount,
      pageFlags,
      bodyPreview: preview,
      url: allFinalUrl,
    });

    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fcDevMirrorScheduleLogToFile("FC_FLICA_ACTIONS_TRADEBOARD_TEST", {
      ok: false,
      error: msg,
    });
    return { ok: false, url: frameUrl, error: msg };
  }
}
