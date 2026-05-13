import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FlicaActionsWebView from "../../src/features/flica-actions/FlicaActionsWebView";
import { colors } from "../../src/styles/theme";

export default function CrewScheduleFlicaWebScreen() {
  const router = useRouter();
  const { uri } = useLocalSearchParams<{ uri?: string }>();
  const raw = typeof uri === "string" ? uri : Array.isArray(uri) ? uri[0] : "";
  const decoded = raw ? decodeURIComponent(raw) : "";

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backHit}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.cardBg} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          FLICA
        </Text>
        <View style={styles.backHit} />
      </SafeAreaView>
      <FlicaActionsWebView variant="embedded" initialUri={decoded || undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: colors.headerRed,
  },
  backHit: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  title: {
    flex: 1,
    textAlign: "center",
    color: colors.cardBg,
    fontSize: 16,
    fontWeight: "700",
  },
});
