/**
 * JetBlue FLICA screenshot preprocessing for Vision OCR: HEIC→JPEG, trim bezels, body crop,
 * aggressive upscale (dense mobile text), multi-region crops for separate passes.
 *
 * OCR always receives these JPEG buffers — never raw HEIC in the Vision request.
 * The in-app “thumbnail” preview does not affect this pipeline (full file bytes from Storage).
 */

// @ts-expect-error Deno node compat
import { Buffer } from 'node:buffer';

const MAX_LONG_SIDE = 4000;
/** Minimum width after upscale — phone FLICA screenshots are often ~1200px wide with tiny text */
const TARGET_MIN_WIDTH = 2800;

export type FlicaImagePipelineResult = {
  /** Primary: full frame (trimmed), upscaled, sharpened JPEG — best first pass for Vision */
  primary: Uint8Array;
  /**
   * Same pixels as `primary` in JPEG form — use for retries instead of raw upload bytes
   * (raw may still be HEIC, which Vision rejects or reads poorly).
   */
  visionSafeFallback: Uint8Array;
  /** Inner crop removing typical status bar + bottom browser chrome */
  bodyCrop: Uint8Array | null;
  stripTop: Uint8Array | null;
  stripMid: Uint8Array | null;
  stripBottom: Uint8Array | null;
  /** Narrow left column (month / totals) — separate OCR pass */
  stripLeft: Uint8Array | null;
  /** Grayscale + normalize + sharpen — alternate for low-contrast captures */
  contrastVariant: Uint8Array | null;
  logs: string[];
  originalMimeHint: string;
  /** Last stage dimensions (primary output) */
  outputMeta: { width: number; height: number };
};

