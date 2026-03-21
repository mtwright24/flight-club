# Architecture & Data Flow Diagrams

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CREW ROOMS SCREEN                        │
│                (app/screens/CrewRoomsScreen)                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  useCrewRooms Hook                                   │  │
│  │  ├─ Detects: isFirstTime                             │  │
│  │  ├─ Loads: userProfile, allPublicRooms              │  │
│  │  ├─ Runs: computeSuggestedRooms()                    │  │
│  │  ├─ Action: autoJoinOfficialRooms()                  │  │
│  │  └─ Marks: markSeenSuggestions()                     │  │
│  └───────────┬────────────────────────────────────────┬──┘  │
│              │                                        │      │
│    ┌─────────▼──────────┐              ┌─────────────▼────┐ │
│    │ My Rooms Section   │              │ Suggested Section │ │
│    │ (if user has)      │              │ (if first-time)   │ │
│    └────────────────────┘              └──────────┬───────┘ │
│                                                    │         │
│                                    ┌───────────────▼────────┐│
│                                    │ SuggestedRoomsSection  ││
│                                    │ (horizontal scroll)    ││
│                                    ├────────────────────────┤│
│                                    │ SuggestedRoomCard × 8  ││
│                                    │ ├─ RoomName            ││
│                                    │ ├─ Tags (base/fleet)   ││
│                                    │ ├─ Member count        ││
│                                    │ ├─ Verified badge      ││
│                                    │ └─ Join Button         ││
│                                    └────────────────────────┘│
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Discovery Section (Live Now, etc.)                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │
         │ Calls
         ▼
┌─────────────────────────────────────────────────────────────┐
│              Library: src/lib/supabase/rooms.ts             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  fetchUserProfile(userId)                                   │
│  └─ Query: SELECT id, base, fleet, airline, role,          │
│           has_seen_room_suggestions FROM profiles           │
│                                                             │
│  fetchPublicRoomsForSuggestion(limit=200)                   │
│  └─ Query: SELECT * FROM rooms WHERE is_private=false      │
│           ORDER BY member_count DESC LIMIT 200             │
│                                                             │
│  computeSuggestedRooms(profile, allRooms, userIds)         │
│  ├─ Input: User profile, all public rooms                  │
│  ├─ Logic: Score each room (base+fleet+airline+role+etc)   │
│  ├─ Filter: Remove already-joined rooms                    │
│  ├─ Sort: By score descending                              │
│  └─ Output: Top 8 rooms                                    │
│                                                             │
│  autoJoinOfficialRooms(userId, profile, rooms)             │
│  ├─ Find: Official base room (verified, public)            │
│  ├─ Find: Official fleet room (verified, public)           │
│  ├─ Call: joinRoom(userId, baseRoomId)                     │
│  ├─ Call: joinRoom(userId, fleetRoomId)                    │
│  └─ Return: Count of joined rooms                          │
│                                                             │
│  markSeenSuggestions(userId)                               │
│  └─ Query: UPDATE profiles SET                             │
│           has_seen_room_suggestions=true WHERE id=userId   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │
         │ Queries
         ▼
┌─────────────────────────────────────────────────────────────┐
│                   SUPABASE TABLES                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ profiles                                               │
│  │  ├─ id (uuid)                                           │
│  │  ├─ base (text)                                         │
│  │  ├─ fleet (text)                                        │
│  │  ├─ airline (text)                                      │
│  │  ├─ role (text)                                         │
│  │  ├─ has_seen_room_suggestions (boolean) ← NEW           │
│  │  └─ created_at                                          │
│  │                                                         │
│  ├─ rooms                                                  │
│  │  ├─ id (uuid)                                           │
│  │  ├─ name (text)                                         │
│  │  ├─ base (text nullable)                                │
│  │  ├─ fleet (text nullable)                               │
│  │  ├─ airline (text nullable)                             │
│  │  ├─ type (text)                                         │
│  │  ├─ is_private (boolean)                                │
│  │  ├─ is_verified (boolean)                               │
│  │  ├─ member_count (integer)                              │
│  │  └─ ... other fields                                    │
│  │                                                         │
│  └─ room_members                                           │
│     ├─ room_id, user_id                                    │
│     └─ ... other fields                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Suggestion Scoring Algorithm (Detailed)

