import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { colors, spacing } from '../../styles/theme';
import SuggestedRoomCard from './SuggestedRoomCard';
import { Room } from '../../types/rooms';

type Props = {
  rooms: Room[];
  onJoinRoom: (roomId: string) => Promise<void>;
  isFirstTime?: boolean;
  loading?: boolean;
};

/**
 * SuggestedRoomsSection
 * Displays recommended rooms in a horizontal scrollable section
 */
export default function SuggestedRoomsSection({ 
  rooms, 
  onJoinRoom, 
  isFirstTime = false,
  loading = false,
}: Props) {
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);

  const handleJoin = async (roomId: string) => {
    setJoiningRoomId(roomId);
    try {
      await onJoinRoom(roomId);
    } finally {
      setJoiningRoomId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Recommended for you</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.headerRed} />
        </View>
      </View>
    );
  }

  if (!rooms || rooms.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {isFirstTime ? 'Recommended for you' : 'Suggested'}
        </Text>
        {isFirstTime && <Text style={styles.subtitle}>Based on your profile</Text>}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
      >
        {rooms.map(room => (
          <SuggestedRoomCard
            key={room.id}
            room={room}
            onJoin={handleJoin}
            isJoining={joiningRoomId === room.id}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.md,
  },
  header: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.headerRed,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  scrollContent: {
    paddingRight: spacing.lg,
  },
  loadingContainer: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
