import type { ToolCta } from './types';

export function ctaLabel(cta: ToolCta): string {
  switch (cta) {
    case 'open':
      return 'Open';
    case 'add':
      return 'Add to My Tools';
    case 'unlock':
      return 'Unlock';
    case 'included':
      return 'Included';
    case 'view_bundle':
      return 'View Bundle';
    case 'owned':
      return 'Owned';
    case 'saved':
      return 'Saved';
    default:
      return 'Open';
  }
}
