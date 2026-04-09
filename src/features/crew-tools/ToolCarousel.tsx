import React from 'react';
import { FlatList, ListRenderItem, Platform, StyleSheet, View } from 'react-native';
import { CARD_GAP, CAROUSEL_TAIL_INSET, EDGE_INSET } from './layoutTokens';
import type { CrewTool } from './types';

type Props = {
  tools: CrewTool[];
  /** Fixed width for every card cell — prevents flex shrink / merged text */
  cardWidth: number;
  renderCard: (tool: CrewTool) => React.ReactElement;
  listKey?: string;
};

/**
 * Horizontal tool list: fixed-width cells + gap separators + end padding for a clean peek.
 */
export default function ToolCarousel({ tools, cardWidth, renderCard, listKey }: Props) {
  const snapInterval = cardWidth + CARD_GAP;

  const renderItem: ListRenderItem<CrewTool> = ({ item }) => (
    <View style={[styles.cell, { width: cardWidth }]} collapsable={false}>
      {renderCard(item)}
    </View>
  );

  return (
    <FlatList
      key={listKey}
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
