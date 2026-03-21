import { supabase } from '../supabaseClient';
import { Room, MyRoom, RoomMember, CreateRoomPayload } from '../../types/rooms';

/**
 * Fetch all rooms the user is a member of, with unread counts and sorting metadata.
 */
export async function fetchMyRooms(userId: string): Promise<MyRoom[]> {
  try {
    const { data: memberships, error: memberError } = await supabase
      .from('room_members')
      .select('room_id, pinned, last_read_at, joined_at, user_id')
      .eq('user_id', userId);

    if (memberError) throw memberError;
    if (!memberships || memberships.length === 0) return [];

    const roomIds = memberships.map((m) => m.room_id);

    // Fetch room details
    const { data: rooms, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .in('id', roomIds);

    if (roomError) throw roomError;
    if (!rooms) return [];

    // Fetch unread counts for each room
    const myRooms: MyRoom[] = [];

    for (const room of rooms) {
      const membership = memberships.find((m) => m.room_id === room.id);
      if (!membership) continue;

      // Count unread messages
      let unread_count = 0;
      if (membership.last_read_at) {
        const { count, error: countError } = await supabase
          .from('room_messages')
          .select('id', { count: 'exact', head: true })
          .eq('room_id', room.id)
          .gt('created_at', membership.last_read_at);

        if (!countError && count !== null) {
          unread_count = count;
        }
      } else {
        // If never read, count all messages since joined
        const { count, error: countError } = await supabase
          .from('room_messages')
          .select('id', { count: 'exact', head: true })
          .eq('room_id', room.id)
          .gte('created_at', membership.joined_at);

        if (!countError && count !== null) {
          unread_count = count;
        }
      }

      myRooms.push({
        ...room,
        unread_count,
        pinned: membership.pinned || false,
        last_read_at: membership.last_read_at,
        joined_at: membership.joined_at,
      });
    }

    // Sort: pinned first, then unread desc, then last_message_at desc, then name asc
    myRooms.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.unread_count !== b.unread_count) return b.unread_count - a.unread_count;
      if (a.last_message_at && b.last_message_at) {
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      }
      return a.name.localeCompare(b.name);
    });

    return myRooms;
  } catch (error) {
    console.error('Error fetching my rooms:', error);
    throw error;
  }
}

/**
 * Get the last active room for a user (to show in "Continue" strip).
 */
export async function getLastActiveRoom(userId: string): Promise<MyRoom | null> {
  try {
    const { data: memberships, error } = await supabase
      .from('room_members')
      .select('room_id, last_read_at, joined_at, pinned')
      .eq('user_id', userId)
      .order('last_read_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!memberships || memberships.length === 0) return null;

    const membership = memberships[0];

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', membership.room_id)
      .single();

    if (roomError) throw roomError;
    if (!room) return null;

    // Count unread
    let unread_count = 0;
    if (membership.last_read_at) {
      const { count } = await supabase
        .from('room_messages')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', room.id)
        .gt('created_at', membership.last_read_at);

      if (count !== null) unread_count = count;
    }

    return {
      ...room,
      unread_count,
      pinned: membership.pinned || false,
      last_read_at: membership.last_read_at,
      joined_at: membership.joined_at,
    };
  } catch (error) {
    console.error('Error fetching last active room:', error);
    return null;
  }
}

/**
 * Fetch public rooms with optional filters for discovery.
 */
export async function fetchPublicRooms(filters?: {
  search?: string;
  base?: string;
  fleet?: string;
  airline?: string;
  limit?: number;
}): Promise<Room[]> {
  try {
    let query = supabase.from('rooms').select('*').eq('is_private', false);

    if (filters?.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }
    if (filters?.base) {
      query = query.eq('base', filters.base);
    }
    if (filters?.fleet) {
      query = query.eq('fleet', filters.fleet);
    }
    if (filters?.airline) {
      query = query.eq('airline', filters.airline);
    }

    const limit = filters?.limit || 20;
    const { data, error } = await query
      .order('last_message_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching public rooms:', error);
    return [];
  }
}

/**
 * Check for duplicate room (same normalized name + same base/fleet/airline/type).
 */
export async function checkDuplicateRoom(
  name: string,
  type: string,
  base?: string | null,
  fleet?: string | null,
  airline?: string | null,
): Promise<Room | null> {
  try {
    const normalizedName = name.toLowerCase().trim();

    let query = supabase
      .from('rooms')
      .select('*')
      .ilike('name', normalizedName)
      .eq('type', type);

    if (base) query = query.eq('base', base);
    if (fleet) query = query.eq('fleet', fleet);
    if (airline) query = query.eq('airline', airline);

    const { data, error } = await query.maybeSingle();

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.error('Error checking duplicate:', error);
    return null;
  }
}

/**
 * Check rate limit: max 1 public room per 24h per user.
 */
export async function checkRateLimit(userId: string): Promise<boolean> {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const { count, error } = await supabase
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .eq('is_private', false)
      .gte('created_at', oneDayAgo.toISOString());

    if (error) throw error;

    // Return true if NO rooms created (i.e., under limit)
    return (count || 0) === 0;
  } catch (error) {
    console.error('Error checking rate limit:', error);
    return false;
  }
}

