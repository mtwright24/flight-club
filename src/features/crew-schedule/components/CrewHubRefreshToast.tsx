import React, { useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

export type CrewHubRefreshToastProps = {
  message: string;
  visible: boolean;
  onDismiss: () => void;
};

/** Small non-blocking top toast (green) for crew hub refresh confirmation. */
export function CrewHubRefreshToast({ message, visible, onDismiss }: CrewHubRefreshToastProps) {
  useEffect(() => {
    if (!visible || !message) return;
    const t = setTimeout(onDismiss, 1800);
    return () => clearTimeout(t);
  }, [visible, message, onDismiss]);

  if (!visible || !message) return null;

  return (
    <View
      style={[styles.wrap, { top: Platform.OS === "ios" ? 52 : 36 }]}
      pointerEvents="none"
    >
      <View style={styles.pill}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    alignItems: "center",
    zIndex: 50,
  },
  pill: {
    backgroundColor: "#15803d",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  text: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
});
