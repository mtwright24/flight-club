import React from 'react';
import { View, Text } from 'react-native';

const brandRed = '#B5161E';

export default function MessageBubble({ body, mine, time }: {
  body: string;
  mine: boolean;
  time?: string;
}) {
  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', marginBottom: 10 }}>
      <View style={{ backgroundColor: mine ? brandRed : '#F1F5F9', borderRadius: 16, padding: 12, paddingHorizontal: 16 }}>
        <Text style={{ color: mine ? '#fff' : '#0f172a', fontSize: 16 }}>{body}</Text>
      </View>
      {time ? <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2, alignSelf: mine ? 'flex-end' : 'flex-start' }}>{formatTime(time)}</Text> : null}
    </View>
  );
}

function formatTime(time: string) {
  // Simple time formatting (HH:mm or relative)
  const d = new Date(time);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
