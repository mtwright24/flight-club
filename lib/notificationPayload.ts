/** Parse `notifications.data` JSON — no dependency on `notifications.ts` / routing (avoids require cycles). */
export function parseNotificationData(n: { data?: unknown }): Record<string, unknown> {
  const d = n.data;
  if (d == null) return {};
  if (typeof d === 'string') {
    try {
      const parsed = JSON.parse(d) as unknown;
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof d === 'object') return d as Record<string, unknown>;
  return {};
}
