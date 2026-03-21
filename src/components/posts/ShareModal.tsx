import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Modal, Pressable, Share as RNShare, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { colors, radius, shadow, spacing } from '../../styles/theme';

interface ShareModalProps {
  visible: boolean;
  postId: string;
  postContent: string;
  onClose: () => void;
}

export default function ShareModal({ visible, postId, postContent, onClose }: ShareModalProps) {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const handleExternalShare = async () => {
    try {
      await RNShare.share({
        message: `Check out this post from Flight Club:\n\n"${postContent}"`,
        title: 'Share Post',
      });
      onClose();
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleCopyLink = () => {
    // TODO: Implement copy link functionality
    onClose();
  };

  const handleShareToDM = async () => {
    try {
      if (!userId) {
        Alert.alert('Sign in required', 'You need to be signed in to send DMs.');
        return;
      }
      // Go to New Message screen with context about which post to share.
      // The actual post_share message is sent from the thread screen once a conversation is chosen.
      router.push({ pathname: '/new-message', params: { sharePostId: postId } });
      onClose();
    } catch (error) {
      console.error('Error sharing to DM:', error);
      Alert.alert('Unable to share', 'Please try again.');
    }
  };

  const handleShareToRoom = () => {
    // TODO: Implement share to room
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.modalContainer} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>Share Post</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.optionsContainer}>
            <Pressable style={styles.option} onPress={handleShareToDM}>
              <View style={styles.iconCircle}>
                <Ionicons name="chatbubble" size={22} color={colors.primary} />
              </View>
              <Text style={styles.optionText}>Send in Direct Message</Text>
            </Pressable>

            <Pressable style={styles.option} onPress={handleShareToRoom}>
              <View style={styles.iconCircle}>
                <Ionicons name="people" size={22} color={colors.primary} />
              </View>
              <Text style={styles.optionText}>Share to Room</Text>
            </Pressable>

            <Pressable style={styles.option} onPress={handleCopyLink}>
              <View style={styles.iconCircle}>
                <Ionicons name="link" size={22} color={colors.primary} />
              </View>
              <Text style={styles.optionText}>Copy Link</Text>
            </Pressable>

            <Pressable style={styles.option} onPress={handleExternalShare}>
              <View style={styles.iconCircle}>
                <Ionicons name="share-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.optionText}>Share via...</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.cardBg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xl,
    ...shadow.cardShadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '30',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  optionsContainer: {
    paddingVertical: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  optionText: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '500',
  },
});
