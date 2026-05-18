/**
 * Hidden WebView: TB frame warmup + TB_MyRequests.cgi DOM capture for Edit/Delete reqId.
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
  buildInjectTradeboardMyRequestsHtmlCaptureScript,
  completeTbMyRequestsWebViewCaptureSuccess,
  failTbMyRequestsWebViewCapture,
  getTbMyRequestsWebViewCapturePending,
  myRequestsHtmlHasActionMarkers,
  myRequestsHtmlHasRowText,
  subscribeTbMyRequestsWebViewCapture,
  type TbMyRequestsHtmlCaptureMessage,
} from "../../flica-actions/flicaTradeBoardMyRequestsWebViewCaptureBridge";

const INJECT_CAPTURE = buildInjectTradeboardMyRequestsHtmlCaptureScript();

type Phase = "warmup" | "target";

export function FlicaTradeBoardMyRequestsWebViewCaptureRunner() {
  const [tick, setTick] = useState(0);
  const pending = getTbMyRequestsWebViewCapturePending();

  useEffect(() => {
    const unsub = subscribeTbMyRequestsWebViewCapture(() => setTick((n) => n + 1));
    if (getTbMyRequestsWebViewCapturePending()) setTick((n) => n + 1);
    return unsub;
  }, []);

  if (!pending) {
    return null;
  }

  return (
    <FlicaTradeBoardMyRequestsWebViewCaptureRunnerInner
      key={`${pending.frameWarmupUrl}|${pending.targetUrl}|${tick}`}
      frameWarmupUrl={pending.frameWarmupUrl}
      targetUrl={pending.targetUrl}
    />
  );
}

function FlicaTradeBoardMyRequestsWebViewCaptureRunnerInner({
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
    if (data.type === "tb_my_requests_html_capture_error") {
      failTbMyRequestsWebViewCapture(String(data.message ?? "WebView capture failed"));
      return;
    }
    if (data.type !== "tb_my_requests_html_capture") return;

    const cap = data as unknown as TbMyRequestsHtmlCaptureMessage;
    const topLen = String(cap.topOuterHtml ?? "").length;
    const frameLens = (cap.frameHtmlList ?? []).map((h) => String(h ?? "").length);
    const hasMarkers = myRequestsHtmlHasActionMarkers(cap.topOuterHtml ?? "");
    const frameHasMarkers = (cap.frameHtmlList ?? []).some((h) =>
      myRequestsHtmlHasActionMarkers(String(h ?? "")),
    );
    const hasRow =
      myRequestsHtmlHasRowText(cap.topOuterHtml ?? "") ||
      (cap.frameHtmlList ?? []).some((h) => myRequestsHtmlHasRowText(String(h ?? "")));

    fcDevMirrorScheduleLogToFile("FC_TB_MY_REQUEST_REQID_WEBVIEW_CAPTURE_RESULT", {
      phase: "runner_message",
      ready: cap.ready,
      url: cap.url,
      topHtmlLength: topLen,
      frameHtmlLengths: frameLens,
      hasActionMarkers: hasMarkers || frameHasMarkers,
      hasRowText: hasRow,
    });

    if (!cap.ready && topLen < 500 && frameLens.every((n) => n < 500)) {
      failTbMyRequestsWebViewCapture(
        "WebView loaded but My Requests row HTML was not found in any frame.",
      );
      return;
    }

    completeTbMyRequestsWebViewCaptureSuccess(cap);
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
    failTbMyRequestsWebViewCapture(
      e.nativeEvent?.description?.trim() || "WebView failed to load FLICA My Requests page.",
    );
  }, []);

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    if (nav.loading) return;
    if (phaseRef.current === "target" && !captureSentRef.current) {
      const low = String(nav.url ?? "").toLowerCase();
      if (low.includes("tb_myrequests") || low.includes("myrequests")) {
        setTimeout(() => runCaptureInject(), 400);
      }
    }
  }, [runCaptureInject]);

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
