/**
 * Supabase/postgrest failures are often plain objects `{ message, code, details, hint }`,
 * not Error instances — `String(that)` is `[object Object]`. Use this for user-visible text.
 */
export function formatUnknownError(e: unknown): string {
  if (e == null) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message || String(e.name) || 'Error';
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message.length > 0) {
      const code = typeof o.code === 'string' && o.code ? ` [${o.code}]` : '';
      const hint = typeof o.hint === 'string' && o.hint ? ` ${o.hint}` : '';
      const details = typeof o.details === 'string' && o.details ? ` (${o.details})` : '';
      return `${o.message}${code}${details}${hint}`;
    }
    if (typeof o.error_description === 'string') return o.error_description;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return '[Unserializable error]';
  }
}
