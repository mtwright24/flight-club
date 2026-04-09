/** Screen horizontal inset for carousels (matches section headings) */
export const EDGE_INSET = 16;

/** Space between two carousel cards (ItemSeparator width) */
export const CARD_GAP = 16;

/** Extra padding at end of horizontal lists so the last card isn’t flush to the screen edge */
export const CAROUSEL_TAIL_INSET = 14;

/** Standard carousel card width — fixed band so text never shares a row with the next card */
export function standardCarouselCardWidth(screenWidth: number): number {
  const max = 292;
  const min = 264;
  const w = Math.round(screenWidth * 0.76);
  return Math.min(max, Math.max(min, w));
}

/** Featured: one dominant card with visible peek of the next */
export function featuredCarouselCardWidth(screenWidth: number): number {
  return Math.round(screenWidth * 0.86);
}

/** Two-column grid: equal columns with gap */
export function exploreGridColumnWidth(screenWidth: number, gap: number = 12): number {
  return (screenWidth - EDGE_INSET * 2 - gap) / 2;
}
