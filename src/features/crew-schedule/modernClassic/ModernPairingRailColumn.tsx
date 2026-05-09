/**
 * Modern Calendar List only: thin vertical “pairing rail” between date column and body.
 * Bridge segments above/below the card are rendered by the list row (absolute overlays).
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import type { ModernPairingRailPosition } from "./modernPairingRailLayout";

const SLOT_W = 10;
const LINE_W = 3;
const CAP_R = 4;

type Props = {
  color: string;
  railPosition: ModernPairingRailPosition;
};

/**
 * Vertical spine inside the day card only (caps + line). Bridges use the same `LINE_W` / X center as slot.
 */
export function ModernPairingRailColumn({ color, railPosition }: Props) {
  const topCap = railPosition === "single" || railPosition === "start";
  const bottomCap = railPosition === "single" || railPosition === "end";

  return (
    <View style={styles.slot} pointerEvents="none">
      {topCap ? (
        <View style={[styles.cap, { backgroundColor: color }]} />
      ) : (
        <View style={styles.lineJoinTop}>
          <View style={[styles.lineCore, { backgroundColor: color }]} />
        </View>
      )}
      <View style={styles.lineStretch}>
        <View style={[styles.lineCore, { backgroundColor: color, flex: 1 }]} />
      </View>
      {bottomCap ? (
        <View style={[styles.cap, { backgroundColor: color }]} />
      ) : (
        <View style={styles.lineJoinBottom}>
          <View style={[styles.lineCore, { backgroundColor: color }]} />
        </View>
      )}
    </View>
  );
}

/** Bridge line for gaps above/below the card (week headers, tile margins). */
export function ModernPairingRailBridge({
  color,
  height,
}: {
  color: string;
  height: number;
}) {
  if (height <= 0) return null;
  return (
    <View style={[styles.bridge, { height }]} pointerEvents="none">
      <View style={[styles.lineCore, { backgroundColor: color, flex: 1 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    width: SLOT_W,
    alignSelf: "stretch",
    alignItems: "center",
    overflow: "visible",
  },
  cap: {
    width: CAP_R * 2,
    height: CAP_R * 2,
    borderRadius: CAP_R,
  },
  lineJoinTop: {
    width: SLOT_W,
    height: CAP_R,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  lineJoinBottom: {
    width: SLOT_W,
    height: CAP_R,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  lineStretch: {
    width: SLOT_W,
    flex: 1,
    minHeight: 6,
    alignItems: "center",
  },
  lineCore: {
    width: LINE_W,
    minHeight: LINE_W,
    alignSelf: "center",
  },
  bridge: {
    width: SLOT_W,
    alignItems: "center",
    overflow: "visible",
  },
});
