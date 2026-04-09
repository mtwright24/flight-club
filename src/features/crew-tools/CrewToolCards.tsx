import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../styles/theme';
import AccessBadge from './AccessBadge';
import { ctaLabel } from './cta';
import type { CrewTool, ToolCta } from './types';

type PressHandler = (tool: CrewTool) => void;

const TITLE_LINES = 2;
const SUBTITLE_LINES = 2;
const SPOTLIGHT_LINES = 3;
const HINT_LINES = 2;

function StarRow({ rating, count }: { rating: number; count?: number }) {
  return (
    <View style={styles.starRow}>
      <Ionicons name="star" size={11} color="#CA8A04" />
      <Text style={styles.ratingText} numberOfLines={1} ellipsizeMode="tail">
        {rating.toFixed(1)}
        {count != null ? ` · ${count}` : ''}
      </Text>
    </View>
  );
}

/** Compact — My Tools rows */
export function CrewToolCardCompact({ tool, onPress }: { tool: CrewTool; onPress: PressHandler }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(tool)}
      style={({ pressed }) => [styles.fill, pressed && styles.pressed]}
    >
      <View style={styles.shellCompact}>
        <View style={styles.topRow}>
          <View style={styles.iconBox}>
            <Ionicons name={tool.icon as never} size={24} color={colors.headerRed} />
          </View>
          <View style={styles.badgeWrap}>
            <AccessBadge access={tool.access} />
          </View>
        </View>
        <Text style={styles.title} numberOfLines={TITLE_LINES} ellipsizeMode="tail">
          {tool.title}
        </Text>
        {tool.subtitle ? (
          <Text style={styles.subtitle} numberOfLines={SUBTITLE_LINES} ellipsizeMode="tail">
            {tool.subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Store — Explore / Suggested; CTA pinned to bottom of card */
export function CrewToolCardStore({
  tool,
  onPress,
  goldPro,
}: {
  tool: CrewTool;
  onPress: PressHandler;
  goldPro?: boolean;
}) {
  const showCta = tool.cta !== 'included' && tool.cta !== 'owned';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(tool)}
      style={({ pressed }) => [styles.fill, pressed && styles.pressed]}
    >
      <View style={styles.shellStore}>
        <View style={styles.storeMain}>
          <View style={styles.topRow}>
            <View style={styles.iconBoxLarge}>
              <Ionicons name={tool.icon as never} size={26} color={colors.headerRed} />
            </View>
            <View style={styles.badgeWrap}>
              <AccessBadge access={tool.access} variant={goldPro && tool.access === 'pro' ? 'goldPro' : 'default'} />
            </View>
          </View>
          <Text style={styles.titleStore} numberOfLines={TITLE_LINES} ellipsizeMode="tail">
            {tool.title}
          </Text>
          {tool.subtitle ? (
            <Text style={styles.subtitle} numberOfLines={SUBTITLE_LINES} ellipsizeMode="tail">
              {tool.subtitle}
            </Text>
          ) : null}
          {tool.rating != null ? (
            <View style={styles.ratingBlock}>
              <StarRow rating={tool.rating} count={tool.reviewCount} />
            </View>
          ) : null}
          {tool.roleHint ? (
            <Text style={styles.hint} numberOfLines={HINT_LINES} ellipsizeMode="tail">
              {tool.roleHint}
            </Text>
          ) : null}
        </View>
        <View style={styles.ctaFooter}>
          {showCta ? (
            <View style={[styles.ctaPill, ctaPillStyle(tool.cta)]}>
              <Text style={[styles.ctaLabelBase, ctaTextStyle(tool.cta)]}>{ctaLabel(tool.cta)}</Text>
            </View>
          ) : (
            <View style={[styles.ctaPill, styles.ctaMuted]}>
              <Text style={styles.ctaMutedLabel}>{ctaLabel(tool.cta)}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/** Featured spotlight — distinct shell + optional benefit line */
export function CrewToolCardFeatured({ tool, onPress }: { tool: CrewTool; onPress: PressHandler }) {
  const benefit = tool.spotlight?.trim();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(tool)}
      style={({ pressed }) => [styles.fill, pressed && styles.pressed]}
    >
      <View style={styles.shellFeaturedOuter}>
        <View style={styles.featuredKicker}>
          <Text style={styles.featuredKickerText}>SPOTLIGHT</Text>
        </View>
        <View style={styles.featuredHero}>
          <View style={styles.featuredBadge}>
            <AccessBadge access={tool.access} />
          </View>
          <View style={styles.featuredIconRing}>
            <Ionicons name={tool.icon as never} size={36} color={colors.headerRed} />
          </View>
        </View>
        <View style={styles.featuredBody}>
          <Text style={styles.featuredTitle} numberOfLines={TITLE_LINES} ellipsizeMode="tail">
            {tool.title}
          </Text>
          {tool.subtitle ? (
            <Text style={styles.subtitleFeaturedMeta} numberOfLines={SUBTITLE_LINES} ellipsizeMode="tail">
              {tool.subtitle}
            </Text>
          ) : null}
          {benefit ? (
            <Text style={styles.featuredBenefit} numberOfLines={SPOTLIGHT_LINES} ellipsizeMode="tail">
              {benefit}
            </Text>
          ) : null}
          {tool.rating != null ? (
            <View style={styles.ratingBlockTight}>
              <StarRow rating={tool.rating} count={tool.reviewCount} />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function ctaPillStyle(cta: ToolCta) {
  switch (cta) {
    case 'open':
      return styles.ctaOpen;
    case 'add':
      return styles.ctaAdd;
    case 'view_bundle':
      return styles.ctaViewBundle;
    case 'unlock':
      return styles.ctaUnlock;
    default:
      return styles.ctaMuted;
  }
}

function ctaTextStyle(cta: ToolCta) {
  switch (cta) {
    case 'open':
    case 'unlock':
      return styles.ctaTextOnPrimary;
    case 'add':
      return styles.ctaTextAdd;
    case 'view_bundle':
      return styles.ctaTextBundle;
    default:
      return styles.ctaMutedLabel;
  }
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
  },
  pressed: { opacity: 0.94 },

  shellCompact: {
    width: '100%',
    minHeight: 154,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    overflow: 'hidden',
  },
  shellStore: {
    width: '100%',
    minHeight: 238,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  storeMain: {
    width: '100%',
  },
  ctaFooter: {
    width: '100%',
    marginTop: 14,
    paddingTop: 2,
  },

  shellFeaturedOuter: {
    width: '100%',
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'rgba(181, 22, 30, 0.22)',
    backgroundColor: colors.cardBg,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  featuredKicker: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: 'rgba(181, 22, 30, 0.06)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(181, 22, 30, 0.1)',
  },
  featuredKickerText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.headerRed,
  },
  featuredHero: {
    height: 132,
    backgroundColor: 'rgba(181, 22, 30, 0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  featuredBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
  },
  featuredIconRing: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(181, 22, 30, 0.15)',
  },
  featuredBody: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
  },
  featuredTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 23,
    width: '100%',
    letterSpacing: -0.3,
  },
  subtitleFeaturedMeta: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 18,
    width: '100%',
  },
  featuredBenefit: {
    marginTop: 10,
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 19,
    width: '100%',
    opacity: 0.88,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(181, 22, 30, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxLarge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(181, 22, 30, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeWrap: {
    maxWidth: '46%',
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 20,
    width: '100%',
  },
  titleStore: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 21,
    width: '100%',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    width: '100%',
  },
  ratingBlock: {
    marginTop: 10,
    width: '100%',
  },
  ratingBlockTight: {
    marginTop: 10,
    width: '100%',
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    maxWidth: '100%',
  },
  ratingText: {
    flexShrink: 1,
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 16,
  },
  hint: {
    marginTop: 8,
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
    fontStyle: 'italic',
    width: '100%',
  },

  ctaPill: {
    alignSelf: 'stretch',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  ctaLabelBase: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  /** Primary — already in your toolkit */
  ctaOpen: {
    backgroundColor: colors.headerRed,
    elevation: 2,
  },
  ctaTextOnPrimary: {
    color: '#FFFFFF',
  },
  /** Secondary — add to collection, still confident */
  ctaAdd: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#2563EB',
  },
  ctaTextAdd: {
    color: '#1D4ED8',
  },
  /** Distinct — bundles */
  ctaViewBundle: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#64748B',
  },
  ctaTextBundle: {
    color: '#1E293B',
  },
  /** Pro / locked */
  ctaUnlock: {
    backgroundColor: '#0F172A',
  },
  ctaMuted: {
    backgroundColor: '#F1F5F9',
  },
  ctaMutedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
