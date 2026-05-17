/**
 * Real FLICA Post Request form action — from WebView DOM capture or HTML parse (no guessed URLs).
 */

import { resolveFlicaAbsoluteUrl } from "./flicaTradeBoardAllRequestsForm";
import type {
  TradeboardPostRequestCapturedSubmit,
  TradeboardPostRequestFormField,
  TradeboardPostRequestFormModel,
  TradeboardPostRequestSubmitControl,
} from "./flicaTradeBoardPostRequestTypes";

export type TbPostRequestCapturedFormWire = {
  actionRaw: string;
  actionResolved: string;
  frameUrl: string;
  method: string;
  submitButton: TradeboardPostRequestSubmitControl | null;
  submitControls: TradeboardPostRequestSubmitControl[];
  hiddenFields: Array<{ name: string; value: string }>;
};

export function formatSubmitButtonLabel(
  btn: TradeboardPostRequestSubmitControl | null,
): string {
  if (!btn) return "—";
  const name = btn.name?.trim() || "(no name)";
  const value = btn.value?.trim() || "";
  const type = btn.type?.trim() || "submit";
  return value ? `${name}=${value} (${type})` : `${name} (${type})`;
}

export function wireToCapturedSubmit(
  wire: TbPostRequestCapturedFormWire,
  source: TradeboardPostRequestCapturedSubmit["source"],
): TradeboardPostRequestCapturedSubmit {
  const method = String(wire.method ?? "POST").toUpperCase() === "GET" ? "GET" : "POST";
  return {
    actionRaw: String(wire.actionRaw ?? ""),
    actionResolved: String(wire.actionResolved ?? "").trim(),
    frameUrl: String(wire.frameUrl ?? "").trim(),
    method,
    submitButton: wire.submitButton,
    submitControls: wire.submitControls ?? [],
    hiddenFields: wire.hiddenFields ?? [],
    source,
  };
}

function findPrimarySubmitControl(
  fields: TradeboardPostRequestFormField[],
): TradeboardPostRequestSubmitControl | null {
  const submits = fields.filter((f) => f.type === "submit" || f.type === "button");
  if (!submits.length) return null;
  const scored = submits.map((f) => {
    const nameL = f.name.toLowerCase();
    const valL = f.value.toLowerCase();
    let score = 0;
    if (nameL.includes("postrequest")) score += 100;
    if (valL.includes("post request")) score += 80;
    if (f.type === "submit") score += 20;
    return { f, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0]!.f;
  return { name: top.name, value: top.value, type: top.type };
}

function listSubmitControls(fields: TradeboardPostRequestFormField[]): TradeboardPostRequestSubmitControl[] {
  return fields
    .filter((f) => f.type === "submit" || f.type === "button")
    .map((f) => ({ name: f.name, value: f.value, type: f.type }));
}

/** Build captured submit from parsed primary form + document/frame URL. */
export function capturedSubmitFromParsedForm(
  form: TradeboardPostRequestFormModel,
  frameUrl: string,
  source: TradeboardPostRequestCapturedSubmit["source"],
): TradeboardPostRequestCapturedSubmit | null {
  const actionRaw = String(form.actionRaw ?? "").trim();
  const actionResolved =
    String(form.actionUrl ?? "").trim() ||
    (actionRaw ? resolveFlicaAbsoluteUrl(actionRaw, frameUrl) : "");
  if (!actionResolved) return null;
  return {
    actionRaw,
    actionResolved,
    frameUrl: frameUrl.trim(),
    method: form.method,
    submitButton: findPrimarySubmitControl(form.fields),
    submitControls: listSubmitControls(form.fields),
    hiddenFields: form.hiddenFields ?? [],
    source,
  };
}

export function applyCapturedSubmitToFormModel(
  form: TradeboardPostRequestFormModel,
  captured: TradeboardPostRequestCapturedSubmit | null,
): TradeboardPostRequestFormModel {
  if (!captured?.actionResolved?.trim()) return form;
  return {
    ...form,
    actionRaw: captured.actionRaw,
    actionUrl: captured.actionResolved,
    frameUrl: captured.frameUrl,
    method: captured.method,
    capturedSubmit: captured,
  };
}

export const CAPTURED_FORM_ACTION_BLOCKER = "captured_form_action_missing";
