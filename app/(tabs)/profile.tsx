import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ProfileHeaderSection from '../../components/ProfileHeaderSection';
import { getFollowingFeed, getMyProfile } from '../../lib/feed';
import ProfilePostsFeedWithInteractions from '../../src/components/profile/ProfilePostsFeedWithInteractions';
import MediaGrid from '../../src/components/profile/MediaGrid';
import { fetchUserMedia } from '../../src/lib/supabase/profileMedia';
import { supabase } from '../../src/lib/supabaseClient';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../src/styles/refreshControl';

/** Card user shown in ProfileHeaderSection (self tab). */
type TabProfileUser = {
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
  const params = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState('Posts');
  const [posts, setPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [media, setMedia] = useState<string[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [followingStatus, setFollowingStatus] = useState(false);
  const [isSelf, setIsSelf] = useState(false);
  const [user, setUser] = useState<TabProfileUser | null>(null);
  const [bio, setBio] = useState('');
  const [stats, setStats] = useState({ followers: 0, following: 0, posts: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const loadSelfProfile = useCallback(async () => {
    try {
      // Fetch current user profile (includes avatar_url / cover_url saved from Edit Profile)
      const profile = await getMyProfile();
      setUser({
        name: profile.display_name || profile.full_name || 'User',
        subtitle: `${profile.role || ''} • ${profile.base || ''}`,
        avatar: profile.avatar_url || '',
        cover: profile.cover_url || 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
        bio: profile.bio || '',
        id: profile.id,
      });
      setBio(profile.bio || '');
      setIsSelf(true);

      // Fetch stats
      const { data: followersData } = await supabase
        .from('follows')
        .select('id')
        .eq('following_id', profile.id);
      const { data: followingData } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', profile.id);
      const { data: postsData } = await supabase
        .from('posts')
        .select('id')
        .eq('user_id', profile.id);
      setStats({
        followers: followersData ? followersData.length : 0,
        following: followingData ? followingData.length : 0,
        posts: postsData ? postsData.length : 0,
      });

      // Fetch posts
      setPostsLoading(true);
      const feed = await getFollowingFeed({ userId: profile.id, limit: 20, offset: 0 });
      const ownPosts = (feed || [])
        .filter((p: any) => p.user_id === profile.id)
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

      // Fetch media from posts
      setMediaLoading(true);
      const mediaUrls = await fetchUserMedia(profile.id);
      setMedia(mediaUrls);
      setMediaLoading(false);

      // Self profile: followingStatus is not meaningful here
      setFollowingStatus(false);
    } catch (err) {
      setPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSelfProfile();
  }, [loadSelfProfile]);

  // Ensure profile (including avatar / cover) refreshes whenever the Profile tab is focused
  useFocusEffect(
    useCallback(() => {
      loadSelfProfile();
    }, [loadSelfProfile])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadSelfProfile();
    } finally {
      setRefreshing(false);
    }
  }, [loadSelfProfile]);

  // Helper for DM routing from self profile
  function handleMessageButton() {
    router.push('/messages-inbox');
  }

  const openConnections = (tab: 'mutual' | 'followers' | 'following') => {
    if (!user?.id) return;
    router.push(`/profile/${user.id}/connections?tab=${tab}`);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {activeTab === 'Posts' ? (
        postsLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" />
          </View>
        ) : (
          <ProfilePostsFeedWithInteractions
            posts={posts}
            emptyTitle="No posts yet."
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onPostsChanged={() => void loadSelfProfile()}
            headerComponent={
              <>
                {user ? (
                  <ProfileHeaderSection
                    user={user}
                    stats={stats}
                    isSelf={isSelf}
                    followingStatus={followingStatus}
                    onFollow={() => setFollowingStatus(!followingStatus)}
                    onMessage={handleMessageButton}
                    onPressFollowers={() => openConnections('followers')}
                    onPressFollowing={() => openConnections('following')}
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
              refreshing={refreshing}
              onRefresh={handleRefresh}
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
              onFollow={() => setFollowingStatus(!followingStatus)}
              onMessage={handleMessageButton}
              onPressFollowers={() => openConnections('followers')}
              onPressFollowing={() => openConnections('following')}
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






















































































