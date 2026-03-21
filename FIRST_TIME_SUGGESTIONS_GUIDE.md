# First-Time User Suggested Crew Rooms - Implementation Guide

## ✅ Overview
This feature populates the "Suggested" section on the Crew Rooms tab with personalized room recommendations when a new user opens Crew Rooms for the first time. Recommendations are based on their signup profile (Base, Fleet, Airline, Role).

## 📋 Implementation Summary

### A) Database Schema Updates

#### Migration File: `supabase/migrations/006_add_room_suggestions.sql`
Adds the `has_seen_room_suggestions` boolean flag to the profiles table:

```sql
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS has_seen_room_suggestions boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_has_seen_suggestions 
  ON public.profiles(has_seen_room_suggestions);
```

**Existing Room Fields (already in schema):**
- `base` (text nullable)
- `fleet` (text nullable)
- `airline` (text nullable)
- `type` (text) - room type classification
- `is_private` (boolean)
- `is_verified` (boolean)
- `member_count` (int)

### B) Core Suggestion Algorithm

**File:** `src/lib/supabase/rooms.ts`

#### New Functions:

1. **`fetchUserProfile(userId: string)`**
   - Retrieves user profile with all fields needed for suggestions
   - Returns: `{ id, base, fleet, airline, role, has_seen_room_suggestions }`

2. **`fetchPublicRoomsForSuggestion(limit: number = 200)`**
   - Fetches up to 200 public rooms sorted by member count
   - Filters out private rooms only

3. **`computeSuggestedRooms(profile, allRooms, userRoomIds?)`**
   - Scores each room based on relevance:
     - Base match: +50 points
     - Fleet match: +40 points
     - Airline match: +30 points
     - Role-specific rooms (FA types like commuters, swap, crashpads): +15 points
     - Verified badge: +10 points
     - Popularity bonus: +min(member_count/100, 10) points
   - Excludes rooms user is already a member of
   - Returns top 8 rooms sorted by score descending

4. **`markSeenSuggestions(userId: string)`**
   - Sets `has_seen_room_suggestions = true` for user
   - Called after first-time auto-join or manual interaction

5. **`autoJoinOfficialRooms(userId, profile, allRooms)`**
   - Auto-joins user to up to 2 official rooms:
     - One verified base room (e.g., "JFK Crew")
     - One verified fleet room (e.g., "A320 Crew")
   - Only joins if rooms exist and are verified + public
   - Returns count of rooms joined

### C) UI Components

#### 1. `src/components/rooms/SuggestedRoomCard.tsx`
Displays a single room in the suggested section:
- **Room name** (2 lines max)
- **Tags row**: Base, Fleet, Airline
- **Verified badge**: Checkmark + "Verified" text
- **Member count**: Icon + count
- **Join button**: Red CTA with icon

**Props:**
```typescript
type Props = {
  room: Room;
  onJoin: (roomId: string) => Promise<void>;
  isJoining?: boolean;
};
```

#### 2. `src/components/rooms/SuggestedRoomsSection.tsx`
Horizontal scrollable section for suggested rooms:
- **Title**: "Recommended for you" (first-time) or "Suggested"
- **Subtitle**: "Based on your profile" (first-time only)
- **Horizontal ScrollView** with room cards
- **Loading state**: Spinner while fetching

**Props:**
```typescript
type Props = {
  rooms: Room[];
  onJoinRoom: (roomId: string) => Promise<void>;
  isFirstTime?: boolean;
  loading?: boolean;
};
```

### D) Hook Updates

**File:** `src/hooks/useCrewRooms.ts`

#### New State:
- `isFirstTime: boolean` - Tracks if user is first-time visitor

#### Updated Logic:
1. On load, fetches user profile
2. Checks `has_seen_room_suggestions` flag
3. If first-time + empty My Rooms:
   - Calls `autoJoinOfficialRooms()` to auto-join 1-2 official rooms
   - Calls `markSeenSuggestions()` to flip flag
   - Refreshes My Rooms list
4. Always computes suggested rooms using the scoring algorithm
5. Filters out already-joined rooms from suggestions

### E) Screen Integration

**File:** `src/screens/CrewRoomsScreen.tsx`

#### Changes:
1. Imports `SuggestedRoomsSection` component
2. Destructures `isFirstTime` from hook
3. Conditionally renders `SuggestedRoomsSection`:
   ```typescript
   {!roomsError && (myRooms.length === 0 || isFirstTime) && suggestedRooms.length > 0 && (
     <SuggestedRoomsSection
       rooms={suggestedRooms}
       onJoinRoom={handleJoinRoom}
       isFirstTime={isFirstTime}
       loading={loading}
     />
   )}
   ```
4. Appears **before** Discovery section when:
   - No error state
   - User has no rooms yet OR on first visit
   - Suggested rooms exist

## 🚀 First-Time User Flow

1. **User Signs Up**
   - Fills profile: base (JFK), fleet (A320), airline (JetBlue), role (FA)
   - Profile created with `has_seen_room_suggestions = false`

2. **User Opens Crew Rooms**
   - Hook fetches profile → detects first-time
   - Suggests top 8 rooms based on profile match
   - Auto-joins official "JFK Crew" + "A320 Crew" rooms
   - Sets `has_seen_room_suggestions = true`

