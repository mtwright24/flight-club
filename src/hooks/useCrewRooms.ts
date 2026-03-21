import { useState, useEffect, useCallback } from 'react';
import {
  fetchMyRooms,
  getLastActiveRoom,
  fetchPublicRooms,
  joinRoom as joinRoomAPI,
  fetchUserProfile,
  fetchPublicRoomsForSuggestion,
  computeSuggestedRooms,
  markSeenSuggestions,
  autoJoinOfficialRooms,
} from '../lib/supabase/rooms';
import { MyRoom, Room } from '../types/rooms';
import { useDebouncedValue } from './useDebouncedValue';

interface UseCrewRoomsOptions {
  userId: string;
}

export interface UseCrewRoomsState {
  myRooms: MyRoom[];
  lastActiveRoom: MyRoom | null;
  suggestedRooms: Room[];
  liveNowRooms: Room[];
  isFirstTime: boolean;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  activeTab: 'airlines' | 'bases' | 'pilots';
  setActiveTab: (tab: 'airlines' | 'bases' | 'pilots') => void;
  filters: {
    base?: string;
    fleet?: string;
    airline?: string;
    private?: boolean;
    verified?: boolean;
  };
  setFilters: (filters: any) => void;
  refetch: () => Promise<void>;
  joinRoom: (roomId: string) => Promise<{ success: boolean; message?: string }>;
}

export function useCrewRooms({ userId }: UseCrewRoomsOptions): UseCrewRoomsState {
  const [myRooms, setMyRooms] = useState<MyRoom[]>([]);
  const [lastActiveRoom, setLastActiveRoom] = useState<MyRoom | null>(null);
  const [suggestedRooms, setSuggestedRooms] = useState<Room[]>([]);
  const [liveNowRooms, setLiveNowRooms] = useState<Room[]>([]);
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'airlines' | 'bases' | 'pilots'>('airlines');
  const [filters, setFilters] = useState({});

  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const fetchData = useCallback(async () => {
    try {
      // FIXED: Guard against empty userId
      if (!userId || userId.trim() === '') {
        setMyRooms([]);
        setLastActiveRoom(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      // Fetch my rooms
      const rooms = await fetchMyRooms(userId);
      setMyRooms(rooms);

      // Fetch last active room
      const lastRoom = await getLastActiveRoom(userId);
      setLastActiveRoom(lastRoom);

      // Fetch user profile for suggestion algorithm
      const userProfile = await fetchUserProfile(userId);
      
      // Detect first-time user
      const firstTime = Boolean(userProfile && !userProfile.has_seen_room_suggestions);
      setIsFirstTime(firstTime);

      // Fetch all public rooms and compute suggestions based on profile
      const allPublicRooms = await fetchPublicRoomsForSuggestion(200);
      const myRoomIds = rooms.map(r => r.id);
      const suggested = computeSuggestedRooms(userProfile, allPublicRooms, myRoomIds);
      setSuggestedRooms(suggested);

      // Auto-join official rooms on first-time
      if (firstTime && rooms.length === 0 && allPublicRooms.length > 0) {
        const joinedCount = await autoJoinOfficialRooms(userId, userProfile, allPublicRooms);
        console.log(`[First-time] Auto-joined ${joinedCount} official rooms`);
        
        // Mark as seen suggestions
        await markSeenSuggestions(userId);
        setIsFirstTime(false);

        // Refresh rooms after auto-join
        const updatedRooms = await fetchMyRooms(userId);
        setMyRooms(updatedRooms);
      }

      // Fetch live now rooms (top by member count, can be filtered by tab later)
      const liveRooms = await fetchPublicRooms({
        search: debouncedSearch || undefined,
        limit: 20,
      });
      setLiveNowRooms(liveRooms.slice(0, 12));
    } catch (err) {
      console.error('Error fetching crew rooms:', err);
      setError(err instanceof Error ? err.message : 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, [userId, debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const joinRoom = async (roomId: string) => {
    try {
      const result = await joinRoomAPI(userId, roomId);
      if (result.success) {
        await fetchData();
      }
      return result;
    } catch (err) {
      console.error('Error joining room:', err);
      return {
        success: false,
        message: 'Failed to join room',
      };
    }
  };

  return {
    myRooms,
    lastActiveRoom,
    suggestedRooms,
    liveNowRooms,
    isFirstTime,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    activeTab,
    setActiveTab,
    filters,
    setFilters,
    refetch: fetchData,
    joinRoom,
  };
}
