
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
  subtitle: string;
  avatarUrl?: string;
  onPress: () => void;
};

export function SearchResultRow({ title, subtitle, avatarUrl, onPress }: Props) {
  return (
    <>
      <Pressable style={styles.row} onPress={onPress}>
        <View style={styles.avatarCol}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{title?.[0]?.toUpperCase() ?? '?'}</Text>
            </View>
          )}
        </View>

        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        </View>

        <View style={styles.chevronCol}>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </View>
      </Pressable>

      <View style={styles.divider} />
    </>
  );
}

// Default export for item-based usage
export function SearchResultRowDefault({ item, onPress }: { item: any; onPress: (item: any) => void }) {
  return (
    <SearchResultRow
      title={item.title}
      subtitle={item.subtitle || (item.type === 'person' ? 'Crew member' : '')}
      avatarUrl={item.avatarUrl}
      onPress={() => onPress(item)}
    />
  );
}

// ...existing code...

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 60,
    backgroundColor: 'transparent',
  },
  rowPressed: {
    backgroundColor: '#F3F4F6',
  },
  avatarCol: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    justifyContent: 'center',
  },
  chevronCol: {
    width: 24,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E5E7EB',
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  roomIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
  },
  toolIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginLeft: 72,
    marginRight: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 14,
    color: '#6B7280',
  },
});