3. **User Sees Suggested Section**
   - Banner: "Recommended for you - Based on your profile"
   - Shows 4-8 recommended rooms in horizontal scroll
   - Each card shows: name, tags, member count, verified badge, join button

4. **User Joins Room**
   - Taps "Join" on a suggested room
   - Room appears in My Rooms
   - Suggested rooms refresh automatically

5. **Next Visit**
   - `has_seen_room_suggestions = true`
   - Suggested section hidden (but still computed)
   - User only sees "Live Now" discovery

## 🧪 Manual Test Checklist

### Test 1: First-Time User Signup
- [ ] Create new account with profile:
  - Base: JFK
  - Fleet: A320
  - Airline: JetBlue
  - Role: FA
- [ ] Open Crew Rooms tab
- [ ] Verify: Suggested section appears with "Recommended for you"
- [ ] Verify: Top rooms match base/fleet/airline/role
- [ ] Verify: At least 1 room is marked "Verified"
- [ ] Check device console: log shows "Auto-joined X official rooms"

### Test 2: Auto-Join Official Rooms
- [ ] After signup, check My Rooms
- [ ] Should have 2 new official rooms (base + fleet)
- [ ] Verify rooms are marked as verified
- [ ] Verify rooms appear in My Rooms list

### Test 3: Join Suggested Room
- [ ] Tap "Join" on a suggested room card
- [ ] Verify loading spinner appears
- [ ] After join, room appears in My Rooms
- [ ] Suggested section still shows other rooms
- [ ] Join button for that room is no longer visible

### Test 4: First-Time Flag
- [ ] After visiting, close app
- [ ] Reopen app and go to Crew Rooms
- [ ] Verify: Suggested section is hidden
- [ ] Verify: Discovery section (Live Now) still visible
- [ ] Check: `profiles.has_seen_room_suggestions` is true in DB

### Test 5: Different Profiles
- [ ] Test with:
  - Pilot + different base/fleet combo
  - Gate agent
  - User with no fleet preference
- [ ] Verify suggestions adapt to role

### Test 6: Empty Suggestions
- [ ] Create account with obscure base/fleet
- [ ] Verify: Empty state or generic suggestions
- [ ] Verify: No crash, graceful fallback

## 📝 SQL Commands (Manual Testing)

### Reset First-Time Flag
```sql
UPDATE public.profiles
SET has_seen_room_suggestions = false
WHERE id = 'YOUR_USER_ID';
```

### View Profile
```sql
SELECT id, base, fleet, airline, role, has_seen_room_suggestions
FROM public.profiles
WHERE id = 'YOUR_USER_ID';
```

### Check Room Suggestions Score
```sql
-- View all public rooms sorted by member count
SELECT id, name, base, fleet, airline, type, is_verified, member_count
FROM public.rooms
WHERE is_private = false
ORDER BY member_count DESC
LIMIT 20;
```

### Create Official Rooms (if missing)
```sql
INSERT INTO public.rooms (name, type, base, is_verified, is_private, created_by)
VALUES
  ('JFK Crew', 'base', 'JFK', true, false, 'ADMIN_UUID'),
  ('A320 Crew', 'fleet', 'A320', true, false, 'ADMIN_UUID')
ON CONFLICT DO NOTHING;
```

## 🎯 Key Features

✅ **Smart Scoring** - Personalized based on base/fleet/airline/role  
✅ **First-Time Detection** - Uses `has_seen_room_suggestions` flag  
✅ **Auto-Join Official Rooms** - Prevents empty state on first visit  
✅ **No Double Headers** - Suggestions appear in content, not duplicate headers  
✅ **Join from Suggestion** - Direct join button in card  
✅ **Graceful Degradation** - Shows empty state if no suggestions  
✅ **Refresh on Join** - My Rooms updates immediately after joining  

## 📚 Files Modified/Created

### Created:
- `supabase/migrations/006_add_room_suggestions.sql` - Migration
- `src/components/rooms/SuggestedRoomCard.tsx` - Room card component
- `src/components/rooms/SuggestedRoomsSection.tsx` - Scrollable section

### Updated:
- `src/lib/supabase/rooms.ts` - Added 5 new functions
- `src/hooks/useCrewRooms.ts` - Added suggestion algorithm + first-time logic
- `src/screens/CrewRoomsScreen.tsx` - Added SuggestedRoomsSection rendering

## ⚠️ Important Notes

1. **Database Migration**: Run `006_add_room_suggestions.sql` in Supabase SQL Editor before deploying
2. **Official Rooms**: Ensure at least some verified base/fleet rooms exist in DB for auto-join to work
3. **Suggestion Refresh**: After joining a suggested room, `joinRoom()` calls `refetch()` to update suggestions
4. **Score Tuning**: Adjust scoring weights in `computeSuggestedRooms()` if needed based on user feedback
5. **First-Time Banner**: Currently says "Recommended for you" - can be customized in `SuggestedRoomsSection.tsx`

## 🔄 Future Enhancements

- [ ] Add "Dismiss all suggestions" button
- [ ] Track which suggestions user tapped but didn't join
- [ ] A/B test different scoring algorithms
- [ ] Show reason for suggestion (e.g., "Matches your base")
- [ ] Exclude invited-only rooms from suggestions
- [ ] Personalize "Live Now" section based on profile
