import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FC } from '../jetblueFlicaImportUi';
import {
  FEEDBACK_OPTION_LABEL,
  queueImportFieldFeedback,
  type ImportFieldFeedbackOption,
  type ImportFieldFeedbackPayload,
} from '../importFieldFeedbackQueue';
import { DEFAULT_REASON_COPY, type ValidationReasonCode } from '../jetblueFlicaImportReasonCopy';
import type { FieldStatus } from '../jetblueFlicaImportValidation';

type Props = {
  assistKey: string;
  fieldLabel: string;
  status: FieldStatus | undefined;
  /** Controlled expand (optional — if omitted, internal state) */
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
  /** Apply a suggested value (e.g. set state in parent). */
  onApplyCandidate: (value: string, source?: 'suggested_choice') => void;
  /** Raw OCR / parser text for this leg or pairing block — shown in a sheet when the user asks. */
  scanTextSnippet?: string | null;
  /** Opens full import image preview (e.g. pinch-zoom) when attached assets exist. */
  onViewImportImage?: () => void;
  pairingId?: string;
  batchId?: string;
  legId?: string;
  fieldScope: ImportFieldFeedbackPayload['fieldScope'];
  fieldKey: string;
  feedbackSubmitted?: boolean;
  onFeedbackSubmitted?: () => void;
};

function fallbackReasonDisplay(s: FieldStatus): string {
  if (s.reasonDisplay?.trim()) return s.reasonDisplay.trim();
  if (s.reasonCode) return DEFAULT_REASON_COPY[s.reasonCode];
  return s.helper ?? 'This field needs a quick look.';
}

