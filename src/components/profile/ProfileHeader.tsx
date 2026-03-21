import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../styles/theme';

interface ProfileHeaderProps {
  displayName: string;
  subtitle: string;
  avatarUrl: string;
  isSelf: boolean;
  onAvatarPress?: () => void;
  onEditPress?: () => void;
  onFollowPress?: () => void;
  onConnectPress?: () => void;
  onMessagePress?: () => void;
  isFollowing?: boolean;
  isConnected?: boolean;
}

export default function ProfileHeader({
  displayName,
  subtitle,
  avatarUrl,
  isSelf,
  onAvatarPress,
  onEditPress,
  onFollowPress,
  onConnectPress,
  onMessagePress,
  isFollowing,
  isConnected,
}: ProfileHeaderProps) {
  return (
    <View style={styles.headerWrap}>
      <Pressable onPress={onAvatarPress} style={styles.avatarWrap}>
        <Image source={{ uri: avatarUrl }} style={styles.avatar} resizeMode="cover" />
      </Pressable>
      <View style={styles.infoBlock}>
        <Text style={styles.displayName}>{displayName}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.actionsRow}>
          {isSelf ? (
            <Pressable style={styles.actionPill} onPress={onMessagePress ?? (() => {})}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.actionText}>Messages</Text>
            </Pressable>
          ) : (
            <>
              <Pressable style={styles.actionPill} onPress={onFollowPress}>
                <Ionicons name={isFollowing ? 'checkmark-circle' : 'person-add-outline'} size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.actionText}>{isFollowing ? 'Following' : 'Follow'}</Text>
              </Pressable>
              <Pressable style={styles.actionPill} onPress={onConnectPress}>
                <Ionicons name={isConnected ? 'link' : 'link-outline'} size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.actionText}>{isConnected ? 'Connected' : 'Connect'}</Text>
              </Pressable>
              <Pressable style={styles.actionPill} onPress={onMessagePress ?? (() => {})}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.actionText}>Message</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.cardBg, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatarWrap: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden', marginRight: spacing.lg, ...shadow.cardShadow },
  avatar: { width: '100%', height: '100%', borderRadius: 48 },
  infoBlock: { flex: 1 },
  displayName: { fontSize: 22, fontWeight: '900', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 2, marginBottom: 8 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 8 },
  actionPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accentBlue, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 16, marginRight: 8 },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
