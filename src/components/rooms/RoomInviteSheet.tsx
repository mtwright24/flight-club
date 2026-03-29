import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchPeople } from '../../../lib/search';
import { buildRoomDeepLink, buildRoomSharePayload, sendRoomInviteNotification } from '../../../lib/roomInvite';
import { sendMessage, startDirectConversation } from '../../lib/supabase/dms';
import { supabase } from '../../lib/supabaseClient';
import { colors, radius, spacing } from '../../styles/theme';

type Person = {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  roomName: string;
  currentUserId: string;
};

export default function RoomInviteSheet({ visible, onClose, roomId, roomName, currentUserId }: Props) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Person[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Person | null>(null);
  const [busy, setBusy] = useState<'notify' | 'dm' | null>(null);

  const reset = useCallback(() => {
    setSearch('');
    setResults([]);
    setSelected(null);
    setBusy(null);
    setMemberIds(new Set());
  }, []);

  useEffect(() => {
    if (!visible || !roomId) return;
    reset();
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from('room_members').select('user_id').eq('room_id', roomId);
      if (cancelled || !data) return;
      setMemberIds(new Set(data.map((r: { user_id: string }) => r.user_id).filter(Boolean)));
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, roomId, reset]);

  const handleSearch = useCallback(
    async (text: string) => {
      setSearch(text);
      if (!text.trim()) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const found = await searchPeople(text, 40);
        const people: Person[] = found
          .filter((r) => r.type === 'person' && r.id && r.id !== currentUserId)
          .map((r) => {
            const handleFromSubtitle =
              r.subtitle && r.subtitle.startsWith('@')
                ? r.subtitle.slice(1).split(/\s/)[0] ?? null
                : null;
            return {
              id: r.id,
              display_name: r.title || 'Crew member',
              username: handleFromSubtitle,
              avatar_url: r.avatarUrl ?? null,
            };
          });
        setResults(people);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [currentUserId]
  );

  const shareOutside = useCallback(async () => {
    try {
      const payload = buildRoomSharePayload(roomName, roomId);
      await Share.share(payload);
    } catch (e) {
      console.warn('[RoomInvite] share failed:', e);
    }
  }, [roomId, roomName]);

  const sendNotification = useCallback(async () => {
    if (!selected) return;
    setBusy('notify');
    try {
      const { error } = await sendRoomInviteNotification({
        recipientUserId: selected.id,
        roomId,
        roomName,
        inviterUserId: currentUserId,
      });
      if (error) {
        Alert.alert('Could not send', error);
        return;
      }
      onClose();
      reset();
    } finally {
      setBusy(null);
    }
  }, [selected, roomId, roomName, currentUserId, onClose, reset]);

  const sendViaDm = useCallback(async () => {
    if (!selected) return;
    setBusy('dm');
    try {
      const { conversationId, isRequest } = await startDirectConversation(currentUserId, selected.id);
      const convId = String(conversationId);
      const link = buildRoomDeepLink(roomId, roomName);
      const text = `You're invited to the crew room "${roomName}" on Flight Club.\n\nOpen it here:\n${link}`;
      try {
        await sendMessage(convId, currentUserId, text);
      } catch (sendErr: unknown) {
        const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
        if (msg.includes('Accept or decline') || msg.includes('not accepted')) {
          Alert.alert(
            'Message request',
            isRequest
              ? 'A message request was started. Once they accept, they can use your link to open the group.'
              : 'Could not send the invite message yet. Try sending a notification instead.'
          );
        } else {
          throw sendErr;
        }
      }
      onClose();
      reset();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not open Messages';
      Alert.alert('Invite', msg);
    } finally {
      setBusy(null);
    }
  }, [selected, roomId, roomName, currentUserId, onClose, reset]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={2}>
            Invite to {roomName}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </Pressable>
        </View>

        {!selected ? (
          <>
            <Pressable style={styles.shareRow} onPress={() => void shareOutside()}>
              <Ionicons name="share-outline" size={22} color={colors.headerRed} />
              <View style={styles.shareTextCol}>
                <Text style={styles.shareTitle}>Share link</Text>
                <Text style={styles.shareSub}>Messages, email, or other apps</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>

            <Text style={styles.sectionLabel}>Invite someone on Flight Club</Text>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name or @username"
                placeholderTextColor={colors.textSecondary}
                value={search}
                onChangeText={handleSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {searching ? (
              <ActivityIndicator style={{ marginTop: 16 }} color={colors.headerRed} />
            ) : (
              <FlatList
                data={results.filter((r) => !memberIds.has(r.id))}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                style={styles.list}
                ListEmptyComponent={
                  search.trim() ? (
                    <Text style={styles.empty}>No crew members found (members of this group are hidden).</Text>
                  ) : (
                    <Text style={styles.empty}>Type to search people you’re connected to on the app.</Text>
                  )
                }
                renderItem={({ item }) => (
                  <Pressable style={styles.userRow} onPress={() => setSelected(item)}>
                    <View style={styles.avatarPlaceholder}>
                      <Ionicons name="person" size={20} color={colors.textSecondary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.userName} numberOfLines={1}>
                        {item.display_name}
                      </Text>
                      {item.username ? (
                        <Text style={styles.userHandle} numberOfLines={1}>
                          @{item.username}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </Pressable>
                )}
              />
            )}
          </>
        ) : (
          <View style={styles.pickChannel}>
            <Text style={styles.pickTitle}>Invite {selected.display_name}</Text>
            <Text style={styles.pickSub}>Choose how to send the invite. They can open the group from the notification or your message.</Text>
            <Pressable
              style={[styles.channelBtn, styles.channelPrimary]}
              onPress={() => void sendNotification()}
              disabled={busy !== null}
            >
              {busy === 'notify' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="notifications-outline" size={22} color="#fff" />
                  <Text style={styles.channelBtnTextLight}>Send in-app notification</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={[styles.channelBtn, styles.channelSecondary]}
              onPress={() => void sendViaDm()}
              disabled={busy !== null}
            >
              {busy === 'dm' ? (
                <ActivityIndicator color={colors.headerRed} />
              ) : (
                <>
                  <Ionicons name="chatbubble-outline" size={22} color={colors.headerRed} />
                  <Text style={styles.channelBtnTextDark}>Send in Messages</Text>
                </>
              )}
            </Pressable>
            <Pressable style={styles.backBtn} onPress={() => setSelected(null)} disabled={busy !== null}>
              <Text style={styles.backBtnText}>Back to search</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.cardBg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.pillBg,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    gap: 12,
  },
  shareTextCol: { flex: 1 },
  shareTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  shareSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.textPrimary,
  },
  list: { flex: 1 },
  empty: {
    color: colors.textSecondary,
    fontSize: 14,
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.pillBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  userHandle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  pickChannel: { flex: 1 },
  pickTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 },
  pickSub: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  channelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  channelPrimary: { backgroundColor: colors.headerRed },
  channelSecondary: {
    backgroundColor: colors.cardBg,
    borderWidth: 2,
    borderColor: colors.headerRed,
  },
  channelBtnTextLight: { fontSize: 16, fontWeight: '800', color: '#fff' },
  channelBtnTextDark: { fontSize: 16, fontWeight: '800', color: colors.headerRed },
  backBtn: { paddingVertical: spacing.md, alignItems: 'center' },
  backBtnText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
});
