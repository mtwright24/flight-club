import React, { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { EDGE_INSET, exploreGridColumnWidth } from './layoutTokens';
import type { CrewTool } from './types';

type Props = {
  tools: CrewTool[];
  renderCard: (tool: CrewTool) => React.ReactElement;
};

const COL_GAP = 12;

function chunkPairs<T>(items: T[]): [T, T | undefined][] {
  const out: [T, T | undefined][] = [];
  for (let i = 0; i < items.length; i += 2) {
    out.push([items[i], items[i + 1]]);
  }
  return out;
}

/**
 * Explore tools: 2-column grid inside the main vertical scroll (no nested FlatList).
 */
export default function ExploreToolsGrid({ tools, renderCard }: Props) {
  const { width: screenW } = useWindowDimensions();
  const colW = exploreGridColumnWidth(screenW, COL_GAP);
  const pairs = useMemo(() => chunkPairs(tools), [tools]);

  return (
    <View style={styles.wrapper}>
      {pairs.map((pair, rowIndex) => (
        <View key={`row-${rowIndex}`} style={[styles.row, { marginBottom: rowIndex < pairs.length - 1 ? COL_GAP : 0 }]}>
          <View style={[styles.cell, { width: colW }]}>
            {renderCard(pair[0])}
          </View>
          {pair[1] ? (
            <View style={[styles.cell, { width: colW }]}>
              {renderCard(pair[1])}
            </View>
          ) : (
            <View style={{ width: colW }} />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: EDGE_INSET,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cell: {
    overflow: 'hidden',
  },
});
