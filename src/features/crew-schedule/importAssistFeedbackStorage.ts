/**
 * Persist which JetBlue import assist fields already received feedback ("Thanks" state) per pairing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@flight_club/import_assist_feedback_done_v1/';

export async function loadAssistFeedbackDoneForPairing(pairingId: string): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(`${PREFIX}${pairingId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v === true) out[k] = true;
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveAssistFeedbackDoneForPairing(
  pairingId: string,
  map: Record<string, boolean>
): Promise<void> {
  try {
    await AsyncStorage.setItem(`${PREFIX}${pairingId}`, JSON.stringify(map));
  } catch {
    /* non-blocking */
  }
}
