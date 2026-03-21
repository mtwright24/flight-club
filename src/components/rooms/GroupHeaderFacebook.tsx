import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../styles/theme';
import ActionSheet from '../common/ActionSheet';

interface GroupHeaderFacebookProps {
  roomId: string;
  name: string;
  memberCount: number;
  isPrivate: boolean;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  isMember: boolean;
  isOwnerOrAdmin: boolean;
  onAvatarPress?: () => void;
  onCoverPress?: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onInvite: () => void;
  disabled?: boolean;
}

export default function GroupHeaderFacebook({
  roomId,
  name,
  memberCount,
  isPrivate,
  avatarUrl,
  coverUrl,
  isMember,
  isOwnerOrAdmin,
  onAvatarPress,
  onCoverPress,
  onJoin,
  onLeave,
  onInvite,
}: GroupHeaderFacebookProps) {
  const [joinedMenuVisible, setJoinedMenuVisible] = useState(false);

  // Generate avatar placeholder from initials
  const getInitials = () => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Placeholder gradient for cover
  const coverBg = coverUrl
    ? { uri: coverUrl }
    : { colors: [colors.headerRed + '60', colors.headerRed + '20'], start: [0, 0], end: [1, 1] };

  return (
    <View style={styles.headerContainer}>
      {/* Cover Photo */}
      <Pressable
        onPress={() => {
          if (isOwnerOrAdmin) {
            onCoverPress?.();
          } else {
            Alert.alert('Info', 'Only admins can edit the cover photo');
          }
        }}
        style={styles.coverWrapper}
      >
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.cover} resizeMode="cover" />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]} />
        )}
      </Pressable>

      {/* Avatar Section - Overlaps cover */}
      <View style={styles.avatarSection}>
        <Pressable
          onPress={() => {
            if (isOwnerOrAdmin) {
              onAvatarPress?.();
            } else {
              Alert.alert('Info', 'Only admins can edit the group photo');
            }
          }}
          style={styles.avatarWrapper}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{getInitials()}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Title Section - Below header */}
      <View style={styles.titleSection}>
        <Text style={styles.title}>{name}</Text>
        <Text style={styles.subline}>
          {isPrivate ? 'Private' : 'Public'} • {memberCount} members
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonsContainer}>
        {isMember ? (
          <Pressable
            style={styles.joinedButton}
            onPress={() => setJoinedMenuVisible(true)}
          >
            <Text style={styles.joinedButtonText}>Joined</Text>
            <Ionicons name="chevron-down" size={14} color={colors.headerRed} />
          </Pressable>
        ) : (
          <Pressable style={styles.joinButton} onPress={onJoin}>
            <Text style={styles.joinButtonText}>Join</Text>
          </Pressable>
        )}

        <Pressable style={styles.inviteButton} onPress={onInvite}>
          <Ionicons name="share-social" size={16} color={colors.cardBg} />
          <Text style={styles.inviteButtonText}>Invite</Text>
        </Pressable>
      </View>

      {/* Joined Menu */}
      <ActionSheet
        visible={joinedMenuVisible}
        options={[
          {
            label: 'Leave group',
            icon: 'exit-outline',
            destructive: true,
            onPress: onLeave,
          },
        ]}
        onClose={() => setJoinedMenuVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  // Cover
  coverWrapper: {
    position: 'relative',
    height: 150,
    width: '100%',
  },
  cover: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.border,
  },
  coverPlaceholder: {
    backgroundColor: colors.border,
  },
  coverGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.headerRed + '40',
  },
  coverEditBadge: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.headerRed,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.cardShadow,
  },

  // Avatar Section - Overlaps cover
  avatarSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    marginTop: -48, // Overlap larger avatar on cover
    zIndex: 10,
  },

  // Title Section - Below header
  titleSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },

  // Avatar
  avatarWrapper: {
    position: 'relative',
    zIndex: 10,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    borderColor: colors.cardBg,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    borderColor: colors.cardBg,
    backgroundColor: colors.headerRed + '40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.headerRed,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.headerRed,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.cardBg,
    ...shadow.cardShadow,
  },

  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subline: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },



  // Buttons
  buttonsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  joinButton: {
    flex: 1,
    height: 38,
    backgroundColor: colors.headerRed,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  joinButtonText: {
    color: colors.cardBg,
    fontWeight: '700',
    fontSize: 14,
  },
  joinedButton: {
    flex: 1,
    height: 38,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  joinedButtonText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  inviteButton: {
    height: 38,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.headerRed,
    borderRadius: radius.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  inviteButtonText: {
    color: colors.cardBg,
    fontWeight: '700',
    fontSize: 14,
  },
});