```
┌─────────────────────────────────────────────────────────┐
│  INPUT: User Profile                                    │
│  {                                                      │
│    base: "JFK",      (LaGuardia/Kennedy)               │
│    fleet: "A320",    (Aircraft type)                    │
│    airline: "Jet",   (Airline)                          │
│    role: "FA"        (Flight Attendant)                 │
│  }                                                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  FOR EACH of 200 public rooms:                          │
│                                                         │
│  score = 0                                              │
│                                                         │
│  IF room.base == "JFK"        → score += 50  (BASE)    │
│  IF room.fleet == "A320"      → score += 40  (FLEET)   │
│  IF room.airline == "Jet"     → score += 30  (AIRLINE) │
│                                                         │
│  IF role == "FA" AND          → score += 15  (ROLE)    │
│     room.type IN ["commuters",                          │
│                   "swap",                               │
│                   "crashpads"]                          │
│                                                         │
│  IF room.is_verified == true  → score += 10  (VERIFY)  │
│                                                         │
│  popularity = room.member_count / 100                   │
│  popularity_bonus = MIN(popularity, 10)                 │
│  score += popularity_bonus    → + 0-10 (POPULAR)       │
│                                                         │
│  IF user already joined        → SKIP (FILTER)         │
│                                                         │
│  result = { room, score }                               │
│  }                                                      │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼ SORT by score DESC
┌──────────────────────────────────────────────────────────┐
│  EXAMPLE OUTPUT (Top 8)                                  │
│                                                          │
│  1. "JFK Crew"        (score: 125 = 50+10+10+55)        │
│     room.base="JFK", verified, 550 members              │
│                                                          │
│  2. "A320 Specialists"(score: 95 = 40+10+45)            │
│     room.fleet="A320", verified, 450 members            │
│                                                          │
│  3. "JetBlue FA Chat" (score: 85 = 30+10+45)            │
│     room.airline="JetBlue", verified, 450 members       │
│                                                          │
│  4. "NYC Commuters"   (score: 78 = 50+15+13)            │
│     room.base="JFK", type="commuters", 130 members      │
│                                                          │
│  5. "A320 Crew Tips"  (score: 73 = 40+10+23)            │
│     room.fleet="A320", verified, 230 members            │
│                                                          │
│  6. "JetBlue Swaps"   (score: 68 = 30+15+23)            │
│     room.airline="Jet", type="swap", 230 members        │
│                                                          │
│  7. "NYC Housing"     (score: 62 = 50+12)               │
│     room.base="JFK", 120 members                         │
│                                                          │
│  8. "FA General Chat" (score: 55 = 15+40)               │
│     type="social", 400 members                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## First-Time User Detection Flow

```
┌─────────────────────────────────────────┐
│ User Opens Crew Rooms                   │
│ (First time OR subsequent)              │
└────────────────┬────────────────────────┘
                 │
                 ▼
        ┌────────────────────┐
        │ Hook: useCrewRooms │
        └────────┬───────────┘
                 │
                 ├─ fetchUserProfile(userId)
                 │  └─ Get: base, fleet, airline, role
                 │  └─ Get: has_seen_room_suggestions
                 │
                 ▼
        ┌────────────────────────────────┐
        │ Check First-Time Flag          │
        │                                │
        │ IF has_seen_room_suggestions   │
        │    isFirstTime = false  →──┐   │
        │ ELSE                        │   │
        │    isFirstTime = true   →┐  │   │
        └────────────────────────────────┘
                 │              │
        ┌────────▼──────┐      ┌─▼───────────────────┐
        │ REPEAT VISIT  │      │ FIRST-TIME VISIT    │
        └───────────────┘      ├─────────────────────┤
                               │                     │
            Hide Suggestions   │ ┌─────────────────┐ │
                               │ │ fetchPublicRooms│ │
                               │ │ computeScores   │ │
                               │ │ autoJoinOfficial│ │
                               │ │ markSeenSuggests│ │
                               │ │ refreshMyRooms  │ │
                               │ └────────┬────────┘ │
                               │          │         │
                               │ Show Suggestions   │
                               │ Banner & Cards     │
                               │          │         │
                               │          ▼         │
                               │  Flag updates to:  │
                               │  has_seen=true     │
                               └─────────────────────┘
                                      │
                                      ▼
                                ┌──────────────────┐
                                │ Next app open    │
                                │ isFirstTime=false│
                                │ Suggestions hidden│
                                └──────────────────┘
