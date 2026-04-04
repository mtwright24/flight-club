/**
 * TradeDetailScreen
 * Full detail view of a single trade with actions
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  useColorScheme,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import type { TradePost } from '../types/trades';
import AppHeader from '../components/AppHeader';
import { checkDuplicateRoom, createRoomWithTemplate, joinRoom } from '../lib/supabase/rooms';
import { createNotification } from '../../lib/notifications';

export const TradeDetailScreen: React.FC = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { session } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = getStyles(isDark);

  const [trade, setTrade] = useState<TradePost | null>(null);
  const [loading, setLoading] = useState(true);
  const [interested, setInterested] = useState(false);
  const [interestCount, setInterestCount] = useState(0);
  const [showMessage, setShowMessage] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [showScreenshot, setShowScreenshot] = useState(false);

  // Load trade details
  useEffect(() => {
    if (!id) return;

    const fetchTrade = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('trade_posts')
          .select(
            `
            *,
            user:user_id (id, handle, display_name, avatar_url)
          `
          )
          .eq('id', String(id))
          .single();

        if (error) throw error;
        setTrade(data);

        // Check if user is interested
        const user = session?.user;
        if (user) {
          const { data: interestData } = await supabase
            .from('trade_interests')
            .select('id')
            .eq('trade_id', String(id))
            .eq('user_id', user.id)
            .single();

          setInterested(!!interestData);
        }

        // Get interest count
        const { data: countData, error: countError } = await supabase
          .from('trade_interests')
          .select('id', { count: 'exact' })
          .eq('trade_id', String(id));

        if (!countError) {
          setInterestCount(countData?.length || 0);
        }
      } catch (err) {
        console.error('Error fetching trade:', err);
        Alert.alert('Error', 'Failed to load trade details');
      } finally {
        setLoading(false);
      }
    };

    fetchTrade();
  }, [id, session?.user?.id]);

  const handleInterestToggle = async () => {
    const user = session?.user;
    if (!user || !trade) return;

    try {
      if (interested) {
        // Remove interest
        await supabase
          .from('trade_interests')
          .delete()
          .eq('trade_id', trade.id)
          .eq('user_id', user.id);

        setInterested(false);
        setInterestCount((prev) => Math.max(0, prev - 1));
      } else {
        // Add interest
        await supabase.from('trade_interests').insert({
          trade_id: trade.id,
          user_id: user.id,
        });

        setInterested(true);
        setInterestCount((prev) => prev + 1);

        if (trade.user_id && trade.user_id !== user.id) {
          try {
            await createNotification({
              user_id: trade.user_id,
              actor_id: user.id,
              type: 'trade_interest',
              entity_type: 'trade',
              entity_id: trade.id,
              title: 'New interest',
              body: 'Someone is interested in your trade post.',
              data: { route: `/crew-exchange/${trade.id}` },
            });
          } catch (notifyErr) {
            console.warn('[Notifications] trade_interest notification:', notifyErr);
          }
        }
      }
    } catch (err) {
      console.error('Error toggling interest:', err);
      Alert.alert('Error', 'Failed to update interest');
    }
  };

  const handleSendMessage = async () => {
    const user = session?.user;
    if (!messageText.trim() || !trade || !user) return;

    try {
      const otherUserId = trade.user_id;
      if (otherUserId === user.id) return;

      const dmName = `dm_${[user.id, otherUserId].sort().join('_')}`;

      // Find or create private DM room
      let roomId: string | null = null;
      const existing = await checkDuplicateRoom(dmName, 'private');
      if (existing) {
        roomId = existing.id;
      } else {
        const result = await createRoomWithTemplate(user.id, {
          name: dmName,
          type: 'private',
          base: null,
          fleet: null,
          airline: null,
          is_private: true,
          created_by: user.id,
        });
        if (!result.success || !result.room) {
          throw new Error(result.message || 'Failed to create DM');
        }
        roomId = result.room.id;
      }

      if (!roomId) throw new Error('Missing room');

      // Ensure other user is added
      await joinRoom(otherUserId, roomId).catch(() => null);

      // Send initial message
      const { error: messageError } = await supabase
        .from('room_messages')
        .insert({
          room_id: roomId,
          user_id: user.id,
          text: messageText.trim(),
        });

      if (messageError) throw messageError;

      setShowMessage(false);
      setMessageText('');

      router.push({ pathname: '/room/[id]', params: { id: roomId } });
    } catch (err) {
      console.error('Error sending DM:', err);
      Alert.alert('Error', 'Failed to send message');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#DC3545" />
        </View>
      </SafeAreaView>
    );
  }

  if (!trade) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Trade not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = session?.user?.id === trade.user_id;
  const handleOpenMessage = () => {
    if (isOwner) {
      Alert.alert('Info', 'You cannot message yourself.');
      return;
    }
    setShowMessage(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader title="Crew Exchange" showLogo={false} />

      {/* Subheader */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trade Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Trade Header Card */}
        <View style={styles.card}>
          <View style={styles.tradeTypeRow}>
            <View
              style={[
                styles.typeIndicator,
                getTypeIndicatorStyle(trade.type, isDark),
              ]}
            >
              <Text style={styles.typeIndicatorText}>{trade.type.toUpperCase()}</Text>
            </View>

            {trade.has_incentive && (
              <View style={styles.incentiveIndicator}>
                <Text style={styles.incentiveIndicatorText}>
                  💰 ${trade.incentive_amount}
                </Text>
              </View>
            )}

            {trade.has_screenshot && (
              <View style={styles.screenshotIndicator}>
                <Text style={styles.screenshotIndicatorText}>📷 Attached</Text>
              </View>
            )}
          </View>

          <View style={styles.dateRow}>
            <Text style={styles.dateText}>
              {formatDate(trade.pairing_date)}
              {trade.end_date && ` → ${formatDate(trade.end_date)}`}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Report Time</Text>
            <Text style={[styles.detailValue, !trade.report_time && styles.detailValueMuted]}>
              {trade.report_time ? formatTime(trade.report_time) : 'Not provided'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Route</Text>
            <Text style={[styles.detailValue, !(trade.route_from || trade.route_to) && styles.detailValueMuted]}>
              {trade.route_from || trade.route_to
                ? `${trade.route_from || 'Not provided'} → ${trade.route_to || 'Not provided'}`
                : 'Not provided'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Trip Number</Text>
            <Text style={[styles.detailValue, !trade.trip_number && styles.detailValueMuted]}>
              {trade.trip_number || 'Not provided'}
            </Text>
          </View>
        </View>

        {/* Metrics */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Flight Metrics</Text>
          <View style={styles.metricsGrid}
          >
            <View style={styles.metricBox}
            >
              <Text style={styles.metricLabel}>Credit</Text>
              <Text style={[styles.metricValue, !trade.credit_minutes && styles.metricValueMuted]}>
                {trade.credit_minutes ?? 'Not provided'}
              </Text>
            </View>
            <View style={styles.metricBox}
            >
              <Text style={styles.metricLabel}>Block</Text>
              <Text style={[styles.metricValue, !trade.block_minutes && styles.metricValueMuted]}>
                {trade.block_minutes ?? 'Not provided'}
              </Text>
            </View>
            <View style={styles.metricBox}
            >
              <Text style={styles.metricLabel}>Duty</Text>
              <Text style={[styles.metricValue, !trade.duty_minutes && styles.metricValueMuted]}>
                {trade.duty_minutes ?? 'Not provided'}
              </Text>
            </View>
            <View style={styles.metricBox}
            >
              <Text style={styles.metricLabel}>TAFB</Text>
              <Text style={[styles.metricValue, !trade.tafb_minutes && styles.metricValueMuted]}>
                {trade.tafb_minutes ?? 'Not provided'}
              </Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={[styles.notesText, !trade.notes && styles.detailValueMuted]}>
            {trade.notes || 'Not provided'}
          </Text>
        </View>

        {/* Screenshot */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Screenshot</Text>
          {trade.has_screenshot && trade.screenshot_url ? (
            <Pressable onPress={() => setShowScreenshot(true)}>
              <Image
                source={{ uri: trade.screenshot_url }}
                style={styles.screenshot}
                resizeMode="contain"
              />
            </Pressable>
          ) : (
            <Text style={[styles.notesText, styles.detailValueMuted]}>Not provided</Text>
          )}
        </View>

        {/* Posted By */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Posted By</Text>
          <View style={styles.userRow}>
            {trade.user?.avatar_url ? (
              <Image
                source={{ uri: trade.user.avatar_url }}
                style={styles.userAvatar}
              />
            ) : (
              <View style={styles.userAvatarPlaceholder}>
                <Text style={styles.userAvatarPlaceholderText}>
                  {(trade.user?.display_name || trade.user?.handle || '?')
                    .charAt(0)
                    .toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.userInfo}>
              <Text style={styles.userName}>
                {trade.user?.display_name || trade.user?.handle || 'Anonymous'}
              </Text>
              <Text style={styles.postedTime}>
                {formatRelativeTime(trade.created_at)}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.messageInlineButton, isOwner && styles.messageInlineButtonDisabled]}
              onPress={handleOpenMessage}
              activeOpacity={0.7}
            >
              <Text style={styles.messageInlineButtonText}>Message</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Interest Count */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Interest</Text>
          <Text style={styles.interestCount}>
            {interestCount} {interestCount === 1 ? 'person' : 'people'} interested
          </Text>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Screenshot Modal */}
      <Modal
        visible={showScreenshot}
        transparent
        animationType="fade"
        onRequestClose={() => setShowScreenshot(false)}
      >
        <Pressable
          style={styles.screenshotModalOverlay}
          onPress={() => setShowScreenshot(false)}
        >
          <Image
            source={{ uri: trade?.screenshot_url }}
            style={styles.screenshotModalImage}
            resizeMode="contain"
          />
        </Pressable>
      </Modal>

      {/* Action Buttons */}
      {!isOwner && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, interested && styles.buttonActive]}
            onPress={handleInterestToggle}
            activeOpacity={0.7}
          >
            <Text style={[styles.buttonText, interested && styles.buttonTextActive]}>
              {interested ? '❤️ Interested' : '🤍 Show Interest'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.buttonPrimary}
            onPress={handleOpenMessage}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonPrimaryText}>💬 Message</Text>
          </TouchableOpacity>
        </View>
      )}

      {isOwner && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push({ pathname: '/crew-exchange/edit-post' as any, params: { tradeId: trade.id } })}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>✏️ Edit Trade</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.buttonDanger}
            onPress={() => {
              Alert.alert(
                'Delete Trade',
                'Are you sure you want to delete this trade?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      // TODO: Implement delete
                      console.log('Delete trade:', trade.id);
                    },
                  },
                ]
              );
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonDangerText}>🗑️ Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Message Modal */}
      <Modal
        visible={showMessage}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMessage(false)}
      >
        <Pressable
          style={styles.messageOverlay}
          onPress={() => setShowMessage(false)}
        >
          <View style={styles.messageBox}>
            <View style={styles.messageHeader}>
              <Text style={styles.messageTitle}>Message</Text>
              <TouchableOpacity
                onPress={() => setShowMessage(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.messageClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.messageInput}
              placeholder="Type your message..."
              placeholderTextColor={isDark ? '#666' : '#999'}
              value={messageText}
              onChangeText={setMessageText}
              multiline
              numberOfLines={4}
            />

            <View style={styles.messageButtonRow}>
              <TouchableOpacity
                style={styles.messageButtonCancel}
                onPress={() => setShowMessage(false)}
              >
                <Text style={styles.messageButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.messageButtonSend}
                onPress={handleSendMessage}
                disabled={!messageText.trim()}
              >
                <Text style={styles.messageButtonSendText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

/**
 * Helper Functions
 */

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatTime(time: string): string {
  try {
    const [hour, minute] = time.split(':');
    const h = parseInt(hour, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayH}:${minute} ${ampm}`;
  } catch {
    return time;
  }
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'recently';
  }
}

function getTypeIndicatorStyle(type: string, isDark: boolean): any {
  const styles: Record<string, any> = {
    swap: { backgroundColor: '#1D4ED8' },
    drop: { backgroundColor: '#DC3545' },
    pickup: { backgroundColor: '#16A34A' },
  };
  return styles[type] || styles.swap;
}

/**
 * Styles
 */

function getStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF',
    },

    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#2A3A4A' : '#E5E5E5',
    },

    backButton: {
      fontSize: 14,
      fontWeight: '600',
      color: '#DC3545',
    },

    headerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#FFFFFF' : '#000000',
    },

    centerContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },

    errorText: {
      fontSize: 14,
      color: isDark ? '#A0A0A0' : '#666666',
    },

    content: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },

    card: {
      borderRadius: 8,
      backgroundColor: isDark ? '#2A2A2A' : '#F9F9F9',
      paddingHorizontal: 12,
      paddingVertical: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDark ? '#3A3A3A' : '#E5E5E5',
    },

    tradeTypeRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
      alignItems: 'center',
    },

    typeIndicator: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
    },

    typeIndicatorText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    incentiveIndicator: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: '#FFB800',
    },

    incentiveIndicatorText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#FFFFFF',
    },

    screenshotIndicator: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: isDark ? '#3A3A3A' : '#E0E0E0',
    },

    screenshotIndicatorText: {
      fontSize: 11,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : '#000000',
    },

    dateRow: {
      marginBottom: 8,
    },

    dateText: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : '#000000',
    },

    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      borderTopWidth: 1,
      borderTopColor: isDark ? '#3A3A3A' : '#E6E6E6',
    },

    detailLabel: {
      fontSize: 11,
      color: isDark ? '#A0A0A0' : '#666666',
      fontWeight: '600',
    },

    detailValue: {
      fontSize: 12,
      color: isDark ? '#FFFFFF' : '#000000',
      fontWeight: '600',
    },

    detailValueMuted: {
      color: isDark ? '#7A7A7A' : '#9A9A9A',
      fontWeight: '500',
    },

    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#A0A0A0' : '#666666',
      marginBottom: 8,
      textTransform: 'uppercase',
    },

    metricsGrid: {
      flexDirection: 'row',
      gap: 8,
    },

    metricBox: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 6,
      backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#2A3A4A' : '#E0E0E0',
    },

    metricLabel: {
      fontSize: 10,
      color: isDark ? '#A0A0A0' : '#666666',
      marginBottom: 4,
    },

    metricValue: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#FFFFFF' : '#000000',
    },

    metricValueMuted: {
      fontSize: 12,
      color: isDark ? '#7A7A7A' : '#9A9A9A',
      fontWeight: '500',
    },

    notesText: {
      fontSize: 13,
      color: isDark ? '#D0D0D0' : '#333333',
      lineHeight: 18,
    },

    screenshot: {
      width: '100%',
      height: 200,
      borderRadius: 6,
      marginTop: 8,
    },

    screenshotModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 12,
    },

    screenshotModalImage: {
      width: '100%',
      height: '80%',
      borderRadius: 8,
    },

    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },

    userAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },

    userAvatarPlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#DC3545',
      justifyContent: 'center',
      alignItems: 'center',
    },

    userAvatarPlaceholderText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 14,
    },

    userInfo: {
      flex: 1,
    },

    messageInlineButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: '#DC3545',
    },

    messageInlineButtonDisabled: {
      backgroundColor: isDark ? '#3A3A3A' : '#E0E0E0',
    },

    messageInlineButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#FFFFFF',
    },

    userName: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : '#000000',
    },

    postedTime: {
      fontSize: 11,
      color: isDark ? '#A0A0A0' : '#666666',
      marginTop: 2,
    },

    interestCount: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : '#000000',
    },

    footer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingBottom: 20,
      paddingTop: 12,
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: isDark ? '#2A3A4A' : '#E5E5E5',
    },

    button: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? '#3A3A3A' : '#E0E0E0',
      justifyContent: 'center',
      alignItems: 'center',
    },

    buttonActive: {
      borderColor: '#DC3545',
      backgroundColor: isDark ? '#3A2A2A' : '#FFE8E8',
    },

    buttonText: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : '#000000',
    },

    buttonTextActive: {
      color: '#DC3545',
    },

    buttonPrimary: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 6,
      backgroundColor: '#DC3545',
      justifyContent: 'center',
      alignItems: 'center',
    },

    buttonPrimaryText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#FFFFFF',
    },

    buttonDanger: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 6,
      backgroundColor: isDark ? '#5A3A3A' : '#FFE8E8',
      borderWidth: 1,
      borderColor: '#DC3545',
      justifyContent: 'center',
      alignItems: 'center',
    },

    buttonDangerText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#DC3545',
    },

    messageOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },

    messageBox: {
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
      backgroundColor: isDark ? '#2A2A2A' : '#FFFFFF',
      paddingHorizontal: 16,
      paddingVertical: 16,
    },

    messageHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },

    messageTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#FFFFFF' : '#000000',
    },

    messageClose: {
      fontSize: 20,
      color: isDark ? '#FFFFFF' : '#000000',
    },

    messageInput: {
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? '#3A3A3A' : '#E0E0E0',
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      color: isDark ? '#FFFFFF' : '#000000',
      backgroundColor: isDark ? '#1A1A1A' : '#F9F9F9',
      marginBottom: 12,
      maxHeight: 100,
    },

    messageButtonRow: {
      flexDirection: 'row',
      gap: 8,
    },

    messageButtonCancel: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? '#3A3A3A' : '#E0E0E0',
      justifyContent: 'center',
      alignItems: 'center',
    },

    messageButtonSend: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 6,
      backgroundColor: '#DC3545',
      justifyContent: 'center',
      alignItems: 'center',
    },

    messageButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : '#000000',
    },

    messageButtonSendText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#FFFFFF',
    },
  });
}
