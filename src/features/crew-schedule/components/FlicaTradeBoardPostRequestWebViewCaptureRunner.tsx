/**
 * Hidden WebView: loads TradeBoard frame + post-request URL, captures DOM outerHTML for form parse.
 * Activated only while {@link requestTbPostWebViewCapture} has a pending promise.
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
  buildInjectTradeboardPostRequestHtmlCaptureScript,
  completeTbPostWebViewCaptureSuccess,
  failTbPostWebViewCapture,
  getTbPostWebViewCapturePending,
  subscribeTbPostWebViewCapture,
  tradeboardPostRequestHtmlHasFormMarkers,
  type TbPostRequestHtmlCaptureMessage,
} from "../../flica-actions/flicaTradeBoardPostRequestWebViewCaptureBridge";

const INJECT_CAPTURE = buildInjectTradeboardPostRequestHtmlCaptureScript();

type Phase = "warmup" | "target";

export function FlicaTradeBoardPostRequestWebViewCaptureRunner() {
  const [tick, setTick] = useState(0);
  const pending = getTbPostWebViewCapturePending();

  useEffect(() => {
    const unsub = subscribeTbPostWebViewCapture(() => setTick((n) => n + 1));
    if (getTbPostWebViewCapturePending()) setTick((n) => n + 1);
    return unsub;
  }, []);

  if (!pending) {
    return null;
  }

  return (
    <FlicaTradeBoardPostRequestWebViewCaptureRunnerInner
      key={`${pending.frameWarmupUrl}|${pending.targetUrl}|${tick}`}
      frameWarmupUrl={pending.frameWarmupUrl}
      targetUrl={pending.targetUrl}
    />
  );
}

function FlicaTradeBoardPostRequestWebViewCaptureRunnerInner({
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
    if (data.type === "tb_post_request_html_capture_error") {
      failTbPostWebViewCapture(String(data.message ?? "WebView capture failed"));
      return;
    }
    if (data.type !== "tb_post_request_html_capture") return;

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
    failTbPostWebViewCapture(
      e.nativeEvent?.description?.trim() || "WebView failed to load FLICA post-request page.",
    );
  }, []);

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    if (nav.loading) return;
    if (phaseRef.current === "target" && !captureSentRef.current) {
      const low = String(nav.url ?? "").toLowerCase();
      if (low.includes("postrequest") || low.includes("tb_post")) {
        setTimeout(() => runCaptureInject(), 400);
      }
    }
  }, [runCaptureInject]);

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
