export type RoomType = 'base' | 'fleet' | 'airline' | 'layover' | 'swap' | 'crashpad' | 'general' | 'commuters' | 'private';

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  base?: string | null;
  fleet?: string | null;
  airline?: string | null;
  is_private: boolean;
  is_verified: boolean;
  created_by: string;
  created_at: string;
  last_message_at?: string | null;
  last_message_text?: string | null;
  member_count: number;
  live_count?: number;
  avatar_url?: string | null;
  cover_url?: string | null;
}

export interface RoomMember {
  room_id: string;
  user_id: string;
  role: 'admin' | 'member';
  pinned: boolean;
  last_read_at?: string | null;
  joined_at: string;
}

export interface RoomMessage {
  id: string;
  room_id: string;
  user_id: string;
  text: string;
  created_at: string;
}

export interface MyRoom extends Room {
  unread_count: number;
  pinned: boolean;
  last_read_at?: string | null;
  joined_at: string;
  avatar_url?: string | null;
}

export interface RoomTemplate {
  type: RoomType;
  name: string;
  description: string;
  suggestedName?: string;
  isPrivate: boolean;
}

export type CreateRoomTemplate = 
  | 'base-room'
  | 'fleet-room'
  | 'commuters'
  | 'crashpads'
  | 'swap-signals'
  | 'layover'
  | 'private-crew';

export interface CreateRoomPayload {
  name: string;
  type: RoomType;
  base?: string | null;
  fleet?: string | null;
  airline?: string | null;
  is_private: boolean;
  created_by: string;
}
