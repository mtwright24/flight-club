import { supabase } from '../src/lib/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toolsRegistry, ToolEntry } from './toolsRegistry';

export type SearchItemType = 'person' | 'post' | 'room' | 'tool';

export type SearchResultItem = {
  type: SearchItemType;
  id: string;
  title: string;
  subtitle?: string | null;
  route: string;
  avatarUrl?: string | null;
  meta?: string | null;
  isLive?: boolean;
  iconName?: string;
};

export type RecentSearchItem = {
  type: SearchItemType;
  id: string;
  title: string;
  route: string;
  timestamp: number;
};

export type SearchAllResult = {
  people: SearchResultItem[];
  posts: SearchResultItem[];
  rooms: SearchResultItem[];
  tools: SearchResultItem[];
};

/**
 * DB / RLS sanity checks – run these in the Supabase SQL editor.
 *
 * A) Confirm profiles table + columns
 *   SELECT column_name, data_type
 *   FROM information_schema.columns
 *   WHERE table_schema = 'public' AND table_name = 'profiles'
 *   ORDER BY ordinal_position;
 *
 * B) Confirm the signed-in user has a profile row
 *   SELECT id, display_name, username
 *   FROM public.profiles
 *   WHERE id = auth.uid();
 *
 * C) Confirm RLS + SELECT policy on profiles
 *   SELECT *
 *   FROM pg_policies
 *   WHERE schemaname = 'public' AND tablename = 'profiles';
 *
 * If SELECT is blocked or missing, apply this migration:
 *
 *   ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
 *
 *   DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
 *   CREATE POLICY "Profiles are viewable by authenticated users"
 *   ON public.profiles
 *   FOR SELECT
 *   TO authenticated
 *   USING (true);
 *
 * NOTE: These statements must be run directly in Supabase; this client code
 * cannot execute or inspect them at build time.
 */

/** Strip characters that break PostgREST `.or()` / `ilike` filters or act as wildcards. */
function sanitizeIlikeTerm(raw: string): string {
  return raw
    .replace(/\\/g, '')
    .replace(/%/g, '')
    .replace(/_/g, '')
    .replace(/,/g, '')
    .trim();
}

function isMissingTableOrColumnError(error: any): boolean {
  if (!error) return false;
  const code = (error as any).code;
  const message = String((error as any).message || '');
  // PGRST205: missing table. 42703: undefined_column (column does not exist).
  return (
    code === 'PGRST205' ||
    code === '42703' ||
    message.includes("Could not find the table") ||
    message.includes('does not exist')
  );
}

// Last raw error message seen by searchPeople; surfaced in the Search screen
// debug panel to distinguish "no results" from RLS / query issues.
let lastSearchPeopleError: string | null = null;

export function getLastSearchPeopleError(): string | null {
  return lastSearchPeopleError;
}

