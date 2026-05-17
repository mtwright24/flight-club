/**
 * Hidden WebView: Post Request form capture + Add Activity (ottrade) flow automation.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import WebView, {
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";

import { FLICA_POC_INJECT_BEFORE_CONTENT } from "../../../dev/flicaPoCWebFontShim";
import { FLICA_WEBVIEW_USER_AGENT } from "../../../dev/flicaPoCConfig";
import { fcDevMirrorScheduleLogToFile } from "../../../dev/fcDevFileLogger";
import { INJECT_FLICA_TB_ACTIVITY_POPUP_SHIM } from "../../flica-actions/flicaTbActivityPopupShim";
import {
  completeTbActivityInjectResult,
  failTbActivityFlow,
  getTbActivityAddActivityUrl,
  getTbActivityFlowPending,
  getTbActivityFlowPhase,
  handleTbActivityFlowNavigation,
  notifyTbActivityFlowPhase,
  runTbActivityFlowOnWebView,
  runTbActivityOpenSelectorOnWebView,
  shouldNavigateToAddActivity,
  shouldNavigateToPostRequest,
  shouldFallbackNavigateToAddActivityUrl,
  subscribeTbActivityFlow,
} from "../../flica-actions/flicaTradeBoardPostRequestActivityWebViewBridge";
import {
  buildInjectTradeboardPostRequestHtmlCaptureScript,
  completeTbPostWebViewCaptureSuccess,
  failTbPostWebViewCapture,
  getTbPostWebViewCapturePending,
  subscribeTbPostWebViewCapture,
  tradeboardPostRequestHtmlHasFormMarkers,
  type TbPostRequestHtmlCaptureMessage,
} from "../../flica-actions/flicaTradeBoardPostRequestWebViewCaptureBridge";

const INJECT_CAPTURE = buildInjectTradeboardPostRequestHtmlCaptureScript();
const INJECT_BEFORE_CONTENT = `${FLICA_POC_INJECT_BEFORE_CONTENT}\n${INJECT_FLICA_TB_ACTIVITY_POPUP_SHIM}`;

type Phase = "warmup" | "target" | "activity_ottrade";

export function FlicaTradeBoardPostRequestWebViewActionRunner() {
  const [captureTick, setCaptureTick] = useState(0);
  const [activityTick, setActivityTick] = useState(0);
  const capturePending = getTbPostWebViewCapturePending();
  const activityPending = getTbActivityFlowPending();

  useEffect(() => {
    const unsub = subscribeTbPostWebViewCapture(() => setCaptureTick((n) => n + 1));
    if (getTbPostWebViewCapturePending()) setCaptureTick((n) => n + 1);
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeTbActivityFlow(() => setActivityTick((n) => n + 1));
    if (getTbActivityFlowPending()) setActivityTick((n) => n + 1);
    return unsub;
  }, []);

  if (!capturePending && !activityPending) {
    return null;
  }

  if (activityPending) {
    return (
      <ActionRunnerInner
        key={`activity|${activityPending.frameWarmupUrl}|${activityPending.postRequestUrl}|${activityTick}`}
        mode="activity"
        frameWarmupUrl={activityPending.frameWarmupUrl}
        targetUrl={activityPending.postRequestUrl}
        addActivityUrl={activityPending.addActivityUrl}
      />
    );
  }

  return (
    <ActionRunnerInner
      key={`capture|${capturePending!.frameWarmupUrl}|${capturePending!.targetUrl}|${captureTick}`}
      mode="capture"
      frameWarmupUrl={capturePending!.frameWarmupUrl}
      targetUrl={capturePending!.targetUrl}
    />
  );
}

/** @deprecated use FlicaTradeBoardPostRequestWebViewActionRunner */
export const FlicaTradeBoardPostRequestWebViewCaptureRunner =
  FlicaTradeBoardPostRequestWebViewActionRunner;

