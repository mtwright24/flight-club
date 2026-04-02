import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ProfileHeaderSection from '../../components/ProfileHeaderSection';
import { getFollowingFeed, getMyProfile } from '../../lib/feed';
import ProfileAboutTab from '../../src/components/profile/ProfileAboutTab';
import ProfilePostsFeedWithInteractions from '../../src/components/profile/ProfilePostsFeedWithInteractions';
import MediaGrid from '../../src/components/profile/MediaGrid';
import { fetchUserMedia } from '../../src/lib/supabase/profileMedia';
import { supabase } from '../../src/lib/supabaseClient';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../src/styles/refreshControl';

type TabKey = 'Posts' | 'Media' | 'About';

type TabProfileUser = {
  name: string;
  subtitle: string;
  avatar: string;
  cover: string;
  bio?: string;
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

async function fetchMemberRoomNames(userId: string): Promise<string[]> {
  const { data: memberships, error: memberErr } = await supabase
    .from('room_members')
    .select('room_id')
    .eq('user_id', userId)
    .limit(12);
  if (memberErr || !memberships?.length) return [];
  const roomIds = memberships.map((m: any) => m.room_id).filter(Boolean);
  if (!roomIds.length) return [];
  const { data: rooms, error: roomErr } = await supabase
    .from('rooms')
    .select('id, name')
    .in('id', roomIds);
  if (roomErr || !rooms?.length) return [];
  return rooms
    .map((r: any) => (typeof r.name === 'string' ? r.name.trim() : ''))
    .filter(Boolean)
    .slice(0, 8);
}

export default function ProfileScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('Posts');
  const [posts, setPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [media, setMedia] = useState<string[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [followingStatus, setFollowingStatus] = useState(false);
  const [isSelf, setIsSelf] = useState(false);
  const [user, setUser] = useState<TabProfileUser | null>(null);
  const [profileRecord, setProfileRecord] = useState<Record<string, any> | null>(null);
  const [memberRoomNames, setMemberRoomNames] = useState<string[]>([]);
  const [stats, setStats] = useState({ followers: 0, following: 0, posts: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const loadSelfProfile = useCallback(async () => {
    try {
      const profile = await getMyProfile();
      setProfileRecord(profile);
      setUser({
        name: profile.display_name || profile.full_name || 'User',
        subtitle: roleBaseLine(profile.role, profile.base),
        avatar: profile.avatar_url || '',
        cover: profile.cover_url || 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
        bio: profile.bio || '',
        id: profile.id,
      });
      setIsSelf(true);

      const [followersRes, followingRes, postsRes, roomNames, feed, mediaUrls] = await Promise.all([
        supabase.from('follows').select('id').eq('following_id', profile.id),
        supabase.from('follows').select('id').eq('follower_id', profile.id),
        supabase.from('posts').select('id').eq('user_id', profile.id),
        fetchMemberRoomNames(profile.id),
        getFollowingFeed({ userId: profile.id, limit: 20, offset: 0 }),
        fetchUserMedia(profile.id),
      ]);

      setMemberRoomNames(roomNames);
      setStats({
        followers: followersRes.data ? followersRes.data.length : 0,
        following: followingRes.data ? followingRes.data.length : 0,
        posts: postsRes.data ? postsRes.data.length : 0,
      });

      setPostsLoading(true);
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

      setMediaLoading(true);
      setMedia(mediaUrls || []);
      setMediaLoading(false);
      setFollowingStatus(false);
    } catch {
      setPostsLoading(false);
      setMediaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSelfProfile();
  }, [loadSelfProfile]);

  useFocusEffect(
    useCallback(() => {
      void loadSelfProfile();
    }, [loadSelfProfile]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadSelfProfile();
    } finally {
      setRefreshing(false);
    }
  }, [loadSelfProfile]);

  const openConnections = (tab: 'mutual' | 'followers' | 'following') => {
    if (!user?.id) return;
    router.push(`/profile/${user.id}/connections?tab=${tab}`);
  };

  const bioText = useMemo(() => {
    const b = typeof user?.bio === 'string' ? user.bio.trim() : '';
    if (b) return b;
    return isSelf ? 'Add a bio in Edit Profile.' : '';
  }, [isSelf, user?.bio]);

  const tabRow = (
    <View style={{ flexDirection: 'row', marginTop: 14, marginBottom: 8, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
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
            <View style={{ width: 1, height: 24, backgroundColor: '#E5E7EB', alignSelf: 'center' }} />
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
          onFollow={() => setFollowingStatus(!followingStatus)}
          onMessage={() => router.push('/messages-inbox')}
          onPressFollowers={() => openConnections('followers')}
          onPressFollowing={() => openConnections('following')}
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
      <View style={{ height: 1, backgroundColor: '#E5E7EB', marginHorizontal: 18, marginBottom: 0 }} />
    </>
  );

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
            headerComponent={headerBlock}
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
          {headerBlock}

          {activeTab === 'Media' &&
            (mediaLoading ? (
              <ActivityIndicator size="small" style={{ marginTop: 12 }} />
            ) : media.length === 0 ? (
              <Text style={{ color: '#334155', textAlign: 'center', marginTop: 32 }}>
                No media yet.
              </Text>
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