```

---

## Data Flow: New User Join Action

```
USER INTERACTION:
┌──────────────────────────────────────┐
│ User taps "Join" button on card      │
│ onJoin(roomId) called                │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│ SuggestedRoomCard shows spinner      │
│ Loading state active                 │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│ CrewRoomsScreen.handleJoinRoom()     │
│ └─ calls: joinRoom(userId, roomId)   │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│ API: joinRoomAPI() (existing func)   │
│ └─ INSERT into room_members          │
│    (room_id, user_id, joined_at)     │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│ Success?                             │
│ ├─ YES: return { success: true }     │
│ └─ NO: return { success: false }     │
└────────────┬─────────────────────────┘
             │
             ├─ IF SUCCESS:
             │  │
             │  ├─ Refresh My Rooms: fetchMyRooms()
             │  │  └─ Room appears in list
             │  │
             │  ├─ Refresh Suggestions: computeScored()
             │  │  └─ Joined room filtered out
             │  │
             │  └─ Hide loading spinner
             │
             └─ IF FAIL:
                │
                ├─ Show error toast
                └─ Keep loading spinner visible
                   (user can retry)
```

---

## Component Hierarchy

```
CrewRoomsScreen
│
├─ ScrollView (main content)
│  │
│  ├─ SearchBar
│  ├─ RoomChips (filters)
│  │
│  ├─ [IF first-time & has suggestions]
│  │  └─ SuggestedRoomsSection
│  │     └─ ScrollView (horizontal)
│  │        └─ SuggestedRoomCard × 8
│  │           ├─ RoomName
│  │           ├─ VerifiedBadge
│  │           ├─ TagsRow (base, fleet, airline)
│  │           ├─ MemberInfo (people + count)
│  │           └─ JoinButton (with loading state)
│  │
│  ├─ MyRoomsSection (if user has rooms)
│  │  └─ RoomListItem × N
│  │     ├─ RoomName
│  │     ├─ LastMessage
│  │     ├─ UnreadCount
│  │     └─ RoomAvatar
│  │
│  └─ RoomDiscoverySection
│     ├─ TabBar (airlines, bases, pilots)
│     ├─ SuggestedRoomsList (if not first-time)
│     └─ LiveNowRoomsList
│        └─ RoomDiscoveryCard × 12
│
└─ FloatingActionButton (+ new room)
```

---

## State Management Flow

```
┌─────────────────────────────────────────────────┐
│ useCrewRooms Hook State                         │
├─────────────────────────────────────────────────┤
│                                                 │
│ ┌─ myRooms: MyRoom[]                           │
│ │  └─ Rooms user is member of                  │
│ │                                               │
│ ├─ lastActiveRoom: MyRoom | null                │
│ │  └─ Most recent room user was in             │
│ │                                               │
│ ├─ suggestedRooms: Room[]                       │
│ │  └─ Top 8 scored recommendations             │
│ │                                               │
│ ├─ liveNowRooms: Room[]                         │
│ │  └─ Trending/most active rooms               │
│ │                                               │
│ ├─ isFirstTime: boolean ← NEW                   │
│ │  └─ Derived from: !has_seen_room_suggestions │
│ │                                               │
│ ├─ loading: boolean                             │
│ │  └─ True while fetching data                 │
│ │                                               │
│ ├─ error: string | null                         │
│ │  └─ Error message if fetch failed            │
│ │                                               │
│ ├─ searchQuery: string                          │
│ │  └─ User search text                         │
│ │                                               │
│ ├─ activeTab: string                            │
│ │  └─ Current discovery tab                    │
│ │                                               │
│ └─ filters: {}                                  │
│    └─ Applied filters (base, fleet, etc)       │
│                                                 │
└─────────────────────────────────────────────────┘
         │
         │ Passed to Screen Components
         ▼
