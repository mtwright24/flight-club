/**
 * Source classifier — multi-airline / multi-role signals + user memory hints.
 * Extend with additional keyword packs or models; keep outputs stable for the router.
 */

import type { ClassificationResult, UserScheduleProfileRow } from './types.ts';
import { SEED_IDS } from './seedIds.ts';

function detectMonthFromScheduleBody(text: string, defaultYear: number): string | null {
  /** Full month names (FLICA sidebar e.g. "April Schedule"). */
  const monNames = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  /** Abbreviations: "Apr 3", "Operates: Apr 3-Apr 13" — OCR rarely has full month on every line. */
  const monAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const lower = text.toLowerCase();
  let best: { m: number; score: number } | null = null;
  for (let i = 0; i < monNames.length; i++) {
    const re = new RegExp(`\\b${monNames[i]}\\b`, 'gi');
    const m = lower.match(re);
    const score = m ? m.length * 2 : 0;
    if (score > 0 && (!best || score > best.score)) best = { m: i + 1, score };
  }
  for (let i = 0; i < monAbbr.length; i++) {
    const re = new RegExp(`\\b${monAbbr[i]}\\.?\\b`, 'gi');
    const m = lower.match(re);
    const score = m ? m.length : 0;
    if (score > 0 && (!best || score > best.score)) best = { m: i + 1, score };
  }
  if (!best) return null;
  return `${defaultYear}-${String(best.m).padStart(2, '0')}`;
}

export function classifyImport(
  rawText: string,
  userMonthKey: string,
  profile: UserScheduleProfileRow
): ClassificationResult {
  const signals: string[] = [];
  let confidence = 0.45;
  const upper = rawText.toUpperCase();

  let airline_guess_id: string | null = null;
  let role_guess_id: string | null = null;
  let software_guess_id: string | null = null;
  const view_guess_id = SEED_IDS.viewMonthlyTable;

  if (/\bFLICA\b/i.test(rawText)) {
    software_guess_id = SEED_IDS.softwareFlica;
    signals.push('keyword:flica');
    confidence += 0.18;
  }

  if (/\bJET\s*BLUE\b|\bJETBLUE\b|\bB6\b/i.test(upper)) {
    airline_guess_id = SEED_IDS.airlineJetBlue;
    signals.push('keyword:jetblue');
    confidence += 0.12;
  }

  if (/\bFA\b|\bFLIGHT\s+ATTENDANT\b|\bINFLIGHT\b/i.test(upper)) {
    role_guess_id = SEED_IDS.roleFA;
    signals.push('keyword:fa');
    confidence += 0.08;
  }

  if (/\bTH\b.*\bJ\d{3}/i.test(rawText) || /\b(MO|TU|WE|TH|FR|SA|SU)\s+\d{1,2}\b/.test(rawText)) {
    signals.push('layout:tabular_dow');
    confidence += 0.06;
  }

  if (profile?.last_successful_template_id) {
    signals.push('profile:prior_template');
    confidence += 0.05;
  }
  if (profile?.airline_id) {
    airline_guess_id = airline_guess_id ?? profile.airline_id;
    signals.push('profile:airline');
    confidence += 0.04;
  }
  if (profile?.software_id && !software_guess_id) {
    software_guess_id = profile.software_id;
    signals.push('profile:software');
    confidence += 0.03;
  }
  if (profile?.role_id && !role_guess_id) {
    role_guess_id = profile.role_id;
    signals.push('profile:role');
    confidence += 0.03;
  }

  if (!software_guess_id) {
    software_guess_id = SEED_IDS.softwareGeneric;
    signals.push('fallback:generic_software');
  }

  const year = Number(userMonthKey.slice(0, 4)) || new Date().getFullYear();
  const detected_month_key = detectMonthFromScheduleBody(rawText, year);

  confidence = Math.min(0.98, Math.max(0.15, confidence));

  return {
    airline_guess_id,
    role_guess_id,
    software_guess_id,
    view_guess_id,
    detected_month_key,
    confidence,
    signals,
  };
}
