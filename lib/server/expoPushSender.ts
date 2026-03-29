/**
 * Flight Club server-side Expo Push Service sender.
 * Use from Supabase Edge Functions (service role) or any backend with service credentials.
 *
 * Client apps should not call this with the anon key — RLS blocks other users' tokens.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

/** Expo documents batches of up to 100 messages per request. */
export const EXPO_PUSH_BATCH_SIZE = 100;

export type ExpoPushMessage = {
  to: string;
  sound: 'default' | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

/** Supported marketing / product event labels (map to registry + routing). */
export type FlightClubPushEventLabel =
  | 'dm'
  | 'message_request'
  | 'crew_room_reply'
  | 'crew_room_post'
  | 'crew_room_invite'
  | 'swap_match'
  | 'housing_alert'
  | 'loads_alert'
  | 'tool_alert'
  | 'social_like'
  | 'social_comment'
  | 'social_follow';

/** Maps public labels to `notifications.type` / registry strings. */
export const PUSH_EVENT_TYPE_MAP: Record<FlightClubPushEventLabel, string> = {
  dm: 'message',
  message_request: 'message_request',
  crew_room_reply: 'crew_room_reply',
  crew_room_post: 'crew_room_post',
  housing_alert: 'housing_alert',
  swap_match: 'swap_match',
  crew_room_invite: 'crew_room_invite',
  loads_alert: 'loads_alert',
  tool_alert: 'tool_alert',
  social_like: 'social_like',
  social_comment: 'social_comment',
  social_follow: 'social_follow',
};

export type ExpoPushTicketRow = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

export type ExpoPushSendResponseBody = {
  data?: ExpoPushTicketRow[];
  errors?: unknown;
};

export type ExpoPushReceiptMap = Record<
  string,
  {
    status: 'ok' | 'error';
    message?: string;
    details?: { error?: string; fault?: string };
  }
>;

export type ExpoPushReceiptsResponseBody = {
  data?: ExpoPushReceiptMap;
};

export type SendBatchResult = {
  batchIndex: number;
  httpStatus: number;
  body: ExpoPushSendResponseBody;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * Active Expo tokens for a user (respects `is_active` when the column exists).
 */
export async function fetchActiveExpoPushTokens(
  supabase: SupabaseClient,
  userId: string
): Promise<{ push_token: string }[]> {
  const { data, error } = await supabase
    .from('user_push_tokens')
    .select('push_token')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) {
    console.error('[expoPush] fetchActiveExpoPushTokens:', error.message);
    throw error;
  }
  return (data ?? []) as { push_token: string }[];
}

export function buildExpoMessagesForTokens(
  tokens: { push_token: string }[],
  content: { title: string; body: string; data?: Record<string, unknown> }
): ExpoPushMessage[] {
  return tokens.map((t) => ({
    to: t.push_token,
    sound: 'default',
    title: content.title,
    body: content.body,
    data: content.data ?? {},
  }));
}

/**
 * POST to Expo push/send with batching and retry on 429 / 5xx / network errors.
 */
export async function sendExpoPushBatches(
  messages: ExpoPushMessage[],
  options?: {
    fetchImpl?: typeof fetch;
    maxRetries?: number;
    onBatchComplete?: (result: SendBatchResult) => void;
  }
): Promise<SendBatchResult[]> {
  const fetchFn = options?.fetchImpl ?? fetch;
  const maxRetries = options?.maxRetries ?? 3;
  const batches = chunk(messages, EXPO_PUSH_BATCH_SIZE);
  const out: SendBatchResult[] = [];

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxRetries) {
      try {
        const res = await fetchFn(EXPO_PUSH_SEND_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messages: batch }),
        });

        const text = await res.text();
        let body: ExpoPushSendResponseBody = {};
        try {
          body = text ? (JSON.parse(text) as ExpoPushSendResponseBody) : {};
        } catch {
          body = { errors: text };
        }

        const result: SendBatchResult = { batchIndex, httpStatus: res.status, body };
        const retryable = res.status === 429 || res.status >= 500;

        if (retryable && attempt < maxRetries - 1) {
          const delay = 200 * Math.pow(2, attempt);
          console.warn(
            `[expoPush] batch ${batchIndex} HTTP ${res.status}, retry in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
          );
          await sleep(delay);
          attempt++;
          continue;
        }

        console.log(
          `[expoPush] batch ${batchIndex} sent`,
          JSON.stringify({
            httpStatus: res.status,
            tickets: body.data?.length ?? 0,
            sample: body.data?.slice(0, 2),
          })
        );
        options?.onBatchComplete?.(result);
        out.push(result);
        break;
      } catch (e) {
        lastError = e;
        const delay = 200 * Math.pow(2, attempt);
        console.warn(`[expoPush] batch ${batchIndex} network error, retry in ${delay}ms`, e);
        if (attempt >= maxRetries - 1) {
          console.error('[expoPush] batch failed after retries', lastError);
          out.push({
            batchIndex,
            httpStatus: 0,
            body: { errors: String(lastError) },
          });
          break;
        }
        await sleep(delay);
        attempt++;
      }
    }
  }

  return out;
}

/**
 * POST getReceipts for ticket UUIDs (max ~1000 per Expo docs; we chunk to 100).
 */
export async function fetchExpoPushReceipts(
  ticketIds: string[],
  options?: { fetchImpl?: typeof fetch; maxChunk?: number }
): Promise<ExpoPushReceiptMap> {
  const fetchFn = options?.fetchImpl ?? fetch;
  const maxChunk = options?.maxChunk ?? 100;
  const merged: ExpoPushReceiptMap = {};

  for (const chunkIds of chunk(ticketIds, maxChunk)) {
    if (!chunkIds.length) continue;
    const res = await fetchFn(EXPO_PUSH_RECEIPTS_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: chunkIds }),
    });
    const text = await res.text();
    let body: ExpoPushReceiptsResponseBody = {};
    try {
      body = text ? (JSON.parse(text) as ExpoPushReceiptsResponseBody) : {};
    } catch {
      console.error('[expoPush] getReceipts parse error', text);
      continue;
    }
    Object.assign(merged, body.data ?? {});
  }

  return merged;
}

function receiptIndicatesDeviceNotRegistered(receipt: ExpoPushReceiptMap[string]): boolean {
  const msg = (receipt.message || '').toLowerCase();
  const err = (receipt.details?.error || receipt.details?.fault || '').toString();
  if (err === 'DeviceNotRegistered') return true;
  if (msg.includes('devicenotregistered')) return true;
  return false;
}

/**
 * Marks tokens inactive when Expo reports DeviceNotRegistered.
 */
export async function deactivatePushTokensNotRegistered(
  supabase: SupabaseClient,
  pairs: { pushToken: string; userId: string }[]
): Promise<void> {
  const seen = new Set<string>();
  for (const { pushToken, userId } of pairs) {
    const k = `${userId}::${pushToken}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const { error } = await supabase
      .from('user_push_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('push_token', pushToken);
    if (error) {
      console.error('[expoPush] deactivate token failed', error.message);
    } else {
      console.log('[expoPush] deactivated invalid token for user', userId.slice(0, 8));
    }
  }
}

export type TicketLogRow = {
  user_id: string;
  push_token: string;
  ticket_id: string | null;
  batch_id: string | null;
  send_http_status: number | null;
  send_status: string | null;
  send_error: string | null;
  raw_send: unknown;
};

/**
 * Persist per-message send results (for getReceipts polling). Uses `expo_push_ticket_log`.
 */
export async function persistExpoPushTicketLog(
  supabase: SupabaseClient,
  rows: TicketLogRow[]
): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase.from('expo_push_ticket_log').insert(rows);
  if (error) {
    console.error('[expoPush] persistExpoPushTicketLog:', error.message);
  }
}

