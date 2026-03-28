import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Notification } from '../../lib/notifications';
import {
  formatNotificationTimeShort,
  getActorAvatarUri,
  getNotificationDisplayLines,
  getNotificationRowPrimary,
  getNotificationThumbnailUri,
  notificationAvatarBadge,
  notificationIsRead,
  notificationRowVisualKind,
  shouldOfferFollowBack,
} from '../../lib/notificationInboxUi';
import { colors, radius, spacing } from '../../src/styles/theme';

type Props = {
  item: Notification;
  followingIds: Set<string>;
  onOpen: (n: Notification) => void;
  onFollowBack: (n: Notification) => Promise<void>;
  followBackLoadingId: string | null;
};

const AVATAR = 40;

export default function NotificationRow({
  item,
  followingIds,
  onOpen,
  onFollowBack,
  followBackLoadingId,
}: Props) {
  const read = notificationIsRead(item);
  const primaryParts = getNotificationRowPrimary(item);
  const { secondary } = getNotificationDisplayLines(item);
  const time = formatNotificationTimeShort(item.created_at);
  const thumbUri = getNotificationThumbnailUri(item);
  const visual = notificationRowVisualKind(item);
  const badge = notificationAvatarBadge(item);
  const actorId = item.actor_id || '';
  const followEligible =
    shouldOfferFollowBack(item) && actorId && !followingIds.has(actorId);
  const followBusy = followBackLoadingId === actorId;
  const showFollowControl = followEligible || followBusy;

  const avatarUri = getActorAvatarUri(item);
  const showThumb = !!thumbUri;
  const showPreviewCard = !!(secondary && showThumb);

  const fallbackIcon = (() => {
    switch (visual) {
      case 'housing':
        return 'home-outline' as const;
      case 'trade':
        return 'swap-horizontal' as const;
      case 'tools':
        return 'construct-outline' as const;
      case 'system':
        return 'megaphone-outline' as const;
      default:
        return 'person-outline' as const;
    }
  })();

  const leading = (
    <View style={styles.avatarWrap}>
      {avatarUri ? (
        <Image source={{ uri: avatarUri }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Ionicons name={fallbackIcon} size={18} color={colors.textSecondary} />
        </View>
      )}
      {badge === 'crew' ? (
        <View style={[styles.badge, styles.badgeCrew]}>
          <Ionicons name="people" size={9} color="#fff" />
        </View>
      ) : null}
      {badge === 'housing' ? (
        <View style={[styles.badge, styles.badgeHousing]}>
          <Ionicons name="home" size={9} color={colors.headerRed} />
        </View>
      ) : null}
    </View>
  );

  const primaryText =
    primaryParts.mode === 'split' ? (
      <Text style={styles.primaryWrap} numberOfLines={2}>
        <Text style={[styles.primaryName, !read && styles.primaryNameUnread]}>{primaryParts.name}</Text>
        <Text style={[styles.primaryRest, !read && styles.primaryRestUnread]}>{primaryParts.rest}</Text>
      </Text>
    ) : (
      <Text style={[styles.primaryPlain, !read && styles.primaryPlainUnread]} numberOfLines={2}>
        {primaryParts.text}
      </Text>
    );

  return (
    <View style={[styles.row, !read && styles.rowUnread]}>
      <Pressable
        onPress={() => onOpen(item)}
        style={({ pressed }) => [styles.pressableHit, pressed && styles.rowPressed]}
      >
        {/*
          Inner row View is required: `Pressable` often ignores flexDirection:row on some
          platforms, which stacks avatar above text. Layout lives on the child View.
        */}
        <View style={styles.rowInner}>
          {leading}
          <View style={styles.main}>
            <View style={styles.topLine}>
              <View style={styles.primaryBlock}>{primaryText}</View>
              <View style={styles.timeCol}>
                <Text style={styles.time}>{time}</Text>
                {!read ? <View style={styles.unreadDot} /> : <View style={styles.dotSpacer} />}
              </View>
            </View>
            {secondary ? (
              showPreviewCard ? (
                <View style={styles.previewCard}>
                  <Text style={styles.previewText} numberOfLines={2}>
                    {secondary}
                  </Text>
                  <Image source={{ uri: thumbUri! }} style={styles.previewThumb} />
                </View>
              ) : (
                <Text style={styles.secondary} numberOfLines={2}>
                  {secondary}
                </Text>
              )
            ) : null}
            {!showPreviewCard && showThumb ? (
              <Image source={{ uri: thumbUri! }} style={styles.thumbInline} />
            ) : null}
          </View>
        </View>
      </Pressable>
      {showFollowControl ? (
        <View style={styles.followRow}>
          <Pressable
            onPress={() => {
              void onFollowBack(item);
            }}
            disabled={followBusy}
            style={({ pressed: p }) => [
              styles.followBtn,
              p && { opacity: 0.88 },
              followBusy && { opacity: 0.65 },
            ]}
          >
            {followBusy ? (
              <ActivityIndicator color={colors.accentBlue} size="small" />
            ) : (
              <Text style={styles.followBtnText}>Follow back</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    backgroundColor: colors.cardBg,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  rowUnread: {
    backgroundColor: 'rgba(181, 22, 30, 0.045)',
  },
  pressableHit: {
    width: '100%',
  },
  /** Real horizontal layout — do not rely on Pressable for flex row. */
  rowInner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  rowPressed: {
    opacity: 0.9,
  },
  avatarWrap: {
    marginRight: 12,
    position: 'relative',
    flexShrink: 0,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: '#ECEFF3',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCrew: {
    backgroundColor: colors.accentBlue,
  },
  badgeHousing: {
    backgroundColor: '#DCFCE7',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  primaryBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  primaryWrap: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  /** Slightly smaller than action line so it doesn’t compete with row titles / section headers. */
  primaryName: {
    fontWeight: '700',
    color: colors.textPrimary,
    fontSize: 12.5,
  },
  primaryNameUnread: {
    fontWeight: '800',
  },
  primaryRest: {
    fontWeight: '400',
    color: colors.textPrimary,
    fontSize: 13,
  },
  primaryRestUnread: {
    fontWeight: '500',
  },
  primaryPlain: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  primaryPlainUnread: {
    fontWeight: '700',
  },
  secondary: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  previewCard: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#F4F5F7',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  previewThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: colors.border,
  },
  previewText: {
    flex: 1,
    marginRight: 8,
    fontSize: 13,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  thumbInline: {
    marginTop: 6,
    width: 44,
    height: 44,
    borderRadius: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.border,
  },
  timeCol: {
    alignItems: 'flex-end',
    width: 44,
    flexShrink: 0,
  },
  time: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.headerRed,
    marginTop: 4,
  },
  dotSpacer: {
    height: 7,
    marginTop: 4,
  },
  followRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingLeft: AVATAR + 12,
  },
  followBtn: {
    backgroundColor: '#E8F1FE',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(37, 99, 235, 0.25)',
  },
  followBtnText: {
    color: colors.accentBlue,
    fontWeight: '700',
    fontSize: 12,
  },
});
