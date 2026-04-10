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
  const res = await fetch(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } });
  let body: AviationstackJsonResponse = {};
  try {
    body = (await res.json()) as AviationstackJsonResponse;
  } catch {
    body = {};
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
