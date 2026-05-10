/**
 * Modern Calendar List only: thin vertical “pairing rail” between date column and body.
 * Bridge segments above/below the card are rendered by the list row (absolute overlays).
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import type { ModernPairingRailPosition } from "./modernPairingRailLayout";

const BRIDGE_SLOT_W = 10;
const COLUMN_SLOT_W = BRIDGE_SLOT_W;
const LINE_W = 3;
const CAP_R = 5;

type Props = {
  color: string;
  railPosition: ModernPairingRailPosition;
  suppressTopCap?: boolean;
  suppressBottomCap?: boolean;
  centerBottomCapInGap?: boolean;
};

/**
 * Vertical spine inside the day card. Dot caps are centered on the card edge,
 * not laid out inside the tile body.
 */
export function ModernPairingRailColumn({
  color,
  railPosition,
  suppressTopCap = false,
  suppressBottomCap = false,
  centerBottomCapInGap = false,
}: Props) {
  const topCap =
    (railPosition === "single" || railPosition === "start") && !suppressTopCap;
  const bottomCap =
    (railPosition === "single" || railPosition === "end") && !suppressBottomCap;

  return (
    <View style={styles.slot} pointerEvents="none">
      <View style={[styles.lineFill, { backgroundColor: color }]} />
      {topCap ? (
        <View style={[styles.cap, styles.capTop, { backgroundColor: color }]} />
      ) : null}
      {bottomCap ? (
        <View
          style={[
            styles.cap,
            centerBottomCapInGap ? styles.capBottomInGap : styles.capBottom,
            { backgroundColor: color },
          ]}
        />
      ) : null}
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
    width: COLUMN_SLOT_W,
    marginLeft: -COLUMN_SLOT_W / 2,
    marginRight: -COLUMN_SLOT_W / 2,
    alignSelf: "stretch",
    alignItems: "center",
    overflow: "visible",
    position: "relative",
    zIndex: 5,
    elevation: 5,
  },
  cap: {
    position: "absolute",
    left: (COLUMN_SLOT_W - CAP_R * 2) / 2,
    width: CAP_R * 2,
    height: CAP_R * 2,
    borderRadius: CAP_R,
    zIndex: 2,
  },
  capTop: {
    top: -(CAP_R * 2),
  },
  capBottom: {
    bottom: -(CAP_R * 2),
  },
  capBottomInGap: {
    bottom: -(CAP_R * 2 + 3),
  },
  lineCore: {
    width: LINE_W,
    minHeight: LINE_W,
    alignSelf: "center",
  },
  lineFill: {
    position: "absolute",
    top: -(CAP_R * 2),
    bottom: -(CAP_R * 2),
    width: LINE_W,
    minHeight: LINE_W,
    alignSelf: "center",
    zIndex: 1,
  },
  bridge: {
    width: BRIDGE_SLOT_W,
    alignItems: "center",
    overflow: "visible",
  },
});
