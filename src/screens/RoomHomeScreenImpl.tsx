import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Image, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, radius, shadow } from '../styles/theme';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import GroupHeaderFacebook from '../components/rooms/GroupHeaderFacebook';
import GroupTabs, { TabType } from '../components/rooms/GroupTabs';
import PostComposerCard from '../components/posts/PostComposerCard';
import PostsFeed from '../components/posts/PostsFeed';
import { fetchRoomPosts, RoomPost, fetchPostComments, RoomPostComment, createPostComment } from '../lib/supabase/posts';
import { fetchPostReactionsSummary, togglePostReaction, PostReactionSummary, ReactionType } from '../lib/supabase/reactions';
import ReactionTrayOverlay from '../components/posts/ReactionTrayOverlay';
import RoomChatView from '../components/rooms/RoomChatView';
import CommentsDrawer from '../components/comments/CommentsDrawer';
import { uploadRoomAvatar, uploadRoomCover, removeRoomAvatar, removeRoomCover } from '../lib/uploadRoomMedia';
import RoomInviteSheet from '../components/rooms/RoomInviteSheet';

export interface RoomHomeScreenProps {
  roomId: string;
  posted?: string;
}

interface RoomData {
  id: string;
  name: string;
  type: string;
  base?: string | null;
  fleet?: string | null;
  airline?: string | null;
  avatar_url?: string | null;
  cover_url?: string | null;
  is_private: boolean;
  member_count?: number | null;
  created_at: string;
  created_by?: string | null;
}

