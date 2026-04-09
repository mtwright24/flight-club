export type ParsedTrackerQuery =
  | { kind: 'flight'; ident: string }
  | { kind: 'route'; origin: string; destination: string }
  | { kind: 'airport'; airportCode: string };

export function parseTrackerQuery(rawInput: string): ParsedTrackerQuery {
  const raw = String(rawInput || '').trim().toUpperCase();
  const normalized = raw.replace(/\s+/g, ' ');
  const routeMatch = normalized.match(/^([A-Z]{3})\s*(?:TO|[-/])\s*([A-Z]{3})$/);
  if (routeMatch) {
    return { kind: 'route', origin: routeMatch[1], destination: routeMatch[2] };
  }
  if (/^[A-Z]{3}$/.test(normalized)) {
    return { kind: 'airport', airportCode: normalized };
  }
  const identCompact = normalized.replace(/\s+/g, '');
  const identMatch = identCompact.match(/^([A-Z0-9]{2,3})(\d{1,4}[A-Z]?)$/);
  if (identMatch) {
    return { kind: 'flight', ident: `${identMatch[1]}${identMatch[2]}` };
  }
  return { kind: 'flight', ident: identCompact };
}
