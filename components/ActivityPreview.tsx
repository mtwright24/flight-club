import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  homeActivityBucket,
  isNotificationUnreadRow,
  type HomeActivityBucket,
} from '../lib/activityHomeBuckets';

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
  /** From enrichment / profiles — used to replace generic "Someone" copy on Home Activity. */
  actor_display_name?: string;
  summary: string;
  /** Relative time for display (same engine as Home trending cards). */
  timeLabel?: string;
}

const BUCKET_TILES: {
  key: HomeActivityBucket;
  shortTitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
}[] = [
  { key: 'social', shortTitle: 'Social', icon: 'chatbubble-ellipses', iconColor: '#2563EB' },
  { key: 'trades', shortTitle: 'Swaps', icon: 'checkmark-circle', iconColor: '#16A34A' },
  { key: 'housing', shortTitle: 'Housing', icon: 'key', iconColor: '#CA8A04' },
  { key: 'crew', shortTitle: 'Crew rooms', icon: 'chatbubbles', iconColor: '#B5161E' },
];

interface ActivityPreviewProps {
  items: NotificationItem[];
  unreadCount: number;
  onPressItem: (notification: NotificationItem) => void;
  onPressViewAll: () => void;
  loading: boolean;
  error?: string | null;
  /** List rows (default) or 2×2 sectioned tiles like the Home activity mockup. */
  variant?: 'list' | 'sectioned';
  /** Hide duplicate header/footer when nested under another Activity section (e.g. tab Home). */
  embedded?: boolean;
  /** When embedded and the list is empty, friendlier copy than a generic error. */
  embeddedEmptyTitle?: string;
  embeddedEmptySubtitle?: string;
}

function buildBucketModel(items: NotificationItem[]) {
  const sorted = [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const per: Record<HomeActivityBucket, NotificationItem[]> = {
    social: [],
    trades: [],
    housing: [],
    crew: [],
  };
  for (const it of sorted) {
    per[homeActivityBucket(it.type)].push(it);
  }
  return BUCKET_TILES.map(({ key }) => {
    const list = per[key];
    const latest = list[0];
    const unreadInBucket = list.filter(isNotificationUnreadRow).length;
    return { key, latest, unreadInBucket };
  });
}

const ActivityPreview: React.FC<ActivityPreviewProps> = ({
  items,
  unreadCount,
  onPressItem,
  onPressViewAll,
  loading,
  error,
  variant = 'list',
  embedded = false,
  embeddedEmptyTitle,
  embeddedEmptySubtitle,
}) => {
  const emptyTitle = embeddedEmptyTitle ?? 'No recent activity';
  const emptySubtitle =
    embeddedEmptySubtitle ?? 'Open notifications for your full history and settings.';

  const bucketModel = useMemo(() => buildBucketModel(items), [items]);

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
      ) : variant === 'sectioned' ? (
        <View style={styles.sectionedGrid}>
          {bucketModel.map((cell) => {
            const { key, latest, unreadInBucket } = cell;
            const meta = BUCKET_TILES.find((b) => b.key === key)!;
            const hasUnread = latest && isNotificationUnreadRow(latest);
            return (
              <Pressable
                key={key}
                style={({ pressed }) => [
                  styles.sectionTile,
                  hasUnread && styles.sectionTileUnread,
                  pressed && styles.sectionTilePressed,
                ]}
                onPress={() => (latest ? onPressItem(latest) : onPressViewAll())}
                accessibilityRole="button"
                accessibilityLabel={`${meta.shortTitle} activity`}
              >
                <View style={styles.sectionTileTop}>
                  <View style={styles.sectionTileIconRow}>
                    <View style={styles.sectionTileIconPad}>
                      <Ionicons name={meta.icon} size={20} color={meta.iconColor} />
                    </View>
                    <Text style={styles.sectionTileLabel}>{meta.shortTitle}</Text>
                  </View>
                  {unreadInBucket > 0 ? (
                    <View style={styles.sectionTileBadge}>
                      <Text style={styles.sectionTileBadgeText}>+{unreadInBucket}</Text>
                    </View>
                  ) : null}
                </View>
                {latest ? (
                  <Text style={styles.sectionTileSummary} numberOfLines={2}>
                    {latest.summary}
                  </Text>
                ) : (
                  <Text style={styles.sectionTilePlaceholder} numberOfLines={2}>
                    No recent updates
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View>
          {items.map((item, index) => (
            <View key={item.id}>
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => onPressItem(item)}
              >
                <View style={styles.avatarWrap}>
                  {item.actor_avatar_url ? (
                    <Image source={{ uri: item.actor_avatar_url }} style={styles.avatarImg} />
                  ) : (
                    <Ionicons name="person-circle" size={32} color="#BDBDBD" />
                  )}
                </View>
                <View style={styles.textCol}>
                  <Text style={styles.summary} numberOfLines={2}>
                    {item.summary}
                  </Text>
                </View>
                <View style={styles.rightCol}>
                  <Text style={styles.timeAgo}>{item.timeLabel ?? item.created_at}</Text>
                  {!item.is_read && <View style={styles.unreadDot} />}
                </View>
              </Pressable>
              {index < items.length - 1 ? <View style={styles.divider} /> : null}
            </View>
          ))}
        </View>
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
    backgroundColor: '#F3F4F6',
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
  avatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5E7EB',
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
  sectionedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 10,
    justifyContent: 'space-between',
  },
  sectionTile: {
    width: '48%',
    marginBottom: 8,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    minHeight: 108,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    position: 'relative',
  },
  sectionTileUnread: {
    backgroundColor: '#FFF6F6',
    borderColor: 'rgba(181, 22, 30, 0.12)',
  },
  sectionTilePressed: {
    opacity: 0.92,
  },
  sectionTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTileIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  sectionTileIconPad: {
    marginRight: 6,
  },
  sectionTileLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  sectionTileBadge: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 4,
  },
  sectionTileBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  sectionTileSummary: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 18,
  },
  sectionTilePlaceholder: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
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
