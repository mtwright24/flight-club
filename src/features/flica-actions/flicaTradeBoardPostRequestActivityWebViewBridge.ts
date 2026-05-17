/**
 * Promise bridge: TradeBoard Post Request Add Activity flow in hidden WebView.
 */

import { fcDevMirrorScheduleLogToFile } from "../../dev/fcDevFileLogger";
import type { TbActivityFlowDiagnostics, TbActivityInjectResult } from "./flicaTradeBoardPostRequestActivityFlow";
import {
  TB_ACTIVITY_LOG,
  buildInjectTbActivityClickNextScript,
  buildInjectTbActivityFailureDiagnosticsScript,
  buildInjectTbActivityNavigateToAddActivityScript,
  buildInjectTbActivityPollPostFormScript,
  buildInjectTbActivityReturnToPostFormScript,
  buildInjectTbActivitySelectPairingScript,
  buildInjectTbActivityVerifyUndoScript,
  logTbActivity,
} from "./flicaTradeBoardPostRequestActivityFlow";

export type TbActivityFlowRequest = {
  frameWarmupUrl: string;
  postRequestUrl: string;
  addActivityUrl: string;
  pairingId: string;
  dateLabel: string;
  /** Max ms to poll for post form after Next. */
  pollTimeoutMs?: number;
};

export type TbActivityFlowResult = {
  ok: boolean;
  postFormReturned: boolean;
  selectedRowText: string;
  undoVisible: boolean;
  nextMethod: string;
  finalUrl: string;
  diagnostics?: TbActivityFlowDiagnostics;
  error?: string;
};

