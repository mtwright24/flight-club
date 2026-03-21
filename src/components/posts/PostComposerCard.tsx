import React from 'react';
import { View, Image, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../styles/theme';

interface PostComposerCardProps {
  avatarUrl: string;
  onComposerPress: () => void;
  onPhotoPress: () => void;
}

export default function PostComposerCard({
  avatarUrl,
  onComposerPress,
  onPhotoPress,
}: PostComposerCardProps) {
  return (
    <>
      {/* Main Composer Card */}
      <View style={styles.composerCard}>
        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        <Pressable
          style={styles.inputContainer}
          onPress={onComposerPress}
          accessibilityRole="button"
        >
          <Text style={styles.inputPlaceholder}>Write something…</Text>
        </Pressable>
        <Pressable onPress={onPhotoPress} style={styles.photoButton} accessibilityRole="button">
          <Ionicons name="image" size={20} color={colors.headerRed} />
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  composerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadow.cardShadow,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  inputContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  inputPlaceholder: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  photoButton: {
    padding: spacing.sm,
  },
  
});
