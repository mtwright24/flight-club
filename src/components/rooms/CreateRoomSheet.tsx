import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow, SHADOW } from '../../styles/theme';
import { CreateRoomTemplate, CreateRoomPayload, Room } from '../../types/rooms';
import { createRoomWithTemplate } from '../../lib/supabase/rooms';

interface CreateRoomSheetProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onSuccess: (room: Room) => void;
}

const TEMPLATES: Array<{ key: CreateRoomTemplate; label: string; description: string; isPrivate: boolean }> = [
  { key: 'base-room', label: 'Base Room', description: 'Connect with crew at your base', isPrivate: false },
  { key: 'fleet-room', label: 'Fleet Room', description: 'Join your fleet community', isPrivate: false },
  { key: 'commuters', label: 'Commuters', description: 'Share rides and tips', isPrivate: false },
  { key: 'crashpads', label: 'Crashpads', description: 'Find or share housing', isPrivate: false },
  { key: 'swap-signals', label: 'Swap Signals', description: 'Post and find swaps', isPrivate: false },
  { key: 'layover', label: 'Layover (Auto-expire)', description: 'Temporary layover crew chat', isPrivate: false },
  { key: 'private-crew', label: 'Private Crew Room', description: 'Invite-only crew space', isPrivate: true },
];

type Step = 'template-select' | 'fill-details' | 'confirmation';

