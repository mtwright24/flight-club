import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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
import ProfileHeaderSection from '../../components/ProfileHeaderSection';
import { followUser, getFollowingFeed, getIsFollowing, getMyProfile, unfollowUser } from '../../lib/feed';
import SectionHeader from '../../src/components/navigation/SectionHeader';
import ProfilePostsFeedWithInteractions from '../../src/components/profile/ProfilePostsFeedWithInteractions';
import MediaGrid from '../../src/components/profile/MediaGrid';
import { useDmUnreadBadge } from '../../src/hooks/useDmUnreadBadge';
import { useNotificationsBadge } from '../../src/hooks/useNotificationsBadge';
import { startDirectConversation } from '../../src/lib/supabase/dms';
import { fetchUserMedia } from '../../src/lib/supabase/profileMedia';
import { supabase } from '../../src/lib/supabaseClient';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../src/styles/refreshControl';

/** Card user shown in ProfileHeaderSection (view by id). */
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
  scrollContent: { paddingBottom: 32 },
  contentPad: { paddingHorizontal: 18 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

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
  const [activeTab, setActiveTab] = useState('Posts');
  const [posts, setPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [media, setMedia] = useState<string[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [followingStatus, setFollowingStatus] = useState(false);
  const [followRequestPending, setFollowRequestPending] = useState(false);
  const [profileIsPrivate, setProfileIsPrivate] = useState(false);
  const [isSelf, setIsSelf] = useState(false);
  const [user, setUser] = useState<ProfileRouteUser | null>(null);
  const [stats, setStats] = useState({ followers: 0, following: 0, posts: 0 });

  const loadProfileData = useCallback(async () => {
    if (!profileId) return;
    try {
      const me = await getMyProfile();
      setIsSelf(me.id === profileId);

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profileId)
        .single();
      setUser({
        name: profile.display_name || profile.full_name || 'User',
        subtitle: `${profile.role || ''} • ${profile.base || ''}`,
        avatar: profile.avatar_url || '',
        cover: profile.cover_url || 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
        bio: profile.bio || '',
      });
      setProfileIsPrivate(profile.is_private === true);

      const { data: followersData } = await supabase
        .from('follows')
        .select('id')
        .eq('following_id', profileId);
      const { data: followingData } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', profileId);
      const { data: postsData } = await supabase
        .from('posts')
        .select('id')
        .eq('user_id', profileId);
      setStats({
        followers: followersData ? followersData.length : 0,
        following: followingData ? followingData.length : 0,
        posts: postsData ? postsData.length : 0,
      });

      setPostsLoading(true);
      const feed = await getFollowingFeed({ userId: profileId, limit: 20, offset: 0 });
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
      const mediaUrls = await fetchUserMedia(profileId);
      setMedia(mediaUrls);
      setMediaLoading(false);

      setFollowingStatus(await getIsFollowing(profileId));
      if (profile.is_private) {
        const { data: requestData } = await supabase
          .from('follow_requests')
          .select('*')
          .eq('follower_id', me.id)
          .eq('following_id', profileId)
          .eq('status', 'pending')
          .single();
        setFollowRequestPending(!!requestData);
      } else {
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

  const { refreshing: profilePullRefreshing, onRefresh: onProfilePullRefresh } = usePullToRefresh(async () => {
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

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <SectionHeader
        title="Profile"
        notificationCount={unread}
        dmCount={dmUnread}
        onPressBell={() => {
          try { router.push('/notifications'); } catch (e) { console.log('no route /notifications'); }
        }}
        onPressMessage={() => {
          try { router.push('/messages-inbox'); } catch (e) { console.log('no route /messages-inbox'); }
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
            headerComponent={
              <>
                {user ? (
                  <ProfileHeaderSection
                    user={user}
                    stats={stats}
                    isSelf={isSelf}
                    followingStatus={followingStatus}
                    followRequestPending={followRequestPending}
                    profileIsPrivate={profileIsPrivate}
                    onFollow={async () => {
                      try {
                        const me = await getMyProfile();
                        if (profileIsPrivate) {
                          const { error } = await supabase
                            .from('follow_requests')
                            .insert({ follower_id: me.id, following_id: profileId, status: 'pending' });
                          if (error) {
                            Alert.alert('Follow Request Failed', error.message);
                            console.log('Follow request error:', error);
                          } else {
                            setFollowRequestPending(true);
                            console.log('Follow request submitted');
                          }
                        } else {
                          if (!followingStatus) {
                            const { error } = await followUser(profileId);
                            if (error) {
                              Alert.alert('Follow Failed', error.message);
                              console.log('Follow error:', error);
                            } else {
                              console.log('Followed user:', profileId);
                            }
                          } else {
                            const { error } = await unfollowUser(profileId);
                            if (error) {
                              Alert.alert('Unfollow Failed', error.message);
                              console.log('Unfollow error:', error);
                            } else {
                              console.log('Unfollowed user:', profileId);
                            }
                          }
                          // Ensure Supabase operations complete before updating state
                          const { data: followersData, error: followersError } = await supabase
                            .from('follows')
                            .select('id')
                            .eq('following_id', profileId);
                          const { data: followingData, error: followingError } = await supabase
                            .from('follows')
                            .select('id')
                            .eq('follower_id', profileId);
                          const statsErr = followersError ?? followingError;
                          if (statsErr) {
                            Alert.alert('Stats Update Failed', statsErr.message);
                            console.log('Stats update error:', statsErr);
                          }
                          setStats({
                            followers: followersData ? followersData.length : 0,
                            following: followingData ? followingData.length : 0,
                            posts: stats.posts,
                          });
                          const newStatus = await getIsFollowing(profileId);
                          setFollowingStatus(newStatus);
                          console.log('Updated followingStatus:', newStatus);
                        }
                      } catch (err) {
                        Alert.alert(
                          'Error',
                          err instanceof Error ? err.message : String(err),
                        );
                        console.log('Follow button error:', err);
                      }
                    }}
                    onMessage={handleStartDm}
                    onPressAvatar={isSelf ? () => router.push('/edit-profile') : undefined}
                    router={router}
                  />
                ) : (
                  <View style={{height:180, justifyContent:'center', alignItems:'center'}}>
                    <Text style={{color:'#64748b'}}>No profile data available.</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', marginTop: 24, marginBottom: 8, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
                  {['Posts', 'Media', 'About'].map((tab, idx) => (
                    <Pressable
                      key={tab}
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
                    )).reduce((acc, el, idx, arr) => acc.concat(el, idx < arr.length - 1 ? <View key={`divider-${idx}`} style={{ width: 1, height: 24, backgroundColor: '#E5E7EB', alignSelf: 'center' }} /> : null), [] as React.ReactNode[])}
                </View>
                <View style={{ height: 1, backgroundColor: '#E5E7EB', marginHorizontal: 18, marginBottom: 0 }} />
              </>
            }
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
          {user ? (
            <ProfileHeaderSection
              user={user}
              stats={stats}
              isSelf={isSelf}
              followingStatus={followingStatus}
              onFollow={async () => {
                if (profileIsPrivate) {
                  // Submit follow request
                  const me = await getMyProfile();
                  await supabase
                    .from('follow_requests')
                    .insert({ follower_id: me.id, following_id: profileId, status: 'pending' });
                  setFollowRequestPending(true);
                } else {
                  if (!followingStatus) {
                    await followUser(profileId);
                  } else {
                    await unfollowUser(profileId);
                  }
                  // Refresh stats and following status
                  const { data: followersData } = await supabase
                    .from('follows')
                    .select('id')
                    .eq('following_id', profileId);
                  const { data: followingData } = await supabase
                    .from('follows')
                    .select('id')
                    .eq('follower_id', profileId);
                  setStats({
                    followers: followersData ? followersData.length : 0,
                    following: followingData ? followingData.length : 0,
                    posts: stats.posts,
                  });
                  setFollowingStatus(await getIsFollowing(profileId));
                }
              }}
              onMessage={handleStartDm}
              onPressAvatar={isSelf ? () => router.push('/edit-profile') : undefined}
              router={router}
            />
          ) : (
            <View style={{height:180, justifyContent:'center', alignItems:'center'}}>
              <Text style={{color:'#64748b'}}>No profile data available.</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', marginTop: 24, marginBottom: 8, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
            {['Posts', 'Media', 'About'].map((tab, idx) => (
              <Pressable
                key={tab}
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
              )).reduce((acc, el, idx, arr) => acc.concat(el, idx < arr.length - 1 ? <View key={`divider-${idx}`} style={{ width: 1, height: 24, backgroundColor: '#E5E7EB', alignSelf: 'center' }} /> : null), [] as React.ReactNode[])}
          </View>
          <View style={{ height: 1, backgroundColor: '#E5E7EB', marginHorizontal: 18, marginBottom: 0 }} />
          {activeTab === 'Media' && (
            mediaLoading ? (
              <ActivityIndicator size="small" style={{ marginTop: 12 }} />
            ) : media.length === 0 ? (
              <Text style={{ color: '#334155', textAlign: 'center', marginTop: 32 }}>
                No media yet.
              </Text>
            ) : (
              <MediaGrid media={media} />
            )
          )}
          {activeTab === 'About' && (
            <View style={{ marginTop: 24, paddingHorizontal: 18 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 8 }}>Bio</Text>
              <Text style={{ color: '#334155', fontSize: 14 }}>
                {user && user.bio ? user.bio : 'No bio available.'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
