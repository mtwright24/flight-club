# Flight Club Feed Update - Testing Guide

## Overview
The Flight Club Group Feed has been updated to behave like Facebook's group feed with in-feed reactions, comment previews, quick commenting, post management, and improved image display.

## What Changed

### 1. **In-Feed Reactions** ✅
- Users can now react directly from the feed without navigating away
- Tap "React" button to open reaction tray above the post
- Optimistic updates provide instant feedback
- Reactions update immediately in the feed

### 2. **Comment Preview** ✅
- Last 2 comments shown inline on each post
- "View all X comments" link to open full comment thread
- Comment count displayed in social summary row

### 3. **Quick Comment Input** ✅
- Add comments directly from the feed
- "Write a comment..." input at bottom of each post
- Comments appear immediately in preview

### 4. **Post Menu (3-Dot)** ✅
- **For your own posts:**
  - Edit post (opens modal with current content)
  - Delete post (with confirmation dialog)
- **For others' posts:**
  - Save post (placeholder - coming soon)
  - Report post (placeholder - coming soon)

### 5. **Better Image Display** ✅
- Images use `resizeMode="contain"` for proper aspect ratio
- Increased height from 350px to 400px
- No more cropped faces or important content

### 6. **Performance Optimizations** ✅
- Batch queries for reactions: `fetchPostReactionsSummary()`
- Batch queries for comments: `fetchCommentPreviews()`
- Single query per feed load instead of N+1 queries

## Manual Testing Steps

### Test 1: React to Posts in Feed
1. Open a crew room with posts
2. Scroll through the feed
3. Tap the "React" button on any post
4. Verify reaction tray appears above the button
5. Select a reaction (e.g., 👍 Solid)
6. Verify:
   - ✅ Reaction tray closes
   - ✅ Reaction count updates immediately
   - ✅ "React" button shows your selected emoji/label
   - ✅ You stay on the feed (no navigation)
7. Tap "React" again
8. Select the same reaction to remove it
9. Verify:
   - ✅ Reaction is removed
   - ✅ Button returns to "React"

### Test 2: View Comment Previews
1. Find a post with comments in the feed
2. Verify you see:
   - ✅ Last 1-2 comments displayed inline
   - ✅ "View all X comments" link if more than 2 comments
   - ✅ Comment count in social summary row
3. Tap "View all comments"
4. Verify:
   - ✅ Navigates to Post Detail screen
   - ✅ All comments are visible

### Test 3: Quick Comment from Feed
1. Find any post in the feed
2. Tap in the "Write a comment..." input at bottom of post
3. Type a comment (e.g., "Great post!")
4. Tap the send icon (or press enter)
5. Verify:
   - ✅ Comment sends immediately
   - ✅ Input clears
   - ✅ Comment appears in preview section
   - ✅ Comment count increments
   - ✅ You stay on the feed

### Test 4: Edit Your Own Post
1. Find a post you created in the feed
2. Tap the 3-dot menu (••• ) in top-right of post header
3. Tap "Edit post"
4. Verify:
   - ✅ Edit modal opens
   - ✅ Current content is pre-filled
5. Modify the text (e.g., add "UPDATED: " prefix)
6. Tap "Save"
7. Verify:
   - ✅ Modal closes
   - ✅ Post content updates in feed
   - ✅ No navigation away from feed

### Test 5: Delete Your Own Post
1. Find a post you created in the feed
2. Tap the 3-dot menu (••• )
3. Tap "Delete post"
4. Verify:
   - ✅ Confirmation dialog appears
   - ✅ Message warns deletion cannot be undone
5. Tap "Delete"
6. Verify:
   - ✅ Post is removed from feed immediately
   - ✅ No error toast appears

