/**
 * Staff Loads marketplace — requests, locks, answers, wallet RPCs, timeline.
 *
 * Push / inbox types for server-triggered notifications (see `lib/notificationRegistry.ts`):
 * `staff_loads_request_answered`, `staff_loads_request_loads_updated`, `staff_loads_request_status`,
 * `staff_loads_request_refresh`, `staff_loads_lock_expiring` — use `entity_id` = `load_requests.id`.
 */

import { supabase } from '../supabaseClient';
import type { NonRevLoadFlight } from './loads';

export type StaffRequestKind = 'standard' | 'priority';
export type StaffRequestStatus = 'open' | 'answered' | 'closed' | 'stale';

export type StaffLoadSearchOptions = {
  allowStops: boolean;
  maxStops: 0 | 1 | 2;
  nearbyDepartureAirports: boolean;
  nearbyArrivalAirports: boolean;
};

export const defaultStaffLoadSearchOptions = (): StaffLoadSearchOptions => ({
  allowStops: false,
  maxStops: 0,
  nearbyDepartureAirports: false,
  nearbyArrivalAirports: false,
});

export type StaffLoadRequestRow = {
  id: string;
  user_id: string;
  airline_code: string;
  flight_number: string | null;
  from_airport: string;
  to_airport: string;
  travel_date: string;
  depart_at: string | null;
  arrive_at: string | null;
  aircraft_type: string | null;
  flight_id: string | null;
  request_kind: StaffRequestKind;
  status: StaffRequestStatus;
  locked_by: string | null;
  locked_at: string | null;
  lock_expires_at: string | null;
  latest_answer_at: string | null;
  priority_upgraded_at: string | null;
  refresh_requested_at: string | null;
  enable_status_updates: boolean;
  enable_auto_updates: boolean;
  pinned: boolean;
  search_snapshot: Record<string, unknown> | null;
  options: unknown;
  created_at: string;
  requester?: { display_name: string | null; avatar_url: string | null };
  /** Latest community answer load level (joined client-side for list accent strips). */
  latest_answer_load_level?: string | null;
  /** Latest answer seat snapshot (joined client-side for strip color + tile preview). */
  latest_answer_open_seats_total?: number | null;
  latest_answer_nonrev_listed_total?: number | null;
};

export type StaffRequestCommentRow = {
  id: string;
  request_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  author?: { display_name: string | null };
};

export type StaffRequestStatusUpdateRow = {
  id: string;
  request_id: string;
  user_id: string;
  kind: 'gate_change' | 'terminal' | 'flight_status' | 'dep_arr' | 'ops_note';
  title: string | null;
  body: string;
  metadata: Record<string, unknown>;
  created_at: string;
  author?: { display_name: string | null };
};

export type StaffInaccuracyReportRow = {
  id: string;
  request_id: string;
  answer_id: string;
  reporter_user_id: string;
  reason: string | null;
  created_at: string;
  reporter?: { display_name: string | null };
};

export type StaffActivityFilter = 'all' | 'comments' | 'loads' | 'status';

export type StaffActivityItem =
  | {
      source: 'comment';
      id: string;
      created_at: string;
      body: string;
      user_id: string;
      author?: { display_name: string | null };
    }
  | {
      source: 'status_update';
      id: string;
      created_at: string;
      kind: StaffRequestStatusUpdateRow['kind'];
      title: string | null;
      body: string;
      user_id: string;
      author?: { display_name: string | null };
    }
  | { source: 'timeline'; row: StaffTimelineRow };

function activityItemTime(it: StaffActivityItem): number {
  if (it.source === 'timeline') return new Date(it.row.created_at).getTime();
  return new Date(it.created_at).getTime();
}

