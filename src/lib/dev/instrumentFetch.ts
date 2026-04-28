/**
 * Dev-only: log failing network calls (non-transient only).
 * - Wraps `global.fetch` (must load before @supabase/supabase-js init — use root `index.js` import order).
 * - Hooks `XHR` (whatwg-fetch / RN): dedupe + suppress noisy offline / status-0 failures.
 * Does not touch FLICA integration code.
 */
const g = globalThis as typeof globalThis & { __fc_net_instrumented?: boolean };

function isTransientRnNetworkFailure(e: unknown): boolean {
  return e instanceof TypeError && String(e.message ?? '').includes('Network request failed');
}

const netLogDedupe = new Map<string, number>();
const NET_LOG_DEDUPE_MS = 1600;
function shouldLogNetUrl(url: string): boolean {
  const now = Date.now();
  const prev = netLogDedupe.get(url);
  if (prev != null && now - prev < NET_LOG_DEDUPE_MS) return false;
  netLogDedupe.set(url, now);
  return true;
}

if (typeof __DEV__ !== 'undefined' && __DEV__ && !g.__fc_net_instrumented) {
  g.__fc_net_instrumented = true;

  if (typeof g.fetch === 'function') {
    const orig = g.fetch.bind(g) as typeof fetch;

    function urlFromInput(input: RequestInfo | URL): string {
      try {
        if (typeof input === 'string') return input;
        if (input instanceof URL) return input.href;
        if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
      } catch {
        /* fall through */
      }
      return String(input);
    }

    g.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = urlFromInput(input);
      try {
        return await orig(input, init);
      } catch (e) {
        /** RN offline / transient: avoid double-scream with XHR; callers still throw. */
        if (isTransientRnNetworkFailure(e)) {
          throw e;
        }
        if (shouldLogNetUrl(url)) {
          console.warn('[dev][fetch:failed]', url, e);
        }
        throw e;
      }
    };
  }

  if (g.XMLHttpRequest) {
    const P = g.XMLHttpRequest.prototype as XMLHttpRequest & { __fc_url?: string };
    const open = P.open;
    const send = P.send;
    P.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      (this as XMLHttpRequest & { __fc_url?: string }).__fc_url = typeof url === 'string' ? url : url.href;
      return (open as (...a: unknown[]) => void).apply(this, [method, url, ...rest] as never);
    };
    P.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null | undefined) {
      this.addEventListener('error', () => {
        const xhr = this as XMLHttpRequest;
        /** Network / offline / paired with whatwg-fetch — same request often logs fetch + XHR; stay quiet for status 0. */
        if ((xhr.status ?? 0) === 0) return;
        const u =
          (xhr as XMLHttpRequest & { __fc_url?: string }).__fc_url || xhr.responseURL || '(unknown XHR url)';
        if (shouldLogNetUrl(u)) {
          console.warn('[dev][xhr:error]', u);
        }
      });
      return send.call(this, body);
    };
  }
}

export {};
