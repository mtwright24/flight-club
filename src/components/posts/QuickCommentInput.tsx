import React, { useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, Pressable, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../styles/theme';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';

interface QuickCommentInputProps {
  onSubmit: (text: string) => Promise<void>;
  placeholder?: string;
}

export default function QuickCommentInput({
  onSubmit,
  placeholder = 'Write a comment...',
}: QuickCommentInputProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const loadUserAvatar = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('avatar_url, display_name')
          .eq('id', userId)
          .single();

        if (!error && data) {
          if (data.avatar_url) {
            setUserAvatar(data.avatar_url);
          }
        }
      } catch (error) {
        console.error('Error loading user avatar:', error);
      }
    };

    loadUserAvatar();
  }, [userId]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;

    try {
      setSending(true);
      await onSubmit(text.trim());
      setText('');
    } catch (error) {
      console.error('Error sending comment:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.container, focused && styles.containerFocused]}>
      {userId && (
        <Image
          key={userAvatar || 'default'}
          source={{ uri: userAvatar || `https://i.pravatar.cc/100?u=${userId}` }}
          style={styles.avatar}
          defaultSource={{ uri: `https://i.pravatar.cc/100?u=${userId}` }}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        value={text}
        onChangeText={setText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        multiline
        maxLength={500}
        editable={!sending}
      />
      {sending ? (
        <ActivityIndicator size="small" color={colors.primary} style={styles.sendButton} />
      ) : (
        <Pressable
          onPress={handleSend}
          disabled={!text.trim()}
          style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
        >
          <Ionicons
            name="send"
            size={18}
            color={text.trim() ? colors.primary : colors.textSecondary}
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border + '30',
    gap: spacing.sm,
  },
  containerFocused: {
    borderColor: colors.primary + '60',
    backgroundColor: colors.cardBg,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    maxHeight: 80,
    paddingVertical: spacing.xs,
  },
  sendButton: {
    marginLeft: spacing.xs,
    padding: spacing.xs,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
