# CrewRoomsScreen — Minimal Enhancement Patch

## What Changed

### 1. **ADDED: Helper Function — `getRelativeTime()`**
- Converts timestamps to relative format: "5m ago", "1h ago", "2d ago"
- Supports null/undefined gracefully → "now"
- Located at top of component file for easy modification

### 2. **ADDED: Error State Tracking**
```tsx
const [roomsError, setRoomsError] = useState<string | null>(null);
const [roomsFetchedSuccessfully, setRoomsFetchedSuccessfully] = useState(false);
```
- Explicitly tracks error vs. initial load vs. success
- Rules:
  - If error: show banner only, hide content
  - If success + empty: show "No rooms yet" + Suggested/Live
  - If success + has rooms: show Continue + My Rooms + Suggested/Live

### 3. **ADDED: Sorting Logic for My Rooms**
```tsx
const sortedMyRooms = useMemo(() => {
  const sorted = [...myRooms].sort((a, b) => {
    // 1) Pinned first
    // 2) Unread count desc
    // 3) Last message time desc (nulls last)
    // 4) Name asc
  });
  return sorted;
}, [myRooms]);
```
- Stable sort that respects user's pinned rooms + priorities
- Wrapped in useMemo for performance

### 4. **FIXED: Error Banner**
- Added Retry button next to error text
- Calls `refetch()` from useCrewRooms hook
- Error row layout: text (flex) + retry button

### 5. **FIXED: Conditional Rendering Logic**
| State | Continue | My Rooms | Suggested | Live |
|-------|----------|----------|-----------|------|
| Error | Hidden | Hidden | Hidden | Hidden |
| Loading (first) | Hidden | Hidden | Hidden | Hidden |
| Empty (no rooms) | N/A | N/A | Show | Show |
| Has rooms | Show (if exists) | Show | Show | Show |

### 6. **ADDED: FAB Safe Area Integration**
```tsx
const insets = useSafeAreaInsets();
// ...
bottom: insets.bottom + 72  // Dynamic positioning above tab bar
```
- Imports `useSafeAreaInsets` from react-native-safe-area-context
- FAB now respects bottom safe area (for notched devices)
- Positioned at `insets.bottom + 72` = above tab bar (~56px) with 16px margin

### 7. **Code Comments**
- All new sections marked with `// ADDED:`, `// FIXED:` for easy diff review

---

## Testing Checklist

### Test 1: Error State
1. Simulate network error in useCrewRooms hook
2. Verify:
   - ✅ Error banner appears with red left border
   - ✅ "Retry" button is visible next to error text
   - ✅ Continue card is **hidden**
   - ✅ My Rooms section is **hidden**
   - ✅ Suggested/Live sections are **hidden**
   - ✅ Retry button calls `refetch()` (check console)

### Test 2: Empty State (No Rooms)
1. Clear myRooms array (simulate user with no rooms)
2. Verify:
   - ✅ No error banner
   - ✅ Loading spinner gone
   - ✅ "No rooms yet" message appears
   - ✅ "Discover rooms below" text visible
   - ✅ Suggested/Live sections **still show** (for discovery)
   - ✅ Continue card is **not shown**
   - ✅ My Rooms section is **not shown**

### Test 3: Multiple Rooms with Unread/Pinned
1. Add 5+ rooms to myRooms with varied data:
   - Room A: pinned=true, unread=2, last_message_at=now
   - Room B: pinned=false, unread=5, last_message_at=1h ago
   - Room C: pinned=true, unread=0, last_message_at=2h ago
   - Room D: pinned=false, unread=0, last_message_at=3d ago
   - Room E: pinned=false, unread=1, last_message_at=null

2. Verify sort order in My Rooms preview (should be A, C, B, E, D):
   - ✅ Pinned rooms (A, C) appear first
   - ✅ Within pinned: unread desc (A before C)
   - ✅ Non-pinned (B, E, D) follow
   - ✅ Within non-pinned: unread desc (B, E before D)
   - ✅ Same unread: time desc (D before E if both unread=0, but E is shown before D due to unread)