async function maybeIncludeCurrentUser(
  results: SearchResultItem[],
  query: string
): Promise<SearchResultItem[]> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const currentUserId = auth?.user?.id as string | undefined;
    if (!currentUserId) return results;

    const q = query.trim().toLowerCase();
    if (!q) return results;

    // If user is already in results, nothing to do.
    if (results.some((r) => r.type === 'person' && r.id === currentUserId)) {
      return results;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, handle, display_name, full_name, first_name, base, airline, role, avatar_url')
      .eq('id', currentUserId)
      .maybeSingle();

    if (error || !profile) return results;

    const displayName: string =
      profile.display_name || profile.full_name || profile.first_name || '';
    const nameLower = displayName.toLowerCase();

    // Only inject current user if the query clearly targets their name/handle.
    const handle: string | null = profile.handle || null;
    const handleLower = handle ? `@${handle}`.toLowerCase() : '';

    const matchesName = nameLower.includes(q);
    const matchesHandle = handleLower && handleLower.includes(q);

    if (!matchesName && !matchesHandle) return results;

    const metaParts: string[] = [];
    if (handle) metaParts.push(`@${handle}`);
    if (profile.role) metaParts.push(profile.role);
    if (profile.base) metaParts.push(profile.base);
    if (profile.airline) metaParts.push(profile.airline);

    const selfItem: SearchResultItem = {
      type: 'person',
      id: profile.id,
      title: displayName || 'Crew member',
      subtitle: metaParts.join(' • ') || null,
      route: `/user/${profile.id}`,
      avatarUrl: profile.avatar_url || null,
      meta: null,
    };

    return [selfItem, ...results];
  } catch {
    return results;
  }
}
export async function searchPeople(query: string, limit = 25): Promise<SearchResultItem[]> {
  const q = query.trim();
  if (!q) {
    lastSearchPeopleError = null;
    return [];
  }

  // Detect UUID-style exact ID search
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuidSearch = uuidRegex.test(q);

  try {
    let data: any[] | null = null;

    if (isUuidSearch) {
      const byIdWithHandle = await supabase
        .from('profiles')
        .select('id, display_name, username, handle, avatar_url, base, airline, role')
        .eq('id', q)
        .limit(limit);

      let byIdRes: { data: any[] | null; error: any } = byIdWithHandle;
      if (byIdWithHandle.error) {
        const msg = String(byIdWithHandle.error.message || '');
        if (msg.includes('handle') || (byIdWithHandle.error as any)?.code === '42703') {
          byIdRes = await supabase
            .from('profiles')
            .select('id, display_name, username, avatar_url, base, airline, role')
            .eq('id', q)
            .limit(limit);
        }
      }

      const { data: byId, error } = byIdRes;
      if (error) {
        lastSearchPeopleError = String(error.message || error);
        console.error('[searchPeople] Supabase error (id search)', error);
        return [];
      }
      data = byId || [];
    } else {
      const safe = sanitizeIlikeTerm(q);
      if (!safe) {
        lastSearchPeopleError = null;
        return [];
      }
      const ilike = `%${safe}%`;

      const tryWithHandle = async () =>
        supabase
          .from('profiles')
          .select('id, display_name, username, handle, avatar_url, base, airline, role')
          .or(
            [
              `display_name.ilike.${ilike}`,
              `username.ilike.${ilike}`,
              `handle.ilike.${ilike}`,
            ].join(',')
          )
          .order('display_name', { ascending: true })
          .limit(limit);

      const textWithHandle = await tryWithHandle();
      let textRes: { data: any[] | null; error: any } = textWithHandle;
      if (textWithHandle.error) {
        const msg = String(textWithHandle.error.message || '');
        if (msg.includes('handle') || (textWithHandle.error as any)?.code === '42703') {
          textRes = await supabase
            .from('profiles')
            .select('id, display_name, username, avatar_url, base, airline, role')
            .or([`display_name.ilike.${ilike}`, `username.ilike.${ilike}`].join(','))
            .order('display_name', { ascending: true })
            .limit(limit);
        }
      }

      const { error } = textRes;
      if (error) {
        lastSearchPeopleError = String(error.message || error);
        console.error('[searchPeople] Supabase error (text search)', error);
        return [];
      }
      data = textRes.data || [];
    }

    lastSearchPeopleError = null;

    const mapped = (data || []).map((row: any): SearchResultItem => {
      const displayName: string | null = row.display_name || null;
      const username: string | null = row.username || null;
      const handle: string | null = row.handle || null;
      const handleStr = handle || username;

      const title = displayName || handleStr || 'Crew member';
      const subtitle = handleStr ? `@${handleStr}` : null;

      return {
        type: 'person',
        id: row.id,
        title,
        subtitle,
        route: `/user/${row.id}`,
        avatarUrl: row.avatar_url || null,
        meta: null,
      };
    });

    return await maybeIncludeCurrentUser(mapped, q);
  } catch (error: any) {
    lastSearchPeopleError = String(error?.message || error);
    console.error('[searchPeople] Unexpected error', error);
    return [];
  }
}

/**
 * Helper to ensure the current authenticated user always has a row in
 * public.profiles. Wire this into your auth flow or app start if you find
 * missing profile rows when running the SQL checks above.
 */
export async function upsertProfileForCurrentUser(): Promise<void> {
  try {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth?.user) {
      if (authError) {
        console.error('[upsertProfileForCurrentUser] auth error', authError);
      }
      return;
    }

    const user = auth.user;
    const metadata: any = user.user_metadata || {};
    const displayName: string =
      metadata.full_name || metadata.name || user.email || 'Crew member';
    const username: string | null = metadata.username || null;

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          display_name: displayName,
          username,
        },
        { onConflict: 'id' }
      );

    if (error) {
      console.error('[upsertProfileForCurrentUser] upsert error', error);
    }
  } catch (error) {
    console.error('[upsertProfileForCurrentUser] unexpected error', error);
  }
}

