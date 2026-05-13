import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { FLICA_ACTIONS_URLS } from "../../flica-actions/flicaActionsHttp";
import FlicaActionsWebView from "../../flica-actions/FlicaActionsWebView";
import { logCrewHubAuth } from "../crewHubFlicaAuthGate";

const winH = Dimensions.get("window").height;

export type FlicaMiniCaptchaSheetProps = {
  visible: boolean;
  purposeLabel: string;
  onReady: () => void;
  /** Only when the user explicitly cancels (not backdrop tap). */
  onUserCancel: () => void;
};

/**
 * Compact bottom sheet with FLICA WebView for captcha / login during crew-hub refresh.
 * Loads the same mainmenu?LoadSchedule entry URL used by working schedule sync (not bare origin).
 */
export function FlicaMiniCaptchaSheet({
  visible,
  purposeLabel,
  onReady,
  onUserCancel,
}: FlicaMiniCaptchaSheetProps) {
  const [wvKey, setWvKey] = useState(0);

  useEffect(() => {
    if (visible) setWvKey((k) => k + 1);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onUserCancel}
    >
      <View style={styles.root} pointerEvents="box-none">
        <View style={styles.dim} pointerEvents="none" />
        <View style={[styles.sheet, { height: Math.round(winH * 0.58) }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.title} numberOfLines={2}>
              {purposeLabel}
            </Text>
            <Pressable
              onPress={onUserCancel}
              hitSlop={12}
              accessibilityLabel="Cancel verification"
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={styles.sub}>
            Sign in or complete verification in FLICA. This sheet closes when the session is ready.
          </Text>
          <View style={styles.webWrap}>
            <FlicaActionsWebView
              key={wvKey}
              variant="embedded"
              hideEmbeddedChrome
              initialUri={FLICA_ACTIONS_URLS.MAIN_MENU_LOAD_SCHEDULE}
              onSessionReady={() => {
                logCrewHubAuth("cookies_captured_after_webview", {
                  entry: "MAIN_MENU_LOAD_SCHEDULE",
                });
                onReady();
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
    overflow: "hidden",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  cancelBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563eb",
  },
  sub: {
    fontSize: 11,
    color: "#6b7280",
    marginBottom: 8,
  },
  webWrap: {
    flex: 1,
    minHeight: 200,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
});