/**
 * Create a new room with spam-resistant checks.
 */
export async function createRoomWithTemplate(
  userId: string,
  payload: CreateRoomPayload,
): Promise<{ success: boolean; room?: Room; message?: string }> {
  try {
    // Check for duplicate
    const duplicate = await checkDuplicateRoom(
      payload.name,
      payload.type,
      payload.base,
      payload.fleet,
      payload.airline,
    );

    if (duplicate) {
      return {
        success: false,
        message: 'This room already exists. Join it instead!',
        room: duplicate,
      };
    }

    // Check rate limit only for public rooms
    if (!payload.is_private) {
      const underLimit = await checkRateLimit(userId);
      if (!underLimit) {
        return {
          success: false,
          message: 'You can create another public room tomorrow. Create a private crew room instead.',
        };
      }
    }

    // Create the room
    const { data: room, error } = await supabase
      .from('rooms')
      .insert([
        {
          name: payload.name,
          type: payload.type,
          base: payload.base || null,
          fleet: payload.fleet || null,
          airline: payload.airline || null,
          is_private: payload.is_private,
          is_verified: false,
          created_by: userId,
          member_count: 1,
          live_count: 0,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    if (!room) throw new Error('Failed to create room');

    // Add creator as admin + pinned
    const { error: memberError } = await supabase.from('room_members').insert([
      {
        room_id: room.id,
        user_id: userId,
        role: 'admin',
        pinned: true,
        joined_at: new Date().toISOString(),
      },
    ]);

    if (memberError) throw memberError;

    // Analytics
    console.log('[ANALYTICS] create_room_success', { roomId: room.id, type: payload.type, isPrivate: payload.is_private });

    return { success: true, room };
  } catch (error) {
    console.error('Error creating room:', error);
    console.log('[ANALYTICS] create_room_error', { error: String(error) });
    return {
      success: false,
      message: 'Failed to create room. Please try again.',
    };
  }
}

/**
 * Join an existing room.
 */
export async function joinRoom(userId: string, roomId: string): Promise<{ success: boolean; message?: string }> {
  try {
    // Check if already member
    const { data: existing } = await supabase
      .from('room_members')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      return { success: false, message: 'You are already a member.' };
    }

    const { error } = await supabase.from('room_members').insert([
      {
        room_id: roomId,
        user_id: userId,
        role: 'member',
        pinned: false,
        joined_at: new Date().toISOString(),
      },
    ]);

    if (error) throw error;

    console.log('[ANALYTICS] join_room_success', { roomId });

    return { success: true };
  } catch (error) {
    console.error('Error joining room:', error);
    return {
      success: false,
      message: 'Failed to join room. Please try again.',
    };
  }
}

/**
 * Update last read timestamp for a room (mark as read).
 */
export async function markRoomAsRead(userId: string, roomId: string): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('room_members')
      .update({ last_read_at: now })
      .eq('room_id', roomId)
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error marking room as read:', error);
  }
}