/**
 * Zip Expo `data[]` with batch messages; build log rows + return ticket ids for receipt fetch.
 */
export function zipSendResultsToTicketRows(
  messages: ExpoPushMessage[],
  batch: SendBatchResult,
  userId: string,
  batchId: string
): { rows: TicketLogRow[]; ticketIds: string[] } {
  const tickets = batch.body.data ?? [];
  const rows: TicketLogRow[] = [];
  const ticketIds: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const t = tickets[i];
    const status = t?.status ?? 'error';
    const ticketId = status === 'ok' && t?.id ? t.id : null;
    if (ticketId) ticketIds.push(ticketId);

    rows.push({
      user_id: userId,
      push_token: msg.to,
      ticket_id: ticketId,
      batch_id: batchId,
      send_http_status: batch.httpStatus,
      send_status: status,
      send_error: t?.status === 'error' ? t?.message ?? JSON.stringify(t) : null,
      raw_send: t ?? null,
    });
  }

  return { rows, ticketIds };
}

/**
 * Fetch tokens → build messages → batch send (≤100) with retries → optional ticket log rows.
 */
export async function sendExpoPushToUser(
  supabase: SupabaseClient,
  userId: string,
  content: { title: string; body: string; data?: Record<string, unknown> },
  options?: { persistTickets?: boolean; batchId?: string }
): Promise<SendBatchResult[]> {
  const tokens = await fetchActiveExpoPushTokens(supabase, userId);
  if (!tokens.length) return [];

  const messages = buildExpoMessagesForTokens(tokens, content);
  const batchId = options?.batchId ?? `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const results = await sendExpoPushBatches(messages);

  if (options?.persistTickets) {
    const batches = chunk(messages, EXPO_PUSH_BATCH_SIZE);
    for (let i = 0; i < results.length; i++) {
      const bm = batches[i] ?? [];
      const { rows } = zipSendResultsToTicketRows(bm, results[i], userId, batchId);
      await persistExpoPushTicketLog(supabase, rows);
    }
  }

  return results;
}

/**
 * Poll getReceipts for ticket IDs, update log rows, deactivate DeviceNotRegistered tokens.
 */
export async function processExpoPushReceiptsForTickets(
  supabase: SupabaseClient,
  ticketIds: string[],
  ticketMeta: Map<string, { userId: string; pushToken: string }>
): Promise<void> {
  if (!ticketIds.length) return;

  const receipts = await fetchExpoPushReceipts(ticketIds);
  const toDeactivate: { pushToken: string; userId: string }[] = [];
  const now = new Date().toISOString();

  for (const id of ticketIds) {
    const r = receipts[id];
    const meta = ticketMeta.get(id);
    if (!meta) continue;

    if (!r) {
      await supabase
        .from('expo_push_ticket_log')
        .update({
          receipt_status: 'unknown',
          receipt_error: 'missing_from_expo_receipts_response',
          receipt_checked_at: now,
        })
        .eq('ticket_id', id);
      continue;
    }

    const err = r.status === 'error';
    const dnr = err && receiptIndicatesDeviceNotRegistered(r);

    await supabase
      .from('expo_push_ticket_log')
      .update({
        receipt_status: r.status,
        receipt_error: err ? (r.message ?? JSON.stringify(r)) : null,
        receipt_checked_at: now,
        raw_receipt: r as unknown,
      })
      .eq('ticket_id', id);

    if (dnr) {
      toDeactivate.push({ pushToken: meta.pushToken, userId: meta.userId });
    }
  }

  await deactivatePushTokensNotRegistered(supabase, toDeactivate);
}

/**
 * Load pending ticket ids from DB (optional cron helper).
 */
export async function loadPendingExpoPushTicketIds(
  supabase: SupabaseClient,
  limit = 500
): Promise<{ ticket_id: string; user_id: string; push_token: string }[]> {
  const { data, error } = await supabase
    .from('expo_push_ticket_log')
    .select('ticket_id, user_id, push_token')
    .not('ticket_id', 'is', null)
    .is('receipt_checked_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[expoPush] loadPendingExpoPushTicketIds:', error.message);
    return [];
  }
  return (data ?? []) as { ticket_id: string; user_id: string; push_token: string }[];
}

/**
 * Cron-friendly: load pending rows → getReceipts → update log + deactivate bad tokens.
 */
export async function runExpoPushReceiptSweep(
  supabase: SupabaseClient,
  limit = 500
): Promise<{ processed: number }> {
  const rows = await loadPendingExpoPushTicketIds(supabase, limit);
  if (!rows.length) return { processed: 0 };

  const ticketIds = rows.map((r) => r.ticket_id).filter(Boolean) as string[];
  const meta = new Map<string, { userId: string; pushToken: string }>();
  for (const r of rows) {
    if (r.ticket_id) meta.set(r.ticket_id, { userId: r.user_id, pushToken: r.push_token });
  }

  await processExpoPushReceiptsForTickets(supabase, ticketIds, meta);
  return { processed: ticketIds.length };
}

/**
 * Build `data` payload aligned with client routing (`resolveNotificationHrefFromPayload`).
 */
export function buildExpoPushDataPayload(input: {
  route: string;
  type: string;
  entity_type: string;
  entity_id: string;
  secondary_id?: string | null;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    route: input.route,
    type: input.type,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    secondary_id: input.secondary_id ?? null,
    ...input.extra,
  };
}

/** Default title line for supported marketing event labels (body usually from template). */
export function defaultTitleForPushEvent(
  event: FlightClubPushEventLabel,
  actorName: string | null
): string {
  const who = actorName?.trim() || 'Someone';
  switch (event) {
    case 'dm':
      return `${who} sent you a message`;
    case 'message_request':
      return `${who} wants to message you`;
    case 'crew_room_reply':
    case 'crew_room_post':
    case 'crew_room_invite':
      return `${who} — crew room`;
    case 'swap_match':
      return 'New swap match';
    case 'housing_alert':
      return 'Housing alert';
    case 'loads_alert':
      return 'Loads update';
    case 'tool_alert':
      return 'Crew tools';
    case 'social_like':
      return `${who} liked your post`;
    case 'social_comment':
      return `${who} commented`;
    case 'social_follow':
      return `${who} followed you`;
    default:
      return 'Flight Club';
  }
}

/**
 * Convenience: map a product event label to registry `type` + default title; merge routing fields from caller.
 */
export function buildPayloadForFlightClubEvent(
  event: FlightClubPushEventLabel,
  parts: {
    route: string;
    entity_type: string;
    entity_id: string;
    secondary_id?: string | null;
    body: string;
    actorName?: string | null;
    extra?: Record<string, unknown>;
  }
): { title: string; body: string; data: Record<string, unknown> } {
  const type = PUSH_EVENT_TYPE_MAP[event];
  const title = defaultTitleForPushEvent(event, parts.actorName ?? null);
  const data = buildExpoPushDataPayload({
    route: parts.route,
    type,
    entity_type: parts.entity_type,
    entity_id: parts.entity_id,
    secondary_id: parts.secondary_id,
    extra: parts.extra,
  });
  return { title, body: parts.body, data };
}

/**
 * End-to-end: DM, crew room, swap, housing, tools, social — same entry for Edge handlers.
 */
export async function sendFlightClubPushForEvent(
  supabase: SupabaseClient,
  recipientUserId: string,
  event: FlightClubPushEventLabel,
  parts: {
    route: string;
    entity_type: string;
    entity_id: string;
    secondary_id?: string | null;
    body: string;
    actorName?: string | null;
    extra?: Record<string, unknown>;
  },
  options?: { persistTickets?: boolean; batchId?: string }
): Promise<SendBatchResult[]> {
  const { title, body, data } = buildPayloadForFlightClubEvent(event, parts);
  return sendExpoPushToUser(supabase, recipientUserId, { title, body, data }, options);
}