### Test 6: Report/Save Others' Posts
1. Find a post created by someone else
2. Tap the 3-dot menu (••• )
3. Verify menu shows:
   - ✅ "Save post" option
   - ✅ "Report post" option
   - ✅ NO "Edit post" or "Delete post" (you're not the author)
4. Tap "Save post" or "Report post"
5. Verify:
   - ✅ "Coming Soon" alert appears (placeholder functionality)

### Test 7: Image Display (No Cropping)
1. Find a post with images in the feed
2. Verify:
   - ✅ Full image is visible (not cropped)
   - ✅ Aspect ratio is preserved
   - ✅ Image uses contain mode
   - ✅ Image background is subtle (not harsh)
3. Tap image
4. Verify:
   - ✅ Opens full-screen image viewer

### Test 8: Social Summary Row
1. Find a post with reactions and comments
2. Verify social summary row shows:
   - ✅ "X reactions" on left
   - ✅ "X comments" on right
3. Tap on "X comments"
4. Verify:
   - ✅ Navigates to Post Detail screen

### Test 9: Navigation Logic
1. In the feed, tap on various elements:
   - Post text/content → ✅ Opens Post Detail
   - "React" button → ✅ Opens reaction tray (NO navigation)
   - Reaction emoji/label → ✅ Opens reaction tray (NO navigation)
   - "Comment" button → ✅ Opens Post Detail
   - "View all comments" → ✅ Opens Post Detail
   - Comment count → ✅ Opens Post Detail
   - Image → ✅ Opens image viewer
   - 3-dot menu → ✅ Opens action sheet (NO navigation)

### Test 10: Performance Check
1. Open a crew room with 10+ posts
2. Verify:
   - ✅ Feed loads quickly
   - ✅ All reactions load at once (not one-by-one)
   - ✅ All comment previews load at once
   - ✅ No visible lag or jank
3. Check console for errors
4. Verify:
   - ✅ No N+1 query warnings
   - ✅ No excessive re-renders

## Known Issues / Edge Cases

### Placeholder Features (Coming Soon)
- "Save post" functionality (shows alert)
- "Report post" functionality (shows alert)
- Multi-image posts (currently shows stacked, could be improved with carousel)

### Limitations
- Comment preview only shows "You" as username (needs user profile integration)
- Images use fixed 400px height (could be dynamic based on aspect ratio)
- Edit post only supports text (media editing not implemented)

## Technical Details

### New Components Created
1. `ActionSheet.tsx` - Bottom sheet for post menu
2. `CommentPreview.tsx` - Inline comment display
3. `QuickCommentInput.tsx` - In-feed comment input
4. `EditPostModal.tsx` - Modal for editing posts

### Updated Components
1. `PostsFeed.tsx` - Complete refactor with all new features
2. `RoomHomeScreenImpl.tsx` - Now uses PostsFeed component

### New API Functions
1. `updateRoomPost()` - Update post content
2. `fetchCommentPreviews()` - Batch fetch comment previews

### Updated Styles
- `colors.primary` - Added for primary action color
- `colors.error` - Added for destructive actions
- `colors.inputBg` - Added for input backgrounds
- `colors.background` - Added for screen backgrounds
- `radius.full` - Added for fully rounded elements

## Rollback Plan

If issues are found, rollback by:
1. Restore `PostsFeed.tsx` from git history
2. Restore `RoomHomeScreenImpl.tsx` from git history
3. Remove new component files
4. Restore `posts.ts` API functions

## Success Criteria

✅ All reactions work in-feed without navigation
✅ Comment previews display correctly
✅ Quick comments can be added from feed
✅ Edit/delete works for own posts
✅ Images display without cropping
✅ Feed performance is smooth (no N+1 queries)
✅ Navigation only happens on specific taps
✅ Flight Club styling is preserved

## Next Steps / Future Enhancements

1. Integrate user profiles for real names/avatars
2. Add dynamic image height based on aspect ratio
3. Implement save/report post functionality
4. Add image carousel for multi-image posts
5. Add ability to edit post media
6. Add reactions to comments (already in detail screen)
7. Add "Share post" functionality
8. Add pull-to-refresh on feed
