/**
 * Text extraction: Google Vision (images) + pdf.js (PDF text only).
 *
 * Do not statically import pdfjs-dist at module load: Edge crashes (DOMMatrix) before Vision runs,
 * so photo-only uploads would fail even though they only need Vision.
 */

import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { SignJWT, importPKCS8 } from 'npm:jose@5';

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

/** HEIF/HEIC — Cloud Vision does not list HEIC as supported; iPhone photos often fail with INVALID_ARGUMENT. */
function isLikelyHeifOrHeic(bytes: Uint8Array, filePathHint?: string): boolean {
  const p = (filePathHint ?? '').toLowerCase();
  if (p.endsWith('.heic') || p.endsWith('.heif')) return true;
  if (bytes.length < 12) return false;
  const box = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (box !== 'ftyp') return false;
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return ['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand);
}

export async function visionDocumentTextFromImage(
  bytes: Uint8Array,
  filePathHint?: string
): Promise<string> {
  if (bytes.length === 0) {
    throw new Error('Image file is empty after download.');
  }
  if (isLikelyHeifOrHeic(bytes, filePathHint)) {
    throw new Error(
      'HEIC/HEIF is not supported by Google Cloud Vision for this import. In Photos, export or duplicate the image as JPEG or PNG, then import again.'
    );
  }

  const b64 = encodeBase64(bytes);
  const body = JSON.stringify({
    requests: [
      {
        image: { content: b64 },
        // Omit maxResults — some Vision deployments reject DOCUMENT_TEXT_DETECTION + maxResults with INVALID_ARGUMENT.
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      },
    ],
  });

  // Prefer API key (no PEM). Name must be exactly GOOGLE_CLOUD_API_KEY in Edge Function secrets.
  const apiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY')?.trim();
  let url = 'https://vision.googleapis.com/v1/images:annotate';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    url += `?key=${encodeURIComponent(apiKey)}`;
  } else {
    const accessToken = await getGoogleAccessToken();
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });

  const json = await res.json();
  if (!res.ok) {
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
  const full = resp?.fullTextAnnotation?.text;
  if (typeof full === 'string' && full.trim().length > 0) return full;

  const text0 = resp?.textAnnotations?.[0]?.description;
  if (typeof text0 === 'string') return text0;

  return '';
}

const MIN_PDF_TEXT_CHARS = 80;

type PdfJsModule = typeof import('npm:pdfjs-dist/legacy/build/pdf.mjs');
let cachedPdfJs: PdfJsModule | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (cachedPdfJs) return cachedPdfJs;
  await import('./pdf-polyfills.ts');
  const mod = await import('npm:pdfjs-dist/legacy/build/pdf.mjs');
  mod.GlobalWorkerOptions.workerSrc = '';
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
