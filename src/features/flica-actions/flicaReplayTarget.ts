import { parseFlicaPairOnclick } from "./flicaPairingDetailUrl";
import { isFlicaPairingDetailHttpUrl } from "./flicaPairingDetailUrl";
import type {
  CapturedFlicaPairingLink,
  FlicaActionRecorderExtra,
} from "./flicaActionRecorderTypes";
import { resolveFlicaAbsoluteUrl } from "./flicaTradeBoardAllRequestsForm";

export type FlicaReplayTargetReason =
  | "popupUrl"
  | "pairingLink"
  | "destination"
  | "href"
  | "currentUrl";

export type FlicaReplayTarget = {
  url: string;
  reason: FlicaReplayTargetReason;
};

function isJavascriptUrl(url: string): boolean {
  return /^javascript:/i.test(String(url ?? "").trim());
}

function isUsableHttpUrl(url: string): boolean {
  const u = String(url ?? "").trim();
  if (!u || isJavascriptUrl(u)) return false;
  return u.startsWith("http://") || u.startsWith("https://");
}

/** Best pairing link for the clicked anchor (normalized rbcpair/RBCPair URL). */
export function findClickedPairingLink(
  links: CapturedFlicaPairingLink[],
  input: { clickedText?: string; onclick?: string; href?: string },
): CapturedFlicaPairingLink | undefined {
  const clicked = String(input.clickedText ?? "").trim();
  const onclick = String(input.onclick ?? "").trim();
  const href = String(input.href ?? "").trim();

  if (clicked) {
    const key = clicked.replace(/\s+/g, " ").toUpperCase();
    const exact = links.find((p) => p.pairingId.toUpperCase() === key);
    if (exact?.absoluteUrl) return exact;
    const partial = links.find((p) => {
      const pid = p.pairingId.toUpperCase();
      return key.includes(pid) || pid.includes(key.split(":")[0] ?? "");
    });
    if (partial?.absoluteUrl) return partial;
  }

  const parsed = parseFlicaPairOnclick(onclick);
  if (parsed) {
    const byPid = links.find(
      (p) =>
        p.absoluteUrl.toUpperCase().includes(`PID=${parsed.pid}`) ||
        p.pairingId.toUpperCase().startsWith(parsed.pid),
    );
    if (byPid) return byPid;
  }

  if (href && !isJavascriptUrl(href)) {
    const abs = resolveFlicaAbsoluteUrl(href);
    if (isFlicaPairingDetailHttpUrl(abs)) {
      return links.find((p) => p.absoluteUrl === abs);
    }
  }

  return links.find((p) => isFlicaPairingDetailHttpUrl(p.absoluteUrl));
}

/**
 * Replay GET target priority:
 * 1. captured popup absoluteUrl
 * 2. normalized pairing detail absoluteUrl (clicked match)
 * 3. destination (non-javascript)
 * 4. href (non-javascript)
 * 5. current document URL
 */
export function resolveReplayTarget(input: {
  popupAbsoluteUrl?: string;
  pairingLinks: CapturedFlicaPairingLink[];
  clickedText?: string;
  onclick?: string;
  href?: string;
  destinationUrl?: string;
  currentUrl?: string;
}): FlicaReplayTarget {
  const popup = String(input.popupAbsoluteUrl ?? "").trim();
  if (isUsableHttpUrl(popup)) {
    return { url: popup, reason: "popupUrl" };
  }

  const pairing = findClickedPairingLink(input.pairingLinks, input);
  if (pairing?.absoluteUrl && isUsableHttpUrl(pairing.absoluteUrl)) {
    return { url: pairing.absoluteUrl, reason: "pairingLink" };
  }

  const dest = String(input.destinationUrl ?? "").trim();
  if (isUsableHttpUrl(dest)) {
    const abs = resolveFlicaAbsoluteUrl(dest);
    if (isUsableHttpUrl(abs)) return { url: abs, reason: "destination" };
  }

  const href = String(input.href ?? "").trim();
  if (isUsableHttpUrl(href)) {
    const abs = resolveFlicaAbsoluteUrl(href);
    if (isUsableHttpUrl(abs)) return { url: abs, reason: "href" };
  }

  const current = String(input.currentUrl ?? "").trim();
  if (isUsableHttpUrl(current)) {
    return { url: resolveFlicaAbsoluteUrl(current), reason: "currentUrl" };
  }

  return { url: "", reason: "currentUrl" };
}

/** Apply replay target priority to event extra fields (popup > pairing > destination > href > current). */
export function applyReplayTargetFields(input: {
  popupAbsoluteUrl?: string;
  pairingLinks: CapturedFlicaPairingLink[];
  clickedText?: string;
  onclick?: string;
  href?: string;
  destinationUrl?: string;
  currentUrl?: string;
}): Pick<FlicaActionRecorderExtra, "replayGetUrl" | "replayTargetReason" | "popupAbsoluteUrl"> {
  const popupAbsoluteUrl = String(input.popupAbsoluteUrl ?? "").trim();
  const target = resolveReplayTarget({
    popupAbsoluteUrl,
    pairingLinks: input.pairingLinks,
    clickedText: input.clickedText,
    onclick: input.onclick,
    href: input.href,
    destinationUrl: input.destinationUrl,
    currentUrl: input.currentUrl,
  });
  return {
    replayGetUrl: target.url,
    replayTargetReason: target.reason,
    popupAbsoluteUrl,
  };
}

export function classifyPopupNavigationSafety(url: string): "SAFE_READ" | "MAY_MUTATE" {
  const u = url.toLowerCase();
  if (isFlicaPairingDetailHttpUrl(url)) return "SAFE_READ";
  if (
    u.includes("rbcpair.cgi") ||
    u.includes("viewpairing") ||
    u.includes("pairingdetail") ||
    u.includes("showpairing")
  ) {
    return "SAFE_READ";
  }
  if (
    u.includes("postrequest") ||
    u.includes("submit") ||
    u.includes("confirm") ||
    u.includes("pickup") ||
    u.includes("addfavorite") ||
    u.includes("restrade") ||
    u.includes("addactivity")
  ) {
    return "MAY_MUTATE";
  }
  return "SAFE_READ";
}
