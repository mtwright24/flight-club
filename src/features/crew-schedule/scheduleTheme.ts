/** Light operational surfaces for schedule reading (not dark / not social cards). */
export const scheduleTheme = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F9',
  text: '#0F172A',
  textSecondary: '#64748B',
  line: '#E2E8F0',
  accent: '#B5161E',
  /** Quick-action tiles (trip detail, etc.) — red stroke; lighter than fill red so outline reads clearly */
  actionTileBorder: '#CC4A52',
  tintOff: '#EEF2FF',
  tintRsv: '#FEF3C7',
  tintPto: '#DCFCE7',
  tintFly: '#FFFFFF',

  /**
   * JetBlue FLICA import review — uses shared text/accent/line from above.
   * Semantic greens/ambers/reds stay grouped here so import UI tracks theme changes.
   */
  importReview: {
    pageBg: '#EEF0F3',
    textSubtle: '#94A3B8',
    good: '#15803D',
    goodBg: '#DCFCE7',
    warn: '#B45309',
    warnBg: '#FEF3C7',
    bad: '#B91C1C',
    badBg: '#FEE2E2',
  },
} as const;
