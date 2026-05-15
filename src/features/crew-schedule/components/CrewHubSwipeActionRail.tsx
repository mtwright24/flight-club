import React from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SCHEDULE_MOCK_HEADER_RED } from "../scheduleMockPalette";

/**
 * Swipeable `renderRightActions` content: pill buttons that stagger in with swipe progress
 * (RNGH passes `progress` 0→1 as the row opens left).
 */
export type CrewHubSwipeRailAction = {
  key: string;
  label: string;
  onPress: () => void;
  /** primary = red CTA, secondary = slate, accent = green (e.g. Add on Open Time) */
  variant: "primary" | "secondary" | "accent";
};

type Props = {
  progress: Animated.AnimatedInterpolation<number>;
  actions: CrewHubSwipeRailAction[];
};

/** RNGH measures swipe distance from this width — must cover longest pill label. */
const SWIPE_RAIL_PAD_H = 6 + 12;
const SWIPE_PILL_GAP = 10;
const SWIPE_PILL_SLOT_W = 138;

function swipeRailWidthPx(actionCount: number): number {
  const n = Math.max(actionCount, 1);
  return Math.ceil(SWIPE_RAIL_PAD_H + n * SWIPE_PILL_SLOT_W + SWIPE_PILL_GAP * Math.max(n - 1, 0));
}

export function CrewHubSwipeActionRail({ progress, actions }: Props) {
  const n = Math.max(actions.length, 1);
  const railWidth = swipeRailWidthPx(actions.length);
  return (
    <View style={[styles.rail, { width: railWidth }]}>
      {actions.map((a, i) => {
        const denom = Math.max(n - 1, 1);
        const tStart = (i / n) * 0.12;
        const tFull = 0.28 + (i / denom) * 0.42;
        const opacity = progress.interpolate({
          inputRange: [0, tStart, tFull, 1],
          outputRange: [0, 0, 1, 1],
          extrapolate: "clamp",
        });
        const scale = progress.interpolate({
          inputRange: [0, tStart, tFull, 1],
          outputRange: [0.72, 0.88, 1, 1],
          extrapolate: "clamp",
        });
        const translateX = progress.interpolate({
          inputRange: [0, tStart, tFull],
          outputRange: [14, 5, 0],
          extrapolate: "clamp",
        });
        const bg =
          a.variant === "primary"
            ? styles.pillPrimary
            : a.variant === "accent"
              ? styles.pillAccent
              : styles.pillSecondary;
        return (
          <Animated.View
            key={a.key}
            style={[styles.pillOuter, { opacity, transform: [{ translateX }, { scale }] }]}
          >
            <Pressable style={[styles.pill, bg]} onPress={a.onPress}>
              <Text style={styles.pillTxt}>{a.label}</Text>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * Do not use flex:1 — RNGH Swipeable measures right-panel width from this view.
   * A full-width rail forces a near full-row swipe before progress reaches 1.
   */
  rail: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    alignSelf: "stretch",
    paddingLeft: 6,
    paddingRight: 12,
    gap: 10,
    minHeight: 56,
    backgroundColor: "transparent",
  },
  pillOuter: {
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  pill: {
    minWidth: 78,
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#0c0a09",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: 5,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  pillPrimary: {
    backgroundColor: SCHEDULE_MOCK_HEADER_RED,
  },
  pillSecondary: {
    backgroundColor: "#475569",
  },
  pillAccent: {
    backgroundColor: "#15803d",
  },
  pillTxt: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
});
