import type { FlicaClickActionKind } from "./FlicaActionsWebView";
import type { FlicaActionSafetyClass } from "./flicaActionRecorderTypes";

const MAY_MUTATE_KINDS = new Set<FlicaClickActionKind>([
  "opentime_add",
  "opentime_drop",
  "opentime_swap",
  "trade_create",
  "tradeboard_pickup",
  "tradeboard_propose_trade",
  "tradeboard_add_favorite",
  "tradeboard_post_request",
  "tradeboard_edit",
  "tradeboard_delete",
]);

const SAFE_READ_KINDS = new Set<FlicaClickActionKind>([
  "tradeboard_all_requests",
  "tradeboard_my_requests",
  "tradeboard_favorites",
  "tradeboard_my_responses",
  "tab_navigation",
]);

function blobLower(parts: Array<string | undefined | null>): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Pairing detail / read-only navigation heuristics. */
export function looksLikePairingDetailTarget(input: {
  href?: string;
  onclick?: string;
  clickedText?: string;
}): boolean {
  const b = blobLower([input.href, input.onclick, input.clickedText]);
  if (/\bJ[A-Z0-9]{3,5}:\d{1,2}[A-Z]{3}\b/i.test(input.clickedText ?? "")) {
    if (
      b.includes("viewpairing") ||
      b.includes("view_pairing") ||
      b.includes("pairingdetail") ||
      b.includes("pairing_detail") ||
      b.includes("showpairing") ||
      b.includes("otview") ||
      b.includes("popup") ||
      b.includes("window.open")
    ) {
      return true;
    }
    if ((input.href || "").length > 8 && !b.includes("pickup") && !b.includes("post")) return true;
  }
  return (
    b.includes("viewpairing") ||
    b.includes("pairingdetail") ||
    b.includes("showpairing") ||
    (b.includes("pairing") && b.includes("view") && !b.includes("post"))
  );
}

export function classifyFlicaActionSafety(input: {
  actionKind: FlicaClickActionKind;
  clickedText?: string;
  href?: string;
  onclick?: string;
  formMethod?: string;
  eventType?: string;
  isSubmit?: boolean;
}): FlicaActionSafetyClass {
  if (input.isSubmit || input.eventType === "submit") return "MAY_MUTATE";

  const t = blobLower([input.clickedText]);
  const h = blobLower([input.href, input.onclick]);

  if (looksLikePairingDetailTarget(input)) return "SAFE_READ";

  if (SAFE_READ_KINDS.has(input.actionKind)) return "SAFE_READ";

  if (MAY_MUTATE_KINDS.has(input.actionKind)) return "MAY_MUTATE";

  if (
    t.includes("post request") ||
    t.includes("submit") ||
    t.includes("pickup trip") ||
    t.includes("propose trade") ||
    t.includes("add to favorite") ||
    t.includes("add activity") ||
    t.includes("drop trip") ||
    t.includes("trade/drop") ||
    t.includes("trade reserve")
  ) {
    return "MAY_MUTATE";
  }

  if (
    h.includes("tb_postrequest") ||
    h.includes("pickup") ||
    h.includes("restrade") ||
    h.includes("addfavorite") ||
    h.includes("hdnpickup")
  ) {
    return "MAY_MUTATE";
  }

  const method = (input.formMethod || "GET").toUpperCase();
  if (method === "POST" && (t.includes("post") || t.includes("submit") || t.includes("add"))) {
    return "MAY_MUTATE";
  }

  if (
    t.includes("all requests") ||
    t.includes("my requests") ||
    t.includes("favorites") ||
    t.includes("opentime pot") ||
    t.includes("leftmenu") ||
    t.includes("mainmenu")
  ) {
    return "SAFE_READ";
  }

  return "SAFE_READ";
}

export function mayMutateWarning(classification: FlicaActionSafetyClass): string | null {
  if (classification === "MAY_MUTATE") {
    return "This action may change FLICA data. Manual test only — recorder does not auto-submit.";
  }
  return null;
}
