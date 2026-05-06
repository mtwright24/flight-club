import { Platform, type TextStyle } from "react-native";

/**
 * Same font stack as TripDetailScreen **stats card values** (`STATS_VALUE_FONT` → `detailStyles.statsValue`):
 * iOS **Menlo**, Android/default **monospace** — aviation-style digits.
 *
 * Use only on **numeric** schedule UI (day-of-month, duty times, block/credit strings), not pairing letters.
 */
export const PAIRING_DETAIL_STAT_DIGIT_TYPE = Platform.select<TextStyle>({
  ios: { fontFamily: "Menlo" },
  android: { fontFamily: "monospace" },
  default: { fontFamily: "monospace" },
});

/** Letter spacing from `TripDetailScreen` `statsValue` — pair with digit type when sizes are similar. */
export const PAIRING_DETAIL_STAT_DIGIT_TRACKING: TextStyle = {
  letterSpacing: -0.45,
};
