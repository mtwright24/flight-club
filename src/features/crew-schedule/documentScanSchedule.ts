/**
 * Live document scan (iOS VisionKit–style / Android ML Kit) for schedule import.
 * Requires a dev/native build with `react-native-document-scanner-plugin` — not available in Expo Go.
 * The package calls `TurboModuleRegistry.getEnforcing('DocumentScanner')` at import time; we must not
 * load it in environments where the native module is absent (otherwise the app throws on import).
 */

import Constants, { ExecutionEnvironment } from 'expo-constants';

/** Expo Go (`StoreClient`) and other hosts without the scanner native binary must skip `import()`. */
function documentScannerNativeModuleAbsent(): boolean {
  try {
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      return true;
    }
    // Deprecated but still set on older runtimes
    if (Constants.appOwnership === 'expo') {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Normalize native scanner output to a `file://` URI `expo-file-system` / `fetch` can read. */
export function normalizeScannerFilePath(path: string): string {
  const t = path.trim();
  if (!t) return t;
  if (t.startsWith('file://')) return t;
  if (t.startsWith('/')) return `file://${t}`;
  return t;
}

export type ScheduleDocumentScanResult =
  | { kind: 'ok'; filePaths: string[]; pageCount: number }
  | { kind: 'cancel' }
  | { kind: 'unavailable'; reason: 'module' | 'runtime' };

/**
 * Presents the system document scanner (edge detection, crop, perspective), returns cleaned page images.
 */
export async function scanScheduleDocuments(): Promise<ScheduleDocumentScanResult> {
  if (documentScannerNativeModuleAbsent()) {
    return { kind: 'unavailable', reason: 'module' };
  }
  try {
    const mod = await import('react-native-document-scanner-plugin');
    const DocumentScanner = mod.default;
    const { ResponseType, ScanDocumentResponseStatus } = mod;

    const res = await DocumentScanner.scanDocument({
      croppedImageQuality: 100,
      maxNumDocuments: 8,
      responseType: ResponseType.ImageFilePath,
    });

    if (res.status === ScanDocumentResponseStatus.Cancel) {
      return { kind: 'cancel' };
    }
    const raw = res.scannedImages ?? [];
    const filePaths = raw.map(normalizeScannerFilePath).filter(Boolean);
    if (!filePaths.length) {
      return { kind: 'cancel' };
    }
    return { kind: 'ok', filePaths, pageCount: filePaths.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      /Cannot find native module|TurboModule|null is not an object|doesn't exist|could not be found|Invariant Violation/i.test(
        msg
      )
    ) {
      return { kind: 'unavailable', reason: 'module' };
    }
    return { kind: 'unavailable', reason: 'runtime' };
  }
}