function ActionRunnerInner({
  mode,
  frameWarmupUrl,
  targetUrl,
  addActivityUrl,
}: {
  mode: "capture" | "activity";
  frameWarmupUrl: string;
  targetUrl: string;
  addActivityUrl?: string;
}) {
  const webRef = useRef<InstanceType<typeof WebView> | null>(null);
  const phaseRef = useRef<Phase>("warmup");
  const captureSentRef = useRef(false);
  const activityFlowStartedRef = useRef(false);
  const [uri, setUri] = useState(frameWarmupUrl);

  const injectJs = useCallback((script: string) => {
    webRef.current?.injectJavaScript(script);
  }, []);

  const runCaptureInject = useCallback(() => {
    if (captureSentRef.current) return;
    captureSentRef.current = true;
    injectJs(INJECT_CAPTURE);
  }, [injectJs]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const raw = event.nativeEvent.data ?? "";
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return;
      }

      if (data.type === "tb_activity_flow_result") {
        completeTbActivityInjectResult(data);
        return;
      }

      if (data.type === "flica_window_open") {
        const absoluteUrl = String(data.absoluteUrl ?? "").trim();
        if (absoluteUrl) {
          fcDevMirrorScheduleLogToFile("FC_TB_ACTIVITY_WINDOW_OPEN", {
            absoluteUrl,
            target: data.target,
            strategy: data.strategy,
            navigatedInPlace: data.navigatedInPlace,
          });
          if (!data.navigatedInPlace) {
            setUri(absoluteUrl);
          }
        }
        return;
      }

      if (data.type === "flica_popup_blocked") {
        fcDevMirrorScheduleLogToFile("FC_TB_ACTIVITY_POPUP_BLOCKED", {
          message: data.message,
          sources: data.sources,
        });
        return;
      }

      if (data.type === "flica_window_open_after") {
        fcDevMirrorScheduleLogToFile("FC_TB_ACTIVITY_WINDOW_OPEN_AFTER", {
          absoluteUrl: data.absoluteUrl,
          frameUrlsAfter: data.frameUrlsAfter,
          strategy: data.strategy,
        });
        return;
      }

      if (data.type === "tb_post_request_html_capture_error") {
        if (mode === "capture") {
          failTbPostWebViewCapture(String(data.message ?? "WebView capture failed"));
        } else {
          failTbActivityFlow(String(data.message ?? "WebView activity flow failed"));
        }
        return;
      }
      if (data.type !== "tb_post_request_html_capture") return;
      if (mode !== "capture") return;

      const cap = data as unknown as TbPostRequestHtmlCaptureMessage;
      const topLen = String(cap.topOuterHtml ?? "").length;
      const frameLens = (cap.frameHtmlList ?? []).map((h) => String(h ?? "").length);
      const hasMarkers = tradeboardPostRequestHtmlHasFormMarkers(cap.topOuterHtml ?? "");
      const frameHasMarkers = (cap.frameHtmlList ?? []).some((h) =>
        tradeboardPostRequestHtmlHasFormMarkers(String(h ?? "")),
      );

      fcDevMirrorScheduleLogToFile("FC_TB_POST_FORM_WEBVIEW_HTML_CAPTURE", {
        ok: hasMarkers || frameHasMarkers,
        url: cap.url,
        title: cap.title,
        topHtmlLength: topLen,
        frameHtmlLengths: frameLens,
        frameCount: frameLens.length,
        hasFormMarkers: hasMarkers || frameHasMarkers,
      });

      if (!hasMarkers && !frameHasMarkers && topLen < 500 && frameLens.every((n) => n < 500)) {
        failTbPostWebViewCapture(
          "WebView loaded but post-request form HTML was not found in any frame.",
        );
        return;
      }

      completeTbPostWebViewCaptureSuccess(cap);
    },
    [mode],
  );

  const onLoadEnd = useCallback(() => {
    if (phaseRef.current === "warmup") {
      phaseRef.current = "target";
      captureSentRef.current = false;
      activityFlowStartedRef.current = false;
      setUri(targetUrl);
      return;
    }

    if (mode === "capture") {
      runCaptureInject();
      return;
    }

    const navUrl = getTbActivityAddActivityUrl() ?? addActivityUrl ?? "";
    const phase = getTbActivityFlowPhase();

    if (phase === "loading_post" && shouldNavigateToAddActivity()) {
      notifyTbActivityFlowPhase("opening_selector");
      setTimeout(() => void runTbActivityOpenSelectorOnWebView(injectJs), 350);
      return;
    }

    if (phase === "loading_ottrade" && shouldFallbackNavigateToAddActivityUrl() && navUrl) {
      phaseRef.current = "activity_ottrade";
      setUri(navUrl);
      return;
    }

    if (phase === "returning_post" && shouldNavigateToPostRequest()) {
      activityFlowStartedRef.current = false;
      phaseRef.current = "target";
      setUri(targetUrl);
      return;
    }

    if (
      mode === "activity" &&
      !activityFlowStartedRef.current &&
      (phase === "loading_ottrade" || phase === "running" || phase === "returning_post")
    ) {
      activityFlowStartedRef.current = true;
      if (phase === "loading_ottrade") notifyTbActivityFlowPhase("running");
      void runTbActivityFlowOnWebView(injectJs);
    }
  }, [addActivityUrl, injectJs, mode, runCaptureInject, targetUrl]);

  const onError = useCallback(
    (e: { nativeEvent?: { description?: string } }) => {
      const msg = e.nativeEvent?.description?.trim() || "WebView failed to load FLICA page.";
      if (mode === "capture") failTbPostWebViewCapture(msg);
      else failTbActivityFlow(msg);
    },
    [mode],
  );

  const onNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      if (nav.loading) return;
      const url = String(nav.url ?? "");
      handleTbActivityFlowNavigation(url);

      if (mode === "capture" && phaseRef.current === "target" && !captureSentRef.current) {
        const low = url.toLowerCase();
        if (low.includes("postrequest") || low.includes("tb_post")) {
          setTimeout(() => runCaptureInject(), 400);
        }
      }

      if (mode === "activity" && !activityFlowStartedRef.current) {
        const low = url.toLowerCase();
        const flowPhase = getTbActivityFlowPhase();
        if (low.includes("ottrade.cgi")) {
          phaseRef.current = "activity_ottrade";
          if (flowPhase === "opening_selector" || flowPhase === "loading_ottrade") {
            notifyTbActivityFlowPhase("loading_ottrade");
          }
          setTimeout(() => {
            if (!activityFlowStartedRef.current) {
              activityFlowStartedRef.current = true;
              notifyTbActivityFlowPhase("running");
              void runTbActivityFlowOnWebView(injectJs);
            }
          }, 500);
        } else if (
          flowPhase === "returning_post" &&
          (low.includes("postrequest") || low.includes("tb_post"))
        ) {
          setTimeout(() => {
            if (!activityFlowStartedRef.current) {
              activityFlowStartedRef.current = true;
              void runTbActivityFlowOnWebView(injectJs);
            }
          }, 500);
        }
      }
    },
    [injectJs, mode, runCaptureInject],
  );

  return (
    <View style={styles.host} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <WebView
        ref={webRef}
        source={{ uri }}
        style={styles.web}
        userAgent={FLICA_WEBVIEW_USER_AGENT}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptEnabled
        domStorageEnabled
        injectedJavaScriptBeforeContentLoaded={INJECT_BEFORE_CONTENT}
        onMessage={onMessage}
        onLoadEnd={onLoadEnd}
        onError={onError}
        onNavigationStateChange={onNavigationStateChange}
        onOpenWindow={(e) => {
          const targetUrl = String(e.nativeEvent.targetUrl ?? "").trim();
          fcDevMirrorScheduleLogToFile("FC_TB_ACTIVITY_WEBVIEW_ON_OPEN_WINDOW", {
            targetUrl,
          });
          if (targetUrl) setUri(targetUrl);
        }}
        originWhitelist={["https://*", "http://*"]}
        javaScriptCanOpenWindowsAutomatically
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
    zIndex: -1,
  },
  web: {
    width: 1,
    height: 1,
    opacity: 0,
  },
});
