/**
 * import-schedule-ocr — Edge Function
 *
 * Auth: SUPABASE_ANON_KEY + auth.getUser(accessToken) with JWT from Authorization (not getUser() — no session in Edge).
 * Admin (DB + storage): SUPABASE_SERVICE_ROLE_KEY (auto-injected) or SERVICE_ROLE_KEY (manual fallback — must match Project Settings → API service_role).
 * Vision (pick one):
 *   GOOGLE_CLOUD_API_KEY          (recommended — Edge Function secret; same GCP API key as Vision; avoids PEM)
 *   OR legacy: GOOGLE_CLOUD_CLIENT_EMAIL + GOOGLE_CLOUD_PRIVATE_KEY (PEM, \\n in env)
 * SUPABASE_URL is injected automatically for Edge Functions; do not add it as a secret.
 *
 * Deploy: `supabase functions deploy import-schedule-ocr`
 * GCP: enable "Cloud Vision API" for the service account project.
 *
 * Client calls: supabase.functions.invoke('import-schedule-ocr', { body: { batch_id } })
 *
 * Parsing is **not** a one-off OCR script. Pipeline: extract → classify → route template (DB) →
 * parser registry → code dictionary enrichment → persist user memory. See ./schedule-intelligence/mod.ts
 *
 * Dashboard "Test" panel: body must be `{ "batch_id": "<uuid>" }` (not the default `{ "name": "Functions" }`).
 * The JWT must be a **logged-in user's** access token — "service role" in the tester is not a user JWT, so
 * `getUser` returns 401. Easiest check for 500 is redeploy after setting `SERVICE_ROLE_KEY`, then read the JSON `detail` field.
 */
// @ts-expect-error Deno std
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error Deno esm
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractPdfText, visionDocumentTextFromImage } from './extract.ts';
import {
  classifyImport,
  enrichCandidatesWithDictionary,
  fetchUserScheduleProfile,
  loadActiveDictionary,
  parseWithRegisteredModule,
  persistUserMemoryAfterSuccessfulImport,
  pickTemplate,
  type TemplateRow,
  type UserScheduleProfileRow,
} from './schedule-intelligence/mod.ts';
import { sanitizeIsoDateForPostgres } from './parser.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Body = { batch_id?: string };

function extMime(path: string): 'image' | 'pdf' | 'unknown' {
  const p = path.toLowerCase();
  if (p.endsWith('.pdf')) return 'pdf';
  if (p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.jpeg') || p.endsWith('.heic') || p.endsWith('.webp')) {
    return 'image';
  }
  return 'unknown';
}

