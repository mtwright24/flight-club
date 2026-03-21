# Supabase Database Setup Guide

## ⚠️ Current Issue
The app is failing with: **`column room_members.pinned does not exist`**

This means your Supabase database tables haven't been created yet. Follow these steps to set them up.

---

## 🔧 Setup Steps

### 1. Open Supabase Console
1. Go to [supabase.com](https://supabase.com) and sign in
2. Select your project (Flight Club)
3. Navigate to **SQL Editor** (left sidebar)

### 2. Run This SQL Script
Copy and paste the entire script below into the SQL Editor and click **Run**:

```sql
-- Create rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  base text,
  fleet text,
  airline text,
  is_private boolean DEFAULT false,
  is_verified boolean DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  last_message_at timestamptz,
  last_message_text text,
  member_count int DEFAULT 0,
  live_count int DEFAULT 0
);

-- Create room_members table
CREATE TABLE IF NOT EXISTS public.room_members (
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text DEFAULT 'member',
  pinned boolean DEFAULT false,
  last_read_at timestamptz,
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

-- Create room_messages table
CREATE TABLE IF NOT EXISTS public.room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_room_members_user ON public.room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_room_members_room ON public.room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_messages_room ON public.room_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_rooms_created_by ON public.rooms(created_by);
CREATE INDEX IF NOT EXISTS idx_rooms_is_private ON public.rooms(is_private);
```

### 3. Configure Row-Level Security (RLS)

Navigate to **Authentication** > **Policies** and enable RLS on these tables:
- `rooms`
- `room_members`
- `room_messages`

For **testing purposes**, you can temporarily disable RLS:
1. Go to each table
2. Click **Edit RLS**
3. Toggle **Enable RLS** OFF (or use the policies below for production)

**Production RLS Policies** (optional - for security):

```sql
-- rooms: users can see public rooms or rooms they're members of
CREATE POLICY rooms_public_or_member ON public.rooms
  FOR SELECT USING (
    is_private = false OR 
    auth.uid() IN (SELECT user_id FROM public.room_members WHERE room_id = id)
  );

-- room_members: users can only see their own memberships
CREATE POLICY room_members_own ON public.room_members
  FOR SELECT USING (auth.uid() = user_id);

-- room_messages: users can see messages in rooms they're members of
CREATE POLICY room_messages_member ON public.room_messages
  FOR SELECT USING (
    room_id IN (SELECT room_id FROM public.room_members WHERE user_id = auth.uid())
  );
```

### 4. Restart Your App

After creating the tables, restart your Expo app:
```bash
# If running in terminal:
# Press R to reload, or restart the simulator
```

---

## ✅ Verification

Once set up, you should see:
- ✅ No "column room_members.pinned does not exist" error
- ✅ Crew Rooms screen loads with My Rooms inbox
- ✅ Continue card appears (if you have previous activity)
- ✅ Create Room sheet works
- ✅ Join Room functionality works

---

## 🔍 Troubleshooting

### Still getting "column X does not exist"?
1. Verify tables were created:
   - Go to **Table Editor** in Supabase
   - Check you see: `rooms`, `room_members`, `room_messages`
   
2. If tables exist but error persists:
   - Hard refresh the app: restart Expo completely
   - Check browser console for other errors

### RLS issues (can't read data)?
- Temporarily disable RLS for testing (see step 3)
- Or ensure policies are set correctly

### Foreign key errors?
- Verify `auth.users` table exists (it's auto-created by Supabase Auth)
- Check that user IDs in your session match the auth.users table

---

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Row-Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [SQL Reference](https://supabase.com/docs/guides/database/introduction)
