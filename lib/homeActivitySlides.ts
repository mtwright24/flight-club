import type { NotificationItem } from '../components/ActivityPreview';
import {
  buildHomeActivityModuleData,
  type ActivitySlideTriple,
  type HomeActivityModuleData,
} from './homeActivityPanels';
import { HOME_ACTIVITY_SEED_AVATARS, HOME_ACTIVITY_SEED_SLIDES } from './homeActivitySeed';

export type HomeActivitySlideModel = ActivitySlideTriple;

export type ActivityChromeModel = HomeActivityModuleData['chrome'];

export function buildHomeActivitySlides(items: NotificationItem[]): {
  slides: [HomeActivitySlideModel, HomeActivitySlideModel, HomeActivitySlideModel];
  chrome: ActivityChromeModel;
  usedSeed: boolean;
} {
  if (items.length === 0) {
    return {
      slides: [
        HOME_ACTIVITY_SEED_SLIDES[0],
        HOME_ACTIVITY_SEED_SLIDES[1],
        HOME_ACTIVITY_SEED_SLIDES[2],
      ],
      chrome: {
        badgeCount: 13,
        avatarUris: HOME_ACTIVITY_SEED_AVATARS.slice(0, 4),
      },
      usedSeed: true,
    };
  }
  const data = buildHomeActivityModuleData(items);
  return { slides: data.slides, chrome: data.chrome, usedSeed: false };
}
