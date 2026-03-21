import React, { useState, useEffect } from 'react';
import RoomHomeScreenImpl from './RoomHomeScreenImpl';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../styles/theme';
import { supabase } from '../lib/supabaseClient';
import { MyRoom } from '../types/rooms';
import { useAuth } from '../hooks/useAuth';

type TabType = 'featured' | 'chat' | 'about' | 'members';

interface RoomData {
  id: string;
  name: string;
  type: string;
  base?: string;
  fleet?: string;
  airline?: string;
  is_private: boolean;
  member_count: number;
  created_at: string;
  created_by?: string;
}

function RoomHomeScreenLegacy() {
  const route = useRoute();
  const { roomId } = route.params as { roomId: string };
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [room, setRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('featured');
  const [isMember, setIsMember] = useState(false);
  const [composerText, setComposerText] = useState('');

  useEffect(() => {
    fetchRoom();
  }, [roomId, userId]);

  const fetchRoom = async () => {
    try {
      setLoading(true);

      // Fetch room data
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (roomError) throw roomError;
      if (roomData) setRoom(roomData);

      // Check if current user is a member
      if (userId) {
        const { data: memberData } = await supabase
          .from('room_members')
          .select('user_id')
          .eq('room_id', roomId)
          .eq('user_id', userId)
          .single();

        setIsMember(!!memberData);
      }
    } catch (error) {
      console.error('Error fetching room:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!userId || !room) return;
    try {
      await supabase.from('room_members').insert({
        room_id: roomId,
        user_id: userId,
        role: 'member',
      });
      setIsMember(true);
    } catch (error) {
      console.error('Error joining room:', error);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.headerRed} />
        </View>
      </SafeAreaView>
    );
  }

  if (!room) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Room not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          scrollEnabled={activeTab === 'featured' || activeTab === 'about' || activeTab === 'members'}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          {/* Room Info Section */}
          <View style={styles.roomInfoSection}>
            <Text style={styles.roomName}>{room.name}</Text>
            <View style={styles.sublineRow}>
              <Text style={styles.subline}>
                {room.is_private ? 'Private' : 'Public'} group • {room.member_count} members
              </Text>
            </View>
            {(room.base || room.fleet || room.airline) && (
              <View style={styles.tagsRow}>
                {room.base && <View style={styles.tag}><Text style={styles.tagText}>{room.base}</Text></View>}
                {room.fleet && <View style={styles.tag}><Text style={styles.tagText}>{room.fleet}</Text></View>}
                {room.airline && <View style={styles.tag}><Text style={styles.tagText}>{room.airline}</Text></View>}
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionsRow}>
              <Pressable
                style={[styles.actionButton, isMember && styles.actionButtonActive]}
                onPress={!isMember ? handleJoinRoom : undefined}
              >
                <Text style={[styles.actionButtonText, isMember && styles.actionButtonTextActive]}>
                  {isMember ? 'Joined' : 'Join'}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={isMember ? colors.headerRed : colors.cardBg}
                />
              </Pressable>
              <Pressable style={styles.actionButton}>
                <Text style={styles.actionButtonText}>Invite</Text>
              </Pressable>
            </View>
          </View>

          {/* Tabs */}
          <View style={styles.tabsContainer}>
            {(['featured', 'chat', 'about', 'members'] as TabType[]).map((tab) => (
              <Pressable
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Tab Content */}
          {activeTab === 'featured' && (
            <View>
              {/* Composer */}
              {isMember && (
                <View style={styles.composerCard}>
                  <Image
                    source={{ uri: `https://i.pravatar.cc/100?img=${Math.floor(Math.random() * 100)}` }}
                    style={styles.composerAvatar}
                  />
                  <TextInput
                    style={styles.composerInput}
                    placeholder="Write something…"
                    placeholderTextColor={colors.textSecondary}
                    value={composerText}
                    onChangeText={setComposerText}
                    editable={isMember}
                  />
                </View>
              )}

              {/* Quick Actions */}
              {isMember && (
                <View style={styles.quickActionsContainer}>
                  {renderQuickActions(room.type)}
                </View>
              )}

              {/* Empty State */}
              {isMember && (
                <View style={styles.emptyState}>
                  <Ionicons name="chatbox-outline" size={48} color={colors.textSecondary} />
                  <Text style={styles.emptyStateText}>Be the first to post in {room.name}.</Text>
                </View>
              )}

              {!isMember && (
                <View style={styles.emptyState}>
                  <Ionicons name="lock-closed-outline" size={48} color={colors.textSecondary} />
                  <Text style={styles.emptyStateText}>Join this room to see posts.</Text>
                </View>
              )}
            </View>
          )}

          {activeTab === 'about' && (
            <View style={styles.tabContent}>
              <View style={styles.aboutCard}>
                <Text style={styles.aboutLabel}>Room Type</Text>
                <Text style={styles.aboutValue}>{room.type.replace(/_/g, ' ')}</Text>
              </View>
              {room.base && (
                <View style={styles.aboutCard}>
                  <Text style={styles.aboutLabel}>Base</Text>
                  <Text style={styles.aboutValue}>{room.base}</Text>
                </View>
              )}
              {room.fleet && (
                <View style={styles.aboutCard}>
                  <Text style={styles.aboutLabel}>Fleet</Text>
                  <Text style={styles.aboutValue}>{room.fleet}</Text>
                </View>
              )}
              {room.airline && (
                <View style={styles.aboutCard}>
                  <Text style={styles.aboutLabel}>Airline</Text>
                  <Text style={styles.aboutValue}>{room.airline}</Text>
                </View>
              )}
              <View style={styles.aboutCard}>
                <Text style={styles.aboutLabel}>Created</Text>
                <Text style={styles.aboutValue}>{new Date(room.created_at).toLocaleDateString()}</Text>
              </View>
            </View>
          )}

          {activeTab === 'members' && (
            <View style={styles.tabContent}>
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
                <Text style={styles.emptyStateText}>Members coming soon.</Text>
              </View>
            </View>
          )}

          {activeTab === 'chat' && (
            <View style={styles.tabContent}>
              <View style={styles.chatPlaceholder}>
                <Text style={styles.chatPlaceholderText}>💬 Chat loading...</Text>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default RoomHomeScreenImpl;

function renderQuickActions(roomType: string) {
  const actions: { [key: string]: string[] } = {
    commuters: ['🚗 Ride share', '💡 Tips', '🏠 Crashpad'],
    crashpads: ['📝 Post listing', '🔍 Find crashpad'],
    swap_signals: ['✈️ Post swap', '📋 Browse swaps'],
    layover: ['✅ Check-in', '🎯 Plans'],
  };

  const roomActions = actions[roomType] || ['💬 Post', '📸 Share', '❓ Ask'];

  return roomActions.map((action, idx) => (
    <Pressable key={idx} style={styles.quickActionChip}>
      <Text style={styles.quickActionText}>{action}</Text>
    </Pressable>
  ));
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  roomInfoSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.cardBg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  headerSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  roomName: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sublineRow: {
    marginBottom: spacing.md,
  },
  subline: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  tagsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: colors.headerRed,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.cardBg,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    backgroundColor: colors.headerRed,
    borderRadius: radius.md,
  },
  actionButtonActive: {
    backgroundColor: colors.screenBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.cardBg,
  },
  actionButtonTextActive: {
    color: colors.headerRed,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.headerRed,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.headerRed,
    fontWeight: '700',
  },
  tabContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  composerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  composerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  composerInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    padding: 0,
  },
  quickActionsContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    flexWrap: 'wrap',
  },
  quickActionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.cardBg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  aboutCard: {
    backgroundColor: colors.cardBg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  aboutLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  aboutValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  chatPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  chatPlaceholderText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
});
