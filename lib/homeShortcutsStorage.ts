import AsyncStorage from '@react-native-async-storage/async-storage';
import { toolsRegistry } from './toolsRegistry';

const storageKey = (userId: string) => `fc_home_tool_shortcuts_v1:${userId}`;

/** Default tool shortcuts when none saved (per user, device-local). */
export const DEFAULT_HOME_TOOL_SHORTCUT_IDS: readonly string[] = [
  'crew-tools',
  'notifications',
  'messages',
  'crew-rooms',
  'social-feed',
  'crew-exchange',
] as const;

const validToolIds = new Set(toolsRegistry.map((t) => t.id));

export async function getHomeToolShortcutIds(userId: string | null | undefined): Promise<string[]> {
  if (!userId) return [...DEFAULT_HOME_TOOL_SHORTCUT_IDS];
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return [...DEFAULT_HOME_TOOL_SHORTCUT_IDS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_HOME_TOOL_SHORTCUT_IDS];
    const filtered = parsed.filter((id): id is string => typeof id === 'string' && validToolIds.has(id));
    return filtered.length > 0 ? filtered : [...DEFAULT_HOME_TOOL_SHORTCUT_IDS];
  } catch {
    return [...DEFAULT_HOME_TOOL_SHORTCUT_IDS];
  }
}

export async function setHomeToolShortcutIds(userId: string, ids: string[]): Promise<void> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' || !validToolIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
    if (unique.length >= 12) break;
  }
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(unique));
}

export const MAX_HOME_TOOL_SHORTCUTS = 8;