function isLikelyHeifOrHeic(bytes: Uint8Array, filePathHint?: string): boolean {
  const p = (filePathHint ?? '').toLowerCase();
  if (p.endsWith('.heic') || p.endsWith('.heif')) return true;
  if (bytes.length < 12) return false;
  const box = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (box !== 'ftyp') return false;
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return ['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand);
}

async function toUpscaledJpeg(
  sharpMod: typeof import('sharp'),
  input: Buffer,
  logLabel: string,
  logs: string[]
): Promise<{ buf: Buffer; w: number; h: number }> {
  const meta = await sharpMod(input).metadata();
  const w0 = meta.width ?? 0;
  const h0 = meta.height ?? 0;
  if (w0 < 1 || h0 < 1) throw new Error('invalid_dimensions');

  let targetW = w0;
  if (w0 < TARGET_MIN_WIDTH) {
    targetW = Math.min(MAX_LONG_SIDE, Math.round(w0 * 2.8));
  }
  let tw = targetW;
  let th = Math.round(h0 * (tw / w0));
  const m = Math.max(tw, th);
  if (m > MAX_LONG_SIDE) {
    const s = MAX_LONG_SIDE / m;
    tw = Math.round(tw * s);
    th = Math.round(th * s);
  }

  const buf = await sharpMod(input)
    .rotate()
    .resize({ width: tw, kernel: sharpMod.kernel.lanczos3 })
    .sharpen({ sigma: 1 })
    .normalize()
    .jpeg({ quality: 93, mozjpeg: true })
    .toBuffer();

  const m2 = await sharpMod(buf).metadata();
  logs.push(`${logLabel}:${w0}x${h0}->${m2.width ?? '?'}x${m2.height ?? '?'}`);
  return { buf, w: m2.width ?? tw, h: m2.height ?? th };
}

/**
 * Build JPEG variants for multi-pass OCR (full image is always processed — not a UI thumbnail).
 */
export async function buildFlicaImagePipeline(
  bytes: Uint8Array,
  filePathHint?: string
): Promise<FlicaImagePipelineResult> {
  const logs: string[] = [];
  const originalMimeHint = isLikelyHeifOrHeic(bytes, filePathHint) ? 'heic' : 'jpeg_or_png';

  let sharp: typeof import('sharp') | null = null;
  try {
    sharp = (await import('npm:sharp')).default;
  } catch (e) {
    logs.push(`sharp_import_failed:${e instanceof Error ? e.message : String(e)}`);
  }

  if (!sharp) {
    logs.push('pipeline:no_sharp_return_original');
    return {
      primary: bytes,
      visionSafeFallback: bytes,
      bodyCrop: null,
      stripTop: null,
      stripMid: null,
      stripBottom: null,
      stripLeft: null,
      contrastVariant: null,
      logs,
      originalMimeHint,
      outputMeta: { width: 0, height: 0 },
    };
  }

  try {
    let inputBuf = Buffer.from(bytes);
    const meta0 = await sharp(inputBuf).metadata();
    logs.push(`input_meta:${meta0.width ?? '?'}x${meta0.height ?? '?'}:${meta0.format ?? '?'}`);

    let rotated = sharp(inputBuf).rotate();

    if (meta0.format === 'heif' || isLikelyHeifOrHeic(bytes, filePathHint)) {
      inputBuf = await rotated.clone().jpeg({ quality: 93, mozjpeg: true }).toBuffer();
      logs.push('converted_heif_to_jpeg');
    }

    /** Optional: remove solid dark phone bezels (does not shrink content area aggressively). */
    let afterTrim = inputBuf;
    try {
      const trimmedBuf = await sharp(inputBuf).rotate().trim({ threshold: 24 }).toBuffer();
      const mT = await sharp(trimmedBuf).metadata();
      const mI = await sharp(inputBuf).rotate().metadata();
      const wT = mT.width ?? 0;
      const wI = mI.width ?? 1;
      if (wT > wI * 0.5 && wT > 200) {
        afterTrim = Buffer.from(trimmedBuf);
        logs.push(`trim_margins:${wI}x${mI.height}->${wT}x${mT.height}`);
      }
    } catch {
      logs.push('trim_skipped');
    }

    const baseMeta = await sharp(afterTrim).rotate().metadata();
    const w = baseMeta.width ?? 0;
    const h = baseMeta.height ?? 0;
    if (w < 20 || h < 20) throw new Error('image_too_small_after_trim');

    /** Inner “body” — drop top status/URL bar and bottom browser chrome */
    const topCut = Math.floor(h * 0.1);
    const botCut = Math.floor(h * 0.11);
    const bodyH = Math.max(120, h - topCut - botCut);
    const sideMargin = Math.floor(w * 0.02);
    const bodyW = Math.max(120, w - 2 * sideMargin);

    const bodyExtract = await sharp(afterTrim)
      .rotate()
      .extract({
        left: sideMargin,
        top: topCut,
        width: bodyW,
        height: bodyH,
      })
      .toBuffer();
    logs.push(`body_extract:${sideMargin},${topCut}+${bodyW}x${bodyH}`);

    const primaryPack = await toUpscaledJpeg(sharp, Buffer.from(afterTrim), 'primary_upscale', logs);
    const primary = new Uint8Array(primaryPack.buf);

    const bodyPack = await toUpscaledJpeg(sharp, bodyExtract, 'body_crop_upscale', logs);
    const bodyCrop = new Uint8Array(bodyPack.buf);

    const bw = bodyPack.w;
    const bh = bodyPack.h;
    const third = Math.floor(bh / 3);

    let stripTop: Uint8Array | null = null;
    let stripMid: Uint8Array | null = null;
    let stripBottom: Uint8Array | null = null;
    if (third > 80 && bw > 200) {
      const mkStrip = async (top: number, height: number, label: string) => {
        const b = await sharp(Buffer.from(bodyCrop))
          .extract({ left: 0, top, width: bw, height })
          .jpeg({ quality: 90, mozjpeg: true })
          .toBuffer();
        logs.push(`strip_${label}:${bw}x${height}`);
        return new Uint8Array(b);
      };
      stripTop = await mkStrip(0, third, 'top');
      stripMid = await mkStrip(third, third, 'mid');
      stripBottom = await mkStrip(third * 2, bh - third * 2, 'bot');
    }

    let stripLeft: Uint8Array | null = null;
    const leftW = Math.min(Math.floor(bw * 0.28), 520);
    if (leftW > 80 && bh > 200) {
      stripLeft = new Uint8Array(
        await sharp(Buffer.from(bodyCrop))
          .extract({ left: 0, top: 0, width: leftW, height: bh })
          .resize({ width: Math.min(1600, leftW * 2), kernel: sharp.kernel.lanczos3 })
          .sharpen({ sigma: 0.9 })
          .jpeg({ quality: 90, mozjpeg: true })
          .toBuffer()
      );
      logs.push(`strip_left:${leftW}x${bh}`);
    }

    let contrastVariant: Uint8Array | null = null;
    try {
      contrastVariant = new Uint8Array(
        await sharp(Buffer.from(bodyCrop))
          .rotate()
          .grayscale()
          .normalize()
          .linear(1.15, -(128 * 0.05))
          .sharpen({ sigma: 1.1 })
          .jpeg({ quality: 91, mozjpeg: true })
          .toBuffer()
      );
      logs.push('contrast_variant:body_grayscale');
    } catch {
      logs.push('contrast_variant_failed');
    }

    return {
      primary,
      visionSafeFallback: primary,
      bodyCrop,
      stripTop,
      stripMid,
      stripBottom,
      stripLeft,
      contrastVariant,
      logs,
      originalMimeHint,
      outputMeta: { width: primaryPack.w, height: primaryPack.h },
    };
  } catch (e) {
    logs.push(`pipeline_error:${e instanceof Error ? e.message : String(e)}`);
    return {
      primary: bytes,
      visionSafeFallback: bytes,
      bodyCrop: null,
      stripTop: null,
      stripMid: null,
      stripBottom: null,
      stripLeft: null,
      contrastVariant: null,
      logs,
      originalMimeHint,
      outputMeta: { width: 0, height: 0 },
    };
  }
}
