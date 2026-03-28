import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ActivityCardModel } from '../lib/homeActivityPanels';
import { buildHomeActivitySlides, type HomeActivitySlideModel } from '../lib/homeActivitySlides';
import type { NotificationItem } from './ActivityPreview';
import { COLORS } from '../src/styles/theme';

/** Soft neutral “frosted glass” gray (no blue/slate tint). */
const SHELL_BG = '#F2F2F7';
const SHELL_RADIUS = 22;
const CARD_RADIUS = 12;
const MOCKUP_BLUE = '#2563EB';
const GREEN_CHECK = '#22C55E';
const GREEN_HOUSING = '#16A34A';
const GREEN_SWAPS = '#16A34A';
const AVIATION_BLUE = '#0284C7';
const ACTIVE_DOT = '#2563EB';
const INACTIVE_DOT = '#D1D5DB';

const MAX_AVATAR_STACK = 4;
/** Gutter between the two bottom mini tiles (each column gets half of remainder of slide width). */
const BOTTOM_TILE_GAP = 6;
/** Swipeable area: hero + gap + bottom row only (chrome is fixed above). */
const CAROUSEL_BODY_HEIGHT = 226;
const HERO_CARD_HEIGHT = 104;
const BOTTOM_ROW_MIN = 110;

type Props = {
  items: NotificationItem[];
  loading: boolean;
  error: string | null;
  onCardPress: (card: ActivityCardModel) => void | Promise<void>;
  onPressAvatarCluster?: () => void;
};

export default function HomeActivityCenter({
  items,
  loading,
  error,
  onCardPress,
  onPressAvatarCluster,
}: Props) {
  const { slides, chrome } = useMemo(() => buildHomeActivitySlides(items), [items]);
  const [page, setPage] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);

  const onCarouselViewportLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - pageWidth) > 0.5) setPageWidth(w);
  }, [pageWidth]);

  const onMomentumScrollEnd = useCallback(
    (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageWidth <= 0) return;
      const x = ev.nativeEvent.contentOffset.x;
      setPage(Math.min(2, Math.max(0, Math.round(x / pageWidth))));
    },
    [pageWidth],
  );

  return (
    <View style={styles.outerShell}>
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={COLORS.red} />
        </View>
      ) : error ? (
        <View style={styles.loadingBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <>
          <ActivityAvatarStrip
            avatarUris={chrome.avatarUris}
            badgeCount={chrome.badgeCount}
            onPressAvatarCluster={onPressAvatarCluster}
          />
          <View style={styles.carouselViewport} onLayout={onCarouselViewportLayout}>
            {pageWidth > 0 ? (
              <FlatList
                data={slides}
                horizontal
                pagingEnabled
                decelerationRate="fast"
                removeClippedSubviews={false}
                showsHorizontalScrollIndicator={false}
                keyExtractor={(_, i) => `activity-slide-${i}`}
                onMomentumScrollEnd={onMomentumScrollEnd}
                getItemLayout={(_, index) => ({
                  length: pageWidth,
                  offset: pageWidth * index,
                  index,
                })}
                style={styles.carouselList}
                renderItem={({ item }) => (
                  <View
                    style={[styles.slidePage, { width: pageWidth, height: CAROUSEL_BODY_HEIGHT }]}
                    collapsable={false}
                  >
                    <ActivitySlideContent
                      slide={item}
                      pageWidth={pageWidth}
                      onCardPress={onCardPress}
                    />
                  </View>
                )}
              />
            ) : (
              <View style={[styles.loadingBox, { minHeight: CAROUSEL_BODY_HEIGHT }]} />
            )}
          </View>
          {pageWidth > 0 ? <ActivityPagerDots activeIndex={page} /> : null}
        </>
      )}
    </View>
  );
}

function activityBottomColumnWidths(pageWidth: number): { left: number; right: number } {
  const usable = Math.max(0, pageWidth - BOTTOM_TILE_GAP);
  const left = Math.floor(usable / 2);
  const right = usable - left;
  return { left, right };
}

