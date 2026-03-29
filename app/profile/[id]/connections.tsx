import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  followUser,
  getFollowedUserIds,
  getFollowersOfUser,
  getFollowingOfUser,
  getMutualConnections,
  getMyProfile,
  type ProfileListUser,
  unfollowUser,
} from '../../../lib/feed';
import { supabase } from '../../../src/lib/supabaseClient';
import { REFRESH_CONTROL_COLORS, REFRESH_TINT } from '../../../src/styles/refreshControl';

type TabKey = 'mutual' | 'followers' | 'following';

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

function displayHandle(u: ProfileListUser): string {
  const raw = (u.username || '').trim();
  if (raw) return raw.startsWith('@') ? raw : `@${raw}`;
  return u.id.slice(0, 8);
}

function displaySecondary(u: ProfileListUser): string {
  return (u.display_name || u.full_name || '').trim() || ' ';
}

export default function ProfileConnectionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[]; tab?: string | string[] }>();
  const profileId =
    typeof params.id === 'string'
      ? params.id
      : Array.isArray(params.id) && params.id[0]
        ? params.id[0]
        : '';
  const tabRaw = typeof params.tab === 'string' ? params.tab : Array.isArray(params.tab) ? params.tab[0] : '';
  const initialTab: TabKey =
    tabRaw === 'mutual' || tabRaw === 'followers' || tabRaw === 'following' ? tabRaw : 'followers';

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [profileHandle, setProfileHandle] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [mutual, setMutual] = useState<ProfileListUser[]>([]);
  const [followers, setFollowers] = useState<ProfileListUser[]>([]);
  const [following, setFollowing] = useState<ProfileListUser[]>([]);
  const [iFollow, setIFollow] = useState<Set<string>>(new Set());
  const [myFollowerIds, setMyFollowerIds] = useState<Set<string>>(new Set());
  const [followBusy, setFollowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profileId) return;
    const me = await getMyProfile();
    setViewerId(me.id);
    const { data: prof } = await supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', profileId)
      .maybeSingle();
    const h = (prof?.username && String(prof.username).trim()) || (prof?.display_name && String(prof.display_name).trim()) || '';
    setProfileHandle(h || 'Profile');

    const [m, f, fo, myFollowing, myFollowersRows] = await Promise.all([
      getMutualConnections(me.id, profileId),
      getFollowersOfUser(profileId),
      getFollowingOfUser(profileId),
      getFollowedUserIds(me.id),
      getFollowersOfUser(me.id),
    ]);
    setMutual(m);
    setFollowers(f);
    setFollowing(fo);
    setIFollow(new Set(myFollowing));
    setMyFollowerIds(new Set(myFollowersRows.map((u) => u.id)));
  }, [profileId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        await load();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    const t = typeof params.tab === 'string' ? params.tab : Array.isArray(params.tab) ? params.tab[0] : '';
    if (t === 'mutual' || t === 'followers' || t === 'following') setActiveTab(t);
  }, [params.tab]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const listForTab = useMemo(() => {
    switch (activeTab) {
      case 'mutual':
        return mutual;
      case 'followers':
        return followers;
      case 'following':
        return following;
      default:
        return [];
    }
  }, [activeTab, mutual, followers, following]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = !q
      ? listForTab
      : listForTab.filter((u) => {
          const a = (u.username || '').toLowerCase();
          const b = (u.display_name || '').toLowerCase();
          const c = (u.full_name || '').toLowerCase();
          return a.includes(q) || b.includes(q) || c.includes(q);
        });
    return [...base].sort((a, b) =>
      displayHandle(a).localeCompare(displayHandle(b), undefined, { sensitivity: 'base' }),
    );
  }, [listForTab, search]);

  const toggleFollow = useCallback(
    async (targetId: string) => {
      if (!viewerId || targetId === viewerId || followBusy) return;
      setFollowBusy(targetId);
      try {
        const isFollowing = iFollow.has(targetId);
        if (isFollowing) {
          const { error } = await unfollowUser(targetId);
          if (error) return;
          setIFollow((prev) => {
            const n = new Set(prev);
            n.delete(targetId);
            return n;
          });
        } else {
          const { error } = await followUser(targetId);
          if (error) return;
          setIFollow((prev) => new Set([...prev, targetId]));
        }
        await load();
      } finally {
        setFollowBusy(null);
      }
    },
    [viewerId, iFollow, followBusy, load],
  );

  const renderRow = useCallback(
    ({ item }: { item: ProfileListUser }) => {
      const isSelf = item.id === viewerId;
      const followingThem = iFollow.has(item.id);
      const showFollowBack = !followingThem && myFollowerIds.has(item.id);
      const followLabel = followingThem ? 'Following' : showFollowBack ? 'Follow back' : 'Follow';
      const handle = displayHandle(item);
      const sub = displaySecondary(item);

      return (
        <View style={styles.row}>
          <Pressable
            style={styles.rowMain}
            onPress={() => router.push(`/profile/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Profile ${handle}`}
          >
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={22} color="#64748b" />
              </View>
            )}
            <View style={styles.rowText}>
              <Text style={styles.rowPrimary} numberOfLines={1}>
                {handle}
              </Text>
              <Text style={styles.rowSecondary} numberOfLines={1}>
                {sub}
              </Text>
            </View>
          </Pressable>
          {!isSelf && viewerId ? (
            <Pressable
              style={[styles.followBtn, followingThem && styles.followBtnOutline]}
              onPress={() => void toggleFollow(item.id)}
              disabled={followBusy === item.id}
            >
              {followBusy === item.id ? (
                <ActivityIndicator size="small" color={followingThem ? '#64748b' : '#fff'} />
              ) : (
                <Text style={[styles.followBtnText, followingThem && styles.followBtnTextOutline]}>{followLabel}</Text>
              )}
            </Pressable>
          ) : (
            <View style={{ width: 96 }} />
          )}
        </View>
      );
    },
    [viewerId, iFollow, myFollowerIds, followBusy, router, toggleFollow],
  );

  if (!profileId) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={28} color="#64748b" />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {profileHandle}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.tabRow}>
        {(['mutual', 'followers', 'following'] as const).map((key) => {
          const count = key === 'mutual' ? mutual.length : key === 'followers' ? followers.length : following.length;
          const label =
            key === 'mutual' ? `${formatCount(count)} mutual` : key === 'followers' ? `${formatCount(count)} followers` : `${formatCount(count)} following`;
          return (
            <Pressable key={key} style={styles.tabCell} onPress={() => setActiveTab(key)}>
              <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]} numberOfLines={1}>
                {label}
              </Text>
              {activeTab === key ? <View style={styles.tabUnderline} /> : <View style={styles.tabUnderlineHidden} />}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color="#8e8e8e" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search"
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={REFRESH_TINT} />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1, backgroundColor: '#fff' }}
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={REFRESH_TINT}
              colors={REFRESH_CONTROL_COLORS}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No users found.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  tabCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  tabText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#B5161E',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    width: '100%',
    backgroundColor: '#B5161E',
  },
  tabUnderlineHidden: {
    height: 2,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    color: '#0f172a',
    fontSize: 16,
    padding: 0,
  },
  listContent: {
    paddingBottom: 32,
    backgroundColor: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    marginRight: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E2E8F0',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  rowPrimary: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  rowSecondary: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
  },
  followBtn: {
    backgroundColor: '#B5161E',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 108,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBtnOutline: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  followBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  followBtnTextOutline: {
    color: '#334155',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  empty: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 32,
    fontSize: 15,
    fontWeight: '600',
  },
});