/** Merge comments, structured status updates, and timeline (excludes migrated-out legacy comment rows). */
export function buildStaffRequestActivity(
  comments: StaffRequestCommentRow[],
  statusUpdates: StaffRequestStatusUpdateRow[],
  timeline: StaffTimelineRow[]
): StaffActivityItem[] {
  const items: StaffActivityItem[] = [];
  for (const c of comments) {
    if (c.deleted_at) continue;
    items.push({
      source: 'comment',
      id: c.id,
      created_at: c.created_at,
      body: c.body,
      user_id: c.user_id,
      author: c.author,
    });
  }
  for (const s of statusUpdates) {
    items.push({
      source: 'status_update',
      id: s.id,
      created_at: s.created_at,
      kind: s.kind,
      title: s.title,
      body: s.body,
      user_id: s.user_id,
      author: s.author,
    });
  }
  for (const t of timeline) {
    items.push({ source: 'timeline', row: t });
  }
  items.sort((a, b) => activityItemTime(b) - activityItemTime(a));
  return items;
}

export function filterStaffRequestActivity(items: StaffActivityItem[], filter: StaffActivityFilter): StaffActivityItem[] {
  if (filter === 'all') return items;
  return items.filter((it) => {
    if (filter === 'comments') return it.source === 'comment';
    if (filter === 'loads') {
      if (it.source === 'timeline') {
        const et = it.row.event_type;
        return et === 'answer' || et === 'loads_update';
      }
      return false;
    }
    if (filter === 'status') {
      if (it.source === 'status_update') return true;
      if (it.source === 'timeline') {
        const et = it.row.event_type;
        return (
          et === 'status_update' ||
          et === 'gate_change' ||
          et === 'refresh_requested' ||
          et === 'report_inaccurate'
        );
      }
      return false;
    }
    return true;
  });
}

export type StaffTimelineRow = {
  id: string;
  request_id: string;
  actor_user_id: string | null;
  event_type: string;
  title: string | null;
  body: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: { display_name: string | null };
};

export type StaffAnswerRow = {
  id: string;
  request_id: string;
  user_id: string;
  load_level: string;
  notes: string | null;
  as_of: string;
  created_at: string;
  open_seats_total: number | null;
  open_seats_by_cabin: Record<string, number> | null;
  nonrev_listed_total: number | null;
  nonrev_by_cabin: Record<string, number> | null;
  answer_source?: string | null;
  is_latest?: boolean | null;
  responder?: { display_name: string | null };
};

export type NonrevFlightReportSummary = {
  count: number;
  recent: { status: string; created_at: string }[];
};

export async function getNonrevReportSummaryForFlight(flightId: string): Promise<NonrevFlightReportSummary> {
  const { data, error } = await supabase
    .from('nonrev_load_reports')
    .select('status, created_at')
    .eq('flight_id', flightId)
    .order('created_at', { ascending: false })
    .limit(15);
  if (error) return { count: 0, recent: [] };
  const rows = (data || []) as { status: string; created_at: string }[];
  return {
    count: rows.length,
    recent: rows.map((r) => ({ status: r.status, created_at: r.created_at })),
  };
}

/** Pretty-print jsonb cabin maps from answers (keys: first, business, main, …). */
export function staffLoadsCabinEntries(
  by: Record<string, unknown> | null | undefined
): { key: string; value: number }[] {
  if (!by || typeof by !== 'object') return [];
  return Object.entries(by)
    .map(([key, raw]) => ({ key, value: typeof raw === 'number' ? raw : Number(raw) || 0 }))
    .filter((x) => x.value > 0)
    .sort((a, b) => a.key.localeCompare(b.key));
}

export async function getStaffWalletSummary(userId: string): Promise<{
  standardCredits: number;
  priorityPool: number;
  myOpenRequestCount: number;
}> {
  const [{ data: uc }, { count }] = await Promise.all([
    supabase.from('user_credits').select('balance, priority_balance').eq('user_id', userId).maybeSingle(),
    supabase
      .from('load_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['open', 'stale']),
  ]);
  return {
    standardCredits: uc?.balance ?? 0,
    priorityPool: uc?.priority_balance ?? 0,
    myOpenRequestCount: count ?? 0,
  };
}

async function attachProfiles<T extends { user_id: string }>(rows: T[]): Promise<(T & { requester?: { display_name: string | null; avatar_url: string | null } })[]> {
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  if (!ids.length) return rows as any;
  const { data: profs } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', ids);
  const map = Object.fromEntries((profs || []).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, requester: map[r.user_id] }));
}

