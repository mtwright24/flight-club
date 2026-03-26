# Flight Club — header badges & live counts (blueprint)

Use this when adding or fixing **bell (notifications)** or **cloud (DMs)** counts so they behave like production social apps: **one shared number everywhere**, **instant updates** after read/unread, and **no reliance on tab headers staying mounted**.

## 1. Shared stores (source of truth)

| Concern | Module | Count source | Notify API |
|--------|--------|--------------|------------|
| DMs | `lib/dmUnreadBadgeStore.ts` | `getUnreadCounts(userId).messages` (thread semantics) | `notifyDmUnreadBadgeRefresh()` |
| Notifications | `lib/notificationsBadgeStore.ts` | `countUnreadNotificationsForUser(userId)` (deduped bell rules) | `notifyNotificationsBadgeRefresh()` |

Both stores:

- Expose **`useSyncExternalStore`** subscribers (`subscribe*`, `get*Snapshot`).
- **`refresh*Count()`** resolves the user with **`supabase.auth.getSession()`** (not a hook-local `userId`) so refreshes work when stack screens cover tabs and headers unmount.
- Use **single-flight** `Promise` deduping for concurrent refreshes.
- **`register*User(userId)`** ref-counts **poll + AppState + Realtime** side effects (start when first consumer mounts, stop when last unmounts).
- **`notify*Refresh()`** = immediate refresh + **~280ms** follow-up to avoid read/mark races.

Hooks (thin wrappers):

- `src/hooks/useDmUnreadBadge.ts` → `{ count, refresh }`
- `src/hooks/useNotificationsBadge.ts` → `number` (bell count)

## 2. When to call `notify*Refresh()`

Call after any action that changes unread semantics:

- **DMs:** after `fetchThread` (marks read), swipe read/unread in inbox, realtime incoming message in thread (mark read + notify), inbox focus (optional; navigation sync often covers it).
- **Notifications:** after `markNotificationsRead` / `markAllNotificationsRead` (wired in `lib/notifications.ts` via dynamic import to avoid cycles), after `markNotificationRead` in `lib/notifications-preview.ts`, on **INSERT** in notifications list realtime if you want the bell to jump immediately.

Avoid duplicate triple-refreshes on a single user action; one notify is enough.

## 3. Navigation sync

`src/components/DmBadgeNavigationSync.tsx` runs on **`usePathname` + `useSegments`** changes (debounced 50ms) and calls:

- `refreshDmUnreadBadgeCount()`
- `refreshNotificationsBadgeCount()`

Mounted in root `app/_layout.tsx`. This fixes “badge updates only after I tap another tab” when route changes weren’t tied to the stores.

## 4. Home Activity UI (notifications-driven)

- **Data:** `getRecentNotifications(userId, 24)` so buckets have enough rows to summarize.
- **Layout:** `ActivityPreview` **`variant="sectioned"`** — 2×2 tiles: **Social**, **Swaps**, **Housing**, **Crew rooms** (`lib/activityHomeBuckets.ts` maps `notification.type` → bucket).
- **Top row:** overlapping avatars + **`+N`** chip on tab Home: **`N` = recent items loaded** when the list is non-empty, else **bell unread** (header bell still uses `useNotificationsBadge()`).
- **Read path:** `markNotificationRead` updates DB and **`notifyNotificationsBadgeRefresh()`** so the bell and tiles stay aligned.

## 5. Checklist for “same as DMs” on a new surface

1. Add or reuse a **store** with session-based `refresh`, `notify`, optional realtime filter.
2. Wire **hook** with `useSyncExternalStore` + `register*User`.
3. Call **`notify*Refresh()`** after every server-side state change that affects the count.
4. Ensure **root navigation sync** calls the store’s `refresh` (or extend `DmBadgeNavigationSync`).
5. Don’t depend on **`activeUserId` from mounted headers** for refresh; always prefer **`getSession()`** inside `refresh*Count`.

## 6. Files reference (notifications pass)

- `lib/notificationsBadgeStore.ts` — store + realtime on `notifications` for `user_id`
- `src/hooks/useNotificationsBadge.ts`
- `lib/notifications.ts` — `markNotificationsRead` / `markAllNotificationsRead` → dynamic `notifyNotificationsBadgeRefresh`
- `lib/notifications-preview.ts` — `markNotificationRead` → `notifyNotificationsBadgeRefresh`
- `app/notifications.tsx` — list realtime INSERT → notify
- `components/ActivityPreview.tsx` — `variant="sectioned"` + list mode
- `lib/activityHomeBuckets.ts` — bucket keys for Activity tiles

DMs mirror: `lib/dmUnreadBadgeStore.ts`, `src/hooks/useDmUnreadBadge.ts`, `notifyDmUnreadBadgeRefresh` call sites (`app/dm-thread.tsx`, `app/messages-inbox.tsx`, etc.).
