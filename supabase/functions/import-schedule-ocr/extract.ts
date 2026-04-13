/**
 * Text extraction: Google Vision (images) + pdf.js (PDF text only).
 *
 * JetBlue FLICA: preprocess (upscale/strips), multi-pass OCR merge, weak-OCR salvage hints.
 * Do not statically import pdfjs-dist at module load: Edge crashes (DOMMatrix) before Vision runs.
 */

import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { SignJWT, importPKCS8 } from 'npm:jose@5';
import { buildFlicaImagePipeline } from './flicaPreprocess.ts';
import { flicaOcrHasScheduleEvidence } from './flicaOcrSalvage.ts';
import { OcrTraceReason } from './ocrTraceCodes.ts';

const VISION_SCOPE = 'https://www.googleapis.com/auth/cloud-vision';

let cachedToken: { token: string; exp: number } | null = null;

/** Supabase secrets often store JSON-style `\n`; strip quotes from bad pastes. */
function normalizeGooglePrivateKeyPem(raw: string): string {
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  s = s.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  return s.trim();
}

async function getGoogleAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.token;

  const clientEmail = Deno.env.get('GOOGLE_CLOUD_CLIENT_EMAIL');
  const privateKeyRaw = Deno.env.get('GOOGLE_CLOUD_PRIVATE_KEY');
  if (!clientEmail || !privateKeyRaw) {
    throw new Error(
      'Missing GOOGLE_CLOUD_CLIENT_EMAIL or GOOGLE_CLOUD_PRIVATE_KEY. Prefer setting GOOGLE_CLOUD_API_KEY (no PEM) in Edge Function secrets.'
    );
  }
  if (privateKeyRaw.trimStart().startsWith('{')) {
    throw new Error(
      'GOOGLE_CLOUD_PRIVATE_KEY must be the PEM text only (private_key field from GCP JSON), not the whole JSON. Or set GOOGLE_CLOUD_API_KEY.'
    );
  }

  const privateKey = normalizeGooglePrivateKeyPem(privateKeyRaw);
  if (!privateKey.includes('BEGIN')) {
    throw new Error(
      'GOOGLE_CLOUD_PRIVATE_KEY must be a PEM block (-----BEGIN ...). Or set GOOGLE_CLOUD_API_KEY.'
    );
  }
  if (privateKey.includes('BEGIN RSA PRIVATE KEY') && !privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new Error(
      'GOOGLE_CLOUD_PRIVATE_KEY is PKCS#1 (RSA PRIVATE KEY). jose needs PKCS#8 (BEGIN PRIVATE KEY). Re-download the GCP service account key or use GOOGLE_CLOUD_API_KEY.'
    );
  }

  let key;
  try {
    key = await importPKCS8(privateKey, 'RS256');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Private key could not be loaded (${msg}). Fastest fix: Supabase → Edge Functions → Secrets → add GOOGLE_CLOUD_API_KEY = your GCP API key (Vision). Then PEM is not used. Or fix GOOGLE_CLOUD_PRIVATE_KEY to PKCS#8 (-----BEGIN PRIVATE KEY-----) from the service account JSON.`
    );
  }

  const jwt = await new SignJWT({ scope: VISION_SCOPE })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Google OAuth failed: ${JSON.stringify(data)}`);
  }
  const accessToken = data.access_token as string;
  cachedToken = { token: accessToken, exp: now + 3500 };
  return accessToken;
}

export type VisionImageExtractionDebug = {
  pipelineLogs: string[];
  variantCharCounts: Record<string, number>;
  mergedLen: number;
  weakOcrFlag: boolean;
  /** End-to-end OCR instrumentation (Edge logs + DB classification_json) */
  ocrInstrument: {
    ocr_provider: 'google_cloud_vision';
    google_auth_mode: 'api_key' | 'oauth';
    preprocess_sharp_ok: boolean;
    preprocess_output_width: number;
    preprocess_output_height: number;
    primary_document_text_len: number;
    primary_text_detection_len: number;
    primary_merged_len: number;
    primary_doc_sample_300: string;
    merged_after_all_chunks_len: number;
    merged_before_weak_marker_len: number;
    merged_after_trim_stripped_len: number;
    weak_ocr_marker: boolean;
  };
};

export type VisionImageExtractionResult = {
  text: string;
  debug: VisionImageExtractionDebug;
};

async function runMergedDocText(
  bytes: Uint8Array,
  apiKey: string | undefined
): Promise<string> {
  const [docText, txtText] = await Promise.all([
    visionAnnotate(bytes, apiKey, 'DOCUMENT_TEXT_DETECTION'),
    visionAnnotate(bytes, apiKey, 'TEXT_DETECTION'),
  ]);
  return mergeFlicaVisionOcr(docText, txtText);
}

/** Primary pass only — separate doc vs text lengths for tracing. */
async function runPrimaryMergedWithLens(
  bytes: Uint8Array,
  apiKey: string | undefined
): Promise<{ merged: string; docLen: number; txtLen: number; docSample300: string }> {
  const [docText, txtText] = await Promise.all([
    visionAnnotate(bytes, apiKey, 'DOCUMENT_TEXT_DETECTION'),
    visionAnnotate(bytes, apiKey, 'TEXT_DETECTION'),
  ]);
  const merged = mergeFlicaVisionOcr(docText, txtText);
  return {
    merged,
    docLen: docText.length,
    txtLen: txtText.length,
    docSample300: docText.slice(0, 300),
  };
}

async function runDocOnly(bytes: Uint8Array, apiKey: string | undefined): Promise<string> {
  return visionAnnotate(bytes, apiKey, 'DOCUMENT_TEXT_DETECTION');
}

/**
 * FLICA-aware Vision extraction: preprocess (HEIC→JPEG, upscale, strips), multi-pass merge.
 */
export async function visionDocumentTextFromImage(
  bytes: Uint8Array,
  filePathHint?: string
): Promise<VisionImageExtractionResult> {
  if (bytes.length === 0) {
    throw new Error('Image file is empty after download.');
  }

  const apiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY')?.trim();
  const googleAuthMode: 'api_key' | 'oauth' = apiKey ? 'api_key' : 'oauth';
  console.log('[import-schedule-ocr] ocr_stage_engine', {
    ocr_provider: 'google_cloud_vision',
    google_auth_mode: googleAuthMode,
    ocr_invoked: true,
    input_bytes: bytes.length,
  });

  const pipeline = await buildFlicaImagePipeline(bytes, filePathHint);
  const preprocessSharpOk = pipeline.outputMeta.width > 0 || pipeline.logs.some((l) => /upscale|converted_heif|primary_upscale/i.test(l));
  console.log('[import-schedule-ocr] ocr_stage_decode_preprocess', {
    decode_preprocess_reached: true,
    mime_hint: pipeline.originalMimeHint,
    preprocess_sharp_ok: preprocessSharpOk,
    preprocess_output_dimensions: `${pipeline.outputMeta.width}x${pipeline.outputMeta.height}`,
    pipeline_logs: pipeline.logs,
  });

  const variantCharCounts: Record<string, number> = {};

  const chunks: string[] = [];
  const primaryLens = await runPrimaryMergedWithLens(pipeline.primary, apiKey);
  const primaryMerged = primaryLens.merged;
  variantCharCounts.primary_merged = primaryMerged.length;

  console.log('[import-schedule-ocr] ocr_stage_primary_pass_raw', {
    primary_document_text_len: primaryLens.docLen,
    primary_text_detection_len: primaryLens.txtLen,
    primary_merged_len: primaryMerged.length,
    primary_merged_sample_300: primaryMerged.slice(0, 300),
    primary_doc_sample_300: primaryLens.docSample300,
  });

  chunks.push(primaryMerged);

  /** Cropped “body” without status/browser chrome — often reads better than full frame. */
  if (pipeline.bodyCrop) {
    const bodyMerged = await runMergedDocText(pipeline.bodyCrop, apiKey);
    variantCharCounts.body_crop_merged = bodyMerged.length;
    if (bodyMerged.trim().length > 6) chunks.push(bodyMerged);
  }

  if (pipeline.contrastVariant) {
    const cv = await runMergedDocText(pipeline.contrastVariant, apiKey);
    variantCharCounts.contrast_body_merged = cv.length;
    if (cv.trim().length > 6) chunks.push(cv);
  }

  const stripRuns: [string, Uint8Array | null][] = [
    ['strip_top_doc', pipeline.stripTop],
    ['strip_mid_doc', pipeline.stripMid],
    ['strip_bottom_doc', pipeline.stripBottom],
    ['strip_left_doc', pipeline.stripLeft],
  ];
  for (const [key, buf] of stripRuns) {
    if (!buf) continue;
    const t = await runDocOnly(buf, apiKey);
    variantCharCounts[key] = t.length;
    if (t.trim().length > 8) chunks.push(t);
  }

  let merged = chunks.filter((c) => c.trim().length > 0).join('\n\n---FLICA_STRIP---\n\n');
  const mergedAfterAllChunksLen = merged.length;
  console.log('[import-schedule-ocr] ocr_stage_merged_after_chunk_join', {
    merged_len_before_supplement: mergedAfterAllChunksLen,
    merged_trim_len_before_supplement: merged.trim().length,
  });

  /**
   * Supplement when DOCUMENT pass is weak: TEXT_DETECTION-only sometimes picks up small labels
   * (pairing codes, FLTNO) that sparse document layout misses — still full-res pipeline buffers, not thumbnails.
   */
  if (merged.trim().length < 160) {
    const txtPrimary = await visionAnnotate(pipeline.primary, apiKey, 'TEXT_DETECTION');
    variantCharCounts.primary_text_detection_only = txtPrimary.length;
    if (txtPrimary.trim().length > 10) {
      merged = `${merged}\n\n---FLICA_STRIP---\n\n${txtPrimary}`;
    }
  }
  if (merged.trim().length < 160 && pipeline.bodyCrop) {
    const txtBody = await visionAnnotate(pipeline.bodyCrop, apiKey, 'TEXT_DETECTION');
    variantCharCounts.body_crop_text_detection_only = txtBody.length;
    if (txtBody.trim().length > 10) {
      merged = `${merged}\n\n---FLICA_STRIP---\n\n${txtBody}`;
    }
  }

  const mergedBeforeWeakMarkerLen = merged.length;
  const stripped = merged.trim();
  const evidence = flicaOcrHasScheduleEvidence(stripped);
  let weakOcrFlag = false;

  console.log('[import-schedule-ocr] ocr_stage_cleanup_threshold', {
    text_len_before_trim: merged.length,
    text_len_after_trim_stripped: stripped.length,
    has_evidence: evidence,
  });

  if (stripped.length === 0) {
    console.error('[import-schedule-ocr] ocr_threshold_discard', {
      reason_code: OcrTraceReason.OCR_RETURNED_EMPTY,
      detail: 'merged_trimmed_empty',
      variantCharCounts,
      pipeline: pipeline.logs,
    });
    const raw = JSON.stringify({ ...variantCharCounts, pipeline: pipeline.logs });
    throw new Error(
      `Vision returned no text for this image (${raw}). Try a brighter screenshot, crop to the FLICA page, or export as PNG/JPEG.`
    );
  }

  if (stripped.length < 140 && evidence) {
    merged += '\n\n[FLICA_WEAK_OCR]';
    weakOcrFlag = true;
  }

  if (stripped.length < 8 && !evidence) {
    console.error('[import-schedule-ocr] ocr_threshold_discard', {
      reason_code: OcrTraceReason.OCR_TEXT_DISCARDED_BY_THRESHOLD,
      detail: 'below_min_len_without_evidence',
      stripped_len: stripped.length,
      variantCharCounts,
      pipeline: pipeline.logs,
    });
    const raw = JSON.stringify({ ...variantCharCounts, pipeline: pipeline.logs });
    throw new Error(
      `Vision returned almost no usable text (${raw}). Try a closer zoom on the schedule, brighter screen, or fewer browser margins.`
    );
  }

  const mergedLen = merged.replace(/\n\n\[FLICA_WEAK_OCR\]\s*$/, '').trim().length;

  const ocrInstrument: VisionImageExtractionDebug['ocrInstrument'] = {
    ocr_provider: 'google_cloud_vision',
    google_auth_mode: googleAuthMode,
    preprocess_sharp_ok: preprocessSharpOk,
    preprocess_output_width: pipeline.outputMeta.width,
    preprocess_output_height: pipeline.outputMeta.height,
    primary_document_text_len: primaryLens.docLen,
    primary_text_detection_len: primaryLens.txtLen,
    primary_merged_len: primaryMerged.length,
    primary_doc_sample_300: primaryLens.docSample300,
    merged_after_all_chunks_len: mergedAfterAllChunksLen,
    merged_before_weak_marker_len: mergedBeforeWeakMarkerLen,
    merged_after_trim_stripped_len: stripped.length,
    weak_ocr_marker: weakOcrFlag,
  };

  console.log('[import-schedule-ocr] ocr_stage_handoff_ok', {
    final_merged_len: merged.length,
    merged_len_for_db: mergedLen,
    weak_ocr_flag: weakOcrFlag,
  });

  return {
    text: merged,
    debug: {
      pipelineLogs: [
        ...pipeline.logs,
        `mime_hint:${pipeline.originalMimeHint}`,
        `preprocess_out:${pipeline.outputMeta.width}x${pipeline.outputMeta.height}`,
      ],
      variantCharCounts,
      mergedLen,
      weakOcrFlag,
      ocrInstrument,
    },
  };
}

/** Merge DOCUMENT_TEXT + TEXT_DETECTION — split-screen UIs often need both. */
function mergeFlicaVisionOcr(doc: string, txt: string): string {
  const a = doc.trim();
  const b = txt.trim();
  if (a.length < 8 && b.length < 8) return '';
  if (a.length < 8) return b;
  if (b.length < 8) return a;
  if (a === b) return a;
  const MIN_SUBSTANTIAL = 120;
  if (a.length >= MIN_SUBSTANTIAL && b.length >= MIN_SUBSTANTIAL) {
    return `${a}\n\n---\n\n${b}`;
  }
  if (b.length > a.length * 1.2) return b;
  if (a.length > b.length * 1.2) return a;
  return `${a}\n\n---\n\n${b}`;
}

async function visionAnnotate(
  bytes: Uint8Array,
  apiKey: string | undefined,
  feature: 'DOCUMENT_TEXT_DETECTION' | 'TEXT_DETECTION'
): Promise<string> {
  const b64 = encodeBase64(bytes);
  const body = JSON.stringify({
    requests: [{ image: { content: b64 }, features: [{ type: feature }] }],
  });

  let url = 'https://vision.googleapis.com/v1/images:annotate';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    url += `?key=${encodeURIComponent(apiKey)}`;
  } else {
    const accessToken = await getGoogleAccessToken();
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(url, { method: 'POST', headers, body });
  const json = await res.json();
  if (!res.ok) {
    console.error('[import-schedule-ocr] ocr_vision_http_error', {
      feature,
      http_status: res.status,
      ok: res.ok,
    });
    if (feature === 'TEXT_DETECTION') return '';
    const raw = JSON.stringify(json);
    if (
      res.status === 403 ||
      /BILLING_DISABLED|requires billing|billing to be enabled/i.test(raw)
    ) {
      throw new Error(
        'Google Cloud Vision needs billing enabled on the GCP project that owns this API key. In Google Cloud Console: Billing → link a billing account to the project, wait a few minutes, then retry.'
      );
    }
    if (
      res.status === 400 &&
      /INVALID_ARGUMENT|Request must specify image and features/i.test(raw)
    ) {
      throw new Error(
        'Vision rejected the image request (INVALID_ARGUMENT). If this is an iPhone photo, export as JPEG/PNG (not HEIC) and retry. Otherwise ensure the file is a supported image (JPEG, PNG, WebP, GIF).'
      );
    }
    throw new Error(`Vision API error: ${raw}`);
  }

  const resp = json.responses?.[0];
  let out = '';
  if (feature === 'DOCUMENT_TEXT_DETECTION') {
    const full = resp?.fullTextAnnotation?.text;
    if (typeof full === 'string' && full.trim().length > 0) out = full;
    else {
      const text0 = resp?.textAnnotations?.[0]?.description;
      if (typeof text0 === 'string') out = text0;
    }
  } else {
    const t0 = resp?.textAnnotations?.[0]?.description;
    if (typeof t0 === 'string') out = t0;
  }

  console.log('[import-schedule-ocr] ocr_vision_response', {
    feature,
    http_status: res.status,
    extracted_text_len_before_merge: out.length,
    sample_first_300: out.slice(0, 300),
  });
  return out;
}

const MIN_PDF_TEXT_CHARS = 80;

/** Pin pdf.js + worker to the same release — unversioned `npm:pdfjs-dist` can drift and break workers. */
const PDFJS_DIST_VERSION = '4.10.38';

type PdfJsModule = typeof import('npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs');
let cachedPdfJs: PdfJsModule | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (cachedPdfJs) return cachedPdfJs;
  await import('./pdf-polyfills.ts');
  const spec = `npm:pdfjs-dist@${PDFJS_DIST_VERSION}/legacy/build/pdf.mjs`;
  const mod = (await import(spec)) as PdfJsModule;
  // pdf.js 4.x: empty workerSrc throws "No GlobalWorkerOptions.workerSrc specified" when setting up the fake worker.
  // Use a public HTTPS URL matching the pinned package (Edge/Deno cannot rely on empty string).
  mod.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_DIST_VERSION}/legacy/build/pdf.worker.mjs`;
  cachedPdfJs = mod;
  return mod;
}

export async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; usedOcrFallback: boolean }> {
  const { getDocument } = await loadPdfJs();
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const loadingTask = getDocument({
    data: buf,
    disableWorker: true,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const parts: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const line = content.items
      .map((it: { str?: string }) => (typeof it.str === 'string' ? it.str : ''))
      .join(' ');
    if (line.trim()) parts.push(line);
  }
  const text = parts.join('\n');
  const weak = text.trim().length < MIN_PDF_TEXT_CHARS;
  return { text, usedOcrFallback: weak };
}
