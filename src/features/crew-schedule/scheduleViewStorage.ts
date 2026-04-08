import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ScheduleViewMode } from './types';
import { DEFAULT_SCHEDULE_VIEW } from './types';

const KEY_VIEW = '@flightclub/crew_schedule_view_mode';
const KEY_TAB = '@flightclub/crew_schedule_last_tab';
const KEY_MONTH = '@flightclub/crew_schedule_last_month';

export async function loadScheduleViewMode(): Promise<ScheduleViewMode> {
  try {
    const v = await AsyncStorage.getItem(KEY_VIEW);
    if (v === 'classic' || v === 'calendar' || v === 'smart') return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_SCHEDULE_VIEW;
}

export async function saveScheduleViewMode(mode: ScheduleViewMode): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_VIEW, mode);
  } catch {
    /* ignore */
  }
}

export type CrewScheduleTabName = 'index' | 'tradeboard' | 'trip-chat' | 'manage' | 'alerts';

export async function loadLastTab(): Promise<CrewScheduleTabName | null> {
  try {
    const v = await AsyncStorage.getItem(KEY_TAB);
    if (v === 'hotels') return 'manage';
    if (
      v === 'index' ||
      v === 'tradeboard' ||
      v === 'trip-chat' ||
      v === 'manage' ||
      v === 'alerts'
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function saveLastTab(tab: CrewScheduleTabName): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_TAB, tab);
  } catch {
    /* ignore */
  }
}

export async function loadLastMonthCursor(): Promise<{ year: number; month: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_MONTH);
    if (!raw) return null;
    const j = JSON.parse(raw) as { year?: number; month?: number };
    if (typeof j.year === 'number' && typeof j.month === 'number' && j.month >= 1 && j.month <= 12) {
      return { year: j.year, month: j.month };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function saveLastMonthCursor(year: number, month: number): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_MONTH, JSON.stringify({ year, month }));
  } catch {
    /* ignore */
  }
}