┌─────────────────────────────────────────────────┐
│ SuggestedRoomsSection Props                     │
├─────────────────────────────────────────────────┤
│                                                 │
│ rooms: Room[]          ← suggestedRooms         │
│ onJoinRoom: Function   ← handleJoinRoom         │
│ isFirstTime: boolean   ← isFirstTime            │
│ loading: boolean       ← loading                │
│                                                 │
└─────────────────────────────────────────────────┘
         │
         │ Passed to Child Components
         ▼
┌─────────────────────────────────────────────────┐
│ SuggestedRoomCard Props                         │
├─────────────────────────────────────────────────┤
│                                                 │
│ room: Room             ← Individual room        │
│ onJoin: Function       ← handleJoinRoom         │
│ isJoining: boolean     ← joiningRoomId==room.id│
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Performance & Optimization

```
┌──────────────────────────────────────────────────┐
│ SUGGESTION COMPUTATION TIMELINE                 │
├──────────────────────────────────────────────────┤
│                                                  │
│ 1. Screen Open                        0ms       │
│    └─ Loading state shows                       │
│                                                  │
│ 2. Fetch User Profile                ~50ms     │
│    └─ Query 1 row from profiles table           │
│                                                  │
│ 3. Fetch All Public Rooms            ~150ms    │
│    └─ Query 200 rows from rooms table           │
│                                                  │
│ 4. Compute Suggestions               ~10ms     │
│    └─ Client-side: Score 200 rooms, take top 8 │
│    └─ Uses Array.map(), Array.sort()           │
│    └─ NO additional queries                    │
│                                                  │
│ 5. Auto-Join (if first-time)         ~200ms    │
│    └─ INSERT into room_members × 2             │
│    └─ Parallel: Both queries run together      │
│    └─ Only if My Rooms is empty                │
│                                                  │
│ 6. Mark Seen Suggestions             ~50ms     │
│    └─ UPDATE profiles set flag                 │
│                                                  │
│ 7. Render Suggestions                ~100ms    │
│    └─ React re-render                          │
│    └─ Layout calculation                       │
│                                                  │
│ ├─────────────────────────────────────────┤   │
│ │  TOTAL TIME: ~560ms (0.56 seconds)      │   │
│ │  ACCEPTABLE: < 1.0 second               │   │
│ └─────────────────────────────────────────┘   │
│                                                  │
│ ✅ Optimization: Client-side scoring avoids     │
│    database query for each room (200 queries   │
│    would take 2+ seconds without optimization) │
│                                                  │
│ ✅ Optimization: Batch room fetch (1 query     │
│    for 200) instead of individual queries      │
│                                                  │
│ ✅ Optimization: No caching needed initially    │
│    (computation is fast enough)                │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## Migration & Rollback Plan

```
┌─────────────────────────┐
│ DEPLOYMENT              │
├─────────────────────────┤
│                         │
│ 1. Backup profiles table│
│    Run SQL             │
│                         │
│ 2. Apply migration      │
│    ADD COLUMN IF EXISTS │
│    (safe: no data loss) │
│                         │
│ 3. Deploy code          │
│    New components ready │
│                         │
│ 4. Test with new users  │
│    Flag defaults false  │
│                         │
└─────────────────────────┘
         │
    ┌────┴────┐
    │          │
    ▼          ▼
SUCCESS   ROLLBACK?
    │          │
    │      ┌───▼──────────────────┐
    │      │ Safe Rollback Steps  │
    │      ├──────────────────────┤
    │      │                      │
    │      │ 1. Revert code       │
    │      │    (no schema change)│
    │      │                      │
    │      │ 2. Remove component  │
    │      │    from screen       │
    │      │                      │
    │      │ 3. Column stays      │
    │      │    (harmless)        │
    │      │                      │
    │      │ ✅ No data loss      │
    │      │ ✅ Existing users OK │
    │      │ ✅ < 5 min downtime  │
    │      │                      │
    │      └──────────────────────┘
    │
    └─────────────────────►
         ✅ LAUNCH
```
