/**
 * Hidden WebView: TB frame warmup + TB_EditRequest.cgi DOM capture for native edit composer.
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
  buildInjectTradeboardEditRequestHtmlCaptureScript,
  completeTbEditRequestWebViewCaptureSuccess,
  editRequestHtmlHasFormMarkers,
  failTbEditRequestWebViewCapture,
  getTbEditRequestWebViewCapturePending,
  subscribeTbEditRequestWebViewCapture,
  type TbEditRequestHtmlCaptureMessage,
} from "../../flica-actions/flicaTradeBoardEditRequestWebViewCaptureBridge";

const INJECT_CAPTURE = buildInjectTradeboardEditRequestHtmlCaptureScript();

type Phase = "warmup" | "target";

export function FlicaTradeBoardEditRequestWebViewCaptureRunner() {
  const [tick, setTick] = useState(0);
  const pending = getTbEditRequestWebViewCapturePending();

  useEffect(() => {
    const unsub = subscribeTbEditRequestWebViewCapture(() => setTick((n) => n + 1));
    if (getTbEditRequestWebViewCapturePending()) setTick((n) => n + 1);
    return unsub;
  }, []);

  if (!pending) {
    return null;
  }

  return (
    <FlicaTradeBoardEditRequestWebViewCaptureRunnerInner
      key={`${pending.frameWarmupUrl}|${pending.targetUrl}|${tick}`}
      frameWarmupUrl={pending.frameWarmupUrl}
      targetUrl={pending.targetUrl}
    />
  );
}

function FlicaTradeBoardEditRequestWebViewCaptureRunnerInner({
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
    if (data.type === "tb_edit_request_html_capture_error") {
      failTbEditRequestWebViewCapture(String(data.message ?? "WebView capture failed"));
      return;
    }
    if (data.type !== "tb_edit_request_html_capture") return;

    const cap = data as unknown as TbEditRequestHtmlCaptureMessage;
    const topLen = String(cap.topOuterHtml ?? "").length;
    const frameLens = (cap.frameHtmlList ?? []).map((h) => String(h ?? "").length);
    const hasMarkers =
      editRequestHtmlHasFormMarkers(cap.topOuterHtml ?? "") ||
      (cap.frameHtmlList ?? []).some((h) => editRequestHtmlHasFormMarkers(String(h ?? "")));

    fcDevMirrorScheduleLogToFile("FC_TB_EDIT_REQUEST_WEBVIEW_CAPTURE_RESULT", {
      phase: "runner_message",
      ready: cap.ready,
      url: cap.url,
      topHtmlLength: topLen,
      frameHtmlLengths: frameLens,
      hasFormMarkers: hasMarkers,
    });

    if (!cap.ready && topLen < 500 && frameLens.every((n) => n < 500)) {
      failTbEditRequestWebViewCapture(
        "WebView loaded but Edit Request form HTML was not found in any frame.",
      );
      return;
    }

    completeTbEditRequestWebViewCaptureSuccess(cap);
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
    failTbEditRequestWebViewCapture(
      e.nativeEvent?.description?.trim() || "WebView failed to load FLICA Edit Request page.",
    );
  }, []);

  const onNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      if (nav.loading) return;
      if (phaseRef.current === "target" && !captureSentRef.current) {
        const low = String(nav.url ?? "").toLowerCase();
        if (low.includes("tb_editrequest") || low.includes("editrequest.cgi")) {
          setTimeout(() => runCaptureInject(), 400);
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
