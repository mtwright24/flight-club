/**
 * Social / room feed video autoplay policy.
 * Today: hardcoded ON at the feed level; later wire to settings (ON / Wi‑Fi only / OFF).
 */
export type FeedVideoAutoplayPolicy = 'on' | 'wifi_only' | 'off';

export function useFeedVideoAutoplayPolicy(): {
  policy: FeedVideoAutoplayPolicy;
  /** When false, feed cells should not autoplay (future: OFF or Wi‑Fi only without Wi‑Fi). */
  feedAutoplayEnabled: boolean;
} {
  const policy: FeedVideoAutoplayPolicy = 'on';
  return {
    policy,
    feedAutoplayEnabled: policy === 'on',
  };
}