/** Parser requires strict YYYY-MM; bad values make every row date fail. */
function normalizeMonthKeyHint(raw: string): string {
  const t = raw.trim();
  if (/^\d{4}-\d{2}$/.test(t)) return t;
  const loose = /^(\d{4})-(\d{1,2})(?:-|$)/.exec(t);
  if (loose) {
    const mm = Number(loose[2]);
    if (mm >= 1 && mm <= 12) return `${loose[1]}-${String(mm).padStart(2, '0')}`;
  }
  return new Date().toISOString().slice(0, 7);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY');

  if (!supabaseUrl) {
    return new Response(
      JSON.stringify({ error: 'Server misconfigured', detail: 'SUPABASE_URL missing (should be injected by Supabase)' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  if (!anonKey) {
    return new Response(
      JSON.stringify({ error: 'Server misconfigured', detail: 'SUPABASE_ANON_KEY missing (should be injected by Supabase)' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  if (!serviceKey) {
    return new Response(
      JSON.stringify({
        error: 'Server misconfigured',
        detail: 'Set Edge Function secret SERVICE_ROLE_KEY to your project service_role key, or rely on auto-injected SUPABASE_SERVICE_ROLE_KEY',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Pass the access token explicitly — getUser() with no args depends on a persisted session, which Edge has none of.
  const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  const supabaseUser = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser(accessToken);
  if (userErr || !userData.user) {
    return new Response(
      JSON.stringify({ error: 'Invalid session', detail: userErr?.message ?? null }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  const userId = userData.user.id;

  const supabase = createClient(supabaseUrl, serviceKey);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const batchId = body.batch_id;
  if (!batchId || typeof batchId !== 'string') {
    return new Response(JSON.stringify({ error: 'batch_id required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: batch, error: batchErr } = await supabase
    .from('schedule_import_batches')
    .select('id,user_id,month_key,source_type,source_file_path')
    .eq('id', batchId)
    .maybeSingle();

  if (batchErr || !batch || batch.user_id !== userId) {
    return new Response(JSON.stringify({ error: 'Batch not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const filePath = batch.source_file_path as string | null;
  if (!filePath) {
    return new Response(JSON.stringify({ error: 'Batch has no file path' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const segments = filePath.split('/').filter(Boolean);
  if (segments[0] !== userId) {
    return new Response(JSON.stringify({ error: 'Invalid storage path' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  await supabase
    .from('schedule_import_batches')
    .update({ parse_status: 'extracting', parse_error: null, updated_at: new Date().toISOString() })
    .eq('id', batchId);

  const { data: fileBlob, error: dlErr } = await supabase.storage.from('schedule-imports').download(filePath);
  if (dlErr || !fileBlob) {
    await supabase
      .from('schedule_import_batches')
      .update({
        parse_status: 'failed',
        parse_error: dlErr?.message ?? 'Download failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId);
    return new Response(JSON.stringify({ error: 'Could not download file', details: dlErr?.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const buf = new Uint8Array(await fileBlob.arrayBuffer());
  console.log('[import-schedule-ocr] storage download', {
    batchId,
    pathSuffix: filePath.split('/').slice(-2).join('/'),
    bytes: buf.length,
  });
  if (buf.length === 0) {
    await supabase
      .from('schedule_import_batches')
      .update({
        parse_status: 'failed',
        parse_error: 'Storage file is empty (0 bytes). Re-upload from the app; if it persists, the image may not have been read on device.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId);
    return new Response(
      JSON.stringify({
        error: 'Empty file',
        details: 'Downloaded file has 0 bytes. Re-upload the schedule image.',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const kind = extMime(filePath);

  let rawText = '';
  let pdfWeak = false;

  try {
    if (kind === 'image' || kind === 'unknown') {
      rawText = await visionDocumentTextFromImage(buf, filePath);
      if (kind === 'unknown' && rawText.trim().length < 20) {
        // Try PDF extraction if extensionless file is actually PDF
        const pdfTry = await extractPdfText(buf);
        if (pdfTry.text.trim().length > rawText.trim().length) {
          rawText = pdfTry.text;
          pdfWeak = pdfTry.usedOcrFallback;
        }
      }
    } else if (kind === 'pdf') {
      const pdfTry = await extractPdfText(buf);
      rawText = pdfTry.text;
      pdfWeak = pdfTry.usedOcrFallback;
      if (pdfWeak) {
        rawText += '\n\n[import: PDF text extraction was weak; scanned PDFs may need a photo/screenshot import.]';
      }
    } else {
      rawText = await visionDocumentTextFromImage(buf, filePath);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from('schedule_import_batches')
      .update({
        parse_status: 'failed',
        parse_error: msg,
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId);
    return new Response(JSON.stringify({ error: 'Extraction failed', details: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const monthKey = normalizeMonthKeyHint(
    (batch.month_key as string | null) || new Date().toISOString().slice(0, 7)
  );

  let profile: UserScheduleProfileRow = null;
  let templates: TemplateRow[] = [];
  let dictionaryRows: Awaited<ReturnType<typeof loadActiveDictionary>> = [];
  try {
    profile = await fetchUserScheduleProfile(supabase, userId);

    const { data: tmpl } = await supabase
      .from('schedule_templates')
      .select('id, parser_key, airline_id, role_id, software_id, view_type_id, active')
      .eq('active', true);
    templates = (tmpl ?? []) as TemplateRow[];

    dictionaryRows = await loadActiveDictionary(supabase);
  } catch (e) {
    console.warn('[import-schedule-ocr] schedule intelligence tables not available; using generic parser', e);
  }

  const classification = classifyImport(rawText, monthKey, profile);
  /** Prefer month read from the image (e.g. "April Schedule", "Apr 3") over the Schedule tab cursor. */
  const effectiveMonthKey = normalizeMonthKeyHint(classification.detected_month_key ?? monthKey);
  const template = templates.length > 0 ? pickTemplate(templates, classification, profile?.last_successful_template_id ?? null) : null;

  const parserKey = template?.parser_key ?? 'generic_fallback_v1';
  const templateId = template?.id ?? '00000000-0000-4000-8000-000000000499';

  let parsed = parseWithRegisteredModule(parserKey, rawText, effectiveMonthKey);
  parsed = enrichCandidatesWithDictionary(parsed, dictionaryRows, {
    airline_id: classification.airline_guess_id,
    role_id: classification.role_guess_id,
    software_id: classification.software_guess_id,
  });

  await supabase.from('schedule_import_candidates').delete().eq('batch_id', batchId);

  /**
   * Omit per-row month_key and sequence_index when possible — older DBs may lack Schedule Intelligence
   * columns on schedule_import_candidates; month lives on the batch + each row's date.
   */
  const rows = parsed.map((p) => ({
    batch_id: batchId,
    date: sanitizeIsoDateForPostgres(p.date),
    day_of_week: p.day_of_week,
    pairing_code: p.pairing_code,
    report_time: p.report_time,
    city: p.city,
    d_end_time: p.d_end_time,
    layover: p.layover,
    depart_local: p.depart_local,
    arrive_local: p.arrive_local,
    wx: p.wx,
    status_code: p.status_code,
    notes: p.notes,
    confidence_score: p.confidence_score,
    warning_flag: p.warning_flag || pdfWeak,
    raw_row_text: p.raw_row_text,
  }));

  const { error: insErr } =
    rows.length === 0
      ? { error: null as null }
      : await supabase.from('schedule_import_candidates').insert(rows);
  if (insErr) {
    await supabase
      .from('schedule_import_batches')
      .update({
        parse_status: 'failed',
        parse_error: insErr.message,
        raw_extracted_text: rawText.slice(0, 50000),
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId);
    return new Response(JSON.stringify({ error: 'Could not save candidates', details: insErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const warningCount = rows.filter((r) => r.warning_flag).length;

  const batchPatch: Record<string, unknown> = {
    raw_extracted_text: rawText.slice(0, 50000),
    parse_status: 'parsed',
    row_count: rows.length,
    warning_count: warningCount,
    parse_error: pdfWeak ? 'PDF text may be incomplete (scanned document).' : null,
    updated_at: new Date().toISOString(),
    selected_month_key: effectiveMonthKey,
    detected_month_key: classification.detected_month_key,
    airline_guess_id: classification.airline_guess_id,
    role_guess_id: classification.role_guess_id,
    software_guess_id: classification.software_guess_id,
    view_guess_id: classification.view_guess_id,
    classification_confidence: classification.confidence,
    classification_json: {
      parser_key: parserKey,
      template_id: templateId,
      signals: classification.signals,
    },
    applied_template_id: templateId,
  };

  await supabase.from('schedule_import_batches').update(batchPatch).eq('id', batchId);

  try {
    await persistUserMemoryAfterSuccessfulImport(supabase, userId, classification, templateId, effectiveMonthKey);
  } catch (e) {
    console.warn('[import-schedule-ocr] user_schedule_profiles upsert skipped', e);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      batch_id: batchId,
      row_count: rows.length,
      warning_count: warningCount,
      pdf_weak: pdfWeak,
      parser_key: parserKey,
      template_id: templateId,
      classification_confidence: classification.confidence,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
