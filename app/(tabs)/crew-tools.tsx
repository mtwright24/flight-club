import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Crew Tools tab — primary tools destination (ecosystem TBD).
 * Header/title chrome comes from app/(tabs)/_layout.tsx (SectionHeader: "Crew Tools").
 */
export default function CrewToolsTabScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lead}>
          Your crew tools hub. More tools and categories will appear here as the ecosystem is built out.
        </Text>
        <Text style={styles.hint}>
          Use Home quick access for schedule, loads, and housing. The Utility Hub tile is separate from this tab.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingBottom: 32 },
  lead: { fontSize: 16, color: '#334155', lineHeight: 24 },
  hint: { fontSize: 14, color: '#64748b', marginTop: 16, lineHeight: 22 },
});
