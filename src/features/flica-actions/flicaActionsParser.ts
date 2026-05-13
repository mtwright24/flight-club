export function extractTokenFromHtml(html: string): string | null {
  const h = String(html ?? "");
  const patterns = [
    /token=([0-9A-Fa-f]{32,40})/,
    /otopentimepot\.cgi[^"']*token=([^&"'\s]+)/,
    /token=([^&"'\s]{8,})/,
  ];
  for (const re of patterns) {
    const m = h.match(re);
    if (m?.[1] && m[1].length > 0) return m[1];
  }
  return null;
}

export function extractAllHrefsAndActions(html: string): string[] {
  const h = String(html ?? "");
  const results: string[] = [];
  const hrefRe = /(?:href|action)\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(h)) !== null) {
    results.push(String(m[1] ?? ""));
  }
  return results;
}

export function extractHtmlTitle(html: string): string | null {
  const h = String(html ?? "");
  const match = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match || match[1] == null) return null;
  return String(match[1]).replace(/\s+/g, " ").trim() || null;
}

export function extractLinksByText(
  html: string,
  keywords: string[],
): Array<{ text: string; href: string }> {
  const h = String(html ?? "");
  const results: Array<{ text: string; href: string }> = [];
  const linkRe = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(h)) !== null) {
    const href = String(m[1] ?? "");
    const rawText = String(m[2] ?? "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const lowerText = rawText.toLowerCase();
    for (const kw of keywords) {
      if (lowerText.includes(String(kw ?? "").toLowerCase())) {
        results.push({ text: rawText, href });
        break;
      }
    }
  }
  return results;
}

export function extractAllLinks(
  html: string,
): Array<{ text: string; href: string }> {
  const h = String(html ?? "");
  const results: Array<{ text: string; href: string }> = [];
  const linkRe = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(h)) !== null) {
    const href = String(m[1] ?? "");
    const rawText = String(m[2] ?? "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (rawText || href) {
      results.push({ text: rawText, href });
    }
  }
  return results;
}

export function countHtmlTableRows(html: string): number {
  const h = String(html ?? "");
  const trRe = /<tr[\s>]/gi;
  let count = 0;
  while (trRe.exec(h) !== null) count++;
  return count;
}

export function sanitizedBodyPreview(html: string, maxLen = 500): string {
  const h = String(html ?? "");
  const noTags = h
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return noTags.length > maxLen ? noTags.slice(0, maxLen) + "…" : noTags;
}

export function detectFlicaActionPage(html: string): {
  hasOpenTime: boolean;
  hasTradeboard: boolean;
  hasMyRequests: boolean;
  hasAdd: boolean;
  hasDrop: boolean;
  hasSwap: boolean;
  hasPickupTrip: boolean;
  hasProposeTrade: boolean;
} {
  const lower = String(html ?? "").toLowerCase();
  return {
    hasOpenTime:
      lower.includes("opentime") ||
      lower.includes("open time") ||
      lower.includes("view opentime pot"),
    hasTradeboard:
      lower.includes("tradeboard") ||
      lower.includes("trades btwn crewmembers"),
    hasMyRequests: lower.includes("my requests"),
    hasAdd:
      lower.includes("add trip") ||
      lower.includes(">add<") ||
      lower.includes("add to schedule"),
    hasDrop:
      lower.includes("drop trip") ||
      lower.includes(">drop<") ||
      lower.includes("drop from schedule"),
    hasSwap: lower.includes("swap") || lower.includes("trade trip"),
    hasPickupTrip:
      lower.includes("pickup trip") ||
      lower.includes("pick up trip") ||
      lower.includes("pickup"),
    hasProposeTrade:
      lower.includes("propose trade") ||
      lower.includes("propose a trade"),
  };
}
