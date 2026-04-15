/**
 * Lightweight local queue for import field feedback (quiet submit — no heavy tracking pipeline required).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@flight_club/import_field_feedback_queue_v1';

export type ImportFieldFeedbackOption =
  | 'suggestion_wrong'
  | 'missed_visible'
  | 'should_not_flag'
  | 'manual_entry'
  | 'other';

export type ImportFieldFeedbackPayload = {
  id: string;
  pairingId?: string;
  batchId?: string;
  legId?: string;
  fieldScope: 'pairing' | 'leg';
  fieldKey: string;
  option: ImportFieldFeedbackOption;
  note?: string;
  createdAt: string;
};

export const FEEDBACK_OPTION_LABEL: Record<ImportFieldFeedbackOption, string> = {
  suggestion_wrong: 'Suggestion was wrong',
  missed_visible: 'App missed a visible value',
  should_not_flag: 'This should not have been flagged',
  manual_entry: 'I fixed it manually',
  other: 'Other',
};

export async function queueImportFieldFeedback(payload: ImportFieldFeedbackPayload): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const list: ImportFieldFeedbackPayload[] = raw ? (JSON.parse(raw) as ImportFieldFeedbackPayload[]) : [];
    list.push(payload);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-200)));
  } catch {
    /* non-blocking */
  }
}
