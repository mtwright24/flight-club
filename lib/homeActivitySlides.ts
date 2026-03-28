import type { NotificationItem } from '../components/ActivityPreview';
import {
  buildHomeActivityModuleData,
  type ActivitySlideTriple,
  type HomeActivityModuleData,
} from './homeActivityPanels';

export type HomeActivitySlideModel = ActivitySlideTriple;

export type ActivityChromeModel = HomeActivityModuleData['chrome'];

export function buildHomeActivitySlides(items: NotificationItem[]): {
  slides: [HomeActivitySlideModel, HomeActivitySlideModel, HomeActivitySlideModel];
  chrome: ActivityChromeModel;
  usedSeed: boolean;
} {
  const data = buildHomeActivityModuleData(items);
  return { slides: data.slides, chrome: data.chrome, usedSeed: items.length === 0 };
}