function deriveLatestAnswerOpenSeats(a: {
  open_seats_total: number | null;
  open_seats_by_cabin: Record<string, number> | null;
}): number | null {
  if (a.open_seats_total != null && !Number.isNaN(Number(a.open_seats_total))) {
    return Math.max(0, Number(a.open_seats_total));
  }
  const by = a.open_seats_by_cabin;
  if (by && typeof by === 'object') {
    const s = Object.values(by).reduce((acc, v) => acc + (typeof v === 'number' && !Number.isNaN(v) ? v : 0), 0);
    if (s > 0) return s;
  }
  return null;
}

/** Join latest `load_answers` row per request: load level + seat counts for strips and tile previews. */
export async function attachLatestAnswerLoadLevels(rows: StaffLoadRequestRow[]): Promise<StaffLoadRequestRow[]> {
  const ids = rows.filter((r) => r.status === 'answered').map((r) => r.id);
  if (!ids.length) return rows;
  const { data, error } = await supabase
    .from('load_answers')
    .select('request_id, load_level, open_seats_total, open_seats_by_cabin, nonrev_listed_total')
    .in('request_id', ids)
    .eq('is_latest', true);
  if (error || !data?.length) return rows;
  type Ans = {
    request_id: string;
    load_level: string;
    open_seats_total: number | null;
    open_seats_by_cabin: Record<string, number> | null;
    nonrev_listed_total: number | null;
  };
  const map = Object.fromEntries(
    (data as Ans[]).map((a) => {
      const o = deriveLatestAnswerOpenSeats(a);
      const n = a.nonrev_listed_total != null && !Number.isNaN(Number(a.nonrev_listed_total)) ? Number(a.nonrev_listed_total) : null;
      return [
        a.request_id,
        { load_level: a.load_level, open: o, listed: n },
      ];
    })
  );
  return rows.map((r) => {
    if (r.status !== 'answered') return r;
    const x = map[r.id] as { load_level: string; open: number | null; listed: number | null } | undefined;
    if (!x) return r;
    return {
      ...r,
      latest_answer_load_level: x.load_level ?? null,
      latest_answer_open_seats_total: x.open,
      latest_answer_nonrev_listed_total: x.listed,
    };
  });
}

export type StaffLoadRequestListTab = 'open' | 'answered';

export async function listStaffLoadRequests(tab: StaffLoadRequestListTab): Promise<{
  data: StaffLoadRequestRow[];
  error?: string;
}> {
  const { data: rpcRows, error: rpcError } = await supabase.rpc('rpc_staff_loads_list_requests', { p_tab: tab });
  if (rpcError) {
    return {
      data: [],
      error:
        rpcError.message ||
        'rpc_staff_loads_list_requests failed. Apply migrations (e.g. npx supabase db push) so Staff Loads request lists stay permission-safe.',
    };
  }
  if (!Array.isArray(rpcRows)) {
    return {
      data: [],
      error: 'Unexpected response from rpc_staff_loads_list_requests. Apply latest Supabase migrations.',
    };
  }
  const withP = await attachProfiles((rpcRows || []) as { user_id: string }[]);
  const withLevels = await attachLatestAnswerLoadLevels(withP as StaffLoadRequestRow[]);
  return { data: withLevels };
}

