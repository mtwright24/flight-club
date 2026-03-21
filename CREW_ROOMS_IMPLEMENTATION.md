# Crew Rooms Screen Implementation - Testing Guide

## Overview
A redesigned Crew Rooms screen with the following features:
- "My Rooms" inbox with unread indicators and last message preview
- "Continue where you left off" strip showing last active room
- Suggested for you and Live now discovery sections with tabbed filtering
- Create Room flow with spam-resistant design (templates, rate limiting, duplicate detection)
- Floating action button for quick room creation
- Search and filter chips for discovery

## Files Created

### Types
- `src/types/rooms.ts` - Room, RoomMember, MyRoom, CreateRoomPayload types

### Hooks
- `src/hooks/useCrewRooms.ts` - Main hook managing rooms state (my rooms, suggested, live)
- `src/hooks/useDebouncedValue.ts` - Utility for debounced search input
- `src/hooks/useAuth.ts` - Auth session hook (wrapper around Supabase)

### Backend Integration
- `src/lib/supabase/rooms.ts` - Database queries and mutations:
  - `fetchMyRooms(userId)` - Fetch user's joined rooms with unread counts
  - `getLastActiveRoom(userId)` - Get last visited room for continue strip
  - `fetchPublicRooms(filters)` - Discover public rooms
  - `checkDuplicateRoom()` - Prevent room creation duplicates
  - `checkRateLimit()` - Enforce 1 public room per 24h per user
  - `createRoomWithTemplate()` - Spam-resistant room creation
  - `joinRoom()` - Add user to room
  - `markRoomAsRead()` - Update last_read_at
  - `setPinRoom()` - Pin/unpin a room

### Components
- `src/components/rooms/RoomChips.tsx` - Filter and create chips row
- `src/components/rooms/ContinueCard.tsx` - "Continue where you left off" card
- `src/components/rooms/RoomListItem.tsx` - Individual room item with emoji icons
- `src/components/rooms/RoomDiscoverySection.tsx` - Suggested + Live sections with tabs
- `src/components/rooms/CreateRoomSheet.tsx` - Multi-step room creation modal

### Screens
- Updated: `src/screens/CrewRoomsScreen.tsx` - Main screen with all layout and navigation

## Database Schema Requirements

The following Supabase tables are expected:

### public.rooms
```sql
id                uuid primary key
name              text
type              text -- 'base', 'fleet', 'airline', 'layover', 'swap', 'crashpad', 'general', 'commuters', 'private'
base              text nullable
fleet             text nullable
airline           text nullable
is_private        boolean default false
is_verified       boolean default false
created_by        uuid
created_at        timestamptz
last_message_at   timestamptz nullable
last_message_text text nullable
member_count      int default 0
live_count        int default 0
```

### public.room_members
```sql
room_id           uuid (fk -> rooms.id)
user_id           uuid (fk -> auth.users.id)
role              text -- 'admin' | 'member'
pinned            boolean default false
last_read_at      timestamptz nullable
joined_at         timestamptz
```

### public.room_messages
```sql
id                uuid primary key
room_id           uuid (fk -> rooms.id)
user_id           uuid (fk -> auth.users.id)
text              text
created_at        timestamptz
```

## Manual Testing Guide

### 1. Setup & Navigation
- [ ] Open app, navigate to "Crew Rooms" tab
- [ ] Screen should load with search bar and filter chips
- [ ] AppHeader should display "Flight Club" logo and menu/notification buttons

### 2. My Rooms Section
- [ ] If user has rooms:
  - [ ] "MY ROOMS" header appears with unread count indicators
  - [ ] Rooms sort: pinned → unread (desc) → last activity (desc)
  - [ ] Each room shows: emoji icon + name + base/fleet tags + unread badge
  - [ ] "See All >" appears if >4 rooms, tapping expands list
  - [ ] Tapping a room navigates to `/room/[id]`

### 3. Continue Card
- [ ] If lastActiveRoom exists, shows "Continue where you left off"
- [ ] Card displays: room name + unread count + time ago + last message preview
- [ ] Red unread pill on right if unread > 0
- [ ] Tapping navigates to that room

