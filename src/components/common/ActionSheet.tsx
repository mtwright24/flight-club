import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { colors, spacing, radius, shadow } from '../../styles/theme';
import { Ionicons } from '@expo/vector-icons';

export interface ActionSheetOption {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
}

interface ActionSheetProps {
  visible: boolean;
  options: ActionSheetOption[];
  onClose: () => void;
  title?: string;
}

export default function ActionSheet({ visible, options, onClose, title }: ActionSheetProps) {
  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          {title && <Text style={styles.title}>{title}</Text>}
          {options.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={styles.option}
              onPress={() => {
                option.onPress();
                onClose();
              }}
            >
              {option.icon && (
                <Ionicons
                  name={option.icon}
                  size={20}
                  color={option.destructive ? colors.error : colors.textPrimary}
                  style={styles.optionIcon}
                />
              )}
              <Text
                style={[
                  styles.optionText,
                  option.destructive && styles.optionTextDestructive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.cardBg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    ...shadow.cardShadow,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '30',
  },
  optionIcon: {
    marginRight: spacing.md,
  },
  optionText: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  optionTextDestructive: {
    color: colors.error,
  },
  cancelButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
