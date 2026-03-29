/** Social `posts.media_type` and similar. */
export function isVideoMediaType(mediaType?: string | null): boolean {
  const t = String(mediaType || '').toLowerCase();
  return t === 'video' || t === 'reel';
}

export function urlLooksLikeVideo(url: string): boolean {
  return /\.(mp4|mov|webm|m4v|3gp)(\?|#|$)/i.test(url || '');
}

/**
 * Single feed attachment: use explicit type when present, else infer from URL (room posts, legacy rows).
 */
export function isFeedVideoMedia(
  item: { media_type?: string | null },
  mediaUrl: string
): boolean {
  return isVideoMediaType(item.media_type) || urlLooksLikeVideo(mediaUrl);
}
