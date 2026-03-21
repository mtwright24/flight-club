# First-Time Suggestions - Quick Start

## 🚀 Deploy in 3 Steps

### Step 1: Run Migration
Go to Supabase Console > SQL Editor and run:

```sql
-- File: supabase/migrations/006_add_room_suggestions.sql
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS has_seen_room_suggestions boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_has_seen_suggestions 
  ON public.profiles(has_seen_room_suggestions);
```

**Verify:**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name = 'has_seen_room_suggestions';
```

### Step 2: Deploy Code
All code files are already in place:
- ✅ `src/lib/supabase/rooms.ts` - 5 new functions added
- ✅ `src/hooks/useCrewRooms.ts` - Suggestion logic integrated
- ✅ `src/screens/CrewRoomsScreen.tsx` - UI rendering integrated
- ✅ `src/components/rooms/SuggestedRoomCard.tsx` - Card component
- ✅ `src/components/rooms/SuggestedRoomsSection.tsx` - Section component

Just deploy normally. No additional env vars needed.

### Step 3: Test
1. Create new user account with profile
2. Open Crew Rooms tab
3. Should see "Recommended for you" section at top
4. Tap Join on a room
5. Room appears in My Rooms

Done! 🎉

---

## 📋 What It Does

**For New Users:**
- Automatically suggests 8 rooms matching their Base/Fleet/Airline/Role
- Auto-joins them to 1-2 official rooms so they're not alone
- Shows personalized "Recommended for you" banner

**Algorithm:**
- Base match: +50 points
- Fleet match: +40 points  
- Airline match: +30 points
- FA-specific room types: +15 points
- Verified room: +10 points
- Popularity bonus: up to +10 points

**Result:** Top 8 rooms ranked by relevance

---

## 🔧 Configuration (Optional)

### Adjust Scoring
Edit `src/lib/supabase/rooms.ts` in `computeSuggestedRooms()`:

```typescript
// Increase base weight to 75
if (profile.base && room.base && ...) {
  score += 75;  // was 50
}

// Add new scoring rule
if (room.type === 'commuters') {
  score += 20;
}
```

### Change Banner Text
Edit `src/components/rooms/SuggestedRoomsSection.tsx`:

```typescript
<Text style={styles.title}>
  {isFirstTime ? "Suggested Rooms" : "Suggested"}  // was "Recommended for you"
</Text>
```

### Hide for Existing Users
Edit `src/screens/CrewRoomsScreen.tsx`:

```typescript
// Change this:
{!roomsError && (myRooms.length === 0 || isFirstTime) && ...}

// To only show if empty:
{!roomsError && myRooms.length === 0 && ...}
```

---

## 🐛 Troubleshooting

### "No suggestions appearing"
1. Check console: Any errors in `fetchUserProfile()`?
2. Verify user profile has `base`, `fleet`, `airline`, `role` set
3. Verify public rooms exist with matching fields
4. Run: `SELECT COUNT(*) FROM rooms WHERE is_private = false;`

### "Can't join suggested room"
1. Check console error in `joinRoom()`
2. Verify room exists and is public
3. Verify user isn't already a member
4. Check Supabase auth token is valid

### "Auto-join not working"
1. Check console: Does log show `[First-time] Auto-joined X`?
2. Verify official rooms exist:
   ```sql
   SELECT * FROM rooms 
   WHERE is_verified = true 
   AND type IN ('base', 'fleet', 'local', 'aircraft')
   LIMIT 10;
   ```
3. If no official rooms, create them:
   ```sql
   INSERT INTO rooms (name, type, base, is_verified, is_private, created_by)
   VALUES ('JFK Crew', 'base', 'JFK', true, false, 'admin-id')
   ```

### "Flag not updating"
1. Verify migration ran successfully
2. Check: `SELECT has_seen_room_suggestions FROM profiles LIMIT 1;`
3. Reset flag: `UPDATE profiles SET has_seen_room_suggestions = false;`

---

## 📊 Monitor

### Key Metrics
```sql
-- How many first-time users saw suggestions?
SELECT COUNT(DISTINCT user_id) as first_time_users
FROM profiles
WHERE has_seen_room_suggestions = true
AND created_at > NOW() - INTERVAL '7 days';

-- Average rooms joined per first-time user
SELECT AVG(room_count) FROM (
  SELECT user_id, COUNT(*) as room_count
  FROM room_members
  WHERE user_id IN (
    SELECT id FROM profiles WHERE has_seen_room_suggestions = true
  )
  GROUP BY user_id
);

-- Top suggested rooms
SELECT name, COUNT(*) as join_count
FROM room_members
WHERE joined_at > NOW() - INTERVAL '7 days'
GROUP BY name
ORDER BY join_count DESC
LIMIT 10;
```

---

## 🎯 Expected Outcomes

After launch:
- ✅ 80%+ of new users see suggestions
- ✅ 50%+ of new users click join at least once
- ✅ 70%+ retention to join suggested room
- ✅ Reduced "empty rooms" complaints
- ✅ Better user onboarding experience

---

## 📚 Full Documentation

For detailed info, see:
- `FIRST_TIME_SUGGESTIONS_GUIDE.md` - Architecture & implementation
- `FIRST_TIME_SUGGESTIONS_TEST_GUIDE.md` - 10 test scenarios
- `FIRST_TIME_SUGGESTIONS_CODE_REFERENCE.md` - Code snippets

---

## 🚨 Known Limitations

1. **Suggestion Compute** happens on every load (not cached)
   - Solution: Add Redis caching layer if needed
2. **Official Rooms** must be manually created
   - Solution: Add admin dashboard to auto-create
3. **No A/B Testing** built-in
   - Solution: Add feature flag later
4. **Scoring Algorithm** is static
   - Solution: ML-based ranking in future

---

## ✅ Checklist

Before going live:
- [ ] Migration applied to Supabase
- [ ] Official rooms created for major bases/fleets
- [ ] Test with 3+ new user accounts
- [ ] Verify no console errors
- [ ] Check performance (< 1 second load)
- [ ] Monitor error logs 24 hours
- [ ] Get stakeholder sign-off

---

## 🎉 You're Done!

The first-time user suggestion feature is now live. Users will see personalized room recommendations when they open Crew Rooms for the first time.

**Questions?** Check the full docs or search the code for `[First-time]` comments.