export default function ImportFieldReviewAssist({
  assistKey,
  fieldLabel,
  status,
  expanded: expandedProp,
  defaultExpanded = false,
  onExpandedChange,
  onApplyCandidate,
  scanTextSnippet,
  onViewImportImage,
  pairingId,
  batchId,
  legId,
  fieldScope,
  fieldKey,
  feedbackSubmitted = false,
  onFeedbackSubmitted,
}: Props) {
  const insets = useSafeAreaInsets();
  const [internalOpen, setInternalOpen] = useState(defaultExpanded);
  const expanded = expandedProp ?? internalOpen;
  const setExpanded = useCallback(
    (v: boolean) => {
      if (onExpandedChange) onExpandedChange(v);
      else setInternalOpen(v);
    },
    [onExpandedChange]
  );

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [pendingOption, setPendingOption] = useState<ImportFieldFeedbackOption | null>(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);

  const scanTrimmed = (scanTextSnippet ?? '').trim();

  if (!status || status.state === 'good') return null;

  const statusLabel = status.state === 'missing_required' ? 'Missing required' : 'Needs review';
  const toneStyle = status.state === 'missing_required' ? styles.panelMiss : styles.panelReview;
  const reason = fallbackReasonDisplay(status);
  const chips = status.candidates ?? [];

  const submitFeedback = async (opt: ImportFieldFeedbackOption) => {
    await queueImportFieldFeedback({
      id: `${assistKey}-${Date.now()}`,
      pairingId,
      batchId,
      legId,
      fieldScope,
      fieldKey,
      option: opt,
      note: feedbackNote.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    onFeedbackSubmitted?.();
    setFeedbackOpen(false);
    setFeedbackNote('');
    setPendingOption(null);
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.triggerRow, toneStyle]}
        onPress={() => setExpanded(!expanded)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Hide fix suggestions' : 'Show fix suggestions'}
      >
        <View style={styles.triggerLeft}>
          <Ionicons
            name={status.state === 'missing_required' ? 'alert-circle' : 'help-circle-outline'}
            size={18}
            color={status.state === 'missing_required' ? FC.bad : FC.warn}
          />
          <Text style={styles.triggerText}>
            {statusLabel} · <Text style={styles.triggerStrong}>{fieldLabel}</Text>
          </Text>
        </View>
        <Text style={styles.triggerHint}>{expanded ? 'Hide' : 'How to fix'}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={FC.textMuted} />
      </Pressable>

      {expanded ? (
        <View style={[styles.panelBody, toneStyle]}>
          <Text style={styles.reason}>{reason}</Text>
          {status.reasonCode && reasonCodeHint(status.reasonCode) ? (
            <Text style={styles.metaHint}>{reasonCodeHint(status.reasonCode)}</Text>
          ) : null}

          {chips.length > 0 ? (
            <View style={styles.chipGrid}>
              {chips.map((c, i) => (
                <Pressable
                  key={`${c.value}-${i}`}
                  style={styles.chip}
                  onPress={() => onApplyCandidate(c.value, 'suggested_choice')}
                >
                  <Text style={styles.chipText}>{c.label ?? c.value}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.refRow}>
            {onViewImportImage ? (
              <Pressable style={styles.refBtn} onPress={onViewImportImage}>
                <Text style={styles.refBtnText}>View screenshot reference</Text>
              </Pressable>
            ) : null}
            {scanTrimmed ? (
              <Pressable style={styles.refBtn} onPress={() => setScanModalOpen(true)}>
                <Text style={styles.refBtnText}>Show scan text</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.manualHint}>You can always type in the field above (manual entry) — no need to memorize the screen.</Text>

          {feedbackSubmitted ? (
            <Text style={styles.thanks}>Thanks — we’ll use this to improve imports.</Text>
          ) : (
            <Pressable style={styles.feedbackBtn} onPress={() => setFeedbackOpen(true)}>
              <Text style={styles.feedbackBtnText}>Send feedback</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      <Modal visible={scanModalOpen} transparent animationType="fade" onRequestClose={() => setScanModalOpen(false)}>
        <View style={styles.feedModalRoot}>
          <Pressable style={styles.feedModalBackdrop} onPress={() => setScanModalOpen(false)} />
          <View style={[styles.scanModalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.feedTitle}>Text from scan</Text>
            <Text style={styles.feedSubtitle}>{fieldLabel}</Text>
            <ScrollView style={styles.scanScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              <Text selectable style={styles.scanBody}>
                {scanTrimmed}
              </Text>
            </ScrollView>
            <Pressable style={styles.feedCancel} onPress={() => setScanModalOpen(false)}>
              <Text style={styles.feedCancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={feedbackOpen} transparent animationType="slide" onRequestClose={() => setFeedbackOpen(false)}>
        <View style={styles.feedModalRoot}>
          <Pressable style={styles.feedModalBackdrop} onPress={() => setFeedbackOpen(false)} />
          <View style={[styles.feedModalSheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.feedTitle}>Quick feedback</Text>
          <Text style={styles.feedSubtitle}>{fieldLabel}</Text>
          {(Object.keys(FEEDBACK_OPTION_LABEL) as ImportFieldFeedbackOption[]).map((opt) => (
            <Pressable
              key={opt}
              style={[styles.feedOption, pendingOption === opt && styles.feedOptionOn]}
              onPress={() => setPendingOption(opt)}
            >
              <Text style={styles.feedOptionText}>{FEEDBACK_OPTION_LABEL[opt]}</Text>
            </Pressable>
          ))}
          <TextInput
            style={styles.feedNote}
            placeholder="Optional note"
            placeholderTextColor={FC.textSubtle}
            value={feedbackNote}
            onChangeText={setFeedbackNote}
            multiline
          />
          <View style={styles.feedActions}>
            <Pressable style={styles.feedCancel} onPress={() => setFeedbackOpen(false)}>
              <Text style={styles.feedCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.feedSend, !pendingOption && styles.feedSendDisabled]}
              disabled={!pendingOption}
              onPress={() => pendingOption && void submitFeedback(pendingOption)}
            >
              <Text style={styles.feedSendText}>Send</Text>
            </Pressable>
          </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function reasonCodeHint(code: ValidationReasonCode): string {
  switch (code) {
    case 'inferred_value':
      return 'Tip: suggested values come from your route or duty-day context.';
    case 'suspicious_code':
      return 'Tip: compare with your screenshot if unsure.';
    default:
      return '';
  }
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 4 },
  triggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  panelReview: {
    backgroundColor: '#FFFBF5',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  panelMiss: {
    backgroundColor: '#FFFBFB',
    borderColor: 'rgba(248, 113, 113, 0.45)',
  },
  triggerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  triggerText: { fontSize: 13, color: FC.text, flex: 1 },
  triggerStrong: { fontWeight: '700' },
  triggerHint: { fontSize: 12, fontWeight: '700', color: FC.accent },
  panelBody: {
    marginTop: 6,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderTopWidth: 0,
  },
  reason: { fontSize: 14, color: FC.text, lineHeight: 20, fontWeight: '500' },
  metaHint: { fontSize: 12, color: FC.textMuted, marginTop: 8, lineHeight: 17 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: FC.card,
    borderWidth: 1,
    borderColor: FC.border,
  },
  chipText: { fontSize: 14, fontWeight: '700', color: FC.accent },
  manualHint: { fontSize: 12, color: FC.textMuted, marginTop: 12, lineHeight: 17 },
  thanks: { fontSize: 12, color: FC.good, marginTop: 10, fontWeight: '600' },
  feedbackBtn: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 6 },
  feedbackBtnText: { fontSize: 13, fontWeight: '700', color: FC.textMuted },
  feedModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  feedModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  feedModalSheet: {
    backgroundColor: FC.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  feedTitle: { fontSize: 17, fontWeight: '800', color: FC.text },
  feedSubtitle: { fontSize: 13, color: FC.textMuted, marginBottom: 12 },
  feedOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: FC.border,
    marginBottom: 8,
  },
  feedOptionOn: { borderColor: FC.accent, backgroundColor: '#FFF5F5' },
  feedOptionText: { fontSize: 15, color: FC.text, fontWeight: '600' },
  feedNote: {
    borderWidth: 1,
    borderColor: FC.border,
    borderRadius: 10,
    padding: 10,
    minHeight: 64,
    fontSize: 14,
    color: FC.text,
    marginTop: 8,
    marginBottom: 12,
    textAlignVertical: 'top',
  },
  feedActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, alignItems: 'center' },
  feedCancel: { paddingVertical: 10 },
  feedCancelText: { fontSize: 16, fontWeight: '700', color: FC.textMuted },
  feedSend: { backgroundColor: FC.accent, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  feedSendDisabled: { opacity: 0.45 },
  feedSendText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  refRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  refBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: FC.border,
    backgroundColor: FC.card,
  },
  refBtnText: { fontSize: 13, fontWeight: '700', color: FC.accent },
  scanModalSheet: {
    backgroundColor: FC.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  scanScroll: {
    borderWidth: 1,
    borderColor: FC.border,
    borderRadius: 10,
    maxHeight: 360,
    marginBottom: 8,
  },
  scanBody: {
    padding: 12,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: FC.text,
    lineHeight: 16,
  },
});
