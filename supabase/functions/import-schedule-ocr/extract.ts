/**
 * Text extraction: Google Vision (images); PDFs use **unpdf** text, then optional **embedded XObject image** OCR.
 *
 * JetBlue FLICA: preprocess (upscale/strips), multi-pass OCR merge, weak-OCR salvage hints.
 * Rasterizing arbitrary PDF pages still needs Node+canvas (unsupported in Edge); many scanned PDFs embed
 * full-page JPEG/PNG per page — `extractImages` + sharp + Vision covers those without canvas.
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

/** Minimum total characters before we treat PDF text extraction as usable (FLICA PDFs are dense). */
const MIN_PDF_TEXT_CHARS = 80;
/** Per-page threshold: below this, page may be image-only — try embedded-image Vision OCR. */
const MIN_PDF_PAGE_TEXT_CHARS = 45;
/** Cap Vision calls for oversized schedules (pages × images). */
const MAX_PDF_PAGES_FOR_EMBEDDED_OCR = 28;
const MAX_EMBEDDED_IMAGES_PER_PDF_PAGE = 8;

function visionEnvAvailable(): boolean {
  const k = Deno.env.get('GOOGLE_CLOUD_API_KEY')?.trim();
  const pem = Deno.env.get('GOOGLE_CLOUD_PRIVATE_KEY')?.trim();
  return Boolean(k || pem);
}

/** Encode embedded PDF image bitmap as JPEG for Vision (resize if very wide). */
async function embeddedPdfImageToJpeg(
  sharpDefault: typeof import('npm:sharp').default,
  img: { data: Uint8Array; width: number; height: number; channels: 1 | 3 | 4 }
): Promise<Uint8Array> {
  const { Buffer } = await import('node:buffer');
  let pipe = sharpDefault(Buffer.from(img.data), {
    raw: { width: img.width, height: img.height, channels: img.channels },
  }).rotate();
  if (img.width > 3600) {
    pipe = pipe.resize({ width: 3600 });
  }
  const buf = await pipe.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return new Uint8Array(buf);
}

/**
 * For weak PDF text pages, pull embedded paintImageXObject bitmaps and run Vision (FLICA-style merge).
 * No canvas — works on Supabase Edge when Vision credentials exist.
 */