function ActivitySlideContent({
  slide,
  pageWidth,
  onCardPress,
}: {
  slide: HomeActivitySlideModel;
  pageWidth: number;
  onCardPress: (c: ActivityCardModel) => void | Promise<void>;
}) {
  const { left: leftMiniW, right: rightMiniW } = activityBottomColumnWidths(pageWidth);
  return (
    <View style={[styles.slideRoot, { width: pageWidth, maxWidth: pageWidth }]}>
      <ActivityHeroTile card={slide.hero} onPress={() => onCardPress(slide.hero)} />
      {/* Explicit spacer: margin on Pressable + flex:1 sibling can collapse the gap in RN */}
      <View style={styles.heroBottomGap} pointerEvents="none" />
      <View style={[styles.bottomRow, { width: pageWidth, maxWidth: pageWidth }]}>
        <ActivityMiniTile
          card={slide.bottomLeft}
          columnWidth={leftMiniW}
          onPress={() => onCardPress(slide.bottomLeft)}
        />
        <View style={styles.bottomGap} />
        <ActivityMiniTile
          card={slide.bottomRight}
          columnWidth={rightMiniW}
          onPress={() => onCardPress(slide.bottomRight)}
          cornerThumbUri={slide.bottomRight.imageUrl}
        />
      </View>
    </View>
  );
}

function ActivityAvatarStrip({
  avatarUris,
  badgeCount,
  onPressAvatarCluster,
}: {
  avatarUris: string[];
  badgeCount: number;
  onPressAvatarCluster?: () => void;
}) {
  const display = useMemo(() => avatarUris.slice(0, MAX_AVATAR_STACK), [avatarUris]);

  return (
    <View style={styles.topRow}>
      <Pressable
        style={styles.avatarStack}
        onPress={onPressAvatarCluster}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Open notifications"
      >
        {display.map((uri, index) => (
          <View key={`${uri}-${index}`} style={[styles.avatar, { marginLeft: index === 0 ? 0 : -8 }]}>
            <Image source={{ uri }} style={styles.avatarImg} />
          </View>
        ))}
      </Pressable>
      {badgeCount > 0 ? (
        <Pressable
          style={styles.totalBadge}
          onPress={onPressAvatarCluster}
          hitSlop={8}
          accessibilityLabel={`${badgeCount} unread notifications`}
        >
          <Text style={styles.totalBadgeText}>+{badgeCount > 99 ? '99+' : badgeCount}</Text>
        </Pressable>
      ) : (
        <View style={styles.totalBadgePlaceholder} />
      )}
    </View>
  );
}

