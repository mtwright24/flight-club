# Optional: Mark Room as Read Integration

This document shows how to optionally integrate `markRoomAsRead()` into your existing room chat screen to update the "last read" timestamp when a user opens a room.

## Integration Point

In **app/room/[id].tsx**, add this hook call after you fetch the room:

```tsx
import { markRoomAsRead } from '../../src/lib/supabase/rooms';
import { useAuth } from '../../src/hooks/useAuth';

export default function RoomDetail() {
  const params = useLocalSearchParams();
  const { id: roomId } = params as any;
  const { session } = useAuth();
  
  // ... existing code ...

  useEffect(() => {
    // Mark room as read when user opens it
    if (session?.user?.id && roomId) {
      markRoomAsRead(session.user.id, roomId).catch((err) => {
        console.warn('Failed to mark room as read:', err);
      });
    }
  }, [session?.user?.id, roomId]);

  // ... rest of component ...
}
```

## Effect

- Calling this will update `room_members.last_read_at` to current timestamp
- Next time user returns to Crew Rooms screen, unread count will be recalculated
- "Continue where you left off" card will show updated time
- Unread badge will disappear from room list item (if all messages are read)

## Alternative: Mark as Read on First Message Load

If you want to defer until messages are actually visible:

```tsx
useEffect(() => {
  // Mark room as read after messages load
  if (session?.user?.id && roomId && messages.length > 0) {
    markRoomAsRead(session.user.id, roomId);
  }
}, [messages, session?.user?.id, roomId]);
```

## Testing

1. Open Crew Rooms screen
2. Note the unread count on a room
3. Tap into the room
4. Go back to Crew Rooms
5. Unread count should be cleared (or updated)

---

**Note**: This is optional. The system works without it, but users' read status won't be tracked.