/**
 * Pin or unpin a room.
 */
export async function setPinRoom(userId: string, roomId: string, pinned: boolean): Promise<void> {
  try {
    const { error } = await supabase
      .from('room_members')
      .update({ pinned })
      .eq('room_id', roomId)
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error pinning room:', error);
  }
}

/**
 * Fetch user profile with all fields needed for suggestions
 */
export async function fetchUserProfile(userId: string) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, base, fleet, airline, role, has_seen_room_suggestions')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

/**
 * Fetch public rooms for suggestion algorithm
 */
export async function fetchPublicRoomsForSuggestion(limit: number = 200): Promise<Room[]> {
  try {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('is_private', false)
      .order('member_count', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching public rooms for suggestion:', error);
    return [];
  }
}

/**
 * Compute suggested rooms based on user profile
 * Returns top 8 rooms scored by relevance to user's base, fleet, airline, role
 */
export function computeSuggestedRooms(
  profile: any,
  allRooms: Room[],
  userRoomIds?: string[]
): Room[] {
  if (!profile) return [];

  // Already joined rooms should not be suggested
  const alreadyJoined = new Set(userRoomIds || []);

  // Score each room
  const scored = allRooms
    .filter(room => !alreadyJoined.has(room.id))
    .map(room => {
      let score = 0;

      // Base match: +50
      if (profile.base && room.base && profile.base.toLowerCase() === room.base.toLowerCase()) {
        score += 50;
      }

      // Fleet match: +40
      if (profile.fleet && room.fleet && profile.fleet.toLowerCase() === room.fleet.toLowerCase()) {
        score += 40;
      }

      // Airline match: +30
      if (profile.airline && room.airline && profile.airline.toLowerCase() === room.airline.toLowerCase()) {
        score += 30;
      }

      // Role-based room types for FA: +15
      if (profile.role && profile.role.toLowerCase() === 'fa') {
        const faTypes = ['commuters', 'swap', 'crashpads', 'layovers', 'trips'];
        if (room.type && faTypes.includes(room.type.toLowerCase())) {
          score += 15;
        }
      }

      // Verified bonus: +10
      if (room.is_verified) {
        score += 10;
      }

      // Popularity bonus: small boost based on member count (max +10)
      if (room.member_count) {
        score += Math.min(Math.floor(room.member_count / 100), 10);
      }

      return { room, score };
    });

  // Sort by score descending and take top 8
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(item => item.room);
}

/**
 * Mark that user has seen room suggestions (first-time flag)
 */
export async function markSeenSuggestions(userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ has_seen_room_suggestions: true })
      .eq('id', userId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error marking seen suggestions:', error);
    return false;
  }
}

/**
 * Auto-join user to official rooms (base + fleet verified rooms)
 * Returns count of rooms joined
 */
export async function autoJoinOfficialRooms(userId: string, profile: any, allRooms: Room[]): Promise<number> {
  if (!profile) return 0;

  let joinCount = 0;

  // Find official base room
  if (profile.base) {
    const baseRoom = allRooms.find(
      r =>
        r.is_verified &&
        !r.is_private &&
        r.base &&
        r.base.toLowerCase() === profile.base.toLowerCase() &&
        r.type === 'base'
    );

    if (baseRoom) {
      const joinResult = await joinRoom(userId, baseRoom.id);
      if (joinResult.success) joinCount++;
    }
  }

  // Find official fleet room
  if (profile.fleet) {
    const fleetRoom = allRooms.find(
      r =>
        r.is_verified &&
        !r.is_private &&
        r.fleet &&
        r.fleet.toLowerCase() === profile.fleet.toLowerCase() &&
        r.type === 'fleet'
    );

    if (fleetRoom) {
      const joinResult = await joinRoom(userId, fleetRoom.id);
      if (joinResult.success) joinCount++;
    }
  }

  return joinCount;
}
