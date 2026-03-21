import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing } from '../../styles/theme';

export interface ProfileStats {
  followers: number;
  following: number;
  posts: number;
}

interface ProfileStatsRowProps {
  stats: ProfileStats;
  onFollowersPress?: () => void;
  onFollowingPress?: () => void;
  onPostsPress?: () => void;
}

const ProfileStatsRow: React.FC<ProfileStatsRowProps> = ({ stats, onFollowersPress, onFollowingPress, onPostsPress }) => {
  return (
    <View style={styles.row}>
      <Pressable style={styles.statBlock} onPress={onFollowersPress}>
        <Text style={styles.statValue}>{stats.followers}</Text>
        <Text style={styles.statLabel}>Followers</Text>
      </Pressable>
      <Pressable style={styles.statBlock} onPress={onFollowingPress}>
        <Text style={styles.statValue}>{stats.following}</Text>
        <Text style={styles.statLabel}>Following</Text>
      </Pressable>
      <Pressable style={styles.statBlock} onPress={onPostsPress}>
        <Text style={styles.statValue}>{stats.posts}</Text>
        <Text style={styles.statLabel}>Posts</Text>
      </Pressable>
    </View>
  );
};

export default ProfileStatsRow;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.sm },
  statBlock: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 18, fontWeight: '900', color: colors.textPrimary },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
