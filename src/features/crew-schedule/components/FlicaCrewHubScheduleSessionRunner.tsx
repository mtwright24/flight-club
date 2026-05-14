/**
 * Same FLICA WebView session + saved-credentials sign-in + optional CAPTCHA handling as
 * `import-flica-direct` (schedule import). Used only for Tradeboard / Open Time pull refresh.
 * Completes after main-menu cookie capture (no schedule HTML download).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CookieManager from "@react-native-community/cookies";
import WebView, {
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";

import { saveFlicaLastMainmenuUrl } from "../../../dev/flicaPoCCookieStore";
import { FLICA_POC_INJECT_BEFORE_CONTENT } from "../../../dev/flicaPoCWebFontShim";
import {
  buildFlicaUrls,
  FLICA_CONSTANTS,
  loadFlicaAirlineSubdomain,
  loadFlicaCookies,
  loadFlicaCredentials,
  saveFlicaCookies,
} from "../../../services/flicaScheduleService";
import { syncWebViewSessionSnapshotFromSavedCookies } from "../../flica-actions/flicaActionsHttp";
import { markFlicaActionsWebViewSessionReady } from "../../flica-actions/flicaActionsWebViewSession";
import FlicaSyncPresentationLayer, {
  type FlicaSyncPresentationPanel,
} from "../flica-sync-ui/FlicaSyncPresentationLayer";
import type { FlicaSyncProgressPhase } from "../flica-sync-ui/FlicaSyncProgressSteps";
import { ImportController } from "../flicaDirectImport/ImportController";
import { ImportWrapperOverlay } from "../flicaDirectImport/ImportWrapperOverlay";
import { scheduleTheme as T } from "../scheduleTheme";
import {
  buildFlicaUiLoginInjectScript,
  flicaUserInteractionSurfaceLikely,
  INJECT_FLICA_BRIDGE_PING,
  isMainmenuAwaitingCaptcha,
  resetFlowNav,
  type FlowNav,
} from "../flicaScheduleSessionShared";

export type FlicaCrewHubScheduleSessionRunnerProps = {
  /** When true, runs the same WebView session flow as schedule import (pull only). */
  active: boolean;
  /** Shown in overlay status (e.g. Tradeboard / Open Time). */
  purposeLabel: string;
  onComplete: () => void;
  onError: (message: string) => void;
};

