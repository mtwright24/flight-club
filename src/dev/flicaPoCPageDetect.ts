/**
 * TEMP PoC — classify FLICA WebView page from URL + visible text (no login rework).
 */
import { FLICA_LOGIN_URL_HINT } from './flicaPoCConfig';

export type FlicaPoCPageKind = 'login' | 'forwarding_or_menu' | 'schedule' | 'pdf_or_embed' | 'unknown';

/** Coarse UI classification for FLICA Test debug strip (maps pdf/embed → schedule). */
export type FlicaPoCUiPageKind = 'login' | 'main_menu' | 'schedule' | 'unknown';

export function toFlicaPocUiPageKind(kind: FlicaPoCPageKind): FlicaPoCUiPageKind {
  if (kind === 'login') return 'login';
  if (kind === 'forwarding_or_menu') return 'main_menu';
  if (kind === 'schedule' || kind === 'pdf_or_embed') return 'schedule';
  return 'unknown';
}

/** Captcha / bot wall heuristics (URL + title + visible text). */
export function isLikelyCaptchaPage(url: string, title: string, textSample: string): boolean {
  const b = `${url} ${title} ${(textSample || '').slice(0, 1800)}`.toLowerCase();
  return /\bcaptcha\b|recaptcha|hcaptcha|verify\s+your\s+identity|prove\s+you(?:'re| are)\s+human|robot\s+check/i.test(b);
}

export function detectFlicaPoCPageKind(url: string, text: string): FlicaPoCPageKind {
  const u = (url || '').toLowerCase();
  const t = (text || '').toLowerCase();
  const len = (text || '').length;

  if (/\.pdf(\b|[?#]|$)/i.test(url) || /\bembed\b.*\.pdf|application\/pdf/i.test(t)) {
    return 'pdf_or_embed';
  }
  if (/<embed[^>]+src=|type=["']application\/pdf["']|<object[^>]+application\/pdf/i.test(text)) {
    return 'pdf_or_embed';
  }

  if (FLICA_LOGIN_URL_HINT.test(url)) {
    return 'login';
  }
  if (/\b(password|sign in|log in|username|forgot password|remember me|captcha|signin)\b/i.test(t) && len < 6000) {
    return 'login';
  }

  if (/\b(main menu|crew access|select|welcome to|dashboard)\b/i.test(t) && !/\b(apr|may|mar|feb|jan|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}\b/i.test(t) && !/\bj\d{4}\b/i.test(t)) {
    if (!/\b(block|credit|tafb|pairing duty|pairing\s*id)\b/i.test(t)) {
      return 'forwarding_or_menu';
    }
  }

  if (/\b(block|credit|tafb|pairing|schedule|trip|duty|pairing\s*id|days?\s*off|report time)\b/i.test(t) || /\bj\d{3,5}\b/i.test(t)) {
    return 'schedule';
  }

  if (len < 120 && /embed|object|pdf|viewer/i.test(t)) {
    return 'pdf_or_embed';
  }

  return 'unknown';
}
