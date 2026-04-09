import React from 'react';
import { FlatList, ListRenderItem, Platform, StyleSheet, View } from 'react-native';
import { CARD_GAP, CAROUSEL_TAIL_INSET, EDGE_INSET, featuredCarouselCardWidth } from './layoutTokens';
import type { CrewTool } from './types';

type Props = {
  tools: CrewTool[];
  screenWidth: number;
  renderCard: (tool: CrewTool) => React.ReactElement;
};

/**
 * Featured: large cards with next-card peek; snap aligns to card + gap.
 */
export default function FeaturedToolCarousel({ tools, screenWidth, renderCard }: Props) {
  const w = featuredCarouselCardWidth(screenWidth);
  const snapInterval = w + CARD_GAP;

  const renderItem: ListRenderItem<CrewTool> = ({ item }) => (
    <View style={[styles.cell, { width: w }]} collapsable={false}>
      {renderCard(item)}
    </View>
  );

  return (
    <FlatList
      horizontal
      data={tools}
      keyExtractor={(t) => t.id}
      renderItem={renderItem}
      ItemSeparatorComponent={Separator}
      contentContainerStyle={[
        styles.content,
        { paddingRight: EDGE_INSET + CAROUSEL_TAIL_INSET },
      ]}
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      snapToInterval={snapInterval}
      snapToAlignment="start"
      decelerationRate="fast"
      {...(Platform.OS === 'android' ? { disableIntervalMomentum: true } : {})}
    />
  );
}

function Separator() {
  return <View style={{ width: CARD_GAP }} />;
}

const styles = StyleSheet.create({
  content: {
    paddingLeft: EDGE_INSET,
    paddingVertical: 8,
  },
  cell: {
    overflow: 'hidden',
  },
});
