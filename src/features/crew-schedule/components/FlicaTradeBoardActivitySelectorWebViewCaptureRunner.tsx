/**
 * Hidden WebView: loads TradeBoard frame + ottrade activity selector, captures rendered DOM.
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
import {
  activitySelectorHtmlMarkers,
  activitySelectorHtmlUsable,
  buildInjectTradeboardActivitySelectorHtmlCaptureScript,
  completeTbActivitySelectorWebViewCaptureSuccess,
  failTbActivitySelectorWebViewCapture,
  getTbActivitySelectorWebViewCapturePending,
  subscribeTbActivitySelectorWebViewCapture,
  type TbActivitySelectorHtmlCaptureMessage,
} from "../../flica-actions/flicaTradeBoardActivitySelectorWebViewCaptureBridge";

const INJECT_CAPTURE = buildInjectTradeboardActivitySelectorHtmlCaptureScript();

type Phase = "warmup" | "target";

export function FlicaTradeBoardActivitySelectorWebViewCaptureRunner() {
  const [tick, setTick] = useState(0);
  const pending = getTbActivitySelectorWebViewCapturePending();

  useEffect(() => {
    const unsub = subscribeTbActivitySelectorWebViewCapture(() => setTick((n) => n + 1));
    if (getTbActivitySelectorWebViewCapturePending()) setTick((n) => n + 1);
    return unsub;
  }, []);

  if (!pending) return null;

  return (
    <CaptureRunnerInner
      key={`${pending.frameWarmupUrl}|${pending.targetUrl}|${tick}`}
      frameWarmupUrl={pending.frameWarmupUrl}
      targetUrl={pending.targetUrl}
    />
  );
}

function CaptureRunnerInner({
  frameWarmupUrl,
  targetUrl,
}: {
  frameWarmupUrl: string;
  targetUrl: string;
}) {
  const webRef = useRef<InstanceType<typeof WebView> | null>(null);
  const phaseRef = useRef<Phase>("warmup");
  const captureSentRef = useRef(false);
  const [uri, setUri] = useState(frameWarmupUrl);

  const runCaptureInject = useCallback(() => {
    if (captureSentRef.current) return;
    captureSentRef.current = true;
    webRef.current?.injectJavaScript(INJECT_CAPTURE);
  }, []);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const raw = event.nativeEvent.data ?? "";
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    if (data.type === "tb_activity_selector_html_capture_error") {
      failTbActivitySelectorWebViewCapture(String(data.message ?? "WebView capture failed"));
      return;
    }
    if (data.type !== "tb_activity_selector_html_capture") return;

    const cap = data as unknown as TbActivitySelectorHtmlCaptureMessage;
    const picked = cap.topOuterHtml ?? "";
    const frameHtml = (cap.frameHtmlList ?? []).join("\n");
    const combined = `${picked}\n${frameHtml}`;
    const markers = activitySelectorHtmlMarkers(combined);
    const usable = activitySelectorHtmlUsable(combined);

    fcDevMirrorScheduleLogToFile("FC_TB_ACTIVITY_SELECTOR_WEBVIEW_CAPTURE_RESULT", {
      ok: usable,
      frameUrl: cap.url,
      title: cap.title,
      htmlLength: combined.length,
      waitedMs: cap.waitedMs,
      markersSeen: cap.markersSeen,
      containsTradeTask: markers.containsTradeTask,
      containsDropTask: markers.containsDropTask,
      containsScheduleTable: markers.containsScheduleTable,
      frameCount: cap.frameHtmlList?.length ?? 0,
    });

    if (!usable && combined.length < 800) {
      failTbActivitySelectorWebViewCapture(
        "WebView loaded but activity selector DOM was not found (no TradeTask, TAry, or schedule table).",
      );
      return;
    }

    completeTbActivitySelectorWebViewCaptureSuccess(cap);
  }, []);

  const onLoadEnd = useCallback(() => {
    if (phaseRef.current === "warmup") {
      phaseRef.current = "target";
      captureSentRef.current = false;
      setUri(targetUrl);
      return;
    }
    runCaptureInject();
  }, [runCaptureInject, targetUrl]);

  const onError = useCallback((e: { nativeEvent?: { description?: string } }) => {
    failTbActivitySelectorWebViewCapture(
      e.nativeEvent?.description?.trim() || "WebView failed to load FLICA activity selector.",
    );
  }, []);

  const onNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      if (nav.loading) return;
      if (phaseRef.current === "target" && !captureSentRef.current) {
        const low = String(nav.url ?? "").toLowerCase();
        if (low.includes("ottrade.cgi")) {
          setTimeout(() => runCaptureInject(), 500);
        }
      }
    },
    [runCaptureInject],
  );

  return (
    <View
      style={styles.host}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <WebView
        ref={webRef}
        source={{ uri }}
        style={styles.web}
        userAgent={FLICA_WEBVIEW_USER_AGENT}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptEnabled
        javaScriptCanOpenWindowsAutomatically
        domStorageEnabled
        injectedJavaScriptBeforeContentLoaded={FLICA_POC_INJECT_BEFORE_CONTENT}
        onMessage={onMessage}
        onLoadEnd={onLoadEnd}
        onError={onError}
        onNavigationStateChange={onNavigationStateChange}
        originWhitelist={["https://*", "http://*"]}
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