### 4. Discovery Sections
- [ ] "SUGGESTED FOR YOU" section shows recommended public rooms
- [ ] Each suggested room has "JOIN" button on right
- [ ] "LIVE NOW" section with tabs: Airlines, Bases, Pilots
- [ ] Each live room shows: LIVE badge + room name + active member count
- [ ] Tapping room opens it
- [ ] Tapping "JOIN" adds user to room and optionally navigates

### 5. Search & Filters
- [ ] Type in search bar → debounces 300ms
- [ ] Filter chips toggle (Base, Fleet, Airline, Private, Verified)
- [ ] Small "+" chip opens CreateRoomSheet
- [ ] Pressing X in search clears it

### 6. Create Room Flow
- [ ] Tap FAB (red circle + bottom-right) or + chip
- [ ] Modal opens with "Create a Room" title
- [ ] **Step 1**: Choose template type (Base Room, Fleet, Commuters, etc.)
- [ ] **Step 2**: Fill name, base, fleet, airline, toggle private/public
  - [ ] Name field pre-populated with suggestion
  - [ ] Private toggle affects description
- [ ] **Step 3**: Confirm details, tap "Create Room"
- [ ] If duplicate detected:
  - [ ] Alert shows "This room already exists"
  - [ ] "Join" button to join existing room
- [ ] If rate limit hit:
  - [ ] Alert shows "You can create another public room tomorrow"
- [ ] On success:
  - [ ] Alert "Room created!"
  - [ ] Navigate to new room
  - [ ] Room appears in "My Rooms"

### 7. Analytics (Check Console)
- [ ] Room tap → `[ANALYTICS] open_room { roomId }`
- [ ] Join room → `[ANALYTICS] join_room_success { roomId }`
- [ ] Create attempt → `[ANALYTICS] create_room_attempt { template, isPrivate }`
- [ ] Create success → `[ANALYTICS] create_room_success { roomId, type, isPrivate }`
- [ ] Rate limited → `[ANALYTICS] create_room_rate_limited`

### 8. Empty States
- [ ] If no rooms:
  - [ ] "No rooms yet" message
  - [ ] Suggested section shows immediately
  - [ ] FAB and "+" chip still available

### 9. Error States
- [ ] Network error → banner with error text + red border
- [ ] Loading state → spinner + "Loading your rooms…"

### 10. UI Polish
- [ ] Red header with Flight Club logo
- [ ] Search bar rounded with search icon
- [ ] Filter chips: inactive (white bg), active (red bg)
- [ ] Room cards have soft shadows
- [ ] Unread pills are red circles with white number
- [ ] FAB is red circle with white +
- [ ] Smooth transitions and press states

## Integration Checklist

- [ ] Supabase tables exist with correct schema
- [ ] Supabase RLS policies allow reads/writes (or disabled for testing)
- [ ] Room chat screen (`app/room/[id].tsx`) handles navigation params
- [ ] Consider calling `markRoomAsRead()` when user opens a room (add to room chat screen)
- [ ] Verify auth session available via `useAuth()` hook

## Optional Enhancements (Future)

1. **Pinned Rooms** - Add pin icon to room list items
2. **Room Notifications** - Show badge count on tab bar
3. **Advanced Filters** - Date range, verified only, member count, etc.
4. **Room Analytics** - View member growth, activity trends
5. **Create Room Validation** - Check name uniqueness more strictly
6. **Offline Support** - Cache rooms list, sync when online
7. **Room Expiry** - Auto-archive layover rooms after 24h
8. **Spam Scoring** - Rate-limit based on user history, reputation

## Known Limitations / TODOs

1. Rate limit is per 24h from creation time; could be improved with bucketing
2. Duplicate detection only checks exact name match (could use fuzzy matching)
3. Last active room is based on last_read_at only; consider message view timestamps
4. Suggested rooms are all public rooms; ideally filtered by user's base/fleet
5. Live now room count comes from `live_count` field; should sync with active members
6. Create room template suggestions are hardcoded; could be data-driven

## Environment

- React Native + Expo
- TypeScript
- Supabase
- React Navigation (tabs)
- Design system: red header (#B5161E), navy text, rounded cards, soft shadows

## Support

For issues or questions:
1. Check console for `[ANALYTICS]` logs
2. Verify Supabase tables and RLS policies
3. Ensure `useAuth()` returns valid session
4. Test with a real user account (not anonymous)
