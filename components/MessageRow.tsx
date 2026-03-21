import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';

const brandRed = '#B5161E';

export default function MessageRow({ avatar, name, username, lastMessage, time, unread, onPress }: {
  avatar?: string;
  name: string;
  username: string;
  lastMessage?: string;
  time?: string;
  unread?: number;
  onPress: () => void;
}) {
  const placeholderUrl = 'https://ui-avatars.com/api/?name=User&background=E5E7EB&color=64748b&size=96';
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
      <Image source={avatar ? { uri: avatar } : { uri: placeholderUrl }} style={{ width: 48, height: 48, borderRadius: 24, marginRight: 14, backgroundColor: '#e5e7eb' }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a' }}>{name}</Text>
        <Text style={{ fontSize: 14, color: '#64748b' }}>@{username}</Text>
        <Text style={{ fontSize: 15, color: '#334155', marginTop: 2 }} numberOfLines={1}>{lastMessage}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', minWidth: 60 }}>
        <Text style={{ fontSize: 13, color: '#64748b' }}>{time}</Text>
        {unread ? <View style={{ marginTop: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: brandRed }} /> : null}
      </View>
    </Pressable>
  );
}
