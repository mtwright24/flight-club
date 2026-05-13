import React, { useCallback, useMemo, useState } from "react";
import { Alert, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";

import type { FlicaCrewHubParseDebugPayload } from "../flicaCrewHubParseDebug";
import {
  formatCrewHubParseDebugPayload,
  getOpenTimeParseDebugSnapshot,
  getTradeboardParseDebugSnapshot,
  pickDebugFetchEntry,
} from "../flicaCrewHubParseDebug";

type Props = {
  title: string;
  payload: FlicaCrewHubParseDebugPayload | null;
  /** Named fetch used for the on-screen metrics block (e.g. "All Requests", "Open Time Pot"). */
  metricsSourceName: string;
};

function dash(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s.length ? s : "—";
}

/** Dev panel export: no `expo-clipboard` — dynamic import still loads native bindings and crashes when ExpoClipboard is absent from the dev client. */
async function shareParseDebugText(text: string, label: string): Promise<void> {
  if (
    Platform.OS === "web" &&
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      Alert.alert("Copied", `${label} parse debug copied to clipboard.`);
      return;
    } catch {
      /* fall through to Share on web if clipboard blocked */
    }
  }
  try {
    await Share.share({ message: text, title: `${label} parse debug` });
  } catch (e) {
    Alert.alert("Share failed", e instanceof Error ? e.message : String(e));
  }
}

export function FlicaCrewHubParseDebugPanel({ title, payload, metricsSourceName }: Props) {
  const [busy, setBusy] = useState(false);

  const m = useMemo(
    () => pickDebugFetchEntry(payload, metricsSourceName),
    [payload, metricsSourceName],
  );

  const copySnapshot = useCallback(async (label: string, get: () => FlicaCrewHubParseDebugPayload | null) => {
    const p = get();
    if (!p?.fetches?.length) {
      Alert.alert("Nothing to copy", `${label}: refresh this tab (or Tradeboard / Open Time) first.`);
      return;
    }
    setBusy(true);
    try {
      const text = formatCrewHubParseDebugPayload(p);
      await shareParseDebugText(text, label);
    } catch (e) {
      Alert.alert("Copy failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const lines: string[] = [];
  if (payload) {
    lines.push(`refreshedAt: ${payload.refreshedAt}`);
    lines.push(`reason: ${payload.loadReason}`);
    if (payload.note) lines.push(`note: ${payload.note}`);
    for (const f of payload.fetches) {
      lines.push(
        `${f.name}: preRows=${f.preMapperRowCount} postMapped=${f.postMapperCount} ok=${f.ok} state=${f.htmlState}`,
      );
    }
  } else {
    lines.push("No tab capture yet — pull to refresh or focus tab.");
  }

  return (
    <View style={styles.wrap} accessibilityLabel="Parse debug inspector">
      <Text style={styles.banner}>TEMP DEBUG — red box</Text>
      <Text style={styles.title}>{title}</Text>

      <Text style={styles.metricsHead}>On-screen metrics ({metricsSourceName})</Text>
      <Text style={styles.metricLine} selectable>
        htmlState: {dash(m?.htmlState)}
      </Text>
      <Text style={styles.metricLine} selectable>
        pageTitle: {dash(m?.pageTitle)}
      </Text>
      <Text style={styles.metricLine} selectable>
        htmlLength: {dash(m?.htmlLength)}
      </Text>
      <Text style={styles.metricLine} selectable>
        rawRowsBeforeFilter: {dash(m?.preMapperRowCount)}
      </Text>
      <Text style={styles.metricLine} selectable>
        mappedRowsAfterFilter: {dash(m?.postMapperCount)}
      </Text>
      <Text style={styles.metricLine} selectable>
        requestedUrl: {dash(m?.requestedUrl)}
      </Text>
      <Text style={styles.metricLine} selectable>
        finalUrl: {dash(m?.finalUrl)}
      </Text>

      {lines.map((line, i) => (
        <Text key={`s-${i}`} style={styles.line} selectable>
          {line}
        </Text>
      ))}

      <View style={styles.btnRow}>
        <Pressable
          style={[styles.btn, busy && styles.btnDisabled]}
          onPress={() => void copySnapshot("Tradeboard", getTradeboardParseDebugSnapshot)}
          disabled={busy}
        >
          <Text style={styles.btnText}>{busy ? "…" : "COPY TRADEBOARD DEBUG"}</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, busy && styles.btnDisabled]}
          onPress={() => void copySnapshot("Open Time", getOpenTimeParseDebugSnapshot)}
          disabled={busy}
        >
          <Text style={styles.btnText}>{busy ? "…" : "COPY OPEN TIME DEBUG"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: "#dc2626",
    backgroundColor: "#fef2f2",
  },
  banner: {
    fontSize: 10,
    fontWeight: "900",
    color: "#991b1b",
    marginBottom: 4,
  },
  title: {
    fontSize: 11,
    fontWeight: "800",
    color: "#7f1d1d",
    marginBottom: 6,
  },
  metricsHead: {
    fontSize: 10,
    fontWeight: "800",
    color: "#991b1b",
    marginTop: 4,
    marginBottom: 4,
  },
  metricLine: {
    fontSize: 10,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#450a0a",
    marginBottom: 3,
  },
  line: {
    fontSize: 9,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#7f1d1d",
    marginTop: 2,
  },
  btnRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  btn: {
    flex: 1,
    minWidth: 130,
    backgroundColor: "#b91c1c",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: "#fff", fontSize: 10, fontWeight: "900", textAlign: "center" },
});
