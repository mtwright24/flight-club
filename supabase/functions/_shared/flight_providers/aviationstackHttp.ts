import { getAviationstackApiKey, getAviationstackBaseUrl } from '../env.ts';

export type AviationstackJsonResponse = {
  pagination?: { limit?: number; offset?: number; count?: number; total?: number };
  data?: unknown[];
  error?: { code?: string; message?: string };
};

/**
 * GET JSON from Aviationstack. Auth is `access_key` query param only (no headers).
 * Never logs URLs or secrets.
 */
export async function aviationstackGet(
  endpoint: 'flights' | 'routes',
  params: Record<string, string | number | undefined>,
): Promise<{ ok: boolean; status: number; body: AviationstackJsonResponse }> {
  const key = getAviationstackApiKey();
  if (!key) {
    throw new Error('Missing AVIATIONSTACK_API_KEY');
  }
  const base = getAviationstackBaseUrl();
  const url = new URL(`${base}/${endpoint}`);
  url.searchParams.set('access_key', key);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    url.searchParams.set(k, String(v));
  }

  const safeLogTarget = `${endpoint}?…`; // no query string in logs
  let res = await fetch(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } });
  let body: AviationstackJsonResponse = {};
  try {
    body = (await res.json()) as AviationstackJsonResponse;
  } catch {
    body = {};
  }

  // Free tier: HTTPS often returns 403 (sometimes without JSON `error.code`) — retry once over plain HTTP.
  if (!res.ok && res.status === 403 && url.protocol === 'https:') {
    const httpUrl = new URL(url.toString());
    httpUrl.protocol = 'http:';
    res = await fetch(httpUrl.toString(), { method: 'GET', headers: { Accept: 'application/json' } });
    try {
      body = (await res.json()) as AviationstackJsonResponse;
    } catch {
      body = {};
    }
  }

  if (!res.ok) {
    console.warn('[aviationstack]', safeLogTarget, 'http', res.status);
  } else if (body.error) {
    console.warn('[aviationstack]', safeLogTarget, 'api_error', body.error.code ?? '', body.error.message ?? '');
  }

  return { ok: res.ok, status: res.status, body };
}

export function firstFlightRow(body: AviationstackJsonResponse): Record<string, unknown> | null {
  const arr = Array.isArray(body.data) ? body.data : [];
  const row = arr[0];
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
}

export function allFlightRows(body: AviationstackJsonResponse): Record<string, unknown>[] {
  const arr = Array.isArray(body.data) ? body.data : [];
  return arr.filter((r): r is Record<string, unknown> => r && typeof r === 'object');
}

/** True when Aviationstack rejects filtered queries (free tier) or HTTPS (use HTTP fallback or unfiltered request). */
export function isAviationstackPlanRestrictedError(res: { body: AviationstackJsonResponse }): boolean {
  const code = res.body.error?.code;
  return code === 'function_access_restricted' || code === 'https_access_restricted';
}

/**
 * Use a second request with only `access_key` (global sample) when:
 * - API returns `function_access_restricted` / `https_access_restricted` in JSON, or
 * - bare HTTP 403 (common with WAF / edge when body is empty or non-JSON).
 */
export function shouldTryAviationstackUnfilteredFallback(res: {
  ok: boolean;
  status: number;
  body: AviationstackJsonResponse;
}): boolean {
  if (isAviationstackPlanRestrictedError(res)) return true;
  if (!res.ok && res.status === 403) return true;
  return false;
}

/** Turn HTTP / API error payloads into thrown errors so we do not show empty results when the provider failed. */
export function throwIfAviationstackFailed(
  res: { ok: boolean; status: number; body: AviationstackJsonResponse },
  context: string,
): void {
  if (!res.ok) {
    const e = res.body.error;
    if (e?.code || e?.message) {
      throw new Error(`Aviationstack: ${[e.code, e.message].filter(Boolean).join(' — ')} (${context})`);
    }
    throw new Error(`Aviationstack HTTP ${res.status} (${context})`);
  }
  if (res.body.error) {
    const e = res.body.error;
    const detail = [e.code, e.message].filter(Boolean).join(' ');
    throw new Error(detail ? `Aviationstack: ${detail}` : `Aviationstack API error (${context})`);
  }
}