3. Verify Continue card:
   - ✅ Shows room with most recent last_message_at (Room A if all have times)
   - ✅ Displays room name + "— 2 unread" or just name if 0 unread

4. Verify My Rooms preview:
   - ✅ Only 4 rooms shown by default
   - ✅ "See All >" button appears (because >4 rooms)
   - ✅ Tapping "See All >" expands to show all 5
   - ✅ When expanded, shows "Show Less" button
   - ✅ Each room item shows:
     - Room icon/emoji
     - Name + base/fleet tag
     - "X unread • 5m ago" or "No unread • 1h ago"
     - Last message preview
     - Red unread pill on right (if unread > 0)

### Test 4: FAB Positioning & Functionality
1. Open app on device/simulator
2. Scroll through My Rooms and Suggested sections
3. Verify FAB:
   - ✅ Stays visible above tab bar (doesn't get hidden)
   - ✅ Not overlapping any content when tabs are visible
   - ✅ Positioned correctly for notched devices (uses safe area)
   - ✅ Tap FAB → CreateRoomSheet opens
   - ✅ Close CreateRoomSheet → FAB reappears
   - ✅ Press scale animation works (scale 0.9 on press)

### Test 5: Search Still Works
1. Type in search bar
2. Verify:
   - ✅ My Rooms list filters correctly (name, base, fleet)
   - ✅ Preview shows ≤4 matching rooms
   - ✅ Continue card stays visible (not filtered)
   - ✅ Suggested/Live sections still visible

### Test 6: Navigation
1. Tap Continue card
2. Tap My Rooms item
3. Tap Suggested room JOIN
4. Tap Live room
5. Verify:
   - ✅ All navigate to `/room/[id]` correctly
   - ✅ Room chat loads
   - ✅ Back button returns to Crew Rooms

---

## Key Improvements

| Issue | Before | After |
|-------|--------|-------|
| Error + empty both shown | ❌ Confusing | ✅ Mutually exclusive |
| Unread pills unordered | ❌ Random order | ✅ Pinned → unread → time |
| Error has no retry | ❌ Stuck | ✅ Retry button |
| FAB position fixed | ❌ Hidden by tab bar on some devices | ✅ Dynamic safe area aware |
| Large timestamp diffs | ❌ "2026-02-22T10:30:00Z" | ✅ "5m ago" |
| No unread sorting | ❌ Not priority | ✅ Unread rooms float to top |

---

## Code Size Impact

- **Lines added**: ~120 (helper + sorting + state)
- **Lines removed**: ~5 (simplified error logic)
- **Net change**: +115 lines (well-contained, no breaking changes)
- **Dependencies**: Added `useSafeAreaInsets` (already in project)

---

## Backward Compatibility

✅ **Fully backward compatible**
- Existing components (ContinueCard, RoomListItem, RoomDiscoverySection) unchanged
- Existing CreateRoomSheet unchanged
- Navigation unchanged
- No breaking changes to props or state shape

---

## If Issues Arise

1. **FAB hidden by tab bar?**
   - Adjust `insets.bottom + 72` to `insets.bottom + 100` or `+ 120`
   - Check tab bar height in app.json or navigation config

2. **Sorting wrong order?**
   - Check `myRooms` data has `pinned`, `unread_count`, `last_message_at` fields
   - Add console.log before sort to debug

3. **Retry button not working?**
   - Ensure `useCrewRooms` hook exports `refetch` function
   - Check hook implementation in `src/hooks/useCrewRooms.ts`

4. **Continue card not appearing?**
   - Verify `lastActiveRoom` is being returned by hook
   - Check that at least one room has non-null `last_message_at`

---

## Next Steps (Optional)

1. Add "Pin room" icon to each My Rooms item (star icon)
2. Add swipe-to-archive gesture
3. Add unread count badge to Crew Rooms tab
4. Add "Mark all as read" option in My Rooms header
