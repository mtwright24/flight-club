/**
 * Shared image → Uint8Array for schedule-import storage uploads (Expo).
 */
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';

function bytesFromBase64(base64: string): Uint8Array {
  const cleaned = base64
    .replace(/^data:.*;base64,/i, '')
    .replace(/\s/g, '');
  if (!cleaned.length) return new Uint8Array(0);
  let padded = cleaned;
  while (padded.length % 4 !== 0) padded += '=';
  try {
    const binary = globalThis.atob(padded);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return new Uint8Array(0);
  }
}

async function readLocalUriAsBytes(uri: string, mimeType: string | undefined): Promise<Uint8Array> {
  try {
    const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
    if (!base64?.length) throw new Error('empty base64');
    const decoded = bytesFromBase64(base64);
    if (decoded.length === 0) throw new Error('empty base64 decode');
    return decoded;
  } catch {
    const res = await fetch(uri);
    const ab = await res.arrayBuffer();
    const bytes = new Uint8Array(ab);
    if (bytes.length === 0) throw new Error('Could not read file (empty).');
    return bytes;
  }
}

export async function buildScheduleUploadBytes(
  uri: string,
  mime: string | undefined,
  jpegBase64: string | null | undefined
): Promise<Uint8Array> {
  if (jpegBase64 && jpegBase64.length > 0) {
    const bytes = bytesFromBase64(jpegBase64);
    if (bytes.length > 0) return bytes;
  }
  return readLocalUriAsBytes(uri, mime);
}
