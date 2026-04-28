/**
 * Wraps the platform `fetch` with limited retries for transient failures (common on RN:
 * `TypeError: Network request failed`). Used as Supabase `global.fetch` only — does not
 * change import/upload code paths that use `fetch` directly.
 *
 * Retries: only on thrown network errors (not HTTP 4xx/5xx bodies). Aborted requests are never retried.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNetworkThrow(e: unknown): boolean {
  if (!(e instanceof TypeError)) return false;
  const m = String(e.message ?? '');
  return m.includes('Network request failed') || m.includes('Failed to fetch') || m.includes('Load failed');
}

export type ResilientFetchOptions = {
  /** Max attempts including the first try (default 3). */
  maxAttempts?: number;
  /** Base backoff in ms before the second attempt (default 350). */
  baseDelayMs?: number;
  /** Cap per-wait delay (default 5000). */
  maxDelayMs?: number;
};

export function createResilientFetch(
  baseFetch: typeof fetch,
  opts: ResilientFetchOptions = {},
): typeof fetch {
  const maxAttempts = Math.max(1, Math.min(6, opts.maxAttempts ?? 3));
  const baseDelayMs = opts.baseDelayMs ?? 350;
  const maxDelayMs = opts.maxDelayMs ?? 5000;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (init?.signal?.aborted) {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      }
      try {
        return await baseFetch(input, init);
      } catch (e) {
        lastError = e;
        if (init?.signal?.aborted) throw e;
        if (!isTransientNetworkThrow(e) || attempt === maxAttempts - 1) {
          throw e;
        }
        const delay = Math.min(maxDelayMs, Math.round(baseDelayMs * 2 ** attempt));
        await sleep(delay);
      }
    }
    throw lastError;
  };
}

/** Default Supabase-bound fetch: three quick retries on transient RN network errors. */
export const resilientFetch: typeof fetch = createResilientFetch(
  typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : fetch,
  { maxAttempts: 3, baseDelayMs: 350, maxDelayMs: 5000 },
);