export function FlicaCrewHubScheduleSessionRunner({
  active,
  purposeLabel,
  onComplete,
  onError,
}: FlicaCrewHubScheduleSessionRunnerProps) {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<InstanceType<typeof WebView> | null>(null);
  const flowNavRef = useRef<FlowNav>({ loadScheduleInjected: false });
  const completingRef = useRef(false);
  const mainmenuHandoffStartedThisSyncRef = useRef(false);
  const mainmenuHandoffInFlightRef = useRef(false);
  const webLoadPassRef = useRef(0);
  const lastNavUrlRef = useRef("");
  const pageLoadCountRef = useRef(0);
  const pageFinishDedupeKeyRef = useRef("");
  const pageFinishDedupeAtRef = useRef(0);
  const postCaptchaFinalizedRef = useRef(false);
  const sawFlicaRecaptchaIframeOnMainmenuRef = useRef(false);
  const noCaptchaMainmenuFinalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialFlicaCoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const [credsLoading, setCredsLoading] = useState(true);
  const [storedAirlineSub, setStoredAirlineSub] = useState<string | null>(null);
  const [storedUser, setStoredUser] = useState<string | null>(null);

  const [webViewKey, setWebViewKey] = useState(0);
  const [captchaWebVisible, setCaptchaWebVisible] = useState(false);
  const [postCaptchaFired, setPostCaptchaFired] = useState(false);
  const [hideWebForSync, setHideWebForSync] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState("");
  const [showInitialFlicaCover, setShowInitialFlicaCover] = useState(false);
  const [flcaVerificationDone, setFlcaVerificationDone] = useState(false);
  const [nativeImportPhase, setNativeImportPhase] = useState<
    "idle" | "webview_schedule" | "http_fetch"
  >("idle");

  const setFlicaVerificationFinalized = useCallback((finalized: boolean) => {
    postCaptchaFinalizedRef.current = finalized;
    setFlcaVerificationDone(finalized);
  }, []);

  const flicaUrls = useMemo(
    () => (storedAirlineSub?.trim() ? buildFlicaUrls(storedAirlineSub) : null),
    [storedAirlineSub],
  );

  const hasCredentials = !!storedUser?.trim();
  const hasAirline = !!storedAirlineSub?.trim();
  const canSync = hasAirline && hasCredentials;

  const tryDismissInitialFlicaCover = useCallback((url: string, recaptchaFrameCount?: number) => {
    if (flicaUserInteractionSurfaceLikely(url, recaptchaFrameCount)) {
      setShowInitialFlicaCover(false);
    }
  }, []);

  const loadCreds = useCallback(async () => {
    setCredsLoading(true);
    try {
      const [sub, c] = await Promise.all([loadFlicaAirlineSubdomain(), loadFlicaCredentials()]);
      setStoredAirlineSub(sub);
      if (!c) {
        setStoredUser(null);
        return;
      }
      setStoredUser(c.username);
    } finally {
      setCredsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCreds();
  }, [loadCreds]);

  const stopSession = useCallback(() => {
    if (noCaptchaMainmenuFinalizeTimerRef.current) {
      clearTimeout(noCaptchaMainmenuFinalizeTimerRef.current);
      noCaptchaMainmenuFinalizeTimerRef.current = null;
    }
    if (initialFlicaCoverTimerRef.current) {
      clearTimeout(initialFlicaCoverTimerRef.current);
      initialFlicaCoverTimerRef.current = null;
    }
    setShowInitialFlicaCover(false);
    setCaptchaWebVisible(false);
    setPostCaptchaFired(false);
    setHideWebForSync(false);
    setOverlayMessage("");
    completingRef.current = false;
    mainmenuHandoffInFlightRef.current = false;
    mainmenuHandoffStartedThisSyncRef.current = false;
    pageLoadCountRef.current = 0;
    pageFinishDedupeKeyRef.current = "";
    pageFinishDedupeAtRef.current = 0;
    setFlicaVerificationFinalized(false);
    sawFlicaRecaptchaIframeOnMainmenuRef.current = false;
    setNativeImportPhase("idle");
    resetFlowNav(flowNavRef);
  }, [setFlicaVerificationFinalized]);

  const finishCrewHubSessionSuccess = useCallback(async () => {
    if (completingRef.current) return;
    completingRef.current = true;
    setPostCaptchaFired(true);
    setHideWebForSync(true);
    setCaptchaWebVisible(false);
    setOverlayMessage("");
    try {
      await syncWebViewSessionSnapshotFromSavedCookies();
    } catch {
      /* non-fatal */
    }
    onComplete();
  }, [onComplete]);

  const beginCrewHubMainmenuHandoff = useCallback(
    async (pageUrl: string) => {
      setShowInitialFlicaCover(false);
      if (completingRef.current || !flicaUrls) return;
      if (mainmenuHandoffInFlightRef.current) return;
      if (flowNavRef.current.loadScheduleInjected) return;
      const low = pageUrl.toLowerCase();
      if (!low.includes("mainmenu.cgi") || low.includes("loadschedule=true")) return;
      if (Platform.OS === "web") return;
      if (mainmenuHandoffStartedThisSyncRef.current) return;
      if (!postCaptchaFinalizedRef.current) {
        return;
      }

      mainmenuHandoffStartedThisSyncRef.current = true;
      mainmenuHandoffInFlightRef.current = true;
      try {
        if (pageUrl) {
          try {
            await saveFlicaLastMainmenuUrl(pageUrl);
          } catch {
            /* non-fatal */
          }
        }
        {
          const cm = CookieManager as unknown as { flush?: () => Promise<void> };
          if (typeof cm.flush === "function") {
            await cm.flush();
          }
        }
        await new Promise((r) => setTimeout(r, 400));
        const baseOrigin = flicaUrls.ORIGIN;
        const mainmenuPath = `${flicaUrls.ORIGIN}/online/mainmenu.cgi`;
        const cookies = await CookieManager.get(baseOrigin);
        const cookieParts = Object.entries(cookies ?? {})
          .map(([name, c]) => `${name}=${(c as { value: string }).value}`)
          .join("; ");
        const cookies2 = await CookieManager.get(mainmenuPath);
        const pickFlica = (jar: Record<string, { value?: string } | undefined> | null | undefined) => {
          const o: {
            FLiCASession?: string;
            FLiCAService?: string;
            AWSALB?: string;
            AWSALBCORS?: string;
          } = {};
          if (!jar) return o;
          for (const k of ["FLiCASession", "FLiCAService", "AWSALB", "AWSALBCORS"] as const) {
            const row = jar[k];
            if (
              row &&
              typeof row === "object" &&
              "value" in row &&
              String((row as { value: string }).value).length
            ) {
              o[k] = (row as { value: string }).value;
            }
          }
          return o;
        };
        const jar1 = (cookies ?? {}) as Record<string, { value?: string }>;
        const jar2 = (cookies2 ?? {}) as Record<string, { value?: string }>;
        const mergedPick = { ...pickFlica(jar1), ...pickFlica(jar2) };
        await saveFlicaCookies(mergedPick);
        const hAfterSave = await loadFlicaCookies();
        let cookieHeader = cookieParts;
        if (!cookieHeader?.trim() && hAfterSave?.trim()) {
          cookieHeader = hAfterSave;
        }
        if (!cookieHeader?.trim()) {
          mainmenuHandoffStartedThisSyncRef.current = false;
          if (pageLoadCountRef.current > 4) {
            onError("No FLICA cookies after sign-in. Try again.");
            stopSession();
          }
          return;
        }
        await markFlicaActionsWebViewSessionReady(mergedPick);
        await finishCrewHubSessionSuccess();
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
        flowNavRef.current.loadScheduleInjected = false;
        stopSession();
      } finally {
        mainmenuHandoffInFlightRef.current = false;
      }
    },
    [flicaUrls, finishCrewHubSessionSuccess, onError, stopSession],
  );

  const markPostCaptchaFinalizedFromUrl = useCallback(
    (rawUrl: string) => {
      if (postCaptchaFinalizedRef.current) return;
      const u = (rawUrl ?? "").toLowerCase();
      if (u.includes("gohm=1")) {
        setFlicaVerificationFinalized(true);
        return;
      }
      if (u.includes("leftmenu.cgi") && u.includes("whosepage=crewmember")) {
        setFlicaVerificationFinalized(true);
        return;
      }
    },
    [setFlicaVerificationFinalized],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      if (completingRef.current) return;
      const raw = event.nativeEvent.data ?? "";
      let data: { type?: string; url?: string };
      try {
        data = JSON.parse(raw) as { type?: string; url?: string };
      } catch {
        return;
      }
      if (data.type === "flica_bridge_ping") {
        const u = (data as { url?: string; recaptchaFrameCount?: number }).url ?? "";
        const rec = (data as { recaptchaFrameCount?: number }).recaptchaFrameCount;
        if (typeof rec === "number" && rec > 0) {
          setCaptchaWebVisible(true);
          setOverlayMessage("Complete the verification in the secure area below.");
        }
        if (u) {
          markPostCaptchaFinalizedFromUrl(u);
          tryDismissInitialFlicaCover(u, typeof rec === "number" ? rec : undefined);
        }
        if (u && isMainmenuAwaitingCaptcha(u) && typeof rec === "number") {
          if (rec > 0) {
            sawFlicaRecaptchaIframeOnMainmenuRef.current = true;
            if (noCaptchaMainmenuFinalizeTimerRef.current) {
              clearTimeout(noCaptchaMainmenuFinalizeTimerRef.current);
              noCaptchaMainmenuFinalizeTimerRef.current = null;
            }
          } else if (sawFlicaRecaptchaIframeOnMainmenuRef.current) {
            if (!postCaptchaFinalizedRef.current) {
              setFlicaVerificationFinalized(true);
            }
          } else if (!postCaptchaFinalizedRef.current && noCaptchaMainmenuFinalizeTimerRef.current == null) {
            noCaptchaMainmenuFinalizeTimerRef.current = setTimeout(() => {
              noCaptchaMainmenuFinalizeTimerRef.current = null;
              if (completingRef.current) return;
              if (postCaptchaFinalizedRef.current) return;
              if (sawFlicaRecaptchaIframeOnMainmenuRef.current) return;
              const latest = lastNavUrlRef.current || u;
              if (!latest.toLowerCase().includes("mainmenu.cgi")) return;
              if (!isMainmenuAwaitingCaptcha(latest)) return;
              setFlicaVerificationFinalized(true);
              void beginCrewHubMainmenuHandoff(latest);
            }, 3000);
          }
        }
        return;
      }
      if (data.type === "flica_login_submitted") {
        setShowInitialFlicaCover(false);
        setOverlayMessage("Signing you in to FLICA…");
        return;
      }
      if (data.type === "flica_diag") {
        const du = (data as { url?: string }).url ?? "";
        if (du) tryDismissInitialFlicaCover(du);
        return;
      }
      if (data.type === "flica_no_login_form") {
        setShowInitialFlicaCover(false);
        return;
      }
    },
    [
      beginCrewHubMainmenuHandoff,
      markPostCaptchaFinalizedFromUrl,
      setFlicaVerificationFinalized,
      tryDismissInitialFlicaCover,
    ],
  );

  const onNavigation = useCallback(
    (nav: WebViewNavigation) => {
      if (completingRef.current) return;
      const url = nav.url ?? "";
      const low = url.toLowerCase();
      lastNavUrlRef.current = url;
      tryDismissInitialFlicaCover(url);
      if (low.includes("captcha")) {
        setCaptchaWebVisible(true);
        setOverlayMessage("Complete the verification, then we'll continue automatically.");
      }
      if (nav.loading === false) {
        const now = Date.now();
        if (pageFinishDedupeKeyRef.current !== url || now - pageFinishDedupeAtRef.current > 600) {
          pageFinishDedupeKeyRef.current = url;
          pageFinishDedupeAtRef.current = now;
          pageLoadCountRef.current += 1;
        }
        markPostCaptchaFinalizedFromUrl(url);
        if (low.includes("mainmenu.cgi") && !low.includes("loadschedule=true")) {
          void beginCrewHubMainmenuHandoff(url);
        }
      }
    },
    [beginCrewHubMainmenuHandoff, markPostCaptchaFinalizedFromUrl, tryDismissInitialFlicaCover],
  );

  const runLoginInject = useCallback(() => {
    if (!activeRef.current) return;
    void (async () => {
      const creds = await loadFlicaCredentials();
      if (!creds) return;
      const script = buildFlicaUiLoginInjectScript(creds.username.trim(), creds.password);
      const r = () => {
        if (!activeRef.current) return;
        webViewRef.current?.injectJavaScript(script);
      };
      r();
      setTimeout(r, 250);
      setTimeout(r, 600);
    })();
  }, []);

  const onLoadEnd = useCallback(() => {
    webViewRef.current?.injectJavaScript(INJECT_FLICA_BRIDGE_PING);
    runLoginInject();
    const u = lastNavUrlRef.current;
    if (u) {
      tryDismissInitialFlicaCover(u);
      markPostCaptchaFinalizedFromUrl(u);
    }
    const low = (u ?? "").toLowerCase();
    if (u && low.includes("mainmenu.cgi") && !low.includes("loadschedule=true")) {
      void beginCrewHubMainmenuHandoff(u);
    }
  }, [beginCrewHubMainmenuHandoff, markPostCaptchaFinalizedFromUrl, runLoginInject, tryDismissInitialFlicaCover]);

  const onLoadProgress = useCallback(
    (e: { nativeEvent: { progress: number } }) => {
      if (e.nativeEvent.progress < 0.99) return;
      const p = webLoadPassRef.current;
      setTimeout(() => {
        if (webLoadPassRef.current === p) runLoginInject();
      }, 250);
    },
    [runLoginInject],
  );

  const startSession = useCallback(() => {
    completingRef.current = false;
    mainmenuHandoffInFlightRef.current = false;
    mainmenuHandoffStartedThisSyncRef.current = false;
    pageLoadCountRef.current = 0;
    pageFinishDedupeKeyRef.current = "";
    pageFinishDedupeAtRef.current = 0;
    setFlicaVerificationFinalized(false);
    sawFlicaRecaptchaIframeOnMainmenuRef.current = false;
    setNativeImportPhase("idle");
    if (noCaptchaMainmenuFinalizeTimerRef.current) {
      clearTimeout(noCaptchaMainmenuFinalizeTimerRef.current);
      noCaptchaMainmenuFinalizeTimerRef.current = null;
    }
    resetFlowNav(flowNavRef);
    setCaptchaWebVisible(false);
    setPostCaptchaFired(false);
    setHideWebForSync(false);
    setOverlayMessage("");
    if (initialFlicaCoverTimerRef.current) {
      clearTimeout(initialFlicaCoverTimerRef.current);
      initialFlicaCoverTimerRef.current = null;
    }
    setShowInitialFlicaCover(true);
    initialFlicaCoverTimerRef.current = setTimeout(() => {
      initialFlicaCoverTimerRef.current = null;
      setShowInitialFlicaCover(false);
    }, 12_000);
    setWebViewKey((k) => k + 1);
    setOverlayMessage("Securely signing you in…");
  }, [setFlicaVerificationFinalized]);

  const sessionStartedForActiveRef = useRef(false);

  useEffect(() => {
    if (!active) {
      sessionStartedForActiveRef.current = false;
      stopSession();
      return;
    }
    if (credsLoading) return;
    if (!canSync) {
      onError("Save FLICA airline and credentials in Schedule → FLICA sync first.");
      return;
    }
    if (sessionStartedForActiveRef.current) return;
    sessionStartedForActiveRef.current = true;
    startSession();
  }, [active, canSync, credsLoading, onError, startSession, stopSession]);

  useEffect(() => {
    if (flcaVerificationDone) {
      setCaptchaWebVisible(false);
    }
  }, [flcaVerificationDone]);

  const splitForCaptchaPanel =
    active && captchaWebVisible && !hideWebForSync && !postCaptchaFired && nativeImportPhase === "idle";

  const importFullScreenCover = !splitForCaptchaPanel;

  const presentationPanel: FlicaSyncPresentationPanel = useMemo(() => {
    if (captchaWebVisible) return "verify";
    if (active && !flcaVerificationDone) return "authenticating";
    if (flcaVerificationDone && active) return "verifyProgress";
    return "authenticating";
  }, [captchaWebVisible, flcaVerificationDone, active]);

  const syncProgressPhase: FlicaSyncProgressPhase = useMemo(() => {
    if (presentationPanel === "authenticating") return "signin";
    return "verify";
  }, [presentationPanel]);

  const presentationStatusLines = useMemo(
    () => ({
      contact: active,
      verified: flcaVerificationDone,
      opening: false,
      importing: false,
    }),
    [active, flcaVerificationDone],
  );

  const splitPresentationMaxHeight = useMemo(
    () => Math.min(Math.round(Dimensions.get("window").height * 0.52), insets.top + 420),
    [insets.top],
  );

  const webVerificationActive = captchaWebVisible && !flcaVerificationDone;

  const fuseBottomToWebChrome = splitForCaptchaPanel && presentationPanel === "verify";

  /** Tab content already sits below `CrewScheduleHeader` safe area — match full-screen import spacing. */
  const underTabsPresentationTop = 10;
  const flicaWvTopInset = underTabsPresentationTop + 48;

  const webViewOpacity = captchaWebVisible && !hideWebForSync && !postCaptchaFired ? 1 : 0;
  const webPointerEvents =
    captchaWebVisible && !hideWebForSync && !postCaptchaFired ? ("auto" as const) : ("none" as const);

  if (!active) return null;

  if (credsLoading || !flicaUrls) {
    return (
      <View style={styles.loadingHost} pointerEvents="box-none">
        <ActivityIndicator color={T.accent} />
      </View>
    );
  }

  if (!canSync) {
    return null;
  }

  return (
    <ImportController
      webLayer={
        <View style={styles.wvHost} pointerEvents="box-none">
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                paddingTop: flicaWvTopInset,
                opacity: webViewOpacity,
              },
            ]}
            pointerEvents={webPointerEvents}
            collapsable={false}
          >
            <WebView
              key={webViewKey}
              ref={webViewRef}
              source={{ uri: flicaUrls.ORIGIN }}
              style={styles.web}
              userAgent={FLICA_CONSTANTS.USER_AGENT}
              injectedJavaScriptBeforeContentLoaded={FLICA_POC_INJECT_BEFORE_CONTENT}
              onLoadStart={() => {
                webLoadPassRef.current += 1;
              }}
              onLoadEnd={onLoadEnd}
              onLoadProgress={onLoadProgress}
              onNavigationStateChange={onNavigation}
              onMessage={onMessage}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              originWhitelist={["https://*", "http://*"]}
              setSupportMultipleWindows={false}
              {...(Platform.OS === "android" ? { mixedContentMode: "compatibility" as const } : {})}
              cacheEnabled={false}
            />
          </View>
        </View>
      }
      overlayLayer={
        <ImportWrapperOverlay
          visible
          fullScreenCover={importFullScreenCover}
          topInset={underTabsPresentationTop}
          splitPresentationMaxHeight={splitForCaptchaPanel ? splitPresentationMaxHeight : undefined}
          onClosePress={() => {
            stopSession();
            onError("FLICA refresh cancelled.");
          }}
          presentation={
            <FlicaSyncPresentationLayer
              panel={presentationPanel}
              progressPhase={syncProgressPhase}
              overlayMessage={overlayMessage || purposeLabel}
              statusLines={presentationStatusLines}
              importMilestones={{ parsing: false, totals: false, hotels: false, crew: false }}
              importProgressPct={0}
              importStageLabel={overlayMessage.trim() || purposeLabel}
              errorMessage={null}
              success={null}
              fuseBottomToWebChrome={fuseBottomToWebChrome}
              webVerificationActive={webVerificationActive}
              presentationLayoutOrigin="underCrewTabs"
              onOpenSchedule={() => {}}
              onViewImported={() => {}}
              onRetryError={() => {}}
            />
          }
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  loadingHost: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 200,
    elevation: 200,
  },
  wvHost: { ...StyleSheet.absoluteFillObject, zIndex: 20, elevation: 20 },
  web: { flex: 1, backgroundColor: "#fff" },
});
