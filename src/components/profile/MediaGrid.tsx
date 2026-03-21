import React from 'react';
import { Dimensions, Image, Pressable, StyleSheet, View } from 'react-native';

interface MediaGridProps {
  media: string[];
  onMediaPress?: (index: number) => void;
}

const numColumns = 3;
const size = Dimensions.get('window').width / numColumns - 8;

export default function MediaGrid({ media, onMediaPress }: MediaGridProps) {
  return (
    <View style={styles.grid}>
      {media.map((item, index) => (
        <Pressable
          key={item + index}
          onPress={() => onMediaPress?.(index)}
          style={styles.item}
        >
          <Image source={{ uri: item }} style={styles.image} resizeMode="cover" />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 8,
  },
  item: {
    margin: 4,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  image: { width: size, height: size, borderRadius: 10 },
});
