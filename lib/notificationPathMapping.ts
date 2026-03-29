import type { Href } from 'expo-router';

/**
 * Map stored notification routes (often `/dm-thread?conversationId=…`) to Expo Router hrefs.
 * Lives outside `notifications.ts` to avoid a require cycle with `notificationRouting.ts`.
 */
export function notificationPathToHref(path: string): Href {
  const trimmed = (path || '').trim();
  if (!trimmed || trimmed === '/') return '/';

  const pathOnly = (pathname: string) => pathname.replace(/^\//, '') || pathname;

  const tryDm = (pathname: string, query: string) => {
    if (pathOnly(pathname) !== 'dm-thread') return null;
    const sp = new URLSearchParams(query);
    const conversationId = sp.get('conversationId');
    if (!conversationId) return null;
    const requestId = sp.get('requestId');
    const params: Record<string, string> = { conversationId: String(conversationId) };
    if (requestId) params.requestId = String(requestId);
    return { pathname: '/dm-thread' as const, params };
  };

  const tryRoomPostDetail = (pathname: string, query: string) => {
    if (pathOnly(pathname) !== 'room-post-detail') return null;
    const postId = new URLSearchParams(query).get('postId');
    if (!postId) return null;
    return { pathname: '/room-post-detail' as const, params: { postId: String(postId) } };
  };

  const normalizedPath = (pathname: string) => pathname.replace(/^\/+/, '');

  const tryCrashpadsDetail = (pathname: string, query: string) => {
    const n = normalizedPath(pathname);
    if (n !== '(screens)/crashpads-detail' && !n.endsWith('crashpads-detail')) return null;
    const id = new URLSearchParams(query).get('id');
    if (!id) return null;
    return { pathname: '/(screens)/crashpads-detail' as const, params: { id: String(id) } };
  };

  const tryRoomHome = (pathname: string, query: string) => {
    const n = normalizedPath(pathname);
    if (!n.includes('crew-rooms/room-home')) return null;
    const sp = new URLSearchParams(query);
    const roomId = sp.get('roomId');
    if (!roomId) return null;
    const roomName = sp.get('roomName');
    const params: Record<string, string> = { roomId: String(roomId) };
    if (roomName) params.roomName = String(roomName);
    return { pathname: '/(tabs)/crew-rooms/room-home' as const, params };
  };

  const q = trimmed.indexOf('?');
  if (q !== -1) {
    const pathnamePart = trimmed.slice(0, q);
    const queryPart = trimmed.slice(q + 1);
    const dm = tryDm(pathnamePart, queryPart);
    if (dm) return dm;
    const rpd = tryRoomPostDetail(pathnamePart, queryPart);
    if (rpd) return rpd;
    const cpd = tryCrashpadsDetail(pathnamePart, queryPart);
    if (cpd) return cpd;
    const rh = tryRoomHome(pathnamePart, queryPart);
    if (rh) return rh;
  }

  return trimmed as Href;
}
