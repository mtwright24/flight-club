import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'staff_loads_recent_searches_v1';
const MAX = 12;

export type StaffLoadRecentSearch = {
  from: string;
  to: string;
  date: string;
  savedAt: string;
};

function norm(s: string) {
  return (s || '').trim().toUpperCase();
}

export async function loadStaffLoadRecentSearches(): Promise<StaffLoadRecentSearch[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StaffLoadRecentSearch[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r?.from && r?.to && r?.date);
  } catch {
    return [];
  }
}

export async function persistStaffLoadRecentSearch(entry: { from: string; to: string; date: string }): Promise<void> {
  const from = norm(entry.from);
  const to = norm(entry.to);
  const date = (entry.date || '').trim();
  if (!from || !to || !date) return;
  const prev = await loadStaffLoadRecentSearches();
  const nextRow: StaffLoadRecentSearch = { from, to, date, savedAt: new Date().toISOString() };
  const deduped = prev.filter((r) => !(norm(r.from) === from && norm(r.to) === to && r.date === date));
  const next = [nextRow, ...deduped].slice(0, MAX);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
