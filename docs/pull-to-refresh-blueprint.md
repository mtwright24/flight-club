# Pull-to-refresh blueprint (Flight Club)

Mirrors **Social Feed** (`src/screens/FeedScreen.tsx` + `PostsFeed`):

1. **State:** `refreshing` boolean, separate from first-load `loading`.
2. **FlatList:** `refreshing={refreshing}` and `onRefresh={...}`.
3. **ScrollView:** `refreshControl={<RefreshControl ... />}`.
4. **Handler:** async function that refetches **all data that screen owns**, then `setRefreshing(false)` in `finally`.

## Shared utilities

- `src/hooks/usePullToRefresh.ts` — `const { refreshing, onRefresh } = usePullToRefresh(async () => { ...reload... });`
- `src/styles/refreshControl.ts` — `REFRESH_CONTROL_COLORS`, `REFRESH_TINT` (brand red `#B5161E`)

## RefreshControl example (ScrollView)

```tsx
import { RefreshControl, ScrollView } from 'react-native';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../styles/refreshControl';

const { refreshing, onRefresh } = usePullToRefresh(async () => {
  await loadEverythingForThisScreen();
});

<ScrollView
  refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={REFRESH_CONTROL_COLORS}
      tintColor={REFRESH_TINT}
    />
  }
>
```

## New screens

Always attach refresh to the **outermost vertical** scroll surface for that route. Nested horizontal `ScrollView`s do not need pull-to-refresh.

## Implemented routes (non-exhaustive)

Uses `usePullToRefresh` + `REFRESH_CONTROL_COLORS` / `REFRESH_TINT` unless noted.

| Area | Route / component | Refresh behavior |
|------|-------------------|------------------|
| Tabs | `app/(tabs)/index.tsx` | Home sections, activity token, badges |
| Tabs | `app/(tabs)/profile.tsx` | Self profile / posts / media |
| Tabs | `app/(tabs)/crew-tools.tsx` | Placeholder (ready for data) |
| Feed | `src/components/posts/PostsFeed.tsx` | Social feed & any consumer with `onRefresh` |
| Stack | `app/home.tsx` | Legacy home sections |
| Stack | `app/post/[id].tsx` | Post + comments |
| Stack | `app/dm-thread.tsx` | Thread messages |
| Stack | `app/messages-inbox.tsx`, `app/new-message.tsx` | Inbox / search results |
| Stack | `app/notifications.tsx` | Notifications list |
| Stack | `app/menu.tsx` | Session re-check |
| Stack | `app/edit-profile.tsx` | Profile form from server |
| Loads | `app/loads/index.tsx` | Parent pull bumps `refreshToken` → search refetch |
| Loads | `app/loads/search.tsx` | Re-run search when criteria set |
| Loads | `app/loads/requests.tsx`, `app/loads/wallet.tsx` | Lists + balance/ledger |
| Settings | `app/privacy-safety.tsx`, `app/help-support.tsx`, `app/about-flight-club.tsx` | Static UI (spinner only) |
| Settings | `app/notifications-settings.tsx` | Reload prefs (`silent` pull avoids full-screen loader) |
| Settings | `app/home-shortcuts.tsx` | Reload pinned tool ids (`silent`) |
| Settings | `src/screens/AccountSettingsScreen.tsx` | Re-read AsyncStorage |
| Settings | `app/blocked-users.tsx`, `app/muted-users.tsx` | Placeholder until lists exist |
| Composer | `app/create-post.tsx` | Static (spinner only) |
| Onboarding | `app/complete-setup/index.tsx` | Reload profile (`silent`) |
| Other | `app/search.tsx`, `src/screens/CrewRoomsScreen.tsx`, `src/screens/RoomHomeScreenImpl.tsx` | Per-screen data |

**Still add refresh when you add a new screen:** copy the ScrollView `RefreshControl` block or FlatList `refreshControl` from an example above; call the same loaders as `useFocusEffect` / mount.