export async function searchPosts(query: string, limit = 10): Promise<SearchResultItem[]> {
  const q = query.trim();
  if (!q) return [];

  const ilike = `%${q}%`;
  const { data, error } = await supabase
    .from('posts')
    .select('id, user_id, content, created_at, media_type, thumbnail_url, profiles!inner(id, display_name, full_name, avatar_url)')
    .ilike('content', ilike)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableOrColumnError(error)) return [];
    throw error;
  }

  return (data || []).map((row: any): SearchResultItem => {
    const author = (row as any).profiles;
    const snippet = (row.content || '').slice(0, 120);
    const subtitleParts: string[] = [];
    const authorName = author?.display_name || author?.full_name;
    if (authorName) subtitleParts.push(authorName);
    if (row.created_at) subtitleParts.push(new Date(row.created_at).toLocaleString());

    return {
      type: 'post',
      id: row.id,
      title: snippet || 'Post',
      subtitle: subtitleParts.join(' • ') || null,
      route: `/post/${row.id}`,
      avatarUrl: author?.avatar_url || null,
      meta: row.media_type || null,
    };
  });
}

export async function searchRooms(query: string, limit = 10): Promise<SearchResultItem[]> {
  const q = query.trim();
  if (!q) return [];

  const safe = sanitizeIlikeTerm(q);
  if (!safe) return [];

  const ilike = `%${safe}%`;
  const { data, error } = await supabase
    .from('crew_rooms')
    .select('id, name, last_message_at')
    .ilike('name', ilike)
    .order('last_message_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableOrColumnError(error)) return [];
    throw error;
  }

  return (data || []).map((row: any): SearchResultItem => {
    const subtitleParts: string[] = [];
    if (row.last_message_at) {
      subtitleParts.push(`Active ${new Date(row.last_message_at).toLocaleString()}`);
    }

    return {
      type: 'room',
      id: row.id,
      title: row.name || 'Crew Room',
      subtitle: subtitleParts.join(' • ') || null,
      route: `/crew-rooms/${row.id}`,
      avatarUrl: null,
      meta: null,
      // Older schemas may not have is_live; treat as unknown/false.
      isLive: false,
    };
  });
}

export async function searchTools(query: string, limit = 10): Promise<SearchResultItem[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: SearchResultItem[] = [];
  for (const tool of toolsRegistry) {
    const haystack = [tool.title, tool.description, ...tool.keywords].join(' ').toLowerCase();
    if (haystack.includes(q)) {
      results.push(toolToSearchResult(tool));
      if (results.length >= limit) break;
    }
  }
  return results;
}

export async function searchAll(query: string, perTypeLimit = 12): Promise<SearchAllResult> {
  const q = query.trim();
  if (!q) {
    return { people: [], posts: [], rooms: [], tools: [] };
  }

  const [people, rooms, posts, tools] = await Promise.all([
    searchPeople(q, perTypeLimit),
    searchRooms(q, perTypeLimit),
    searchPosts(q, Math.min(perTypeLimit, 10)),
    searchTools(q, Math.min(perTypeLimit, 10)),
  ]);

  return { people, posts, rooms, tools };
}

export async function getTrendingPosts(limit = 5): Promise<SearchResultItem[]> {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const { data, error } = await supabase
    .from('posts')
    .select('id, user_id, content, created_at, media_type, thumbnail_url, like_count, comment_count, profiles!inner(id, display_name, full_name, avatar_url)')
    .gte('created_at', since.toISOString())
    .order('like_count', { ascending: false })
    .order('comment_count', { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableOrColumnError(error)) return [];
    throw error;
  }

  return (data || []).map((row: any): SearchResultItem => {
    const author = (row as any).profiles;
    const snippet = (row.content || '').slice(0, 120);
    const metrics: string[] = [];
    if (typeof row.like_count === 'number') metrics.push(`${row.like_count} likes`);
    if (typeof row.comment_count === 'number') metrics.push(`${row.comment_count} comments`);

    return {
      type: 'post',
      id: row.id,
      title: snippet || 'Post',
      subtitle: (author?.display_name || author?.full_name) || null,
      route: `/post/${row.id}`,
      avatarUrl: author?.avatar_url || null,
      meta: metrics.join(' • ') || null,
    };
  });
}

// Mixed "For you" suggestions for the Search empty state.
// Combines people, rooms, and posts into a single flat list.
export async function getSuggestedItems(limit = 8): Promise<SearchResultItem[]> {
  const [people, rooms, posts] = await Promise.all([
    getSuggestedPeople(4),
    getSuggestedRooms(2),
    getTrendingPosts(2),
  ]);

  const combined: SearchResultItem[] = [];
  combined.push(...people.slice(0, 4));
  combined.push(...rooms.slice(0, 2));
  combined.push(...posts.slice(0, 2));

  return combined.slice(0, limit);
}