export async function getStaffLoadRequestDetail(requestId: string): Promise<{
  request: StaffLoadRequestRow | null;
  flight: NonRevLoadFlight | null;
  timeline: StaffTimelineRow[];
  answers: StaffAnswerRow[];
  comments: StaffRequestCommentRow[];
  statusUpdates: StaffRequestStatusUpdateRow[];
  inaccuracyReports: StaffInaccuracyReportRow[];
  lockHolderDisplayName?: string | null;
  reportSummary?: NonrevFlightReportSummary | null;
  error?: string;
}> {
  const { data: req, error: e1 } = await supabase.from('load_requests').select('*').eq('id', requestId).maybeSingle();
  if (e1 || !req) {
    return {
      request: null,
      flight: null,
      timeline: [],
      answers: [],
      comments: [],
      statusUpdates: [],
      inaccuracyReports: [],
      reportSummary: null,
      error: e1?.message || 'Not found',
    };
  }

  const merged = await attachProfiles([req as { user_id: string }]);
  const raw = merged[0] as StaffLoadRequestRow & { refresh_requested_at?: string | null };
  const row: StaffLoadRequestRow = {
    ...raw,
    refresh_requested_at: raw.refresh_requested_at ?? null,
  };

  let lockHolderDisplayName: string | null = null;
  if (row.locked_by) {
    const { data: lp } = await supabase.from('profiles').select('display_name').eq('id', row.locked_by).maybeSingle();
    lockHolderDisplayName = lp?.display_name ?? null;
  }
  let flight: NonRevLoadFlight | null = null;
  let reportSummary: NonrevFlightReportSummary | null = null;
  if (row.flight_id) {
    const [{ data: f }, rep] = await Promise.all([
      supabase.from('nonrev_load_flights').select('*').eq('id', row.flight_id).maybeSingle(),
      getNonrevReportSummaryForFlight(row.flight_id),
    ]);
    flight = (f as NonRevLoadFlight) || null;
    reportSummary = rep.count > 0 ? rep : null;
  }

  const [{ data: tl }, { data: ans }, { data: com }, { data: su }, { data: ir }] = await Promise.all([
    supabase.from('load_request_timeline').select('*').eq('request_id', requestId).order('created_at', { ascending: false }).limit(100),
    supabase
      .from('load_answers')
      .select('*')
      .eq('request_id', requestId)
      .order('is_latest', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('load_request_comments')
      .select('*')
      .eq('request_id', requestId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('load_request_status_updates')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('load_answer_inaccuracy_reports')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const tlRows = tl || [];
  const ansRows = ans || [];
  const comRows = (com || []) as StaffRequestCommentRow[];
  const suRows = (su || []) as StaffRequestStatusUpdateRow[];
  const irRows = (ir || []) as StaffInaccuracyReportRow[];

  const actorIds = [...new Set(tlRows.map((t: any) => t.actor_user_id).filter(Boolean))];
  const respIds = [...new Set(ansRows.map((a: any) => a.user_id).filter(Boolean))];
  const commentUserIds = [...new Set(comRows.map((c) => c.user_id).filter(Boolean))];
  const statusUserIds = [...new Set(suRows.map((s) => s.user_id).filter(Boolean))];
  const reportUserIds = [...new Set(irRows.map((r) => r.reporter_user_id).filter(Boolean))];
  const allIds = [...new Set([...actorIds, ...respIds, ...commentUserIds, ...statusUserIds, ...reportUserIds])];
  const { data: profs } = allIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', allIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const pmap = Object.fromEntries((profs || []).map((p) => [p.id, p.display_name]));
  const timeline = tlRows.map((t: any) => ({
    ...t,
    actor: t.actor_user_id ? { display_name: pmap[t.actor_user_id] ?? null } : undefined,
  })) as StaffTimelineRow[];
  const answers = ansRows.map((a: any) => ({
    ...a,
    responder: { display_name: pmap[a.user_id] ?? null },
  })) as StaffAnswerRow[];
  const comments = comRows.map((c) => ({
    ...c,
    author: { display_name: pmap[c.user_id] ?? null },
  }));
  const statusUpdates = suRows.map((s) => ({
    ...s,
    author: { display_name: pmap[s.user_id] ?? null },
  }));
  const inaccuracyReports = irRows.map((r) => ({
    ...r,
    reporter: { display_name: pmap[r.reporter_user_id] ?? null },
  }));

  return {
    request: row,
    flight,
    timeline,
    answers,
    comments,
    statusUpdates,
    inaccuracyReports,
    lockHolderDisplayName,
    reportSummary,
  };
}

export async function markStaffLoadRequestStale(requestId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('rpc_staff_loads_mark_stale', { p_request_id: requestId });
  if (error) return { ok: false, error: error.message };
  const j = data as { ok?: boolean; error?: string };
  if (!j?.ok) return { ok: false, error: (j as any)?.error };
  return { ok: true };
}

export async function reopenStaleStaffLoadRequest(requestId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('rpc_staff_loads_reopen_stale', { p_request_id: requestId });
  if (error) return { ok: false, error: error.message };
  const j = data as { ok?: boolean; error?: string };
  if (!j?.ok) return { ok: false, error: (j as any)?.error };
  return { ok: true };
}

/** Legacy Marsha demo user id; DB also allows `marcus.wrightllc@gmail.com` for reseed RPC. */
export const MARSHA_DEMO_USER_ID = '85f152bb-4b50-44c6-9f31-74f5906abb38';

const MARSHA_DEMO_EMAIL = 'marcus.wrightllc@gmail.com';

function normalizeDemoEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/** True when signed in as Marsha demo (email or legacy UUID). Matches `rpc_staff_loads_dev_reseed_demos`. */
export function isMarshaDemoUser(
  userId: string | null | undefined,
  email?: string | null | undefined
): boolean {
  if (normalizeDemoEmail(email) === MARSHA_DEMO_EMAIL) return true;
  return !!userId && userId === MARSHA_DEMO_USER_ID;
}

/** Dev: re-apply `staff_loads_reseed_demos` (Marsha session only; RPC enforces server-side). */
export async function devReseedStaffLoadsDemoFixtures(): Promise<{
  ok: boolean;
  error?: string;
  result?: Record<string, unknown>;
}> {
  const { data, error } = await supabase.rpc('rpc_staff_loads_dev_reseed_demos');
  if (error) return { ok: false, error: error.message };
  return { ok: true, result: (data as Record<string, unknown>) || {} };
}

export function flightToRequestPayload(
  f: NonRevLoadFlight,
  kind: StaffRequestKind,
  searchSnapshot: StaffLoadSearchOptions
): Record<string, unknown> {
  return {
    flight_id: f.id.startsWith('local-') ? null : f.id,
    airline_code: f.airline_code,
    flight_number: f.flight_number,
    from_airport: f.from_airport,
    to_airport: f.to_airport,
    travel_date: f.travel_date,
    depart_at: f.depart_at,
    arrive_at: f.arrive_at,
    aircraft_type: null,
    request_kind: kind,
    search_snapshot: searchSnapshot,
  };
}

export async function postStaffLoadRequests(
  flights: NonRevLoadFlight[],
  selection: Record<string, StaffRequestKind>,
  searchSnapshot: StaffLoadSearchOptions
): Promise<{ ok: boolean; error?: string; requestIds?: string[]; spent?: number }> {
  const requests = flights.map((f) => {
    const kind = selection[f.id] || 'standard';
    return flightToRequestPayload(f, kind, searchSnapshot);
  });
  const { data, error } = await supabase.rpc('rpc_staff_loads_post_requests', {
    payload: { requests, search_snapshot: searchSnapshot },
  });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string; request_ids?: string[]; spent?: number };
  if (!row?.ok) return { ok: false, error: (row as any)?.error || 'Post failed' };
  const ids = Array.isArray(row.request_ids) ? row.request_ids : [];
  return { ok: true, requestIds: ids as string[], spent: row.spent };
}

export async function tryAcquireStaffRequestLock(requestId: string): Promise<{
  ok: boolean;
  error?: string;
  lockedByOther?: boolean;
}> {
  await supabase.rpc('rpc_staff_loads_sweep_locks');
  const { data, error } = await supabase.rpc('rpc_staff_loads_try_lock', { p_request_id: requestId });
  if (error) return { ok: false, error: error.message };
  const j = data as { ok?: boolean; error?: string };
  if (!j?.ok) {
    const code = j?.error;
    return {
      ok: false,
      error: code,
      lockedByOther: code === 'locked',
    };
  }
  return { ok: true };
}

export async function releaseStaffRequestLock(requestId: string) {
  await supabase.rpc('rpc_staff_loads_release_lock', { p_request_id: requestId });
}

export type StaffAnswerPayload = {
  loadLevel: string;
  notes: string;
  /** Defaults to community-reported loads. */
  answerSource?: 'community' | 'system';
  openSeatsTotal: number | null;
  openSeatsByCabin: Record<string, number> | null;
  nonrevListedTotal: number | null;
  nonrevByCabin: Record<string, number> | null;
};

export async function submitStaffLoadAnswer(requestId: string, p: StaffAnswerPayload) {
  const { data, error } = await supabase.rpc('rpc_staff_loads_submit_answer', {
    p_request_id: requestId,
    p_load_level: p.loadLevel,
    p_notes: p.notes || '',
    p_open_seats_total: p.openSeatsTotal ?? 0,
    p_open_seats_by_cabin: p.openSeatsByCabin || {},
    p_nonrev_listed_total: p.nonrevListedTotal ?? 0,
    p_nonrev_by_cabin: p.nonrevByCabin || {},
    p_answer_source: p.answerSource ?? 'community',
  });
  if (error) return { ok: false, error: error.message };
  const j = data as { ok?: boolean; error?: string };
  if (!j?.ok) return { ok: false, error: (j as any)?.error };
  return { ok: true };
}

export async function addStaffRequestComment(requestId: string, body: string) {
  const { data, error } = await supabase.rpc('rpc_staff_loads_add_comment', {
    p_request_id: requestId,
    p_body: body,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: !!(data as any)?.ok, error: (data as any)?.error };
}

export async function addStaffRequestStatusUpdate(
  requestId: string,
  payload: {
    kind: StaffRequestStatusUpdateRow['kind'];
    title?: string;
    body: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { data, error } = await supabase.rpc('rpc_staff_loads_add_status_update', {
    p_request_id: requestId,
    p_kind: payload.kind,
    p_title: payload.title ?? '',
    p_body: payload.body,
    p_metadata: payload.metadata ?? {},
  });
  if (error) return { ok: false, error: error.message };
  const j = data as { ok?: boolean; error?: string };
  if (!j?.ok) return { ok: false, error: (j as any)?.error };
  return { ok: true };
}

export async function requestStaffLoadRefresh(requestId: string, message?: string) {
  const { data, error } = await supabase.rpc('rpc_staff_loads_request_refresh', {
    p_request_id: requestId,
    p_message: message ?? '',
  });
  if (error) return { ok: false, error: error.message };
  const j = data as { ok?: boolean; error?: string };
  if (!j?.ok) return { ok: false, error: (j as any)?.error };
  return { ok: true };
}

export async function reportInaccurateStaffLoads(requestId: string, answerId: string, reason?: string) {
  const { data, error } = await supabase.rpc('rpc_staff_loads_report_inaccurate', {
    p_request_id: requestId,
    p_answer_id: answerId,
    p_reason: reason ?? '',
  });
  if (error) return { ok: false, error: error.message };
  const j = data as { ok?: boolean; error?: string; duplicate?: boolean };
  if (!j?.ok) return { ok: false, error: (j as any)?.error };
  return { ok: true, duplicate: !!j.duplicate };
}

export async function upgradeStaffRequestToPriority(requestId: string) {
  const { data, error } = await supabase.rpc('rpc_staff_loads_upgrade_priority', { p_request_id: requestId });
  if (error) return { ok: false, error: error.message };
  return { ok: !!(data as any)?.ok, error: (data as any)?.error };
}

export async function deleteStaffLoadRequest(requestId: string) {
  const { data, error } = await supabase.rpc('rpc_staff_loads_delete_request', { p_request_id: requestId });
  if (error) return { ok: false, error: error.message };
  return { ok: !!(data as any)?.ok, error: (data as any)?.error };
}

export async function updateStaffRequestSettings(
  requestId: string,
  patch: Partial<Pick<StaffLoadRequestRow, 'enable_status_updates' | 'enable_auto_updates' | 'pinned'>>
) {
  const { error } = await supabase.from('load_requests').update(patch).eq('id', requestId);
  return { ok: !error, error: error?.message };
}

export async function listUserAirlineAccess(userId: string) {
  const { data, error } = await supabase.from('user_airline_access').select('airline_code').eq('user_id', userId);
  if (error) return { codes: [] as string[], error: error.message };
  return { codes: (data || []).map((r) => r.airline_code) };
}

export async function setUserAirlineAccess(userId: string, codes: string[]) {
  await supabase.from('user_airline_access').delete().eq('user_id', userId);
  if (!codes.length) return { ok: true };
  const rows = codes.map((airline_code) => ({ user_id: userId, airline_code: airline_code.toUpperCase() }));
  const { error } = await supabase.from('user_airline_access').insert(rows);
  return { ok: !error, error: error?.message };
}

/** @deprecated Prefer listStaffLoadsAirlineNoteEntries — legacy single-row table. */
export async function getAirlineNote(airlineCode: string) {
  const { data, error } = await supabase.from('airline_notes').select('*').eq('airline_code', airlineCode.toUpperCase()).maybeSingle();
  if (error) return null;
  return data as { airline_code: string; title: string; body: string } | null;
}

export type StaffLoadsAirlineNoteCategory =
  | 'standby'
  | 'embargo'
  | 'checkin'
  | 'priority'
  | 'nominee'
  | 'baggage'
  | 'general'
  | 'other';

export type StaffLoadsAirlineNoteEntry = {
  id: string;
  airline_code: string;
  note_category: StaffLoadsAirlineNoteCategory;
  title: string;
  body: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type StaffLoadsRouteKnowledgeBlock = {
  id: string;
  from_airport: string | null;
  to_airport: string | null;
  travel_date: string | null;
  block_kind: 'timezone' | 'weather' | 'route_context' | 'arrival' | 'misc';
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type StaffLoadsTravelOfferTemplate = {
  id: string;
  offer_kind: 'hotel' | 'car' | 'esim' | 'other';
  title: string;
  subtitle: string | null;
  detail_url: string | null;
  image_url: string | null;
  applicable_airports: string[] | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type StaffLoadsAirportTimezone = {
  airport_code: string;
  iana_tz: string;
  updated_at: string;
};

const AIRLINE_DISPLAY: Record<string, string> = {
  AA: 'American Airlines',
  DL: 'Delta Air Lines',
  UA: 'United Airlines',
  WN: 'Southwest Airlines',
  B6: 'JetBlue',
  AS: 'Alaska Airlines',
  NK: 'Spirit Airlines',
  F9: 'Frontier Airlines',
};

export function staffLoadsAirlineDisplayName(airlineCode: string): string {
  const c = airlineCode.trim().toUpperCase();
  return AIRLINE_DISPLAY[c] || c;
}

export function staffLoadsAirlineNoteCategoryLabel(cat: StaffLoadsAirlineNoteCategory): string {
  const m: Record<StaffLoadsAirlineNoteCategory, string> = {
    standby: 'Standby',
    embargo: 'Embargoes',
    checkin: 'Check-in',
    priority: 'Priority',
    nominee: 'Nominee / agreements',
    baggage: 'Baggage / listing',
    general: 'General',
    other: 'Other',
  };
  return m[cat] || cat;
}

export async function listStaffLoadsAirlineNoteEntries(airlineCode: string): Promise<{
  data: StaffLoadsAirlineNoteEntry[];
  error?: string;
}> {
  const code = airlineCode.trim().toUpperCase();
  const { data, error } = await supabase
    .from('staff_loads_airline_note_entries')
    .select('*')
    .eq('airline_code', code)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as StaffLoadsAirlineNoteEntry[] };
}

export async function listStaffLoadsAirportTimezones(airportCodes: string[]): Promise<StaffLoadsAirportTimezone[]> {
  const codes = [...new Set(airportCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  if (!codes.length) return [];
  const { data, error } = await supabase.from('staff_loads_airport_timezones').select('*').in('airport_code', codes);
  if (error) return [];
  return (data || []) as StaffLoadsAirportTimezone[];
}

/** Rows that apply to this origin/destination/date (null column = wildcard). */
export async function listStaffLoadsRouteKnowledge(params: {
  fromAirport: string;
  toAirport: string;
  travelDate: string;
}): Promise<{ data: StaffLoadsRouteKnowledgeBlock[]; error?: string }> {
  const from = params.fromAirport.trim().toUpperCase();
  const to = params.toAirport.trim().toUpperCase();
  const td = params.travelDate.trim().slice(0, 10);
  const norm = (d: string | null | undefined) => (d ? String(d).trim().slice(0, 10) : null);
  const { data, error } = await supabase
    .from('staff_loads_route_knowledge')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .limit(400);
  if (error) return { data: [], error: error.message };
  const rows = (data || []) as StaffLoadsRouteKnowledgeBlock[];
  const filtered = rows.filter((r) => {
    if (r.from_airport && r.from_airport.toUpperCase() !== from) return false;
    if (r.to_airport && r.to_airport.toUpperCase() !== to) return false;
    const rd = norm(r.travel_date as string | null);
    if (rd && rd !== td) return false;
    return true;
  });
  filtered.sort((a, b) => {
    const score = (x: StaffLoadsRouteKnowledgeBlock) =>
      (x.from_airport ? 2 : 0) + (x.to_airport ? 2 : 0) + (x.travel_date ? 1 : 0);
    return score(b) - score(a) || a.sort_order - b.sort_order;
  });
  return { data: filtered };
}

export async function listActiveStaffLoadsTravelOfferTemplates(): Promise<StaffLoadsTravelOfferTemplate[]> {
  const { data, error } = await supabase
    .from('staff_loads_travel_offer_templates')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) return [];
  return (data || []) as StaffLoadsTravelOfferTemplate[];
}

/** Offers with null/empty applicable_airports apply globally; else must touch origin or destination. */
export function matchStaffLoadsTravelOffersForRequest(
  offers: StaffLoadsTravelOfferTemplate[],
  fromAirport: string,
  toAirport: string
): StaffLoadsTravelOfferTemplate[] {
  const from = fromAirport.trim().toUpperCase();
  const to = toAirport.trim().toUpperCase();
  return offers.filter((o) => {
    const ap = o.applicable_airports;
    if (!ap || !ap.length) return true;
    const up = ap.map((a) => a.trim().toUpperCase());
    return up.includes(from) || up.includes(to);
  });
}

/** Same calendar travel_date: show clock labels at a reference UTC instant (data-backed TZ table). */
export function buildStaffLoadsTimezoneContextLine(
  travelDate: string,
  fromAirport: string,
  toAirport: string,
  tzRows: StaffLoadsAirportTimezone[]
): string | null {
  const from = fromAirport.trim().toUpperCase();
  const to = toAirport.trim().toUpperCase();
  const map = Object.fromEntries(tzRows.map((r) => [r.airport_code.toUpperCase(), r.iana_tz]));
  const fromTz = map[from];
  const toTz = map[to];
  if (!fromTz || !toTz) return null;
  const ref = new Date(`${travelDate}T16:00:00.000Z`);
  if (Number.isNaN(ref.getTime())) return null;
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(ref);
  return `${from}: ${fmt(fromTz)} · ${to}: ${fmt(toTz)} (same instant on ${travelDate})`;
}

export async function pinStaffRequestForUser(userId: string, requestId: string, pin: boolean) {
  if (pin) {
    const { error } = await supabase.from('pinned_load_requests').upsert(
      { user_id: userId, request_id: requestId },
      { onConflict: 'user_id,request_id' }
    );
    return { ok: !error, error: error?.message };
  }
  const { error } = await supabase.from('pinned_load_requests').delete().eq('user_id', userId).eq('request_id', requestId);
  return { ok: !error, error: error?.message };
}

export async function isStaffRequestPinned(userId: string, requestId: string) {
  const { data } = await supabase
    .from('pinned_load_requests')
    .select('request_id')
    .eq('user_id', userId)
    .eq('request_id', requestId)
    .maybeSingle();
  return !!data;
}

export async function listMyOpenStaffRequestsPreview(userId: string, limit = 5) {
  const { data } = await supabase
    .from('load_requests')
    .select(
      'id, airline_code, from_airport, to_airport, travel_date, flight_number, request_kind, status, depart_at, arrive_at, aircraft_type, refresh_requested_at, created_at, options, locked_by, lock_expires_at'
    )
    .eq('user_id', userId)
    .in('status', ['open', 'stale', 'answered'])
    .order('created_at', { ascending: false })
    .limit(limit);
  const rows = (data || []) as StaffLoadRequestRow[];
  return attachLatestAnswerLoadLevels(rows);
}

export async function insertStaffTimelineEvent(
  requestId: string,
  eventType: string,
  title: string,
  body: string,
  metadata: Record<string, unknown> = {}
) {
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return { ok: false };
  const { error } = await supabase.from('load_request_timeline').insert({
    request_id: requestId,
    actor_user_id: uid,
    event_type: eventType,
    title,
    body,
    metadata,
  });
  return { ok: !error, error: error?.message };
}
