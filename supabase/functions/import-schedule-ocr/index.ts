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
import { extractPdfText, visionDocumentTextFromImage, type VisionImageExtractionDebug } from './extract.ts';
import { flicaOcrHasScheduleEvidence, pickOcrIssueCodes } from './flicaOcrSalvage.ts';
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
import { ocrLooksLikeJetBlueFlicaMonthly } from './jetblueDetect.ts';
import { OcrTraceReason } from './ocrTraceCodes.ts';
import { updateScheduleImportBatchRow } from './scheduleBatchUpdate.ts';

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

  /** Do not list optional columns (e.g. schedule_import_id) — older DBs without the migration break the whole query. */
  const { data: batch, error: batchErr } = await supabase
    .from('schedule_import_batches')
    .select('id,user_id,month_key,source_type,source_file_path')
    .eq('id', batchId)
    .maybeSingle();

  if (batchErr) {
    console.error('[import-schedule-ocr] batch lookup', batchErr);
    return new Response(
      JSON.stringify({
        error: 'Batch lookup failed',
        detail: batchErr.message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  if (!batch) {
    return new Response(JSON.stringify({ error: 'Batch not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (batch.user_id !== userId) {
    return new Response(
      JSON.stringify({ error: 'Forbidden', detail: 'Batch does not belong to the signed-in user' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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

  console.log('[import-schedule-ocr] ocr_stage_storage_fetch_start', {
    batch_id: batchId,
    bucket: 'schedule-imports',
    storage_path: filePath,
  });

  const { data: fileBlob, error: dlErr } = await supabase.storage.from('schedule-imports').download(filePath);
  const storageFetchOk = !dlErr && !!fileBlob;
  console.log('[import-schedule-ocr] ocr_stage_storage_fetch_result', {
    batch_id: batchId,
    storage_path: filePath,
    fetch_succeeded: storageFetchOk,
    storage_error_message: dlErr?.message ?? null,
    /** Supabase JS client does not expose HTTP status; use error presence + blob presence */
    has_blob: !!fileBlob,
  });

  if (dlErr || !fileBlob) {
    const reason = !fileBlob ? OcrTraceReason.STORAGE_FETCH_NO_BLOB : OcrTraceReason.STORAGE_FETCH_FAILED;
    console.error('[import-schedule-ocr] ocr_storage_failed', { reason_code: reason, detail: dlErr?.message });
    await supabase
      .from('schedule_import_batches')
      .update({
        parse_status: 'failed',
        parse_error: dlErr?.message ?? 'Download failed',
        classification_json: {
          ocr_instrumentation: {
            reason_codes: [reason],
            storage_path: filePath,
            storage_download_bytes: 0,
            storage_fetch_ok: false,
            handoff_reason_code: reason,
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId);
    return new Response(JSON.stringify({ error: 'Could not download file', details: dlErr?.message, ocr_reason_code: reason }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const buf = new Uint8Array(await fileBlob.arrayBuffer());
  console.log('[import-schedule-ocr] ocr_stage_storage_download_bytes', {
    batch_id: batchId,
    storage_path: filePath,
    downloaded_byte_length: buf.length,
  });
  if (buf.length === 0) {
    console.error('[import-schedule-ocr] ocr_storage_empty', { reason_code: OcrTraceReason.STORAGE_FETCH_EMPTY });
    await supabase
      .from('schedule_import_batches')
      .update({
        parse_status: 'failed',
        parse_error: 'Storage file is empty (0 bytes). Re-upload from the app; if it persists, the image may not have been read on device.',
        classification_json: {
          ocr_instrumentation: {
            reason_codes: [OcrTraceReason.STORAGE_FETCH_EMPTY],
            storage_path: filePath,
            storage_download_bytes: 0,
            storage_fetch_ok: true,
            handoff_reason_code: OcrTraceReason.STORAGE_FETCH_EMPTY,
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId);
    return new Response(
      JSON.stringify({
        error: 'Empty file',
        details: 'Downloaded file has 0 bytes. Re-upload the schedule image.',
        ocr_reason_code: OcrTraceReason.STORAGE_FETCH_EMPTY,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const kind = extMime(filePath);
  const mimeFromExtension = (filePath.split('.').pop() ?? '').toLowerCase();

  let rawText = '';
  let pdfWeak = false;
  let imageOcrDebug: VisionImageExtractionDebug | null = null;
  let ocrFailureReasonCode: string | null = null;

  try {
    if (kind === 'image' || kind === 'unknown') {
      console.log('[import-schedule-ocr] ocr_stage_invoke_image', {
        file_kind: kind,
        mime_from_extension: mimeFromExtension,
        storage_bytes: buf.length,
      });
      const vis = await visionDocumentTextFromImage(buf, filePath);
      const beforeTrim = vis.text;
      rawText = vis.text.replace(/\n\n\[FLICA_WEAK_OCR\]\s*$/i, '').trim();
      imageOcrDebug = vis.debug;
      console.log('[import-schedule-ocr] ocr_stage_text_cleanup', {
        len_before_weak_marker_strip: beforeTrim.length,
        len_after_trim_for_db: rawText.length,
        discarded_empty_by_final_trim: rawText.length === 0 && beforeTrim.length > 0,
      });
      console.log('[import-schedule-ocr] ocr_stage_handoff_parser_entry', {
        parser_entry_raw_text_len: rawText.length,
        handoff_reason_code:
          rawText.length === 0 ? OcrTraceReason.PARSER_RECEIVED_EMPTY_RAW_TEXT : null,
        compare_storage_vs_client: `server_downloaded_bytes=${buf.length} (compare to client jpegBase64DecodedBytes)`,
      });
      if (rawText.length === 0) {
        console.error('[import-schedule-ocr] ocr_handoff_empty_raw_text', {
          reason_code: OcrTraceReason.PARSER_RECEIVED_EMPTY_RAW_TEXT,
          note: 'If Vision succeeded, text was wiped by cleanup — check weak-OCR marker handling',
        });
      }
      if (kind === 'unknown' && rawText.trim().length < 20) {
        const pdfTry = await extractPdfText(buf);
        if (pdfTry.text.trim().length > rawText.trim().length) {
          rawText = pdfTry.text;
          pdfWeak = pdfTry.usedOcrFallback;
          imageOcrDebug = null;
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
      const vis = await visionDocumentTextFromImage(buf, filePath);
      rawText = vis.text.replace(/\n\n\[FLICA_WEAK_OCR\]\s*$/i, '').trim();
      imageOcrDebug = vis.debug;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Vision returned no text|no text for this image/i.test(msg)) ocrFailureReasonCode = OcrTraceReason.OCR_RETURNED_EMPTY;
    else if (/almost no usable text/i.test(msg)) ocrFailureReasonCode = OcrTraceReason.OCR_TEXT_DISCARDED_BY_THRESHOLD;
    else if (/empty after download/i.test(msg)) ocrFailureReasonCode = OcrTraceReason.STORAGE_FETCH_EMPTY;
    else ocrFailureReasonCode = OcrTraceReason.OCR_ENGINE_ERROR;

    console.error('[import-schedule-ocr] ocr_stage_extraction_caught', {
      ocr_failure_reason_code: ocrFailureReasonCode,
      message: msg,
      storage_download_bytes: buf.length,
    });

    await supabase
      .from('schedule_import_batches')
      .update({
        parse_status: 'failed',
        parse_error: msg,
        classification_json: {
          ocr_instrumentation: {
            reason_codes: [ocrFailureReasonCode],
            storage_path: filePath,
            storage_download_bytes: buf.length,
            storage_fetch_ok: true,
            handoff_reason_code: ocrFailureReasonCode,
            extraction_error_message: msg.slice(0, 2000),
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId);
    return new Response(
      JSON.stringify({
        error: 'Extraction failed',
        details: msg,
        ocr_reason_code: ocrFailureReasonCode,
        storage_download_bytes: buf.length,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
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

  /** Guided uploads use `/jetblue/` in path; generic Schedule tab uploads use `uid/YYYY-MM/...` but same FLICA screenshots. */
  const isJetBlueFlicaGuided = typeof filePath === 'string' && filePath.includes('/jetblue/');
  const isJetBlueFlicaMonthlyOcr = ocrLooksLikeJetBlueFlicaMonthly(rawText);

  if (imageOcrDebug) {
    const monthFound = Boolean(classification.detected_month_key ?? effectiveMonthKey);
    console.log('[import-schedule-ocr] jetblue_flica_ocr_trace', {
      jetblue_flica_guided: isJetBlueFlicaGuided,
      jetblue_flica_monthly_ocr: isJetBlueFlicaMonthlyOcr,
      month_found: monthFound,
      merged_len: imageOcrDebug.mergedLen,
      weak_ocr: imageOcrDebug.weakOcrFlag,
      variant_char_counts: imageOcrDebug.variantCharCounts,
      evidence_tokens: flicaOcrHasScheduleEvidence(rawText),
    });
  }

  if (isJetBlueFlicaGuided || isJetBlueFlicaMonthlyOcr) {
    await supabase.from('schedule_import_candidates').delete().eq('batch_id', batchId);

    const handoffEmpty = rawText.length === 0;
    const handoffCode = handoffEmpty ? OcrTraceReason.PARSER_RECEIVED_EMPTY_RAW_TEXT : null;

    console.log('[import-schedule-ocr] ocr_stage_jetblue_structured_handoff', {
      batch_id: batchId,
      raw_text_len_written_to_batch: rawText.length,
      storage_download_bytes: buf.length,
      ocr_handoff_reason_code: handoffCode,
    });

    const batchPatch: Record<string, unknown> = {
      raw_extracted_text: rawText.slice(0, 50000),
      parse_status: 'parsed',
      row_count: 0,
      warning_count: 0,
      parse_error: handoffEmpty
        ? `OCR produced no usable text (${OcrTraceReason.PARSER_RECEIVED_EMPTY_RAW_TEXT}). See classification_json.ocr_instrumentation.`
        : pdfWeak
          ? 'PDF text may be incomplete (scanned document).'
          : null,
      updated_at: new Date().toISOString(),
      selected_month_key: effectiveMonthKey,
      detected_month_key: classification.detected_month_key,
      airline_guess_id: classification.airline_guess_id,
      role_guess_id: classification.role_guess_id,
      software_guess_id: classification.software_guess_id,
      view_guess_id: classification.view_guess_id,
      classification_confidence: classification.confidence,
      classification_json: {
        parser_key: 'jetblue_flica_structured_v1',
        template_id: '00000000-0000-4000-8000-000000000499',
        jetblue_flica_skip_generic_candidates: true,
        jetblue_flica_ocr_detect: isJetBlueFlicaMonthlyOcr,
        jetblue_flica_path_detect: isJetBlueFlicaGuided,
        signals: classification.signals,
        ocr_instrumentation: {
          storage_path: filePath,
          storage_download_bytes: buf.length,
          mime_from_extension: mimeFromExtension,
          file_kind: kind,
          raw_text_len_for_db: rawText.length,
          handoff_reason_code: handoffCode,
          reason_codes: handoffEmpty ? [OcrTraceReason.PARSER_RECEIVED_EMPTY_RAW_TEXT] : [],
          vision_ocr: imageOcrDebug?.ocrInstrument ?? null,
        },
        ocr_pipeline: imageOcrDebug
          ? {
              merged_len: imageOcrDebug.mergedLen,
              weak_ocr: imageOcrDebug.weakOcrFlag,
              logs: imageOcrDebug.pipelineLogs,
              variant_char_counts: imageOcrDebug.variantCharCounts,
              ocr_issues: pickOcrIssueCodes({
                mergedLen: imageOcrDebug.mergedLen,
                monthDetected: Boolean(classification.detected_month_key ?? effectiveMonthKey),
                evidenceFound: flicaOcrHasScheduleEvidence(rawText),
                multiPass: Object.keys(imageOcrDebug.variantCharCounts).length > 1,
                salvageParserUsed: false,
              }),
            }
          : undefined,
      },
      applied_template_id: '00000000-0000-4000-8000-000000000499',
    };

    const jbUpd = await updateScheduleImportBatchRow(supabase, batchId, batchPatch);
    if (jbUpd.error) {
      console.error('[import-schedule-ocr] ocr_stage_batch_update_failed', {
        reason_code: OcrTraceReason.BATCH_UPDATE_FAILED,
        message: jbUpd.error.message,
        batch_id: batchId,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        batch_id: batchId,
        row_count: 0,
        warning_count: 0,
        pdf_weak: pdfWeak,
        parser_key: 'jetblue_flica_structured_v1',
        template_id: '00000000-0000-4000-8000-000000000499',
        classification_confidence: classification.confidence,
        jetblue_flica_skip_generic_candidates: true,
        jetblue_flica_ocr_detect: isJetBlueFlicaMonthlyOcr,
        raw_extracted_text_len: rawText.length,
        storage_download_bytes: buf.length,
        ocr_handoff_reason_code: handoffCode,
        batch_update_error: jbUpd.error?.message ?? null,
        batch_update_used_core_fallback: jbUpd.used_core_fallback,
        batch_update_extended_skipped: jbUpd.extended_error != null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

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
      ocr_instrumentation: {
        storage_path: filePath,
        storage_download_bytes: buf.length,
        mime_from_extension: mimeFromExtension,
        file_kind: kind,
        raw_text_len_for_db: rawText.length,
        handoff_reason_code: rawText.length === 0 ? OcrTraceReason.PARSER_RECEIVED_EMPTY_RAW_TEXT : null,
        vision_ocr: imageOcrDebug?.ocrInstrument ?? null,
      },
    },
    applied_template_id: templateId,
  };

  const genUpd = await updateScheduleImportBatchRow(supabase, batchId, batchPatch);
  if (genUpd.error) {
    console.error('[import-schedule-ocr] ocr_stage_batch_update_failed', {
      reason_code: OcrTraceReason.BATCH_UPDATE_FAILED,
      message: genUpd.error.message,
      batch_id: batchId,
    });
  }

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
      raw_extracted_text_len: rawText.length,
      storage_download_bytes: buf.length,
      ocr_handoff_reason_code: rawText.length === 0 ? OcrTraceReason.PARSER_RECEIVED_EMPTY_RAW_TEXT : null,
      batch_update_error: genUpd.error?.message ?? null,
      batch_update_used_core_fallback: genUpd.used_core_fallback,
      batch_update_extended_skipped: genUpd.extended_error != null,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
