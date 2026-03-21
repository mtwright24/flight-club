import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SearchResultItem, RecentSearchItem } from '../lib/search';

export type SearchEmptyStateProps = {
  recents: RecentSearchItem[];
  suggestedRooms: SearchResultItem[];
  suggestedPeople: SearchResultItem[];
  trendingPosts: SearchResultItem[];
  popularTools: SearchResultItem[];
  onPressItem: (item: SearchResultItem) => void;
  onPressRecent: (recent: RecentSearchItem) => void;
  isAllTab: boolean;
};

export default function SearchEmptyState({
  recents,
  suggestedRooms,
  suggestedPeople,
  trendingPosts,
  popularTools,
  onPressItem,
  onPressRecent,
  isAllTab,
}: SearchEmptyStateProps) {
  const renderRecentRow = (item: RecentSearchItem, index: number, lastIndex: number) => (
    <Pressable
      key={`${item.type}:${item.id}`}
      onPress={() => onPressRecent(item)}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
        index === lastIndex && styles.rowLast,
      ]}
    >
      <View style={styles.rowIconBubble}>
        <Ionicons name="time-outline" size={18} color="#B5161E" />
      </View>
      <View style={styles.rowTextCol}>
        <Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
    </Pressable>
  );

  const renderHorizontalRooms = () => {
    if (!suggestedRooms.length) return null;
    const list = suggestedRooms.slice(0, 3);
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Suggested Rooms</Text>
        </View>
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPressItem(item)}
              style={({ pressed }) => [styles.roomCard, pressed && styles.roomCardPressed]}
            >
              <Text numberOfLines={1} style={styles.roomName}>{item.title}</Text>
              {item.subtitle ? (
                <Text numberOfLines={1} style={styles.roomMeta}>{item.subtitle}</Text>
              ) : null}
              {item.isLive ? (
                <View style={styles.livePill}>
                  <Text style={styles.livePillText}>LIVE</Text>
                </View>
              ) : null}
            </Pressable>
          )}
        />
      </View>
    );
  };

  const renderPeopleList = () => {
    if (!suggestedPeople.length) return null;
    const list = suggestedPeople.slice(0, 3);
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Suggested People</Text>
        {list.map((item, index) => (
          <Pressable
            key={item.id}
            onPress={() => onPressItem(item)}
            style={({ pressed }) => [
              styles.personRow,
              pressed && styles.personRowPressed,
              index === list.length - 1 && styles.rowLast,
            ]}
          >
            <Ionicons name="person-circle-outline" size={24} color="#0F172A" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.personName}>{item.title}</Text>
              {item.subtitle ? (
                <Text numberOfLines={1} style={styles.personMeta}>{item.subtitle}</Text>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>
    );
  };

  const renderTrendingPosts = () => {
    if (!trendingPosts.length) return null;
    const list = trendingPosts.slice(0, 2);
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trending Posts</Text>
        {list.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onPressItem(item)}
            style={({ pressed }) => [styles.postRow, pressed && styles.postRowPressed]}
          >
            <View style={styles.postIconBubble}>
              <Ionicons name="chatbox-ellipses-outline" size={18} color="#B5161E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={styles.postTitle}>{item.title}</Text>
              {item.meta ? (
                <Text numberOfLines={1} style={styles.postMeta}>{item.meta}</Text>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>
    );
  };

  const renderPopularTools = () => {
    if (!popularTools.length) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Popular Tools</Text>
        <View>
          {popularTools.map((item, index) => (
            <Pressable
              key={item.id}
              onPress={() => onPressItem(item)}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
                index === popularTools.length - 1 && styles.rowLast,
              ]}
            >
              <View style={styles.rowIconBubble}>
                <Ionicons
                  name={(item.iconName as any) || 'apps-outline'}
                  size={18}
                  color="#B5161E"
                />
              </View>
              <View style={styles.rowTextCol}>
                <Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text>
                {item.subtitle ? (
                  <Text numberOfLines={1} style={styles.rowSubtitle}>{item.subtitle}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent</Text>
        {recents.length > 0 ? (
          <View>
            {recents.map((item, index) =>
              renderRecentRow(item, index, recents.length - 1)
            )}
          </View>
        ) : (
          <Text style={styles.emptyHelperText}>No recent searches</Text>
        )}
      </View>

      {isAllTab && renderPeopleList()}
      {isAllTab && renderHorizontalRooms()}
      {isAllTab && renderTrendingPosts()}
      {renderPopularTools()}

      {recents.length === 0 &&
        !suggestedRooms.length &&
        !suggestedPeople.length &&
        !trendingPosts.length &&
        !popularTools.length && (
          <View style={styles.fallbackEmpty}>
            <Ionicons name="search-outline" size={40} color="#CBD5E1" />
            <Text style={styles.fallbackTitle}>Search Flight Club</Text>
            <Text style={styles.fallbackSubtitle}>
              Find crew, rooms, posts, tools, and more.
            </Text>
          </View>
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 0,
    marginBottom: 4,
  },
  sectionTitle: {
    paddingHorizontal: 0,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  recentsRow: {
    paddingHorizontal: 0,
  },
  roomCard: {
    width: 180,
    marginRight: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  roomCardPressed: {
    backgroundColor: '#F8FAFC',
  },
  roomName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  roomMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748B',
  },
  livePill: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#DC2626',
  },
  livePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  personRowPressed: {
    backgroundColor: '#F8FAFC',
  },
  personName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  personMeta: {
    fontSize: 12,
    color: '#64748B',
  },
  postRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: 10,
  },
  postRowPressed: {
    backgroundColor: '#F8FAFC',
  },
  postIconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: '#FEF2F2',
  },
  postTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  postMeta: {
    marginTop: 3,
    fontSize: 12,
    color: '#64748B',
  },
  toolsGrid: {
    paddingHorizontal: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowPressed: {
    backgroundColor: '#F8FAFC',
  },
  rowIconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: '#F1F5F9',
  },
  rowTextCol: {
    flex: 1,
    marginRight: 8,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748B',
  },
  fallbackEmpty: {
    alignItems: 'center',
    paddingTop: 40,
  },
  fallbackTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  fallbackSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#64748B',
  },
  emptyHelperText: {
    paddingHorizontal: 0,
    fontSize: 13,
    color: '#64748B',
  },
});
