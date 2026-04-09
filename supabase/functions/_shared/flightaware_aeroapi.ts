import type { Json } from './normalize.ts';

export async function fetchProviderJson(
  baseUrl: string,
  apiKey: string,
  path: string,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const url = `${baseUrl}/${path.replace(/^\/+/, '')}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'x-apikey': apiKey,
    },
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

export function firstProviderFlight(payload: unknown): Json | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Json;
  const arr = (Array.isArray(p.flights) ? p.flights : Array.isArray(p.data) ? p.data : []) as Json[];
  if (!arr.length) return null;
  return arr[0];
}

export function compact(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

export function parseDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function buildFlightKey(args: {
  airlineCode: string;
  flightNumber: string;
  serviceDate: string;
  origin?: string | null;
  destination?: string | null;
}): string {
  const airline = args.airlineCode.trim().toUpperCase();
  const flight = args.flightNumber.trim().toUpperCase();
  const date = args.serviceDate.trim();
  const origin = (args.origin || 'UNK').trim().toUpperCase();
  const destination = (args.destination || 'UNK').trim().toUpperCase();
  return `${airline}-${flight}-${date}-${origin}-${destination}`;
}
