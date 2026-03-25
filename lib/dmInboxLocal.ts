import AsyncStorage from '@react-native-async-storage/async-storage';

const archivedKey = (userId: string) => `fc_dm_inbox_archived_v1:${userId}`;
const deletedKey = (userId: string) => `fc_dm_inbox_deleted_v1:${userId}`;

async function readIdSet(key: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x) => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

async function writeIdSet(key: string, set: Set<string>): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify([...set]));
}

/** Device-local only: hides threads from the inbox list (not server archive). */
export async function loadArchivedConversationIds(userId: string): Promise<Set<string>> {
  return readIdSet(archivedKey(userId));
}

/** Device-local only: stronger hide; same effect as archive in UI until server delete exists. */
export async function loadDeletedConversationIds(userId: string): Promise<Set<string>> {
  return readIdSet(deletedKey(userId));
}

export async function addArchivedConversationId(userId: string, conversationId: string): Promise<void> {
  const s = await loadArchivedConversationIds(userId);
  s.add(conversationId);
  await writeIdSet(archivedKey(userId), s);
}

export async function removeArchivedConversationId(userId: string, conversationId: string): Promise<void> {
  const s = await loadArchivedConversationIds(userId);
  s.delete(conversationId);
  await writeIdSet(archivedKey(userId), s);
}

export async function addDeletedConversationId(userId: string, conversationId: string): Promise<void> {
  const s = await loadDeletedConversationIds(userId);
  s.add(conversationId);
  await writeIdSet(deletedKey(userId), s);
}

export async function getMergedHiddenConversationIds(userId: string): Promise<Set<string>> {
  const a = await loadArchivedConversationIds(userId);
  const d = await loadDeletedConversationIds(userId);
  return new Set([...a, ...d]);
}
