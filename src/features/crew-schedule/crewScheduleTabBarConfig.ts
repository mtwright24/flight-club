import { useWindowDimensions } from "react-native";

/**
 * Option A: show Alerts in the crew bottom tab bar (6 tabs).
 * Option B (narrower widths): hide Alerts from the tab bar (5 tabs) and surface Alerts from Manage.
 */
export const CREW_SCHEDULE_SIX_TAB_MIN_WIDTH_DP = 390;

export function useCrewScheduleSixTabBarLayout(): boolean {
  const { width } = useWindowDimensions();
  return width >= CREW_SCHEDULE_SIX_TAB_MIN_WIDTH_DP;
}
