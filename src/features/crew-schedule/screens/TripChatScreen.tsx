import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabaseClient';
import {
  fetchTripChatMessages,
  insertTripChatMessage,
  type ScheduleTripChatMessage,
} from '../scheduleTripChatApi';
import { scheduleTheme as T } from '../scheduleTheme';
import type { CrewScheduleTrip } from '../types';
import { entriesToSingleTrip } from '../tripMapper';
import { fetchTripGroupEntries } from '../scheduleApi';
import { getMockTripById } from '../mockScheduleData';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Trip release day end + 24h — trip chat is not DM and expires after this instant. */
export function computeTripChatRoomExpiresAtIso(endDateYmd: string): string {
  const raw = (endDateYmd || '').trim();
  const d = new Date(`${raw}T23:59:59`);
  if (Number.isNaN(d.getTime())) {
    return new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  }
  d.setHours(d.getHours() + 24);
  return d.toISOString();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

type Profile = { display_name?: string | null; avatar_url?: string | null };

export default function TripChatScreen({ tripId }: { tripId: string | undefined }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [trip, setTrip] = useState<CrewScheduleTrip | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [messages, setMessages] = useState<ScheduleTripChatMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [text, setText] = useState('');
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [sending, setSending] = useState(false);

  const roomExpiresAtIso = useMemo(() => {
    if (!trip?.endDate) return null;
    return computeTripChatRoomExpiresAtIso(trip.endDate);
  }, [trip?.endDate]);

  const chatEnded = useMemo(() => {
    if (!roomExpiresAtIso) return false;
    return Date.now() >= new Date(roomExpiresAtIso).getTime();
  }, [roomExpiresAtIso]);

  useEffect(() => {
    let cancelled = false;
    async function loadTrip() {
      if (!tripId) {
        setTrip(null);
        setLoadingTrip(false);
        return;
      }
      setLoadingTrip(true);
      try {
        if (tripId.startsWith('demo-')) {
          setTrip(getMockTripById(tripId) ?? null);
        } else if (UUID_RE.test(tripId)) {
          const rows = await fetchTripGroupEntries(tripId);
          const built = entriesToSingleTrip(rows);
          if (!cancelled) setTrip(built ?? null);
        } else {
          setTrip(getMockTripById(tripId) ?? null);
        }
      } catch {
        if (!cancelled) setTrip(null);
      } finally {
        if (!cancelled) setLoadingTrip(false);
      }
    }
    void loadTrip();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  useEffect(() => {
    if (!tripId || !trip) return;
    const tid = tripId;
    let cancelled = false;
    async function load() {
      setLoadingMsgs(true);
      try {
        const rows = await fetchTripChatMessages(tid);
        if (!cancelled) setMessages(rows);
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setLoadingMsgs(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tripId, trip?.id]);

  useEffect(() => {
    if (!tripId || !messages.length) return;
    const ids = [...new Set(messages.map((m) => m.user_id).filter(Boolean))] as string[];
    if (!ids.length) return;
    void (async () => {
      const { data } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', ids);
      if (!data) return;
      const next: Record<string, Profile> = {};
      data.forEach((p: { id: string; display_name?: string | null; avatar_url?: string | null }) => {
        next[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
      });
      setProfiles((prev) => ({ ...prev, ...next }));
    })();
  }, [messages, tripId]);

  useEffect(() => {
    if (!tripId) return;
    const channel = supabase
      .channel(`schedule-trip-chat-${tripId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'schedule_trip_chat_messages',
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          const row = payload.new as ScheduleTripChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tripId]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !tripId || !userId || !roomExpiresAtIso || chatEnded || sending) return;
    if (Date.now() >= new Date(roomExpiresAtIso).getTime()) return;
    setSending(true);
    setText('');
    try {
      const inserted = await insertTripChatMessage({
        tripId,
        userId,
        text: trimmed,
        roomExpiresAtIso,
      });
      if (inserted) {
        setMessages((prev) => (prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]));
      }
    } catch (e) {
      console.warn('[TripChat] send failed:', e);
    } finally {
      setSending(false);
    }
  }, [text, tripId, userId, roomExpiresAtIso, chatEnded, sending]);

  const renderItem = useCallback(
    ({ item }: { item: ScheduleTripChatMessage }) => {
      const isMe = item.user_id === userId;
      const name = profiles[item.user_id]?.display_name || 'Crew';
      return (
        <View style={[styles.row, isMe ? styles.rowMe : styles.rowThem]}>
          {!isMe ? (
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
          ) : null}
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
            <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.text}</Text>
            <Text style={[styles.time, isMe && styles.timeMe]}>{formatTime(item.created_at)}</Text>
          </View>
        </View>
      );
    },
    [userId, profiles]
  );

  if (!tripId) {
    return (
      <View style={styles.center}>
        <Ionicons name="chatbubbles-outline" size={40} color={T.textSecondary} />
        <Text style={styles.hint}>Open Trip Chat from a trip on your schedule.</Text>
        <Text style={styles.subHint}>This room is only for the active trip — not Messages or DMs.</Text>
      </View>
    );
  }

  if (loadingTrip) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={T.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {trip ? (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle} numberOfLines={1}>
            {trip.routeSummary} · {trip.pairingCode}
          </Text>
          <Text style={styles.bannerMeta} numberOfLines={2}>
            Trip chat · Not linked to DMs · Ends 24h after trip ({trip.startDate === trip.endDate ? trip.endDate : `${trip.startDate} → ${trip.endDate}`})
          </Text>
          {roomExpiresAtIso ? (
            <Text style={[styles.bannerMeta, chatEnded && styles.ended]}>
              {chatEnded ? 'This trip chat has ended.' : `Closes ${new Date(roomExpiresAtIso).toLocaleString()}`}
            </Text>
          ) : null}
        </View>
      ) : null}

      {loadingMsgs ? (
        <View style={styles.flexCenter}>
          <ActivityIndicator color={T.accent} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listPad}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <Text style={styles.empty}>No messages yet. Coordinate gate, van, or day plans here.</Text>
          }
        />
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(8, insets.bottom) }]}>
        <TextInput
          style={styles.input}
          placeholder={chatEnded ? 'Chat closed' : 'Message trip crew…'}
          placeholderTextColor={T.textSecondary}
          value={text}
          onChangeText={setText}
          editable={!chatEnded && !!userId}
          multiline
        />
        <Pressable
          style={[styles.sendBtn, (!text.trim() || chatEnded || sending) && styles.sendDisabled]}
          onPress={() => void handleSend()}
          disabled={!text.trim() || chatEnded || sending}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: T.bg },
  flexCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center', backgroundColor: T.bg },
  hint: { marginTop: 12, fontSize: 15, fontWeight: '700', color: T.text, textAlign: 'center' },
  subHint: { marginTop: 8, fontSize: 13, color: T.textSecondary, textAlign: 'center', lineHeight: 18 },
  banner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
    backgroundColor: T.surface,
  },
  bannerTitle: { fontSize: 15, fontWeight: '800', color: T.text },
  bannerMeta: { fontSize: 12, color: T.textSecondary, marginTop: 4, lineHeight: 16 },
  ended: { color: '#b91c1c', fontWeight: '700' },
  listPad: { padding: 12, paddingBottom: 24 },
  empty: { textAlign: 'center', color: T.textSecondary, padding: 20, fontSize: 14 },
  row: { marginBottom: 10, maxWidth: '92%' },
  rowMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  name: { fontSize: 11, fontWeight: '700', color: T.textSecondary, marginBottom: 2, marginLeft: 4 },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '100%' },
  bubbleMe: { backgroundColor: T.accent },
  bubbleThem: { backgroundColor: '#E5E7EB' },
  msgText: { fontSize: 15, color: T.text },
  msgTextMe: { color: '#fff' },
  time: { fontSize: 10, marginTop: 4, color: T.textSecondary },
  timeMe: { color: 'rgba(255,255,255,0.85)', textAlign: 'right' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.line,
    backgroundColor: T.surface,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: T.text,
    backgroundColor: T.bg,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.45 },
});