function ActivityHeroTile({ card, onPress }: { card: ActivityCardModel; onPress: () => void }) {
  const accent = heroAccentForLabel(card.label);
  const hasRoute = Boolean(card.detailRoute);
  const hasSparkle = card.sparkleCount != null && card.sparkleCount > 0;
  const showFooter = hasRoute || hasSparkle;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.heroPressable, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={[styles.heroIconCircle, { backgroundColor: accent.iconBg }]}>
            <Ionicons name={accent.icon} size={13} color="#FFFFFF" />
          </View>
          <Text style={[styles.heroLabel, { color: accent.labelColor }]} numberOfLines={1}>
            {card.label}
          </Text>
          {card.inlineCount != null && card.inlineCount > 0 ? (
            <View style={styles.inlinePill}>
              <Text style={styles.inlinePillText}>{card.inlineCount}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.headlineTimeRow}>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {card.title}
          </Text>
          {card.timestamp ? (
            <Text style={styles.timeRight} numberOfLines={1}>
              {card.timestamp}
            </Text>
          ) : null}
        </View>
        {card.subtitle ? (
          <Text style={styles.heroSubtitle} numberOfLines={1}>
            {card.subtitle}
          </Text>
        ) : null}
        {showFooter ? (
          <View style={styles.socialFooterRow}>
            <View style={styles.socialFooterLeft}>
              {hasRoute ? (
                <View style={styles.routeGroup}>
                  <Ionicons name="checkmark-circle" size={14} color={GREEN_CHECK} />
                  <Text style={styles.detailRouteText} numberOfLines={1}>
                    {card.detailRoute}
                  </Text>
                </View>
              ) : (
                <View style={styles.footerSpacer} />
              )}
            </View>
            {hasSparkle ? (
              <View style={styles.sparkleGroup}>
                <Ionicons name="sparkles" size={11} color="#9CA3AF" />
                <Text style={styles.sparkleGray}>+ {card.sparkleCount}</Text>
                <Ionicons name="chevron-forward" size={12} color="#9CA3AF" />
              </View>
            ) : hasRoute ? (
              <Ionicons name="chevron-forward" size={13} color="#9CA3AF" />
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function miniCategoryLabel(label: string): string {
  const u = (label || '').toUpperCase();
  if (u.includes('MESSAGE REQUEST')) return 'REQUESTS';
  return label;
}

function ActivityMiniTile({
  card,
  columnWidth,
  onPress,
  cornerThumbUri,
}: {
  card: ActivityCardModel;
  /** Exact column width so both minis + gutter === hero width (no flex overflow). */
  columnWidth: number;
  onPress: () => void;
  cornerThumbUri?: string;
}) {
  const accent = miniAccentForLabel(card.label);
  const titleLine = (card.primaryLine || card.title || '').trim();
  const subLine = (card.secondaryLine || card.subtitle || '').trim();
  const showThumb = Boolean(cornerThumbUri);
  const showCount = card.inlineCount != null && card.inlineCount > 0;
  const colStyle = { width: columnWidth, maxWidth: columnWidth };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.miniTile, colStyle, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={[styles.miniInner, showThumb && styles.miniInnerWithThumb, colStyle]}>
        <View style={styles.miniHeaderRow}>
          <View style={[styles.miniIconCircle, { backgroundColor: accent.iconBg }]}>
            <Ionicons name={accent.icon} size={12} color="#FFFFFF" />
          </View>
          <Text
            style={[styles.miniLabel, { color: accent.labelColor }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {miniCategoryLabel(card.label)}
          </Text>
          {showCount ? (
            <View style={styles.miniInlinePill}>
              <Text style={styles.miniInlinePillText}>{card.inlineCount}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.miniTextStack}>
          {titleLine ? (
            <Text style={styles.miniTitle} numberOfLines={2} ellipsizeMode="tail">
              {titleLine}
            </Text>
          ) : null}
          {subLine ? (
            <Text style={styles.miniSub} numberOfLines={2} ellipsizeMode="tail">
              {subLine}
            </Text>
          ) : null}
        </View>
        {showThumb ? (
          <Image source={{ uri: cornerThumbUri! }} style={styles.miniThumb} />
        ) : null}
      </View>
    </Pressable>
  );
}

function ActivityPagerDots({ activeIndex }: { activeIndex: number }) {
  return (
    <View style={styles.dotsRow}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]}
        />
      ))}
    </View>
  );
}

function heroAccentForLabel(label: string): {
  iconBg: string;
  labelColor: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
} {
  const L = (label || '').toUpperCase();
  if (L === 'SOCIAL' || L === 'MESSAGES') {
    return { iconBg: MOCKUP_BLUE, labelColor: MOCKUP_BLUE, icon: 'chatbubble-ellipses' };
  }
  if (L === 'SWAPS') {
    return { iconBg: GREEN_SWAPS, labelColor: GREEN_SWAPS, icon: 'swap-horizontal' };
  }
  if (L === 'HOUSING') {
    return { iconBg: GREEN_HOUSING, labelColor: GREEN_HOUSING, icon: 'home' };
  }
  if (L === 'CREW ROOMS') {
    return { iconBg: COLORS.red, labelColor: COLORS.red, icon: 'chatbubbles' };
  }
  if (L === 'ALERTS' || L === 'ACTIVITY' || L.includes('LOAD') || L === 'OPS' || L.includes('REST') || L.includes('COMMUTE')) {
    return { iconBg: AVIATION_BLUE, labelColor: AVIATION_BLUE, icon: 'notifications' };
  }
  return { iconBg: MOCKUP_BLUE, labelColor: MOCKUP_BLUE, icon: 'flash' };
}

function miniAccentForLabel(label: string): {
  iconBg: string;
  labelColor: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
} {
  const L = (label || '').toUpperCase();
  if (L.includes('CREW') || L.includes('ROOM')) {
    return { iconBg: COLORS.red, labelColor: COLORS.red, icon: 'chatbubbles' };
  }
  if (L.includes('MESSAGE') || L.includes('REQUEST')) {
    return { iconBg: MOCKUP_BLUE, labelColor: MOCKUP_BLUE, icon: 'mail-open-outline' };
  }
  if (L.includes('HOUSING') || L.includes('CRASH')) {
    return { iconBg: GREEN_HOUSING, labelColor: GREEN_HOUSING, icon: 'home' };
  }
  if (L.includes('SWAP') || L.includes('TRADE')) {
    return { iconBg: GREEN_SWAPS, labelColor: GREEN_SWAPS, icon: 'swap-horizontal' };
  }
  if (L.includes('LOAD') || L.includes('OPS') || L.includes('STAFF')) {
    return { iconBg: AVIATION_BLUE, labelColor: AVIATION_BLUE, icon: 'airplane' };
  }
  return { iconBg: MOCKUP_BLUE, labelColor: MOCKUP_BLUE, icon: 'ellipse-outline' };
}

const TILE_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.04,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};

const styles = StyleSheet.create({
  outerShell: {
    backgroundColor: SHELL_BG,
    borderRadius: SHELL_RADIUS,
    paddingHorizontal: 11,
    paddingTop: 8,
    paddingBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.05)',
    overflow: 'hidden',
  },
  carouselViewport: {
    width: '100%',
    overflow: 'hidden',
    marginTop: 6,
  },
  carouselList: {
    width: '100%',
    height: CAROUSEL_BODY_HEIGHT,
    overflow: 'hidden',
  },
  slidePage: {
    overflow: 'hidden',
  },
  slideRoot: {
    flex: 1,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
    minHeight: 32,
    maxHeight: 34,
    width: '100%',
    overflow: 'hidden',
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    overflow: 'hidden',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    backgroundColor: '#E8E8E8',
  },
  avatarImg: { width: '100%', height: '100%' },
  totalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: COLORS.red,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 6,
  },
  totalBadgeText: { color: '#FFFFFF', fontWeight: '700', fontSize: 11, letterSpacing: 0.1 },
  totalBadgePlaceholder: { minWidth: 32, minHeight: 26, flexShrink: 0, marginLeft: 6 },
  loadingBox: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  errorText: { color: COLORS.red, fontSize: 12, textAlign: 'center', paddingHorizontal: 12 },
  heroPressable: {
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
  },
  heroBottomGap: {
    height: 12,
    width: '100%',
    flexShrink: 0,
  },
  heroCard: {
    width: '100%',
    maxWidth: '100%',
    height: HERO_CARD_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderRadius: CARD_RADIUS,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
    ...TILE_SHADOW,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    flexWrap: 'nowrap',
  },
  heroIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flex: 1,
    minWidth: 0,
  },
  inlinePill: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  inlinePillText: { fontSize: 10, fontWeight: '800', color: MOCKUP_BLUE },
  headlineTimeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  heroTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 18,
  },
  heroSubtitle: { marginTop: 3, fontSize: 10, color: COLORS.text2, lineHeight: 14 },
  timeRight: {
    fontSize: 9,
    fontWeight: '500',
    color: '#9CA3AF',
    marginTop: 1,
    maxWidth: 68,
    textAlign: 'right',
    flexShrink: 0,
  },
  socialFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    width: '100%',
  },
  socialFooterLeft: { flex: 1, minWidth: 0, marginRight: 6 },
  routeGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailRouteText: { flex: 1, fontSize: 10, fontWeight: '600', color: '#0F172A' },
  footerSpacer: { minHeight: 1 },
  sparkleGroup: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sparkleGray: { fontSize: 10, fontWeight: '700', color: '#9CA3AF' },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    overflow: 'hidden',
    flexShrink: 0,
    minHeight: BOTTOM_ROW_MIN,
    maxHeight: BOTTOM_ROW_MIN,
  },
  bottomGap: { width: BOTTOM_TILE_GAP, flexShrink: 0 },
  miniTile: {
    minWidth: 0,
    overflow: 'hidden',
    minHeight: BOTTOM_ROW_MIN,
    maxHeight: BOTTOM_ROW_MIN,
  },
  miniInner: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 6,
    paddingVertical: 6,
    ...TILE_SHADOW,
  },
  miniInnerWithThumb: {
    paddingRight: 40,
  },
  miniHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
    minWidth: 0,
    width: '100%',
  },
  miniInlinePill: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    flexShrink: 0,
  },
  miniInlinePillText: { fontSize: 9, fontWeight: '800', color: MOCKUP_BLUE },
  miniTextStack: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    justifyContent: 'flex-start',
  },
  miniIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  miniTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 14,
    flexShrink: 1,
  },
  miniSub: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '500',
    color: '#6B7280',
    lineHeight: 13,
    flexShrink: 1,
  },
  miniThumb: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 6,
    paddingBottom: 0,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  dotActive: { backgroundColor: ACTIVE_DOT },
  dotInactive: { backgroundColor: INACTIVE_DOT },
  pressed: { opacity: 0.94 },
});
