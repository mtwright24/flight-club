import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../styles/theme';

interface EditPostModalProps {
  visible: boolean;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
}

export default function EditPostModal({
  visible,
  initialContent,
  onSave,
  onClose,
}: EditPostModalProps) {
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!content.trim() || saving) return;

    try {
      setSaving(true);
      await onSave(content.trim());
      onClose();
    } catch (error) {
      console.error('Error saving post:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.headerButton}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Edit Post</Text>
            <Pressable
              onPress={handleSave}
              disabled={!content.trim() || saving}
              style={styles.headerButton}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text
                  style={[
                    styles.saveText,
                    (!content.trim() || saving) && styles.saveTextDisabled,
                  ]}
                >
                  Save
                </Text>
              )}
            </Pressable>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <TextInput
              style={styles.textInput}
              value={content}
              onChangeText={setContent}
              placeholder="What's on your mind?"
              placeholderTextColor={colors.textSecondary}
              multiline
              autoFocus
              maxLength={2000}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  headerButton: {
    width: 60,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'right',
  },
  saveTextDisabled: {
    opacity: 0.4,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
});
