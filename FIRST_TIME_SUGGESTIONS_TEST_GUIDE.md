# First-Time Suggestions - Manual Test Scenarios

## Prerequisites
- App is built and running on simulator/device
- Supabase migration `006_add_room_suggestions.sql` has been applied
- At least 5-10 public rooms exist in database with:
  - Various base values (JFK, ORD, LAX, etc.)
  - Various fleet values (A320, B787, etc.)
  - Various airlines (JetBlue, Delta, United, etc.)
  - Some marked as `is_verified = true`
  - Member counts > 0

## Test Scenario 1: Basic First-Time Flow (New User)

### Setup
1. Create new email account or clear app data
2. Sign up with profile:
   - Handle: `testuser1`
   - Display Name: Test User One
   - **Base: JFK**
   - **Fleet: A320**
   - **Airline: JetBlue**
   - **Role: FA**

### Steps
1. Open app
2. Verify email if required
3. Navigate to **Crew Rooms** tab
4. Check device console for logs

### Expected Results
- ✅ Suggested section appears at top with title "Recommended for you"
- ✅ Subtitle shows "Based on your profile"
- ✅ At least 4 suggested rooms visible in horizontal scroll
- ✅ Rooms with "JFK" base appear first
- ✅ Rooms with "A320" fleet appear highly
- ✅ Console log shows: `[First-time] Auto-joined X official rooms`
- ✅ My Rooms section now shows 1-2 newly joined rooms
- ✅ All cards show proper styling with tags, member count, verified badge
- ✅ Room cards are clickable and tap-responsive

---

## Test Scenario 2: Auto-Join Official Rooms

### Setup
Same as Scenario 1 - complete signup

### Steps
1. Check Supabase: Verify official rooms exist
   ```
   SELECT * FROM rooms 
   WHERE is_verified = true 
   AND (base = 'JFK' OR fleet = 'A320')
   LIMIT 10;
   ```
2. Open Crew Rooms tab
3. Check My Rooms section

### Expected Results
- ✅ Exactly 1-2 new rooms appear in My Rooms
- ✅ New rooms match user's base and fleet
- ✅ New rooms are marked verified (blue checkmark badge)
- ✅ Room was not previously in My Rooms (fresh account)

### Debugging
If no auto-join:
- Check console for errors in `autoJoinOfficialRooms()`
- Verify official rooms have `is_verified = true`
- Verify official rooms have `is_private = false`
- Verify rooms with type 'base' or 'local' exist for base
- Verify rooms with type 'fleet' or 'aircraft' exist for fleet

---

## Test Scenario 3: Join from Suggested Room

### Setup
Complete Scenario 1 first

### Steps
1. Find a suggested room that's NOT in My Rooms
2. Tap the red "Join" button on its card
3. Watch for loading state
4. Check My Rooms section
5. Check if room reappears in suggestions

### Expected Results
- ✅ "Join" button shows loading spinner
- ✅ After ~1-2 seconds, spinner disappears
- ✅ Room appears in My Rooms list
- ✅ Suggested section refreshes
- ✅ Joined room no longer visible in suggestions
- ✅ Button state restored (no UI stuck)
- ✅ If error occurs, graceful error message shown

### Debugging
If join fails:
- Check device console for network errors
- Verify room exists in Supabase
- Verify `joinRoom()` function called correctly
- Check if `room_members` table was updated

---

## Test Scenario 4: First-Time Flag Persistence

### Setup
Complete Scenario 1 and 3 (at least one join)

### Steps
1. Close app completely
2. Wait 2 seconds
3. Reopen app
4. Navigate to Crew Rooms tab
5. Check if suggested section is still visible

### Expected Results
- ✅ Suggested section is **hidden** on second visit
- ✅ Only "Live Now" discovery section visible (or "Trending" tabs)
- ✅ My Rooms shows joined rooms from previous session
- ✅ In Supabase, check: `has_seen_room_suggestions = true` for user

### Database Verification
```sql
SELECT has_seen_room_suggestions, created_at
FROM public.profiles
WHERE handle = 'testuser1';
-- Should show: has_seen_room_suggestions = true
```

---

## Test Scenario 5: Different Profile - Pilot

### Setup
Create another account with profile:
- Handle: `testpilot1`
- Display Name: Test Pilot
- **Base: ORD**
- **Fleet: B787**
- **Airline: United**
- **Role: Pilot**

### Steps
1. Navigate to Crew Rooms tab
2. Check suggested rooms
3. Compare with Scenario 1

### Expected Results
- ✅ Suggested section appears with different rooms
- ✅ Rooms with "ORD" base score higher
- ✅ Rooms with "B787" fleet score higher
- ✅ Rooms with "United" airline score higher
- ✅ Role-specific rooms (commuters/swap) show if any
- ✅ Different from Scenario 1 suggestions

---

## Test Scenario 6: Different Profile - Gate Agent

### Setup
Create account with profile:
- Handle: `testgate1`
- Display Name: Test Gate
- **Base: LAX**
- **Fleet: (empty or N/A)**
- **Airline: Southwest**
- **Role: Gate**

### Steps
1. Navigate to Crew Rooms tab
2. Check suggested rooms
3. Check if auto-join still works with empty fleet

### Expected Results
- ✅ Suggested section shows rooms matching LAX base
- ✅ No fleet-specific rooms prioritized (empty fleet)
- ✅ Rooms with Southwest airline score higher
- ✅ Auto-join only joins base room (fleet room not found)
- ✅ Still shows 1-2 suggested rooms minimum