export default function RoomHomeScreenImpl({ roomId, posted }: RoomHomeScreenProps) {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [room, setRoom] = useState<RoomData | null>(null);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [isMember, setIsMember] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('featured');
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<RoomPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [reactionsSummary, setReactionsSummary] = useState<PostReactionSummary>({});
  const [trayVisible, setTrayVisible] = useState(false);
  const [trayAnchorLayout, setTrayAnchorLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [commentsDrawerVisible, setCommentsDrawerVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<RoomPostComment[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [roomAvatarUrl, setRoomAvatarUrl] = useState<string | null>(null);
  const [roomCoverUrl, setRoomCoverUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isOwnerOrAdmin, setIsOwnerOrAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollPositionRef = useRef(0);

  const avatarUrl = useMemo(() => userAvatarUrl || `https://i.pravatar.cc/100?u=${userId || 'anon'}`, [userAvatarUrl, userId]);

  // Load user's avatar from profile
  useEffect(() => {
    if (!userId) return;

    const loadUserAvatar = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', userId)
          .single();

        if (!error && data?.avatar_url) {
          setUserAvatarUrl(data.avatar_url);
        }
      } catch (error) {
        console.error('Error loading user avatar:', error);
      }
    };

    loadUserAvatar();
  }, [userId]);

  const loadRoom = useCallback(async () => {
    try {
      setLoading(true);

      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (roomError) throw roomError;
      setRoom(roomData);

      // Prime local media state if columns exist
      if (roomData?.avatar_url) setRoomAvatarUrl(roomData.avatar_url);
      if (roomData?.cover_url) setRoomCoverUrl(roomData.cover_url);

      // Check if current user is owner or admin
      if (userId && roomData) {
        const isOwner = roomData.created_by === userId;
        const { data: memberRole } = await supabase
          .from('room_members')
          .select('role')
          .eq('room_id', roomId)
          .eq('user_id', userId)
          .single();

        setIsOwnerOrAdmin(isOwner || memberRole?.role === 'admin');
      }

      const { count } = await supabase
        .from('room_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('room_id', roomId);

      setMemberCount(count || roomData?.member_count || 0);

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
  }, [roomId, userId]);

  const loadPosts = useCallback(async () => {
    try {
      setPostsLoading(true);
      const data = await fetchRoomPosts(roomId, 20);
      setPosts(data);
    } catch (error) {
      console.error('Error loading posts:', error);
    } finally {
      setPostsLoading(false);
    }
  }, [roomId]);

  // Handle avatar upload
  const handleAvatarPress = useCallback(async () => {
    if (!isOwnerOrAdmin) {
      Alert.alert('Info', 'Only group admins can upload photos');
      return;
    }

    setUploading(true);
    const result = await uploadRoomAvatar(roomId);
    setUploading(false);

    if (result.success) {
      if (result.url) {
        setRoomAvatarUrl(result.url);
        setRoom((prev) => (prev ? { ...prev, avatar_url: result.url! } : prev));
      }
      Alert.alert('Success', 'Group photo updated!');
    } else {
      Alert.alert('Error', result.error || 'Failed to upload photo');
    }
  }, [roomId, isOwnerOrAdmin, loadRoom]);

  // Handle cover upload
  const handleCoverPress = useCallback(async () => {
    if (!isOwnerOrAdmin) {
      Alert.alert('Info', 'Only group admins can upload photos');
      return;
    }

    setUploading(true);
    const result = await uploadRoomCover(roomId);
    setUploading(false);

    if (result.success) {
      if (result.url) {
        setRoomCoverUrl(result.url);
        setRoom((prev) => (prev ? { ...prev, cover_url: result.url! } : prev));
      }
      Alert.alert('Success', 'Cover photo updated!');
    } else {
      Alert.alert('Error', result.error || 'Failed to upload photo');
    }
  }, [roomId, isOwnerOrAdmin, loadRoom]);

  // Handle leave group
  const handleLeaveGroup = useCallback(async () => {
    Alert.alert(
      'Leave Group?',
      `Are you sure you want to leave ${room?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase
                .from('room_members')
                .delete()
                .eq('room_id', roomId)
                .eq('user_id', userId);

              Alert.alert('Left group', `You left ${room?.name}`);
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to leave group');
            }
          },
        },
      ]
    );
  }, [roomId, userId, room?.name, router]);


  useEffect(() => {
    loadRoom();
    loadPosts();
  }, [roomId, loadRoom, loadPosts]);

  useEffect(() => {
    if (!userId || posts.length === 0) return;

    const postIds = posts.map((p) => p.id);
    fetchPostReactionsSummary(postIds, userId)
      .then((summary) => setReactionsSummary(summary))
      .catch((error) => console.error('[RoomHome] Failed to fetch reactions:', error));
  }, [posts, userId]);

  useEffect(() => {
    if (posted === '1') {
      setToastVisible(true);
      loadPosts();
      const t = setTimeout(() => setToastVisible(false), 2000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [posted, loadPosts]);

  useFocusEffect(
    useCallback(() => {
      if (scrollPositionRef.current > 0 && scrollViewRef.current) {
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ y: scrollPositionRef.current, animated: false });
        }, 50);
      }
    }, [])
  );

  const handleJoin = useCallback(async () => {
    if (!userId || !room) return;
    try {
      await supabase.from('room_members').insert({
        room_id: roomId,
        user_id: userId,
        role: 'member',
      });
      setIsMember(true);
      setMemberCount((c) => c + 1);
      Alert.alert('Joined', `You joined ${room.name}`);
    } catch (error) {
      console.error('Error joining room:', error);
      Alert.alert('Error', 'Failed to join group');
    }
  }, [room, roomId, userId]);

  const handleInvite = useCallback(() => {
    if (!room || !userId) return;
    setInviteSheetVisible(true);
  }, [room, userId]);

  const openCreatePost = useCallback((startMode: 'text' | 'photo') => {
    router.push({
      pathname: '/room-post',
      params: { roomId, startMode },
    });
  }, [router, roomId]);

  const openPostDetail = useCallback(async (postId: string) => {
    setSelectedPostId(postId);
    setCommentsDrawerVisible(true);
    const commentsData = await fetchPostComments(postId, 50);
    setComments(commentsData);
  }, []);

  const loadMembers = useCallback(async () => {
    try {
      setMembersLoading(true);
      const { data: membersData, error } = await supabase
        .from('room_members')
        .select('user_id, joined_at')
        .eq('room_id', roomId)
        .order('joined_at', { ascending: false });

      if (error) {
        console.error('Error loading members:', error);
        return;
      }

      if (!membersData || membersData.length === 0) {
        setMembers([]);
        return;
      }

      // Fetch profiles for all user IDs
      const userIds = membersData.map(m => m.user_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);

      if (profilesError) {
        console.error('Error loading profiles:', profilesError);
        setMembers(membersData);
        return;
      }

      // Combine members with profiles
      const membersWithProfiles = membersData.map(member => ({
        ...member,
        profiles: profilesData?.find(p => p.id === member.user_id) || null
      }));

      setMembers(membersWithProfiles);
    } catch (err) {
      console.error('Members load exception:', err);
    } finally {
      setMembersLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (activeTab === 'members' && members.length === 0) {
      loadMembers();
    }
  }, [activeTab, loadMembers, members.length]);

  const handleOpenReactionTray = useCallback((postId: string, anchorLayout: { x: number; y: number; width: number; height: number }) => {
    setActivePostId(postId);
    setTrayAnchorLayout(anchorLayout);
    setTrayVisible(true);
  }, []);

  const handleCloseReactionTray = useCallback(() => {
    setTrayVisible(false);
  }, []);

  const handleSelectReaction = useCallback(async (reaction: ReactionType) => {
    if (!userId || !activePostId) return;

    const postId = activePostId;

    setReactionsSummary((prev) => {
      const newSummary = { ...prev };
      const postReactions = newSummary[postId] || { counts: {} };
      const currentUserReaction = postReactions.userReaction;
      const newCounts = { ...postReactions.counts };

      if (currentUserReaction === reaction) {
        newCounts[reaction] = Math.max(0, (newCounts[reaction] || 0) - 1);
        newSummary[postId] = { counts: newCounts };
      } else if (currentUserReaction) {
        newCounts[currentUserReaction] = Math.max(0, (newCounts[currentUserReaction] || 0) - 1);
        newCounts[reaction] = (newCounts[reaction] || 0) + 1;
        newSummary[postId] = { counts: newCounts, userReaction: reaction };
      } else {
        newCounts[reaction] = (newCounts[reaction] || 0) + 1;
        newSummary[postId] = { counts: newCounts, userReaction: reaction };
      }

      return newSummary;
    });

    const result = await togglePostReaction(postId, userId, reaction);
    if (!result.success) {
      console.error('[RoomHome] Failed to toggle reaction:', result.error);
      const postIds = posts.map((p) => p.id);
      const summary = await fetchPostReactionsSummary(postIds, userId);
      setReactionsSummary(summary);
    }
  }, [userId, activePostId, posts]);

  const handlePostDeleted = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  const handlePostUpdated = useCallback(() => {
    loadPosts();
  }, [loadPosts]);

  const handleAddComment = useCallback(async (text: string, parentCommentId?: string | null) => {
    if (!userId || !selectedPostId) return;
    const result = await createPostComment(selectedPostId, roomId, userId, text, parentCommentId);
    if (result.success && result.comment) {
      setComments((prev) => [...prev, result.comment!]);
    }
  }, [userId, selectedPostId, roomId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadRoom(),
        loadPosts(),
        activeTab === 'members' ? loadMembers() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadRoom, loadPosts, loadMembers, activeTab]);

  if (loading || !room) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.headerRed} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {userId ? (
        <RoomInviteSheet
          visible={inviteSheetVisible}
          onClose={() => setInviteSheetVisible(false)}
          roomId={roomId}
          roomName={room.name}
          currentUserId={userId}
        />
      ) : null}
      {toastVisible && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>Post submitted successfully</Text>
        </View>
      )}

      {activeTab === 'chat' ? (
        <>
          <GroupHeaderFacebook
            roomId={roomId}
            name={room.name}
            memberCount={memberCount}
            isPrivate={room.is_private}
            isMember={isMember}
            isOwnerOrAdmin={isOwnerOrAdmin}
            avatarUrl={roomAvatarUrl ?? room.avatar_url}
            coverUrl={roomCoverUrl ?? room.cover_url}
            onAvatarPress={handleAvatarPress}
            onCoverPress={handleCoverPress}
            onJoin={handleJoin}
            onLeave={handleLeaveGroup}
            onInvite={handleInvite}
            disabled={uploading}
          />
          <GroupTabs activeTab={activeTab} onTabChange={setActiveTab} />
          <RoomChatView roomId={roomId} />
        </>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.headerRed}
            />
          }
          onScroll={(event) => {
            scrollPositionRef.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          <GroupHeaderFacebook
            roomId={roomId}
            name={room.name}
            memberCount={memberCount}
            isPrivate={room.is_private}
            isMember={isMember}
            isOwnerOrAdmin={isOwnerOrAdmin}
            avatarUrl={roomAvatarUrl ?? room.avatar_url}
            coverUrl={roomCoverUrl ?? room.cover_url}
            onAvatarPress={handleAvatarPress}
            onCoverPress={handleCoverPress}
            onJoin={handleJoin}
            onLeave={handleLeaveGroup}
            onInvite={handleInvite}
            disabled={uploading}
          />
          <GroupTabs activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === 'featured' && (
            <>
              <PostComposerCard
                avatarUrl={avatarUrl}
                onComposerPress={() => openCreatePost('text')}
                onPhotoPress={() => openCreatePost('photo')}
              />
              <View style={{ height: spacing.md }} />
              {postsLoading && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={colors.headerRed} />
                </View>
              )}
              <PostsFeed
                posts={posts}
                emptyTitle={`Be the first to post in ${room.name}.`}
                onPostPress={openPostDetail}
                onPostDeleted={handlePostDeleted}
                onPostUpdated={handlePostUpdated}
                reactionsSummary={reactionsSummary}
                onOpenReactionTray={handleOpenReactionTray}
                scrollEnabled={false}
              />
            </>
          )}

          {activeTab === 'about' && (
            <View style={styles.aboutContainer}>
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
            <View style={styles.membersContainer}>
              {membersLoading ? (
                <ActivityIndicator
                  size="small"
                  color={colors.headerRed}
                  style={{ marginTop: spacing.lg }}
                />
              ) : members.length === 0 ? (
                <Text style={styles.membersPlaceholder}>No members yet</Text>
              ) : (
                members.map((member: any) => {
                  const profile = member.profiles;
                  const displayName =
                    profile?.display_name || profile?.full_name || 'Crew Member';
                  const joinedDate = new Date(member.joined_at).toLocaleDateString(
                    'en-US',
                    {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    }
                  );

                  return (
                    <View key={member.user_id} style={styles.memberCard}>
                      <View style={styles.memberLeft}>
                        {profile?.avatar_url ? (
                          <Image
                            source={{ uri: profile.avatar_url }}
                            style={styles.memberAvatar}
                          />
                        ) : (
                          <View style={styles.memberAvatarPlaceholder}>
                            <Text style={styles.memberAvatarText}>
                              {displayName
                                .split(' ')
                                .map((n: string) => n[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2)}
                            </Text>
                          </View>
                        )}
                        <View style={styles.memberInfo}>
                          <Text style={styles.memberName}>{displayName}</Text>
                          <Text style={styles.memberJoined}>Joined {joinedDate}</Text>
                        </View>
                      </View>
                      {member.user_id === userId && (
                        <View style={styles.youBadge}>
                          <Text style={styles.youBadgeText}>You</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
      )}

      {selectedPostId && (
        <CommentsDrawer
          visible={commentsDrawerVisible}
          comments={comments}
          onClose={() => {
            setCommentsDrawerVisible(false);
            setSelectedPostId(null);
            setComments([]);
          }}
          onAddComment={handleAddComment}
          postId={selectedPostId}
          commentReactionMode="room"
          userId={userId ?? null}
        />
      )}

      <ReactionTrayOverlay
        visible={trayVisible}
        anchorLayout={trayAnchorLayout || undefined}
        selectedReaction={
          activePostId ? reactionsSummary[activePostId]?.userReaction : undefined
        }
        reactionCounts={
          (activePostId ? reactionsSummary[activePostId]?.counts : {}) as Record<
            ReactionType,
            number
          >
        }
        onSelect={handleSelectReaction}
        onClose={handleCloseReactionTray}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toast: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 1000,
    ...shadow.cardShadow,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  aboutContainer: {
    padding: spacing.lg,
  },
  aboutCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadow.cardShadow,
  },
  aboutLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  aboutValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  membersContainer: {
    paddingTop: spacing.md,
  },
  membersPlaceholder: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: spacing.md,
  },
  memberAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.headerRed + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  memberAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.headerRed,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  memberJoined: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  youBadge: {
    backgroundColor: colors.headerRed + '15',
    borderWidth: 1,
    borderColor: colors.headerRed + '30',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  youBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.headerRed,
  },
});
