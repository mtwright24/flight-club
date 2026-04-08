import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ProfileHeaderSection from '../../../components/ProfileHeaderSection';
import { followUser, getFollowingFeed, getIsFollowing, getMyProfile, unfollowUser } from '../../../lib/feed';
import SectionHeader from '../../../src/components/navigation/SectionHeader';
import ProfileAboutTab from '../../../src/components/profile/ProfileAboutTab';
import ProfilePostsFeedWithInteractions from '../../../src/components/profile/ProfilePostsFeedWithInteractions';
import MediaGrid from '../../../src/components/profile/MediaGrid';
import { useDmUnreadBadge } from '../../../src/hooks/useDmUnreadBadge';
import { useNotificationsBadge } from '../../../src/hooks/useNotificationsBadge';
import { usePullToRefresh } from '../../../src/hooks/usePullToRefresh';
import { startDirectConversation } from '../../../src/lib/supabase/dms';
import { fetchUserMedia } from '../../../src/lib/supabase/profileMedia';
import { supabase } from '../../../src/lib/supabaseClient';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../../src/styles/refreshControl';

type TabKey = 'Posts' | 'Media' | 'About';

type ProfileRouteUser = {
  name: string;
  subtitle: string;
  avatar: string;
  cover: string;
  bio: string;
  id?: string;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

function roleBaseLine(role?: string | null, base?: string | null): string {
  const r = typeof role === 'string' ? role.trim() : '';
  const b = typeof base === 'string' ? base.trim() : '';
  if (r && b) return `${r} • ${b}`;
  return r || b || '';
}

async function fetchMemberRoomNames(userId: string, isSelf: boolean): Promise<string[]> {
  const { data: memberships, error: memberErr } = await supabase
    .from('room_members')
    .select('room_id')
    .eq('user_id', userId)
    .limit(16);
  if (memberErr || !memberships?.length) return [];
  const roomIds = memberships.map((m: any) => m.room_id).filter(Boolean);
  if (!roomIds.length) return [];
  const { data: rooms, error: roomErr } = await supabase
    .from('rooms')
    .select('id, name, is_private')
    .in('id', roomIds);
  if (roomErr || !rooms?.length) return [];
  return rooms
    .filter((r: any) => isSelf || !r.is_private)
    .map((r: any) => (typeof r.name === 'string' ? r.name.trim() : ''))
    .filter(Boolean)
    .slice(0, 8);
}

export default function ProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const profileId =
    typeof params.id === 'string'
      ? params.id
      : Array.isArray(params.id) && params.id[0]
      ? params.id[0]
      : '';

  const unread = useNotificationsBadge();
  const { count: dmUnread } = useDmUnreadBadge();
  const [activeTab, setActiveTab] = useState<TabKey>('Posts');
  const [posts, setPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [media, setMedia] = useState<string[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [followingStatus, setFollowingStatus] = useState(false);
  const [followRequestPending, setFollowRequestPending] = useState(false);
  const [profileIsPrivate, setProfileIsPrivate] = useState(false);
  const [isSelf, setIsSelf] = useState(false);
  const [user, setUser] = useState<ProfileRouteUser | null>(null);
  const [profileRecord, setProfileRecord] = useState<Record<string, any> | null>(null);
  const [memberRoomNames, setMemberRoomNames] = useState<string[]>([]);
  const [stats, setStats] = useState({ followers: 0, following: 0, posts: 0 });

  const openConnections = useCallback(
    (tab: 'mutual' | 'followers' | 'following') => {
      if (!profileId) return;
      router.push(`/profile/${profileId}/connections?tab=${tab}` as const);
    },
    [profileId, router],
  );

  const loadProfileData = useCallback(async () => {
    if (!profileId) return;
    try {
      const me = await getMyProfile();
      const self = me.id === profileId;
      setIsSelf(self);

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profileId)
        .single();
      setProfileRecord(profile);
      setUser({
        name: profile.display_name || profile.full_name || 'User',
        subtitle: roleBaseLine(profile.role, profile.base),
        avatar: profile.avatar_url || '',
        cover: profile.cover_url || 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
        bio: profile.bio || '',
        id: profileId,
      });
      setProfileIsPrivate(profile.is_private === true);

      const [followersRes, followingRes, postsRes, feed, mediaUrls, roomNames] = await Promise.all([
        supabase.from('follows').select('id').eq('following_id', profileId),
        supabase.from('follows').select('id').eq('follower_id', profileId),
        supabase.from('posts').select('id').eq('user_id', profileId),
        getFollowingFeed({ userId: profileId, limit: 20, offset: 0 }),
        fetchUserMedia(profileId),
        fetchMemberRoomNames(profileId, self),
      ]);

      setMemberRoomNames(roomNames);
      setStats({
        followers: followersRes.data ? followersRes.data.length : 0,
        following: followingRes.data ? followingRes.data.length : 0,
        posts: postsRes.data ? postsRes.data.length : 0,
      });

      setPostsLoading(true);
      const ownPosts = (feed || [])
        .filter((p: any) => p.user_id === profileId)
        .map((post: any) => {
          const joinedProfile = (post as any).profiles || {};
          return {
            ...post,
            profile_display_name:
              post.profile_display_name ??
              joinedProfile.display_name ??
              joinedProfile.full_name ??
              undefined,
            profile_avatar_url:
              post.profile_avatar_url ??
              joinedProfile.avatar_url ??
              undefined,
          };
        });
      setPosts(ownPosts);
      setPostsLoading(false);

      setMediaLoading(true);
      setMedia(mediaUrls);
      setMediaLoading(false);

      if (!self) {
        setFollowingStatus(await getIsFollowing(profileId));
        if (profile.is_private) {
          const { data: requestData } = await supabase
            .from('follow_requests')
            .select('*')
            .eq('follower_id', me.id)
            .eq('following_id', profileId)
            .eq('status', 'pending')
            .maybeSingle();
          setFollowRequestPending(!!requestData);
        } else {
          setFollowRequestPending(false);
        }
      } else {
        setFollowingStatus(false);
        setFollowRequestPending(false);
      }
    } catch {
      setPostsLoading(false);
      setMediaLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  const { refreshing: profilePullRefreshing, onRefresh: onProfilePullRefresh } =
    usePullToRefresh(async () => {
      await loadProfileData();
    });

  const handleStartDm = useCallback(async () => {
    try {
      const me = await getMyProfile();
      if (!me?.id || !profileId) return;
      const { conversationId } = await startDirectConversation(me.id, profileId);
      router.push({ pathname: '/dm-thread', params: { conversationId: String(conversationId) } });
    } catch (err: any) {
      Alert.alert('Unable to start message', err?.message || 'Please try again.');
    }
  }, [profileId, router]);

  const handleFollow = useCallback(async () => {
    try {
      const me = await getMyProfile();
      if (profileIsPrivate) {
        const { error } = await supabase
          .from('follow_requests')
          .insert({ follower_id: me.id, following_id: profileId, status: 'pending' });
        if (error) {
          Alert.alert('Follow Request Failed', error.message);
        } else {
          setFollowRequestPending(true);
        }
        return;
      }

      if (!followingStatus) {
        const { error } = await followUser(profileId);
        if (error) {
          Alert.alert('Follow Failed', error.message);
          return;
        }
      } else {
        const { error } = await unfollowUser(profileId);
        if (error) {
          Alert.alert('Unfollow Failed', error.message);
          return;
        }
      }
      await loadProfileData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Something went wrong');
    }
  }, [followingStatus, loadProfileData, profileId, profileIsPrivate]);

  const bioText = useMemo(() => {
    const b = typeof user?.bio === 'string' ? user.bio.trim() : '';
    if (b) return b;
    if (isSelf) return 'Add a bio in Edit Profile.';
    return 'No bio yet.';
  }, [isSelf, user?.bio]);

  const tabRow = (
    <View
      style={{
        flexDirection: 'row',
        marginTop: 20,
        marginBottom: 24,
        paddingTop: 4,
        justifyContent: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
      }}
    >
      {(['Posts', 'Media', 'About'] as TabKey[]).map((tab, idx, arr) => (
        <React.Fragment key={tab}>
          <Pressable
            style={{
              paddingVertical: 8,
              paddingHorizontal: 24,
              marginHorizontal: 4,
              borderBottomWidth: activeTab === tab ? 3 : 0,
              borderBottomColor: activeTab === tab ? '#B5161E' : 'transparent',
            }}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={{ color: activeTab === tab ? '#B5161E' : '#334155', fontWeight: '700' }}>{tab}</Text>
          </Pressable>
          {idx < arr.length - 1 ? (
            <View
              style={{
                width: 1,
                height: 24,
                backgroundColor: '#E5E7EB',
                alignSelf: 'center',
              }}
            />
          ) : null}
        </React.Fragment>
      ))}
    </View>
  );

  const headerBlock = (
    <>
      {user ? (
        <ProfileHeaderSection
          user={user}
          stats={stats}
          isSelf={isSelf}
          followingStatus={followingStatus}
          followRequestPending={followRequestPending}
          profileIsPrivate={profileIsPrivate}
          onPressFollowers={() => openConnections('followers')}
          onPressFollowing={() => openConnections('following')}
          onFollow={handleFollow}
          onMessage={handleStartDm}
          onPressAvatar={isSelf ? () => router.push('/edit-profile') : undefined}
          router={router}
        />
      ) : (
        <View style={{ height: 180, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#64748b' }}>No profile data available.</Text>
        </View>
      )}
      {!!bioText && (
        <View style={{ paddingHorizontal: 22, marginTop: 10 }}>
          <Text style={{ color: '#334155', fontSize: 14, lineHeight: 20 }}>{bioText}</Text>
        </View>
      )}
      {tabRow}
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <SectionHeader
        title="Profile"
        notificationCount={unread}
        dmCount={dmUnread}
        onPressBell={() => {
          router.push('/notifications');
        }}
        onPressMessage={() => {
          router.push('/messages-inbox');
        }}
      />
      {activeTab === 'Posts' ? (
        postsLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" />
          </View>
        ) : (
          <ProfilePostsFeedWithInteractions
            posts={posts}
            emptyTitle="No posts yet."
            refreshing={profilePullRefreshing}
            onRefresh={onProfilePullRefresh}
            onPostsChanged={() => void loadProfileData()}
            headerComponent={headerBlock}
          />
        )
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={profilePullRefreshing}
              onRefresh={onProfilePullRefresh}
              colors={REFRESH_CONTROL_COLORS}
              tintColor={REFRESH_TINT}
            />
          }
        >
          {headerBlock}
          {activeTab === 'Media' &&
            (mediaLoading ? (
              <ActivityIndicator size="small" style={{ marginTop: 12 }} />
            ) : media.length === 0 ? (
              <Text style={{ color: '#334155', textAlign: 'center', marginTop: 32 }}>No media yet.</Text>
            ) : (
              <MediaGrid media={media} />
            ))}
          {activeTab === 'About' && (
            <ProfileAboutTab profile={profileRecord} memberRoomNames={memberRoomNames} />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

