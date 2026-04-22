import { Redirect } from 'expo-router';

/**
 * Legacy route: FLICA import now lives at `import-flica-direct` (no JetBlue-only gate, no upload picker).
 */
export default function ImportJetBlueSourceRedirect() {
  return <Redirect href="/crew-schedule/import-flica-direct" />;
}