type PendingInject = {
  resolve: (r: TbActivityInjectResult) => void;
  reject: (e: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type PendingFlow = {
  request: TbActivityFlowRequest;
  resolve: (r: TbActivityFlowResult) => void;
  reject: (e: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  phase:
    | "idle"
    | "loading_post"
    | "opening_selector"
    | "loading_ottrade"
    | "running"
    | "returning_post";
};

let pendingInject: PendingInject | null = null;
let pendingFlow: PendingFlow | null = null;
let addActivityUriFallback = false;
const flowListeners = new Set<() => void>();
const injectListeners = new Set<() => void>();

function notifyFlow() {
  flowListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

function notifyInject() {
  injectListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeTbActivityFlow(listener: () => void): () => void {
  flowListeners.add(listener);
  return () => flowListeners.delete(listener);
}

export function getTbActivityFlowPending(): TbActivityFlowRequest | null {
  return pendingFlow?.request ?? null;
}

export function getTbActivityFlowPhase(): PendingFlow["phase"] | null {
  return pendingFlow?.phase ?? null;
}

export function failTbActivityFlow(message: string): void {
  if (!pendingFlow) return;
  clearTimeout(pendingFlow.timeoutId);
  const reject = pendingFlow.reject;
  pendingFlow = null;
  notifyFlow();
  reject(new Error(message));
}

function failPendingInject(message: string): void {
  if (!pendingInject) return;
  clearTimeout(pendingInject.timeoutId);
  const reject = pendingInject.reject;
  pendingInject = null;
  notifyInject();
  reject(new Error(message));
}

export function completeTbActivityInjectResult(raw: Record<string, unknown>): void {
  if (!pendingInject) return;
  clearTimeout(pendingInject.timeoutId);
  const resolve = pendingInject.resolve;
  pendingInject = null;
  notifyInject();

  const result: TbActivityInjectResult = {
    ok: Boolean(raw.ok),
    step: String(raw.step ?? ""),
    undoVisible: raw.undoVisible != null ? Boolean(raw.undoVisible) : undefined,
    postFormReturned:
      raw.postFormReturned != null ? Boolean(raw.postFormReturned) : undefined,
    selectedRowText: raw.selectedRowText != null ? String(raw.selectedRowText) : undefined,
    frameUrl: raw.frameUrl != null ? String(raw.frameUrl) : undefined,
    topUrl: raw.topUrl != null ? String(raw.topUrl) : undefined,
    diagnostics: raw.diagnostics as TbActivityFlowDiagnostics | undefined,
    message: raw.message != null ? String(raw.message) : undefined,
  };
  resolve(result);
}

function requestInject(
  runInject: () => void,
  step: string,
  timeoutMs = 12_000,
): Promise<TbActivityInjectResult> {
  if (pendingInject) {
    return Promise.reject(new Error("TB activity inject already in progress."));
  }
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (!pendingInject) return;
      pendingInject = null;
      notifyInject();
      reject(new Error(`TB activity inject timed out (${step}).`));
    }, timeoutMs);

    pendingInject = { resolve, reject, timeoutId };
    notifyInject();
    queueMicrotask(() => {
      try {
        runInject();
      } catch (e) {
        failPendingInject(e instanceof Error ? e.message : String(e));
      }
    });
  });
}

export function requestTbPostActivityFlow(
  request: TbActivityFlowRequest,
): Promise<TbActivityFlowResult> {
  if (pendingFlow) {
    return Promise.reject(new Error("TB activity flow already in progress."));
  }
  return new Promise((resolve, reject) => {
    const timeoutMs = 90_000;
    const timeoutId = setTimeout(() => {
      if (!pendingFlow) return;
      logTbActivity(TB_ACTIVITY_LOG.nextFailed, { reason: "flow_timeout" });
      failTbActivityFlow(`Activity flow timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }, timeoutMs);

    addActivityUriFallback = false;
    pendingFlow = {
      request,
      resolve,
      reject,
      timeoutId,
      phase: "loading_post",
    };
    notifyFlow();
  });
}

export function notifyTbActivityFlowPhase(phase: PendingFlow["phase"]): void {
  if (!pendingFlow) return;
  pendingFlow.phase = phase;
  notifyFlow();
}

async function pollTbActivityPostForm(
  injectJs: (script: string) => void,
  deadlineMs: number,
): Promise<{ returned: boolean; lastPoll: TbActivityInjectResult | null }> {
  let lastPoll: TbActivityInjectResult | null = null;
  while (Date.now() < deadlineMs) {
    await new Promise((r) => setTimeout(r, 700));
    lastPoll = await requestInject(
      () => injectJs(buildInjectTbActivityPollPostFormScript()),
      "poll_post_form",
      8_000,
    );
    if (lastPoll.postFormReturned) {
      return { returned: true, lastPoll };
    }
  }
  return { returned: false, lastPoll };
}

export async function runTbActivityOpenSelectorOnWebView(
  injectJs: (script: string) => void,
): Promise<void> {
  const flow = pendingFlow;
  if (!flow || flow.phase !== "opening_selector") return;

  try {
    const open = await requestInject(
      () => injectJs(buildInjectTbActivityNavigateToAddActivityScript(flow.request.addActivityUrl)),
      "open_add_activity",
    );
    if (!open.ok) {
      addActivityUriFallback = true;
      notifyTbActivityFlowPhase("loading_ottrade");
      return;
    }
    notifyTbActivityFlowPhase("loading_ottrade");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failTbActivityFlow(msg);
  }
}

export async function runTbActivityFlowOnWebView(injectJs: (script: string) => void): Promise<void> {
  const flow = pendingFlow;
  if (!flow || (flow.phase !== "running" && flow.phase !== "returning_post")) return;

  if (flow.phase === "returning_post") {
    try {
      const { returned, lastPoll } = await pollTbActivityPostForm(
        injectJs,
        Date.now() + (flow.request.pollTimeoutMs ?? 25_000),
      );
      if (returned && lastPoll) {
        logTbActivity(TB_ACTIVITY_LOG.returnedToPostForm, {
          frameUrl: lastPoll.frameUrl,
          topUrl: lastPoll.topUrl,
          via: "returning_post",
        });
        clearTimeout(flow.timeoutId);
        const resolve = flow.resolve;
        pendingFlow = null;
        notifyFlow();
        resolve({
          ok: true,
          postFormReturned: true,
          selectedRowText: "",
          undoVisible: true,
          nextMethod: "return_post_form",
          finalUrl: lastPoll.frameUrl ?? lastPoll.topUrl ?? "",
        });
        return;
      }
      failTbActivityFlow("Post Request form did not load after returning from activity selector.");
    } catch (e) {
      failTbActivityFlow(e instanceof Error ? e.message : String(e));
    }
    return;
  }

  const { pairingId, dateLabel } = flow.request;

  try {
    const sel = await requestInject(
      () => injectJs(buildInjectTbActivitySelectPairingScript(pairingId, dateLabel)),
      "select_pairing",
    );
    if (!sel.ok) {
      throw new Error(sel.message ?? "Could not click pairing row.");
    }
    logTbActivity(TB_ACTIVITY_LOG.selectClicked, {
      pairingId,
      dateLabel,
      selectedRowText: sel.selectedRowText,
    });

    await new Promise((r) => setTimeout(r, 400));

    const undo = await requestInject(
      () => injectJs(buildInjectTbActivityVerifyUndoScript()),
      "verify_undo",
    );
    if (!undo.undoVisible) {
      logTbActivity(TB_ACTIVITY_LOG.nextFailed, { reason: "undo_not_visible_before_next" });
      throw new Error("Undo button not visible after pairing selection.");
    }
    logTbActivity(TB_ACTIVITY_LOG.undoVisible, { pairingId });

    const next = await requestInject(
      () => injectJs(buildInjectTbActivityClickNextScript()),
      "click_next",
    );
    if (!next.ok) {
      throw new Error(next.message ?? "Next control not found.");
    }
    logTbActivity(TB_ACTIVITY_LOG.nextClicked, { method: next.message });

    await new Promise((r) => setTimeout(r, 500));

    let { returned: postFormReturned, lastPoll } = await pollTbActivityPostForm(
      injectJs,
      Date.now() + Math.min(flow.request.pollTimeoutMs ?? 25_000, 12_000),
    );

    if (!postFormReturned) {
      const ret = await requestInject(
        () => injectJs(buildInjectTbActivityReturnToPostFormScript(flow.request.postRequestUrl)),
        "return_post_form",
      );
      if (ret.ok) {
        notifyTbActivityFlowPhase("returning_post");
        await new Promise((r) => setTimeout(r, 900));
        const retry = await pollTbActivityPostForm(
          injectJs,
          Date.now() + (flow.request.pollTimeoutMs ?? 25_000),
        );
        postFormReturned = retry.returned;
        lastPoll = retry.lastPoll;
      }
    }

    if (postFormReturned && lastPoll) {
      logTbActivity(TB_ACTIVITY_LOG.returnedToPostForm, {
        frameUrl: lastPoll.frameUrl,
        topUrl: lastPoll.topUrl,
      });
    }

    if (!postFormReturned) {
      const diag = await requestInject(
        () => injectJs(buildInjectTbActivityFailureDiagnosticsScript()),
        "diagnostics",
        15_000,
      );
      logTbActivity(TB_ACTIVITY_LOG.nextFailed, {
        pairingId,
        diagnostics: diag.diagnostics,
      });
      fcDevMirrorScheduleLogToFile(TB_ACTIVITY_LOG.nextFailed, {
        pairingId,
        ...(diag.diagnostics ?? {}),
      });

      clearTimeout(flow.timeoutId);
      const resolve = flow.resolve;
      pendingFlow = null;
      notifyFlow();
      resolve({
        ok: false,
        postFormReturned: false,
        selectedRowText: sel.selectedRowText ?? "",
        undoVisible: true,
        nextMethod: next.message ?? "",
        finalUrl: diag.diagnostics?.topUrl ?? "",
        diagnostics: diag.diagnostics,
        error: "Next did not return to populated Post Request form.",
      });
      return;
    }

    clearTimeout(flow.timeoutId);
    const resolve = flow.resolve;
    pendingFlow = null;
    notifyFlow();
    resolve({
      ok: true,
      postFormReturned: true,
      selectedRowText: sel.selectedRowText ?? "",
      undoVisible: true,
      nextMethod: next.message ?? "",
      finalUrl: lastPoll?.frameUrl ?? lastPoll?.topUrl ?? "",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const diag = await requestInject(
        () => injectJs(buildInjectTbActivityFailureDiagnosticsScript()),
        "diagnostics",
        12_000,
      );
      logTbActivity(TB_ACTIVITY_LOG.nextFailed, { error: msg, diagnostics: diag.diagnostics });
    } catch {
      logTbActivity(TB_ACTIVITY_LOG.nextFailed, { error: msg });
    }
    failTbActivityFlow(msg);
  }
}

export function handleTbActivityFlowNavigation(url: string): void {
  if (!pendingFlow) return;
  const low = String(url ?? "").toLowerCase();
  if (low.includes("ottrade.cgi") && pendingFlow.phase === "loading_post") {
    notifyTbActivityFlowPhase("loading_ottrade");
  }
}

export function shouldNavigateToAddActivity(): boolean {
  return pendingFlow?.phase === "loading_post";
}

export function shouldOpenAddActivityViaInject(): boolean {
  return pendingFlow?.phase === "opening_selector";
}

export function shouldNavigateToPostRequest(): boolean {
  return pendingFlow?.phase === "returning_post";
}

export function shouldFallbackNavigateToAddActivityUrl(): boolean {
  return addActivityUriFallback && pendingFlow?.phase === "loading_ottrade";
}

export function getTbActivityPostRequestUrl(): string | null {
  return pendingFlow?.request.postRequestUrl ?? null;
}

export function getTbActivityAddActivityUrl(): string | null {
  return pendingFlow?.request.addActivityUrl ?? null;
}
