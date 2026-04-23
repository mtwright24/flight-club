/**
 * Dev-only: log failing network calls.
 * - Wraps `global.fetch` (must load before @supabase/supabase-js init — use root `index.js` import order).
 * - Hooks `XMLHttpRequest` (whatwg-fetch / RN use XHR; some failures only surface here).
 * Does not touch FLICA integration code.
 */
const g = globalThis as typeof globalThis & { __fc_net_instrumented?: boolean };
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
        console.error('[dev][fetch:failed] URL =', url, '|', e);
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
        const u =
          (this as XMLHttpRequest & { __fc_url?: string }).__fc_url ||
          (this as XMLHttpRequest).responseURL ||
          '(unknown XHR url)';
        console.error('[dev][xhr:error] URL =', u);
      });
      return send.call(this, body);
    };
  }
}

export {};
