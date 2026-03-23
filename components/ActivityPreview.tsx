import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface NotificationItem {
  id: string;
  created_at: string;
  actor_id: string;
  type: string;
  entity_type: string;
  entity_id: string;
  secondary_id?: string;
  is_read: boolean;
  data?: any;
  actor_avatar_url?: string;
  summary: string;
  /** Relative time for display (same engine as Home trending cards). */
  timeLabel?: string;
}

interface ActivityPreviewProps {
  items: NotificationItem[];
  unreadCount: number;
  onPressItem: (notification: NotificationItem) => void;
  onPressViewAll: () => void;
  loading: boolean;
  error?: string | null;
  /** Hide duplicate header/footer when nested under another Activity section (e.g. tab Home). */
  embedded?: boolean;
  /** When embedded and the list is empty, friendlier copy than a generic error. */
  embeddedEmptyTitle?: string;
  embeddedEmptySubtitle?: string;
}

const ActivityPreview: React.FC<ActivityPreviewProps> = ({
  items,
  unreadCount,
  onPressItem,
  onPressViewAll,
  loading,
  error,
  embedded = false,
  embeddedEmptyTitle,
  embeddedEmptySubtitle,
}) => {
  const emptyTitle = embeddedEmptyTitle ?? 'No recent activity';
  const emptySubtitle =
    embeddedEmptySubtitle ?? 'Open notifications for your full history and settings.';
  return (
    <View style={[styles.container, embedded && styles.containerEmbedded]}>
      {!embedded ? (
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>ACTIVITY</Text>
          <Pressable onPress={onPressViewAll} style={styles.viewAllBtn} hitSlop={8}>
            <Text style={styles.viewAllText}>View All {'>'}</Text>
          </Pressable>
        </View>
      ) : null}
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#B5161E" />
        </View>
      ) : error ? (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>{error}</Text>
          {embedded ? (
            <Pressable onPress={onPressViewAll} style={styles.embeddedEmptyCta} hitSlop={8}>
              <Text style={styles.embeddedEmptyCtaText}>Open notifications</Text>
            </Pressable>
          ) : null}
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>{embedded ? emptyTitle : 'No activity yet'}</Text>
          {embedded ? <Text style={styles.emptySubtext}>{emptySubtitle}</Text> : null}
          {embedded ? (
            <Pressable onPress={onPressViewAll} style={styles.embeddedEmptyCta} hitSlop={8}>
              <Text style={styles.embeddedEmptyCtaText}>View all</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => onPressItem(item)}
            >
              <View style={styles.avatarWrap}>
                {item.actor_avatar_url ? (
                  <View style={styles.avatarOuter}>
                    <View style={styles.avatarInner}>
                      <Ionicons name="person-circle" size={32} color="#BDBDBD" />
                    </View>
                  </View>
                ) : (
                  <Ionicons name="person-circle" size={32} color="#BDBDBD" />
                )}
                {/* Optionally overlay icon by type */}
              </View>
              <View style={styles.textCol}>
                <Text style={styles.summary} numberOfLines={2}>{item.summary}</Text>
              </View>
              <View style={styles.rightCol}>
                <Text style={styles.timeAgo}>{item.timeLabel ?? item.created_at}</Text>
                {!item.is_read && <View style={styles.unreadDot} />}
              </View>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          scrollEnabled={false}
        />
      )}
      {!embedded && unreadCount > 0 && !loading && (
        <View style={styles.seeAllRow}>
          <Pressable onPress={onPressViewAll} style={styles.seeAllBtn} hitSlop={8}>
            <Text style={styles.seeAllText}>See all ({unreadCount})</Text>
          </Pressable>
        </View>
      )}
      {!embedded && unreadCount === 0 && items.length > 0 && !loading && (
        <View style={styles.caughtUpRow}>
          <Text style={styles.caughtUpText}>You’re all caught up</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    paddingBottom: 4,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  containerEmbedded: {
    marginHorizontal: 0,
    marginTop: 0,
    borderRadius: 14,
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: 0.2,
  },
  viewAllBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  viewAllText: {
    fontSize: 14,
    color: '#2563EB',
    fontWeight: '500',
  },
  loadingRow: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFF',
  },
  rowPressed: {
    backgroundColor: '#F3F4F6',
  },
  avatarWrap: {
    marginRight: 12,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOuter: {
    borderRadius: 18,
    overflow: 'hidden',
    width: 36,
    height: 36,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
  },
  summary: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  rightCol: {
    alignItems: 'flex-end',
    minWidth: 48,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  timeAgo: {
    fontSize: 12,
    color: '#6B7280',
    marginRight: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB',
    alignSelf: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F1F1',
    marginLeft: 64,
  },
  seeAllRow: {
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  seeAllBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  seeAllText: {
    fontSize: 14,
    color: '#2563EB',
    fontWeight: '500',
  },
  caughtUpRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  caughtUpText: {
    fontSize: 13,
    color: '#6B7280',
  },
  emptyRow: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  embeddedEmptyCta: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(181, 22, 30, 0.08)',
  },
  embeddedEmptyCtaText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B5161E',
  },
});

export default ActivityPreview;
