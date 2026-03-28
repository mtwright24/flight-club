import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Platform, Pressable, RefreshControl, StyleSheet as RNStyleSheet, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SearchResultRowDefault, SearchResultRow as SearchResultRowExplicit } from '../components/SearchResultRow';
import {
    getLastSearchPeopleError,
    getRecentSearches,
    getSuggestedPeople,
    getSuggestedRooms,
    getTrendingPosts,
    RecentSearchItem,
    saveRecentSearch,
    searchAll,
    searchPeople,
    searchPosts,
    SearchResultItem,
    searchRooms,
    searchTools,
} from '../lib/search';
import { useAuth } from '../src/hooks/useAuth';
import { colors } from '../src/styles/theme';
// Facebook-style Recent row styles
const recentStyles = RNStyleSheet.create({
  rowWrap: {
    backgroundColor: '#F3F4F6', // match grey background
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    minHeight: 64,
    backgroundColor: '#FFF',
  },
  rowPressed: {
    backgroundColor: '#F3F4F6',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: '#E5E7EB',
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: '#E5E7EB',
  },
  textCol: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 0,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 1,
  },
  moreCol: {
    marginLeft: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    width: 36,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginLeft: 72,
    marginRight: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
    backgroundColor: '#F3F4F6', // match grey background
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  seeAllBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  seeAllText: {
    fontSize: 14,
    color: colors.headerRed,
    fontWeight: '600',
  },
  emptyRow: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
});

type SearchTabKey = 'all' | 'people' | 'posts' | 'rooms' | 'tools';

type SectionItem =
  | { kind: 'result'; item: SearchResultItem }
  | { kind: 'message'; id: string; text: string };

type SearchSection = {
  key: string;
  title: string;
  data: SectionItem[];
};