---

## Test Scenario 7: Empty Suggestions Fallback

### Setup
Create account with profile:
- Handle: `testrare1`
- Display Name: Test Rare
- **Base: XYZ** (non-existent)
- **Fleet: FAKE**
- **Airline: Unicorn Air**
- **Role: FA**

### Steps
1. Navigate to Crew Rooms tab
2. Check if app crashes or errors
3. Check suggested section

### Expected Results
- ✅ **No crash** - graceful handling
- ✅ Suggested section may show generic rooms (by popularity)
- ✅ Or suggested section hidden (empty state)
- ✅ My Rooms shows no auto-joined rooms
- ✅ Discovery section (Live Now) still visible and usable
- ✅ User can still create/browse rooms normally

---

## Test Scenario 8: Pagination & Scroll

### Setup
Complete Scenario 1

### Steps
1. In Suggested section, scroll horizontally
2. Check if all suggested rooms are visible
3. Scroll back to first room
4. Tap a room card from the middle

### Expected Results
- ✅ Smooth horizontal scroll in suggested section
- ✅ All 8 rooms (or fewer) visible by scrolling
- ✅ No lag or jank during scroll
- ✅ Room cards are consistent size
- ✅ Tap any card to join works from any position
- ✅ No visual clipping or overflow

---

## Test Scenario 9: Concurrent Joins

### Setup
Complete Scenario 1

### Steps
1. Quickly tap "Join" on multiple suggested rooms (2-3 rapid taps)
2. Wait for all to complete
3. Check My Rooms

### Expected Results
- ✅ All join requests queued/handled properly
- ✅ No duplicate joins
- ✅ All rooms appear in My Rooms
- ✅ No UI corruption or stuck buttons
- ✅ Loading spinners managed correctly

### Debugging
If duplicates occur:
- Check `room_members` table for duplicates
- Verify `PRIMARY KEY (room_id, user_id)` constraint working
- Check if `joinRoom()` has race condition handling

---

## Test Scenario 10: Existing User Gets Feature

### Setup
- Account that exists in DB with `has_seen_room_suggestions = false`
- Use admin SQL or reset flag:
  ```sql
  UPDATE profiles SET has_seen_room_suggestions = false WHERE id = 'USER_ID';
  ```

### Steps
1. Sign in as existing user
2. Navigate to Crew Rooms
3. Check if suggestions appear

### Expected Results
- ✅ Suggestions appear even for existing users (on next visit)
- ✅ `has_seen_room_suggestions` flips to true after visit
- ✅ Auto-join only happens if My Rooms is empty (won't rejoin)
- ✅ User not disrupted by auto-join (existing rooms remain)

---

## Console Logs to Check

When testing, open device console and look for:

### Success Logs
```
[First-time] Auto-joined 2 official rooms
Error fetching user profile: null
Error marking seen suggestions: null
```

### Expected Patterns
1. First visit: Auto-join log appears
2. Subsequent visits: Auto-join log does NOT appear
3. No error logs for profile/suggestions functions

### Troubleshooting Logs
```
Error fetching user profile: <error message>
Error marking seen suggestions: <error message>
Error joining room: <error message>
```

---

## Network/Timing Tests

### Test A: Slow Network
1. Throttle network to "Slow 4G" in DevTools
2. Open Crew Rooms
3. Watch suggestion section load

Expected: Skeleton/placeholder shown, then rooms appear

### Test B: Room Server Down
1. Temporarily make Supabase rooms endpoint inaccessible
2. Open Crew Rooms

Expected: Graceful error message, suggestions hidden, other sections still work

---

## Accessibility Tests

- [ ] Tap "Join" button with VoiceOver enabled
- [ ] Check button sizes (minimum 44x44 points)
- [ ] Read all text labels aloud - should be clear
- [ ] Test with reduced motion (animation should still work)
- [ ] Color contrast in tags/badges meets WCAG AA

---

## Performance Tests

### Measure with Profiler
1. Record Crew Rooms screen load (Scenario 1)
2. Check timing:
   - Profile fetch: < 200ms
   - Rooms fetch: < 300ms
   - Suggestion compute: < 50ms (client-side)
   - Total load: < 1 second

### Memory Profiling
- Check no memory leaks after multiple joins
- Verify component cleanup when unmounting

---

## Reset User Data (For Re-Testing)

### Option A: Clear App Data
```
iOS Simulator: Simulator > Device > Erase All Content and Settings
Android Emulator: AVD > Wipe Data
```

### Option B: Reset Supabase Profile
```sql
UPDATE public.profiles
SET has_seen_room_suggestions = false
WHERE id = 'USER_ID';

DELETE FROM public.room_members
WHERE user_id = 'USER_ID';
```

Then sign back in and re-test.

---

## Success Criteria

All tests should pass before shipping:
- [ ] Scenario 1-4: Core flow works (9 checks ✅)
- [ ] Scenario 5-6: Multi-profile scoring works
- [ ] Scenario 7: Edge cases handled gracefully
- [ ] Scenario 8-9: UI/UX responsive and smooth
- [ ] Scenario 10: Existing users not disrupted
- [ ] Console: No unexpected errors
- [ ] Performance: All operations < 1 second
- [ ] Accessibility: WCAG AA compliant
