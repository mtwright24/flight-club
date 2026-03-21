# First-Time Suggestions - Code Changes Summary

## Files Created

### 1. `supabase/migrations/006_add_room_suggestions.sql`
```sql
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS has_seen_room_suggestions boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_has_seen_suggestions 
  ON public.profiles(has_seen_room_suggestions);
```

### 2. `src/components/rooms/SuggestedRoomCard.tsx`
- Card component for individual suggested room
- Shows: name, tags (base/fleet/airline), member count, verified badge, join button
- Props: `{ room, onJoin, isJoining }`

### 3. `src/components/rooms/SuggestedRoomsSection.tsx`
- Horizontal scrollable section containing suggested rooms
- Shows: "Recommended for you" (first-time) or "Suggested"
- Props: `{ rooms, onJoinRoom, isFirstTime, loading }`

## Files Updated

### 1. `src/lib/supabase/rooms.ts` - Added 5 Functions

```typescript
// Fetch user profile with suggestion fields
export async function fetchUserProfile(userId: string)

// Fetch all public rooms for suggestion computation
export async function fetchPublicRoomsForSuggestion(limit: number = 200)

// Score and rank rooms based on user profile match
export function computeSuggestedRooms(profile, allRooms, userRoomIds?)

// Mark user as having seen suggestions
export async function markSeenSuggestions(userId: string)

// Auto-join user to official base + fleet rooms
export async function autoJoinOfficialRooms(userId, profile, allRooms)
```

**Scoring Algorithm:**
- Base match: +50
- Fleet match: +40
- Airline match: +30
- Role-specific rooms (FA): +15
- Verified badge: +10
- Popularity bonus: +min(member_count/100, 10)

### 2. `src/hooks/useCrewRooms.ts` - Integrated Suggestions

**Added State:**
```typescript
const [isFirstTime, setIsFirstTime] = useState(false);
```

**Added to Return:**
```typescript
export interface UseCrewRoomsState {
  // ... existing
  isFirstTime: boolean;  // NEW
}
```

**Updated fetchData() Logic:**
```typescript
// 1. Fetch user profile
const userProfile = await fetchUserProfile(userId);

// 2. Detect first-time
const firstTime = userProfile && !userProfile.has_seen_room_suggestions;
setIsFirstTime(firstTime);

// 3. Compute suggestions based on profile
const allPublicRooms = await fetchPublicRoomsForSuggestion(200);
const suggested = computeSuggestedRooms(userProfile, allPublicRooms, myRoomIds);
setSuggestedRooms(suggested);

// 4. Auto-join on first-time if no rooms yet
if (firstTime && rooms.length === 0) {
  await autoJoinOfficialRooms(userId, userProfile, allPublicRooms);
  await markSeenSuggestions(userId);
  // Refresh rooms
}
```

### 3. `src/screens/CrewRoomsScreen.tsx` - Render Suggestions

**Added Import:**
```typescript
import SuggestedRoomsSection from '../components/rooms/SuggestedRoomsSection';
```

**Destructured from Hook:**
```typescript
const { isFirstTime, ... } = crewRoomsState;
```

**Render Condition:**
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

## Deployment Checklist

- [ ] Run migration: `006_add_room_suggestions.sql` in Supabase SQL Editor
- [ ] Ensure official rooms exist (base + fleet rooms marked verified)
- [ ] Deploy code changes
- [ ] Test with new user account
- [ ] Verify first-time banner appears
- [ ] Verify auto-join works
- [ ] Check flag updates on second visit
- [ ] Monitor error logs for suggestion computation failures

## Performance Notes

- Suggestions fetch up to 200 public rooms but only return top 8
- Computation happens client-side using simple scoring algorithm
- No additional database queries needed beyond initial profile + rooms fetch
- Lazy evaluation: suggestions only computed if user is first-time or has no rooms

## Backwards Compatibility

- `has_seen_room_suggestions` defaults to `false` for existing users
- Existing users will see suggestions on next app load (but can be disabled)
- No breaking changes to Room or Profile table structures
- All new functions are additive, no modifications to existing functions