export default function CreateRoomSheet({ visible, userId, onClose, onSuccess }: CreateRoomSheetProps) {
  const [step, setStep] = useState<Step>('template-select');
  const [selectedTemplate, setSelectedTemplate] = useState<CreateRoomTemplate | null>(null);
  const [name, setName] = useState('');
  const [base, setBase] = useState('');
  const [fleet, setFleet] = useState('');
  const [airline, setAirline] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [duplicateRoom, setDuplicateRoom] = useState<Room | null>(null);

  const handleTemplateSelect = (key: CreateRoomTemplate) => {
    setSelectedTemplate(key);
    const template = TEMPLATES.find((t) => t.key === key);
    setIsPrivate(template?.isPrivate || false);

    // Set name suggestion
    if (key === 'base-room' && base) {
      setName(`${base} Room`);
    } else if (key === 'fleet-room' && fleet) {
      setName(`${fleet} Crew`);
    } else if (key === 'commuters') {
      setName('Commuters');
    } else if (key === 'crashpads') {
      setName('Crashpads');
    } else if (key === 'swap-signals') {
      setName('Swap Signals');
    } else if (key === 'layover') {
      setName('Layover Crew');
    } else if (key === 'private-crew') {
      setName('Private Crew');
    }

    setStep('fill-details');
  };

  const handleNextStep = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a room name');
      return;
    }

    // For now, skip duplicate check in this step. Check on create.
    setStep('confirmation');
  };

  const handleCreateRoom = async () => {
    try {
      setLoading(true);

      const templateRecord = TEMPLATES.find((t) => t.key === selectedTemplate);
      const type = selectedTemplate?.replace(/-/g, '_') || 'general';

      const payload: CreateRoomPayload = {
        name: name.trim(),
        type: type as any,
        base: base || null,
        fleet: fleet || null,
        airline: airline || null,
        is_private: isPrivate,
        created_by: userId,
      };

      console.log('[ANALYTICS] create_room_attempt', { template: selectedTemplate, isPrivate });

      const result = await createRoomWithTemplate(userId, payload);

      if (result.success && result.room) {
        Alert.alert('Success', `Room "${result.room.name}" created!`);
        onSuccess(result.room);
        resetForm();
        onClose();
      } else if (result.room) {
        // Duplicate detected
        setDuplicateRoom(result.room);
        setStep('confirmation');
        Alert.alert('Room Exists', result.message || 'This room already exists. Would you like to join it?', [
          { text: 'Cancel', onPress: () => {} },
          {
            text: 'Join',
            onPress: () => {
              // Assume joinRoom is available in parent or passed as prop
              onSuccess(result.room!);
              resetForm();
              onClose();
            },
          },
        ]);
      } else {
        Alert.alert('Error', result.message || 'Failed to create room');
        console.log('[ANALYTICS] create_room_rate_limited');
      }
    } catch (error) {
      console.error('Error creating room:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep('template-select');
    setSelectedTemplate(null);
    setName('');
    setBase('');
    setFleet('');
    setAirline('');
    setIsPrivate(false);
    setDuplicateRoom(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.container}>
          <SafeAreaView style={styles.safeTop} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
              <Pressable onPress={handleClose}>
                <Text style={styles.closeBtn}>Cancel</Text>
              </Pressable>
              <Text style={styles.headerTitle}>Create a Room</Text>
              <View style={{ width: 60 }} />
            </View>

            <ScrollView 
              style={styles.content} 
              contentContainerStyle={styles.contentPadding} 
              scrollEnabled={true}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
            >
          {step === 'template-select' && (
            <View>
              <Text style={styles.stepTitle}>Choose a template</Text>
              <Text style={styles.stepDesc}>What type of room would you like to create?</Text>

              <View style={styles.templateGrid}>
                {TEMPLATES.map((template) => (
                  <Pressable
                    key={template.key}
                    style={({ pressed }) => [
                      styles.templateCard,
                      pressed && styles.templateCardPressed,
                    ]}
                    onPress={() => handleTemplateSelect(template.key)}
                  >
                    <Text style={styles.templateLabel}>{template.label}</Text>
                    <Text style={styles.templateDesc}>{template.description}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {step === 'fill-details' && (
            <View>
              <Text style={styles.stepTitle}>Room Details</Text>

              {/* Name */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Room Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., ORD Commuters"
                  placeholderTextColor={colors.textSecondary}
                  value={name}
                  onChangeText={setName}
                  editable={!loading}
                />
              </View>

              {/* Base */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Base (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., ORD"
                  placeholderTextColor={colors.textSecondary}
                  value={base}
                  onChangeText={setBase}
                  editable={!loading}
                />
              </View>

              {/* Fleet */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Fleet (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., A320"
                  placeholderTextColor={colors.textSecondary}
                  value={fleet}
                  onChangeText={setFleet}
                  editable={!loading}
                />
              </View>

              {/* Airline */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Airline (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Delta"
                  placeholderTextColor={colors.textSecondary}
                  value={airline}
                  onChangeText={setAirline}
                  editable={!loading}
                />
              </View>

              {/* Private Toggle */}
              <View style={styles.formGroup}>
                <View style={styles.toggleRow}>
                  <Text style={styles.label}>Private Room</Text>
                  <Switch
                    value={isPrivate}
                    onValueChange={setIsPrivate}
                    trackColor={{ false: colors.border, true: colors.headerRed }}
                    thumbColor={colors.cardBg}
                    disabled={loading}
                  />
                </View>
                <Text style={styles.toggleDesc}>
                  {isPrivate
                    ? 'Only invited crew members can join.'
                    : 'Anyone can discover and join this room.'}
                </Text>
              </View>
            </View>
          )}

          {step === 'confirmation' && (
            <View>
              <Text style={styles.stepTitle}>Ready to create?</Text>

              <View style={styles.confirmCard}>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Room Name</Text>
                  <Text style={styles.confirmValue}>{name}</Text>
                </View>
                {base && (
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>Base</Text>
                    <Text style={styles.confirmValue}>{base}</Text>
                  </View>
                )}
                {fleet && (
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>Fleet</Text>
                    <Text style={styles.confirmValue}>{fleet}</Text>
                  </View>
                )}
                {airline && (
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>Airline</Text>
                    <Text style={styles.confirmValue}>{airline}</Text>
                  </View>
                )}
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Type</Text>
                  <Text style={styles.confirmValue}>{isPrivate ? 'Private' : 'Public'}</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
        </SafeAreaView>

        {/* Action Buttons - Footer with proper flex row */}
        <View style={styles.footer}>
          {step === 'template-select' && (
            <Pressable
              style={styles.cancelButton}
              onPress={handleClose}
            >
              <Text style={styles.buttonSecondaryText}>Cancel</Text>
            </Pressable>
          )}

          {step === 'fill-details' && (
            <View style={{ flexDirection: 'row', gap: spacing.md, width: '100%' }}>
              <Pressable
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setStep('template-select')}
              >
                <Text style={styles.buttonSecondaryText}>Back</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.buttonPrimary]}
                onPress={handleNextStep}
                disabled={loading}
              >
                <Text style={styles.buttonPrimaryText}>Next</Text>
              </Pressable>
            </View>
          )}

          {step === 'confirmation' && (
            <View style={{ flexDirection: 'row', gap: spacing.md, width: '100%' }}>
              <Pressable
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setStep('fill-details')}
                disabled={loading}
              >
                <Text style={styles.buttonSecondaryText}>Back</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.buttonPrimary]}
                onPress={handleCreateRoom}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.cardBg} />
                ) : (
                  <Text style={styles.buttonPrimaryText}>Create Room</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  safeTop: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  closeBtn: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.headerRed,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  content: {
    flex: 1,
  },
  contentPadding: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  stepDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  templateGrid: {
    gap: spacing.md,
  },
  templateCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...SHADOW.soft,
  },
  templateCardPressed: {
    borderColor: colors.headerRed,
    borderWidth: 2,
  },
  templateLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  templateDesc: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  formGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  confirmCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.lg,
    ...SHADOW.soft,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  confirmLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  confirmValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    width: '100%',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.screenBg,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    flex: 1,
    minHeight: 48,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.headerRed,
  },
  buttonSecondary: {
    backgroundColor: colors.screenBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonPrimaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.cardBg,
  },
  buttonSecondaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
});