async function ocrPdfWeakPagesViaEmbeddedImages(
  pdfBytes: Uint8Array,
  pageNums: number[],
  apiKey: string | undefined
): Promise<{
  ocrByPage: Map<number, string>;
  embedded_images_per_page: Record<number, number>;
  ocr_log_lines: string[];
}> {
  const ocrByPage = new Map<number, string>();
  const embedded_images_per_page: Record<number, number> = {};
  const ocr_log_lines: string[] = [];
  const sharpDefault = (await import('npm:sharp')).default;
  const { extractImages } = await import('npm:unpdf@1.6.0');

  const unique = [...new Set(pageNums)].filter((n) => n >= 1).slice(0, MAX_PDF_PAGES_FOR_EMBEDDED_OCR);
  for (const pageNum of unique) {
    try {
      const imgs = await extractImages(pdfBytes, pageNum);
      embedded_images_per_page[pageNum] = imgs.length;
      let combined = '';
      const slice = imgs.slice(0, MAX_EMBEDDED_IMAGES_PER_PDF_PAGE);
      for (let ii = 0; ii < slice.length; ii++) {
        const img = slice[ii];
        const data = img?.data;
        if (!data || img.width < 6 || img.height < 6) continue;
        const ch = img.channels;
        if (ch !== 1 && ch !== 3 && ch !== 4) continue;
        const u8 = data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const jpeg = await embeddedPdfImageToJpeg(sharpDefault, {
          data: u8,
          width: img.width,
          height: img.height,
          channels: ch,
        });
        if (jpeg.length < 64) continue;
        const [docT, txtT] = await Promise.all([
          visionAnnotate(jpeg, apiKey, 'DOCUMENT_TEXT_DETECTION'),
          visionAnnotate(jpeg, apiKey, 'TEXT_DETECTION'),
        ]);
        const piece = mergeFlicaVisionOcr(docT, txtT).trim();
        if (piece.length > 4) combined += (combined ? '\n' : '') + piece;
      }
      if (combined.trim()) ocrByPage.set(pageNum, combined.trim());
    } catch (e) {
      ocr_log_lines.push(`page_${pageNum}:${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ocrByPage, embedded_images_per_page, ocr_log_lines };
}

export type PdfExtractionDebug = {
  engine: 'unpdf';
  pdf_byte_length: number;
  page_count: number;
  page_text_lengths: number[];
  merged_text_length: number;
  pages_below_min_chars: number[];
  used_ocr_fallback: boolean;
  ocr_fallback_page_numbers: number[];
  /** Pages where embedded-image OCR ran and returned text */
  embedded_image_ocr_pages: number[];
  embedded_images_per_page: Record<number, number>;
  /** True when weak pages had no extractable bitmaps (vector-only or canvas-only scan) */
  embedded_image_ocr_unavailable_for_weak_pages: boolean;
  vision_configured: boolean;
  ocr_fallback_log?: string[];
};

/**
 * Extract text from a PDF using unpdf (bundles pdf.js without browser worker/CDN setup).
 * Avoids pdfjs-dist + GlobalWorkerOptions which break on Supabase Edge package resolution.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<{
  text: string;
  usedOcrFallback: boolean;
  debug: PdfExtractionDebug;
}> {
  await import('./pdf-polyfills.ts');

  console.log('[import-schedule-ocr] pdf_stage_start', {
    file_kind: 'pdf',
    pdf_byte_length: bytes.byteLength,
  });

  if (bytes.byteLength === 0) {
    throw new Error('PDF_EMPTY_FILE: The uploaded PDF is empty (0 bytes).');
  }

  try {
    const { extractText } = await import('npm:unpdf@1.6.0');
    const result = await extractText(bytes, { mergePages: false });
    const totalPages = result.totalPages ?? 0;
    const pageArr = result.text;
    const page_text_lengths = pageArr.map((t) => String(t ?? '').trim().length);
    const pages_below_min_chars = page_text_lengths
      .map((len, i) => (len < MIN_PDF_PAGE_TEXT_CHARS ? i + 1 : 0))
      .filter((n) => n > 0);

    let merged = pageArr
      .map((t) => String(t ?? '').trim())
      .filter((s) => s.length > 0)
      .join('\n\n');
    let merged_text_length = merged.length;

    console.log('[import-schedule-ocr] pdf_stage_unpdf_pages', {
      file_kind: 'pdf',
      pdf_byte_length: bytes.byteLength,
      page_count: totalPages,
      page_text_lengths,
      merged_text_length,
      pages_below_min_chars,
    });

    let weakTotal = merged.trim().length < MIN_PDF_TEXT_CHARS;

    /** Prefer OCR for pages below text threshold; if whole doc is weak but no page flagged, sample all pages. */
    let pagesNeedingOcr = [...pages_below_min_chars];
    if (weakTotal && pagesNeedingOcr.length === 0 && totalPages > 0) {
      pagesNeedingOcr = Array.from({ length: Math.min(totalPages, MAX_PDF_PAGES_FOR_EMBEDDED_OCR) }, (_, i) => i + 1);
    }

    const apiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY')?.trim();
    const visionOk = visionEnvAvailable();

    let ocrByPage = new Map<number, string>();
    let embedded_images_per_page: Record<number, number> = {};
    let ocr_log_lines: string[] = [];

    if (visionOk && pagesNeedingOcr.length > 0) {
      console.log('[import-schedule-ocr] pdf_stage_embedded_image_ocr_start', {
        file_kind: 'pdf',
        pages: pagesNeedingOcr.length,
        page_list_head: pagesNeedingOcr.slice(0, 12),
      });
      const emb = await ocrPdfWeakPagesViaEmbeddedImages(bytes, pagesNeedingOcr, apiKey);
      ocrByPage = emb.ocrByPage;
      embedded_images_per_page = emb.embedded_images_per_page;
      ocr_log_lines = emb.ocr_log_lines;

      const patched: string[] = [];
      for (let i = 0; i < pageArr.length; i++) {
        const pageNum = i + 1;
        const base = String(pageArr[i] ?? '').trim();
        const ocr = ocrByPage.get(pageNum)?.trim() ?? '';
        if (ocr) {
          if (base.length < MIN_PDF_PAGE_TEXT_CHARS) {
            patched.push(ocr);
          } else {
            patched.push(mergeFlicaVisionOcr(base, ocr));
          }
        } else {
          patched.push(base);
        }
      }
      merged = patched
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .join('\n\n');
      merged_text_length = merged.length;
      weakTotal = merged.trim().length < MIN_PDF_TEXT_CHARS;

      const perPageLensAfter = patched.map((s) => s.trim().length);
      console.log('[import-schedule-ocr] pdf_stage_embedded_image_ocr_done', {
        file_kind: 'pdf',
        ocr_pages_with_text: [...ocrByPage.keys()],
        ocr_chars_total: [...ocrByPage.values()].reduce((a, s) => a + s.length, 0),
        merged_text_length_after: merged_text_length,
        page_text_lengths_after_embedded_ocr: perPageLensAfter,
      });
    } else if (!visionOk && pagesNeedingOcr.length > 0) {
      console.warn('[import-schedule-ocr] pdf_stage_embedded_image_ocr_skipped', {
        file_kind: 'pdf',
        reason: 'no_google_vision_credentials',
      });
    }

    const ranEmbeddedImageOcr = ocrByPage.size > 0;
    const ocrFallbackPageNums = [...ocrByPage.keys()].sort((a, b) => a - b);
    const embedded_no_yield =
      visionOk &&
      pagesNeedingOcr.length > 0 &&
      ocrByPage.size === 0 &&
      pagesNeedingOcr.every((p) => (embedded_images_per_page[p] ?? 0) === 0);

    const debug: PdfExtractionDebug = {
      engine: 'unpdf',
      pdf_byte_length: bytes.byteLength,
      page_count: totalPages,
      page_text_lengths,
      merged_text_length,
      pages_below_min_chars,
      used_ocr_fallback: ranEmbeddedImageOcr,
      ocr_fallback_page_numbers: ocrFallbackPageNums,
      embedded_image_ocr_pages: ocrFallbackPageNums,
      embedded_images_per_page,
      embedded_image_ocr_unavailable_for_weak_pages: embedded_no_yield,
      vision_configured: visionOk,
      ocr_fallback_log: ocr_log_lines.length > 0 ? ocr_log_lines : undefined,
    };

    let textOut = merged;
    if (weakTotal) {
      textOut = `${merged}\n\n[import: PDF had very little selectable text after extraction (may be scanned or image-only). Try screenshot import if pairings are missing.]`;
    }

    return {
      text: textOut,
      /** True when merged text is still below threshold (warn in UI / batch). Distinct from `debug.used_ocr_fallback`. */
      usedOcrFallback: weakTotal,
      debug,
    };
  } catch (err) {
    const inner = err instanceof Error ? err.message : String(err);
    console.error('[import-schedule-ocr] pdf_stage_engine_failed', {
      file_kind: 'pdf',
      pdf_byte_length: bytes.byteLength,
      message: inner,
    });
    throw new Error(
      `PDF_EXTRACTION_ENGINE: ${inner}. The server could not read this PDF (extraction engine or unsupported format).`
    );
  }
}
