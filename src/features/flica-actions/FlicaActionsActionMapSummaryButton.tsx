import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  NativeModules,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
} from "react-native";
import { colors, radius, spacing } from "../../styles/theme";
import { summarizeActionMapForDev } from "./flicaActionsActionMap";

function nativeExpoClipboardLinked(): boolean {
  if (Platform.OS === "web") return false;
  const mod = (NativeModules as Record<string, unknown>).ExpoClipboard;
  return mod != null && typeof mod === "object";
}

async function tryCopyToClipboard(text: string): Promise<boolean> {
  if (Platform.OS === "web") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  if (nativeExpoClipboardLinked()) {
    try {
      const { setStringAsync } = require("expo-clipboard") as {
        setStringAsync: (s: string) => Promise<void>;
      };
      await setStringAsync(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Dev control: log + copy (or share) the FLICA Actions action map summary.
 */
export function FlicaActionsActionMapSummaryButton() {
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    setBusy(true);
    try {
      const body = summarizeActionMapForDev();
      console.log("[FLICA Action Map Summary]\n", body);
      const copied = await tryCopyToClipboard(body);
      if (copied) {
        Alert.alert(
          "Action Map Summary",
          "Copied to clipboard. Full text was also printed to the Metro / dev console.",
        );
      } else {
        try {
          await Share.share({
            message: body.slice(0, 118_000),
            title: "FLICA Action Map",
          });
        } catch {
          /* user dismissed share sheet */
        }
        Alert.alert(
          "Action Map Summary",
          "Clipboard unavailable in this build: opened the share sheet if possible. Full text printed to the console.",
        );
      }
    } catch (e) {
      Alert.alert(
        "Action Map Summary",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      style={[styles.btn, busy && styles.btnDisabled]}
      onPress={onPress}
      disabled={busy}
    >
      {busy ? (
        <ActivityIndicator size="small" color="#1565c0" />
      ) : (
        <Text style={styles.btnText}>Action Map Summary</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#1565c0",
    backgroundColor: colors.cardBg,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { fontSize: 11, fontWeight: "600", color: "#1565c0" },
});
