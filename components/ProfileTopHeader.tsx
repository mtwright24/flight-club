import { Feather, Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

interface ProfileTopHeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
}

const ICON_SIZE = 22;

export default function ProfileTopHeader({ title = 'Profile', showBack, onBack }: ProfileTopHeaderProps) {
  return (
    <View
      style={{
        height: 56,
        backgroundColor: '#B5161E',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#B5161E',
        zIndex: 10,
      }}
    >
      {showBack ? (
        <Pressable onPress={onBack} style={{ padding: 4, marginRight: 8 }} hitSlop={8}>
          <Ionicons name="arrow-back" size={ICON_SIZE} color="#fff" />
        </Pressable>
      ) : (
        <View style={{ width: ICON_SIZE + 8 }} />
      )}
      <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', flex: 1 }}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable style={{ padding: 6, marginHorizontal: 2 }} hitSlop={8} onPress={() => {}}>
          <Feather name="search" size={ICON_SIZE} color="#fff" />
        </Pressable>
        <Pressable style={{ padding: 6, marginHorizontal: 2 }} hitSlop={8} onPress={() => {}}>
          <Ionicons name="notifications-outline" size={ICON_SIZE} color="#fff" />
        </Pressable>
        <Pressable style={{ padding: 6, marginHorizontal: 2 }} hitSlop={8} onPress={() => {}}>
          <Ionicons name="chatbubble-ellipses-outline" size={ICON_SIZE} color="#fff" />
        </Pressable>
        <Pressable style={{ padding: 6, marginHorizontal: 2 }} hitSlop={8} onPress={() => {}}>
          <Feather name="more-vertical" size={ICON_SIZE} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}