export default function SearchScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTabKey>('all');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [peopleResults, setPeopleResults] = useState<SearchResultItem[]>([]);
  const [postResults, setPostResults] = useState<SearchResultItem[]>([]);
  const [roomResults, setRoomResults] = useState<SearchResultItem[]>([]);
  const [toolResults, setToolResults] = useState<SearchResultItem[]>([]);

  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([]);
  const [suggestedRooms, setSuggestedRooms] = useState<SearchResultItem[]>([]);
  const [suggestedPeople, setSuggestedPeople] = useState<SearchResultItem[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<SearchResultItem[]>([]);

  const requestIdRef = useRef(0);
  const inputRef = useRef<TextInput | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [recentProfiles, setRecentProfiles] = useState<Record<string, { display_name: string | null; username: string | null; avatar_url: string | null }>>({});

  useEffect(() => {
    let mounted = true;
    const loadSuggestions = async () => {
      try {
        const [recents, rooms, people, posts] = await Promise.all([
          getRecentSearches(userId),
          getSuggestedRooms(8),
          getSuggestedPeople(6),
          getTrendingPosts(5),
        ]);
        if (!mounted) return;
        setRecentSearches(recents);
        setSuggestedRooms(rooms);
        setSuggestedPeople(people);
        setTrendingPosts(posts);
      } catch (e) {
        if (!mounted) return;
        console.warn('[search] Failed to load suggestions', e);
      }
    };
    loadSuggestions();
    return () => {
      mounted = false;
    };
  }, [userId]);

  // Keep a live map of profiles for person-type recent searches so
  // their display name and avatar stay up to date instead of using
  // the cached title only.
  useEffect(() => {
    const personIds = recentSearches
      .filter((r) => r.type === 'person')
      .map((r) => r.id);
    if (personIds.length === 0) {
      setRecentProfiles({});
      return;
    }
    let isCancelled = false;
    (async () => {
      try {
        const { supabase } = require('../src/lib/supabaseClient');
        const { data, error } = await supabase
          .from('profiles')
          .select('id, display_name, username, avatar_url')
          .in('id', personIds);
        if (error || !data || isCancelled) return;
        const next: Record<string, { display_name: string | null; username: string | null; avatar_url: string | null }> = {};
        for (const row of data) {
          next[row.id] = {
            display_name: row.display_name ?? null,
            username: row.username ?? null,
            avatar_url: row.avatar_url ?? null,
          };
        }
        setRecentProfiles(next);
      } catch {
        // Ignore; recents will just use cached title/avatar.
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [recentSearches]);

  useEffect(() => {
    if (!userId) {
      setRecentSearches([]);
    } else {
      getRecentSearches(userId).then(setRecentSearches).catch(() => {});
    }
  }, [userId]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearching(false);
      setError(null);
      setPeopleResults([]);
      setPostResults([]);
      setRoomResults([]);
      setToolResults([]);
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    setSearching(true);
    setError(null);

    const timeout = setTimeout(async () => {
      try {
        if (activeTab === 'all') {
          const all = await searchAll(trimmed, 15);
          if (requestIdRef.current !== currentRequestId) return;
          setPeopleResults(all.people);
          setRoomResults(all.rooms);
          setPostResults(all.posts);
          setToolResults(all.tools);
        } else if (activeTab === 'people') {
          const people = await searchPeople(trimmed, 20);
          if (requestIdRef.current !== currentRequestId) return;
          setPeopleResults(people);
          setPostResults([]);
          setRoomResults([]);
          setToolResults([]);
        } else if (activeTab === 'posts') {
          const posts = await searchPosts(trimmed, 20);
          if (requestIdRef.current !== currentRequestId) return;
          setPostResults(posts);
          setPeopleResults([]);
          setRoomResults([]);
          setToolResults([]);
        } else if (activeTab === 'rooms') {
          const rooms = await searchRooms(trimmed, 20);
          if (requestIdRef.current !== currentRequestId) return;
          setRoomResults(rooms);
          setPeopleResults([]);
          setPostResults([]);
          setToolResults([]);
        } else if (activeTab === 'tools') {
          const tools = await searchTools(trimmed, 20);
          if (requestIdRef.current !== currentRequestId) return;
          setToolResults(tools);
          setPeopleResults([]);
          setPostResults([]);
          setRoomResults([]);
        }
        if (requestIdRef.current === currentRequestId) {
          setSearching(false);
        }
      } catch (e: any) {
        if (requestIdRef.current !== currentRequestId) return;
        console.error('[search] Search error', e);
        setError('Something went wrong while searching.');
        setSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [query, activeTab]);

  const handleBack = () => {
    router.back();
  };

  const handleFilterPress = () => {
    Alert.alert('Coming soon', 'Search filters are not available yet.');
  };

  const handlePressResult = useCallback(
    async (item: SearchResultItem) => {
      if (userId) {
        await saveRecentSearch(userId, {
          type: item.type,
          id: item.id,
          title: item.title,
          route: item.route,
          timestamp: Date.now(),
        });
        const updated = await getRecentSearches(userId);
        setRecentSearches(updated);
      }
      if (item.type === 'person' && item.id) {
        router.push(`/profile/${item.id}`);
      } else if (item.type === 'room' && item.id) {
        router.push({ pathname: '/(tabs)/crew-rooms/room-home', params: { roomId: item.id } });
      } else if (item.type === 'post' && item.id) {
        router.push(`/post/${item.id}`);
      } else {
        router.push(item.route as any);
      }
    },
    [router, userId]
  );

  const handlePressRecent = useCallback(
    (recent: RecentSearchItem) => {
      if (recent.type === 'person' && recent.id) {
        router.push(`/profile/${recent.id}`);
        return;
      }
      if (recent.type === 'room' && recent.id) {
        router.push({ pathname: '/(tabs)/crew-rooms/room-home', params: { roomId: recent.id } });
        return;
      }
      if (recent.type === 'post' && recent.id) {
        router.push(`/post/${recent.id}`);
        return;
      }
      router.push(recent.route as any);
    },
    [router]
  );

  const sections: SearchSection[] = useMemo(() => {
    // Only show Recent section under the tabs, nothing else.
    const trimmed = query.trim();
    const sections: SearchSection[] = [];
    if (!trimmed && activeTab === 'all') {
      // Only show recents that are NOT tools
      const filteredRecents = recentSearches.filter(r => r.type !== 'tool');
      if (filteredRecents.length > 0) {
        sections.push({
          key: 'recent',
          title: 'Recent',
          data: filteredRecents.slice(0, 6).map((r) => ({ kind: 'result', item: r })),
        });
      } else {
        sections.push({
          key: 'recent',
          title: 'Recent',
          data: [{ kind: 'message', id: 'recent-empty', text: 'No recent searches yet' }],
        });
      }
    }
    return sections;
  }, [query, activeTab, recentSearches]);

  const handleSubmitSearch = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearching(false);
      setError(null);
      setPeopleResults([]);
      setPostResults([]);
      setRoomResults([]);
      setToolResults([]);
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    setSearching(true);
    setError(null);

    (async () => {
      try {
        if (activeTab === 'all') {
          const all = await searchAll(trimmed, 15);
          if (requestIdRef.current !== currentRequestId) return;
          setPeopleResults(all.people);
          setRoomResults(all.rooms);
          setPostResults(all.posts);
          setToolResults(all.tools);
        } else if (activeTab === 'people') {
          const people = await searchPeople(trimmed, 20);
          if (requestIdRef.current !== currentRequestId) return;
          setPeopleResults(people);
        } else if (activeTab === 'posts') {
          const posts = await searchPosts(trimmed, 20);
          if (requestIdRef.current !== currentRequestId) return;
          setPostResults(posts);
        } else if (activeTab === 'rooms') {
          const rooms = await searchRooms(trimmed, 20);
          if (requestIdRef.current !== currentRequestId) return;
          setRoomResults(rooms);
        } else if (activeTab === 'tools') {
          const tools = await searchTools(trimmed, 20);
          if (requestIdRef.current !== currentRequestId) return;
          setToolResults(tools);
        }

        if (requestIdRef.current === currentRequestId) {
          setSearching(false);
        }
      } catch (e: any) {
        if (requestIdRef.current !== currentRequestId) return;
        console.error('[search] Search error (submit)', e);
        setError('Something went wrong while searching.');
        setSearching(false);
      }
    })();
  }, [query, activeTab]);

  const handleRefresh = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    // Re-run the current tab search; rely on existing handlers
    handleSubmitSearch();
    // Allow a brief spinner; results update asynchronously via state
    setTimeout(() => setRefreshing(false), 800);
  }, [query, handleSubmitSearch]);

  // Use new SearchResultRow for Recent rows (people, rooms, posts, etc.)
  const renderRecentRow = (item: any, isLast: boolean) => {
    if (item.type === 'person') {
      const profile = recentProfiles[item.id];
      const title = profile?.display_name || profile?.username || item.title || 'Crew member';
      const subtitle = profile?.username ? `@${profile.username}` : item.subtitle || null;
      const avatarUrl = profile?.avatar_url || null;
      return (
        <SearchResultRowExplicit
          title={title}
          subtitle={subtitle || 'Crew member'}
          avatarUrl={avatarUrl ?? undefined}
          onPress={() => handlePressResult({ ...item, title })}
        />
      );
    }
    return <SearchResultRowDefault item={item} onPress={handlePressResult} />;
  };

  // Custom Recent section header
  const renderRecentHeader = () => (
    <View style={recentStyles.headerRow}>
      <Text style={recentStyles.headerTitle}>Recent</Text>
      <Pressable style={recentStyles.seeAllBtn}>
        <Text style={recentStyles.seeAllText}>See all</Text>
      </Pressable>
    </View>
  );

  // Main renderItem for SectionList
  const renderItem = ({ item, index, section }: { item: any; index: number; section: any }) => {
    if (section.key === 'recent' && item.kind === 'result') {
      return renderRecentRow(item.item, index === section.data.length - 1);
    }
    if (item.kind === 'message') {
      return (
        <View style={recentStyles.emptyRow}>
          <Text style={recentStyles.emptyText}>{item.text}</Text>
        </View>
      );
    }
    return null;
  };
  // For People tab: use SearchResultRow for each person result
  const renderPeopleRow = (item: SearchResultItem) => (
    <SearchResultRowDefault item={item} onPress={handlePressResult} />
  );


  // Main renderSectionHeader for SectionList
  const renderSectionHeader = ({ section }: { section: any }) => {
    if (section.key === 'recent') return renderRecentHeader();
    return (
      <View style={{
        backgroundColor: 'transparent',
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{section.title}</Text>
        {section.seeAll && (
          <Pressable onPress={section.onSeeAll} hitSlop={8}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#B91C1C' }}>See all</Text>
          </Pressable>
        )}
      </View>
    );
  };

  const listEmptyComponent = () => {
    const trimmed = query.trim();
    if (searching) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="small" color="#B5161E" />
          <Text style={styles.emptyText}>Searching…</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      );
    }
    if (!trimmed && activeTab === 'all') {
      // For the empty All tab, we still show suggestion sections via sections[]
      // so ListEmptyComponent can be null here.
      return null;
    }
    return null;
  };

  const debugLastPeopleError = getLastSearchPeopleError();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.safe}>
        <View style={styles.headerBar}>
          <Pressable
            onPress={handleBack}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
          >
            <Ionicons name="chevron-back" size={24} color={colors.cardBg} />
          </Pressable>
          <Text
            style={styles.headerTitle}
            numberOfLines={1}
            ellipsizeMode="tail"
            {...(Platform.OS === 'ios'
              ? { adjustsFontSizeToMinimumFontScale: true, minimumFontScale: 0.82 }
              : {})}
          >
            Search
          </Text>
          <Pressable
            onPress={handleFilterPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
          >
            <Ionicons name="options-outline" size={22} color={colors.cardBg} />
          </Pressable>
        </View>
        {/* Search bar + tabs pinned under header, not inside FlatList */}
        <View style={styles.searchHeaderArea}>
          <View style={styles.searchBarRow}>
            <Ionicons name="search-outline" size={20} color="#9CA3AF" style={{ marginRight: 8 }} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search Flight Club…"
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              blurOnSubmit={true}
              onSubmitEditing={handleSubmitSearch}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </Pressable>
            )}
          </View>
          <View style={styles.tabsRow}>
            {(['all', 'people', 'posts', 'rooms', 'tools'] as SearchTabKey[]).map((tabKey) => {
              const label =
                tabKey === 'all'
                  ? 'All'
                  : tabKey === 'people'
                  ? 'People'
                  : tabKey === 'posts'
                  ? 'Posts'
                  : tabKey === 'rooms'
                  ? 'Rooms'
                  : 'Tools';
              const active = activeTab === tabKey;
              return (
                <Pressable
                  key={tabKey}
                  onPress={() => {
                    setActiveTab(tabKey);
                    Keyboard.dismiss();
                  }}
                  style={[styles.tabPill, active && styles.tabPillActive]}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={[styles.tabPillLabel, active && styles.tabPillLabelActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {searching && query.trim().length > 0 && (
            <View style={styles.searchingRow}>
              <ActivityIndicator
                size="small"
                color="#B5161E"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.searchingText}>Searching…</Text>
            </View>
          )}
          {error && query.trim().length > 0 && !searching && (
            <View style={styles.searchingRow}>
              <Text style={styles.searchingText}>{error}</Text>
            </View>
          )}
        </View>
        <View style={styles.contentWrap}>
          {activeTab === 'people' ? (
            peopleResults.length === 0 && !searching && !error ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No people found.</Text>
              </View>
            ) : (
              <ScrollView
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                }
              >
                {peopleResults.map((item) => (
                  <SearchResultRowExplicit
                    key={item.id}
                    title={item.title}
                    subtitle={item.subtitle || (item.type === 'person' ? 'Crew member' : '')}
                    avatarUrl={item.avatarUrl ?? undefined}
                    onPress={() => handlePressResult(item)}
                  />
                ))}
              </ScrollView>
            )
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item, index) => {
                if (item.kind === 'message') return `${item.id}-${index}`;
                if (item.kind === 'result') return `${item.item.type}-${item.item.id}-${index}`;
                return `${index}`;
              }}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 24 }}
              ListEmptyComponent={listEmptyComponent}
              stickySectionHeadersEnabled={false}
              style={{ flex: 1 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
              }
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.headerRed,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.headerRed,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 8,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: colors.cardBg,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  contentWrap: {
    flex: 1,
    backgroundColor: colors.screenBg || '#F8FAFC',
  },
  searchHeaderArea: {
    backgroundColor: colors.screenBg || '#F8FAFC',
    paddingTop: 10,
    paddingBottom: 4,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  searchingText: {
    fontSize: 13,
    color: '#64748B',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tabPill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    marginRight: 8,
  },
  tabPillActive: {
    backgroundColor: '#B5161E',
  },
  tabPillPressed: {
    opacity: 0.8,
  },
  tabPillLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  tabPillLabelActive: {
    color: '#FFFFFF',
  },
  emptyContainer: {
    paddingTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748B',
  },
  messageRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  messageRowText: {
    fontSize: 13,
    color: '#6B7280',
  },
  sectionHeaderRowList: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 4,
    backgroundColor: colors.screenBg || '#F8FAFC',
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
});
