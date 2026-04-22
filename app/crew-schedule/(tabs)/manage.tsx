import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleTheme as T } from '../../../src/features/crew-schedule/scheduleTheme';
import type { ScheduleViewMode } from '../../../src/features/crew-schedule/types';
import {
  fetchLatestBatchWithFile,
  fetchLatestParsedBatch,
  invokeImportScheduleOcr,
} from '../../../src/features/crew-schedule/scheduleApi';
import {
  loadScheduleViewMode,
  saveScheduleViewMode,
} from '../../../src/features/crew-schedule/scheduleViewStorage';

const TEXT = '#0F172A';
const SUB = '#64748B';
const SECTION_MUTED = '#94A3B8';

const ICON_SIZE = 18;
const CHEVRON = 14;

const VIEW_OPTIONS: {
  id: ScheduleViewMode;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'classic', label: 'Classic List', description: 'Ledger', icon: 'list-outline' },
  { id: 'calendar', label: 'Calendar', description: 'Month grid', icon: 'calendar-outline' },
  { id: 'smart', label: 'Smart List', description: 'Quick actions', icon: 'layers-outline' },
];

export default function ManageTabScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const tripContext =
    typeof tripId === 'string' ? tripId : Array.isArray(tripId) ? tripId[0] : undefined;

  const [viewMode, setViewMode] = useState<ScheduleViewMode>('classic');

  React.useEffect(() => {
    void loadScheduleViewMode().then(setViewMode);
  }, []);

  const setMode = useCallback((m: ScheduleViewMode) => {
    setViewMode(m);
    void saveScheduleViewMode(m);
  }, []);

  const onRerunImport = useCallback(async () => {
    try {
      const batch = await fetchLatestBatchWithFile();
      if (!batch) {
        Alert.alert('No import file', 'Run Import Schedule first so there is a file to re-process.');
        return;
      }
      await invokeImportScheduleOcr(batch.id);
      router.push({
        pathname: '../import-review/[batchId]',
        params: { batchId: batch.id },
      });
    } catch (e) {
      Alert.alert('Re-run failed', e instanceof Error ? e.message : String(e));
    }
  }, [router]);

  const onReplaceMonth = useCallback(async () => {
    try {
      const batch = await fetchLatestParsedBatch();
      if (!batch) {
        Alert.alert(
          'Nothing to apply',
          'Import a schedule and complete parsing first, or open Import Schedule to start a new import.'
        );
        return;
      }
      router.push({
        pathname: '../import-review/[batchId]',
        params: { batchId: batch.id },
      });
    } catch (e) {
      Alert.alert('Could not open review', e instanceof Error ? e.message : String(e));
    }
  }, [router]);

  const onMerge = useCallback(async () => {
    try {
      const batch = await fetchLatestParsedBatch();
      if (!batch) {
        Alert.alert('Nothing to merge', 'Import and parse a schedule first.');
        return;
      }
      router.push({
        pathname: '../import-review/[batchId]',
        params: { batchId: batch.id },
      });
    } catch (e) {
      Alert.alert('Could not open review', e instanceof Error ? e.message : String(e));
    }
  }, [router]);

  const onEditDay = useCallback(async () => {
    try {
      const batch = await fetchLatestParsedBatch();
      if (!batch) {
        Alert.alert('No import', 'Parse an import first, then use Edit before save from the review screen.');
        return;
      }
      router.push({
        pathname: '../import-edit/[batchId]',
        params: { batchId: batch.id },
      });
    } catch (e) {
      Alert.alert('Could not open editor', e instanceof Error ? e.message : String(e));
    }
  }, [router]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 12 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerBlock}>
        <Text style={styles.screenTitle}>Manage</Text>
        <Text style={styles.subline}>Schedule tools and view controls</Text>
      </View>

      {tripContext ? (
        <View style={styles.contextPill}>
          <Text style={styles.contextLabel}>Trip context</Text>
          <Text style={styles.contextMono} numberOfLines={1}>
            {tripContext}
          </Text>
        </View>
      ) : null}

      <Text style={[styles.sectionLabel, styles.sectionLabelFirst]}>Import & data</Text>
      <View style={styles.insetGroup}>
        <ActionRow
          icon="cloud-upload-outline"
          title="Import Schedule"
          subtitle="Upload or connect a source"
          onPress={() => router.push('/crew-schedule/import-schedule')}
        />
        <Hairline />
        <ActionRow
          icon="airplane-outline"
          title="FLICA"
          subtitle="Direct sync from your airline's FLICA portal"
          onPress={() => router.push('/crew-schedule/import-flica-direct')}
        />
        <Hairline />
        <ActionRow
          icon="calendar-outline"
          title="Replace Month"
          subtitle="Overwrite a month with new data"
          onPress={onReplaceMonth}
        />
        <Hairline />
        <ActionRow
          icon="git-merge-outline"
          title="Merge Changes"
          subtitle="Apply pending import changes"
          onPress={onMerge}
        />
        <Hairline />
        <ActionRow
          icon="refresh-outline"
          title="Re-run Last Import"
          subtitle="Retry the most recent import"
          onPress={onRerunImport}
        />
      </View>

      <Text style={styles.sectionLabel}>Edit</Text>
      <View style={styles.insetGroup}>
        <ActionRow
          icon="create-outline"
          title="Edit Day"
          subtitle="Adjust a single day"
          onPress={onEditDay}
        />
      </View>

      <Text style={styles.sectionLabel}>View mode</Text>
      <View style={styles.insetGroup}>
        {VIEW_OPTIONS.map((opt, i) => {
          const active = viewMode === opt.id;
          return (
            <View key={opt.id}>
              {i > 0 ? <Hairline /> : null}
              <Pressable
                style={({ pressed }) => [styles.viewRowWrap, pressed && styles.pressed]}
                onPress={() => setMode(opt.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View style={styles.rowContent}>
                  <View style={styles.iconCell}>
                    <Ionicons name={opt.icon} size={ICON_SIZE} color={active ? T.accent : TEXT} />
                  </View>
                  <View style={styles.viewTextCol}>
                    <Text style={[styles.viewTitle, active && styles.viewTitleActive]} numberOfLines={1}>
                      {opt.label}
                    </Text>
                    <Text style={styles.viewSub} numberOfLines={1}>
                      {opt.description}
                    </Text>
                  </View>
                  {active ? (
                    <Ionicons name="checkmark-circle" size={18} color={T.accent} />
                  ) : (
                    <View style={styles.radioOuter} />
                  )}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function Hairline() {
  return <View style={styles.hairline} />;
}

function ActionRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.actionRowWrap, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.rowContent}>
        <View style={styles.iconCell}>
          <Ionicons name={icon} size={ICON_SIZE} color={TEXT} />
        </View>
        <View style={styles.actionText}>
          <Text style={styles.actionTitle}>{title}</Text>
          <Text style={styles.actionSub}>{subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={CHEVRON} color={SUB} />
      </View>
    </Pressable>
  );
}

const ROW_PAD_V = 7;
const ROW_PAD_H = 12;
const ICON_COL_W = 26;
const ICON_GAP = 8;
/** Left inset so divider lines up with title text (after icon column + gap) */
const ROW_TEXT_INSET = ROW_PAD_H + ICON_COL_W + ICON_GAP;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: T.bg },
  content: { paddingHorizontal: 16, paddingTop: 6 },
  headerBlock: { marginBottom: 10 },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -0.4,
    marginBottom: 2,
  },
  subline: { fontSize: 12, color: SUB, lineHeight: 16 },
  contextPill: {
    backgroundColor: T.surface,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginBottom: 10,
  },
  contextLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: SECTION_MUTED,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contextMono: { fontSize: 11, fontWeight: '600', color: TEXT },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: SECTION_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    marginBottom: 4,
    marginTop: 12,
  },
  sectionLabelFirst: { marginTop: 2 },
  insetGroup: {
    backgroundColor: T.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    overflow: 'hidden',
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: T.line,
    marginLeft: ROW_TEXT_INSET,
  },
  /** Pressable can default to column layout; inner rowContent forces horizontal icon | text | chevron */
  actionRowWrap: {
    width: '100%',
  },
  viewRowWrap: {
    width: '100%',
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: ROW_PAD_V,
    paddingHorizontal: ROW_PAD_H,
  },
  iconCell: {
    width: ICON_COL_W,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginRight: ICON_GAP,
  },
  actionText: { flex: 1, paddingRight: 6 },
  actionTitle: { fontSize: 14, fontWeight: '600', color: TEXT, letterSpacing: -0.1 },
  actionSub: { fontSize: 11, color: SUB, marginTop: 1, lineHeight: 14 },
  pressed: { backgroundColor: 'rgba(15, 23, 42, 0.04)' },
  viewTextCol: { flex: 1, paddingRight: 8 },
  viewTitle: { fontSize: 14, fontWeight: '600', color: TEXT, letterSpacing: -0.1 },
  viewTitleActive: { color: T.accent },
  viewSub: { fontSize: 10, color: SUB, marginTop: 0, lineHeight: 13 },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
});