export async function getSuggestedPeople(limit = 6): Promise<SearchResultItem[]> {
  // Try handle/display_name-aware suggested people first.
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, handle, display_name, full_name, first_name, base, airline, role, avatar_url')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data || []).map((row: any): SearchResultItem => {
      const name =
        row.display_name || row.full_name || row.first_name || 'Crew member';
      const metaParts: string[] = [];
      if (row.handle) metaParts.push(`@${row.handle}`);
      if (row.role) metaParts.push(row.role);
      if (row.base) metaParts.push(row.base);
      if (row.airline) metaParts.push(row.airline);

      return {
        type: 'person',
        id: row.id,
        title: name,
        subtitle: metaParts.join(' • ') || null,
        route: `/user/${row.id}`,
        avatarUrl: row.avatar_url || null,
        meta: null,
      };
    });
  } catch (error: any) {
    const code = (error as any)?.code;
    const message = String((error as any)?.message || '');

    if (code === '42703' || message.includes('handle') || message.includes('display_name')) {
      try {
        const { data, error: fallbackError } = await supabase
          .from('profiles')
          .select('id, full_name, first_name, base, airline, role, avatar_url')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (fallbackError) {
          if (isMissingTableOrColumnError(fallbackError)) return [];
          throw fallbackError;
        }

        return (data || []).map((row: any): SearchResultItem => {
          const name = row.full_name || row.first_name || 'Crew member';
          const metaParts: string[] = [];
          if (row.role) metaParts.push(row.role);
          if (row.base) metaParts.push(row.base);
          if (row.airline) metaParts.push(row.airline);

          return {
            type: 'person',
            id: row.id,
            title: name,
            subtitle: metaParts.join(' • ') || null,
            route: `/user/${row.id}`,
            avatarUrl: row.avatar_url || null,
            meta: null,
          };
        });
      } catch (fallbackFatal) {
        if (isMissingTableOrColumnError(fallbackFatal)) return [];
        throw fallbackFatal;
      }
    }

    if (isMissingTableOrColumnError(error)) return [];
    throw error;
  }
}

export async function getSuggestedRooms(limit = 8): Promise<SearchResultItem[]> {
  const { data, error } = await supabase
    .from('crew_rooms')
    .select('id, name, last_message_at')
    .order('last_message_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableOrColumnError(error)) return [];
    throw error;
  }

  return (data || []).map((row: any): SearchResultItem => {
    const subtitle = row.last_message_at
      ? `Active ${new Date(row.last_message_at).toLocaleString()}`
      : null;

    return {
      type: 'room',
      id: row.id,
      title: row.name || 'Crew Room',
      subtitle,
      route: `/crew-rooms/${row.id}`,
      avatarUrl: null,
      meta: null,
      isLive: false,
    };
  });
}

function toolToSearchResult(tool: ToolEntry): SearchResultItem {
  return {
    type: 'tool',
    id: tool.id,
    title: tool.title,
    subtitle: tool.description,
    route: tool.route,
    avatarUrl: null,
    meta: tool.keywords.join(', '),
    iconName: typeof tool.iconName === 'string' ? tool.iconName : undefined,
  };
}

export async function getPopularTools(limit = 6): Promise<SearchResultItem[]> {
  return toolsRegistry.slice(0, limit).map(toolToSearchResult);
}

export async function getRecentSearches(userId: string | null | undefined): Promise<RecentSearchItem[]> {
  if (!userId) return [];
  try {
    const key = `recent_searches:${userId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentSearchItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
  } catch (e) {
    console.warn('[search] Failed to load recent searches', e);
    return [];
  }
}

export async function saveRecentSearch(userId: string | null | undefined, item: RecentSearchItem): Promise<void> {
  if (!userId) return;
  try {
    const key = `recent_searches:${userId}`;
    const existingRaw = await AsyncStorage.getItem(key);
    let existing: RecentSearchItem[] = [];
    if (existingRaw) {
      try {
        existing = JSON.parse(existingRaw) as RecentSearchItem[];
      } catch {
        existing = [];
      }
    }

    const filtered = existing.filter(
      (r) => !(r.type === item.type && r.id === item.id)
    );
    const next = [{ ...item, timestamp: Date.now() }, ...filtered].slice(0, 10);
    await AsyncStorage.setItem(key, JSON.stringify(next));
  } catch (e) {
    console.warn('[search] Failed to save recent search', e);
  }
}
