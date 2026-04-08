import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../styles/theme';
import AccessBadge from './AccessBadge';
import { ctaLabel } from './cta';
import type { CrewTool } from './types';

type PressHandler = (tool: CrewTool) => void;

function StarRow({ rating, count }: { rating: number; count?: number }) {
  return (
    <View style={styles.starRow}>
      <Ionicons name="star" size={12} color="#CA8A04" />
      <Text style={styles.ratingText}>
        {rating.toFixed(1)}
        {count != null ? ` · ${count}` : ''}
      </Text>
    </View>
  );
}

/** Compact horizontal card — favorites, recent, included rows */
export function RowToolCard({ tool, onPress }: { tool: CrewTool; onPress: PressHandler }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.rowCard, pressed && styles.pressed]}
      onPress={() => onPress(tool)}
    >
      <View style={styles.rowBadgeAbs}>
        <AccessBadge access={tool.access} />
      </View>
      <View style={styles.rowIconWrap}>
        <Ionicons name={tool.icon as never} size={26} color={colors.headerRed} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {tool.title}
        </Text>
        {tool.subtitle ? (
          <Text style={styles.rowSub} numberOfLines={2}>
            {tool.subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Suggested / store-style card with optional rating + CTA */
export function StoreToolCard({ tool, onPress, goldPro }: { tool: CrewTool; onPress: PressHandler; goldPro?: boolean }) {
  const showCta = tool.cta !== 'included' && tool.cta !== 'owned';
  return (
    <Pressable
      style={({ pressed }) => [styles.storeCard, pressed && styles.pressed]}
      onPress={() => onPress(tool)}
    >
      <View style={styles.storeTop}>
        <View style={styles.storeIconWrap}>
          <Ionicons name={tool.icon as 'car-outline'} size={28} color={colors.headerRed} />
        </View>
        <AccessBadge access={tool.access} variant={goldPro && tool.access === 'pro' ? 'goldPro' : 'default'} />
      </View>
      <Text style={styles.storeTitle} numberOfLines={2}>
        {tool.title}
      </Text>
      {tool.subtitle ? (
        <Text style={styles.storeSub} numberOfLines={2}>
          {tool.subtitle}
        </Text>
      ) : null}
      {tool.rating != null ? <StarRow rating={tool.rating} count={tool.reviewCount} /> : null}
      {tool.roleHint ? <Text style={styles.hint}>{tool.roleHint}</Text> : null}
      {showCta ? (
        <View style={[styles.ctaBtn, ctaStyle(tool.cta)]}>
          <Text style={[styles.ctaText, ctaTextStyle(tool.cta)]}>{ctaLabel(tool.cta)}</Text>
        </View>
      ) : (
        <View style={[styles.ctaBtn, styles.ctaMuted]}>
          <Text style={styles.ctaMutedText}>{ctaLabel(tool.cta)}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Large featured tile */
export function FeaturedToolCard({ tool, onPress }: { tool: CrewTool; onPress: PressHandler }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.featured, pressed && styles.pressed]}
      onPress={() => onPress(tool)}
    >
      <View style={styles.featuredHero}>
        <Ionicons name={tool.icon as never} size={40} color={colors.headerRed} />
      </View>
      <View style={styles.featuredBody}>
        <View style={styles.featuredTopRow}>
          <Text style={styles.featuredTitle} numberOfLines={2}>
            {tool.title}
          </Text>
          <AccessBadge access={tool.access} />
        </View>
        {tool.subtitle ? <Text style={styles.featuredSub}>{tool.subtitle}</Text> : null}
        {tool.rating != null ? <StarRow rating={tool.rating} count={tool.reviewCount} /> : null}
      </View>
    </Pressable>
  );
}

/** Photo-style explore card (gradient placeholder) */
export function ExploreHeroCard({ tool, onPress }: { tool: CrewTool; onPress: PressHandler }) {
  return (
    <Pressable style={({ pressed }) => [styles.heroCard, pressed && styles.pressed]} onPress={() => onPress(tool)}>
      <View style={styles.heroImage}>
        <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.85)" />
        <View style={styles.heroBadge}>
          <AccessBadge access={tool.access} />
        </View>
      </View>
      <Text style={styles.heroTitle}>{tool.title}</Text>
      <Text style={styles.heroSub} numberOfLines={2}>
        {tool.subtitle}
      </Text>
    </Pressable>
  );
}

function ctaStyle(cta: CrewTool['cta']) {
  switch (cta) {
    case 'add':
      return { backgroundColor: colors.accentBlue };
    case 'unlock':
      return { backgroundColor: '#1E293B' };
    case 'open':
      return { backgroundColor: colors.headerRed };
    case 'view_bundle':
      return { backgroundColor: colors.accentBlue };
    default:
      return { backgroundColor: '#E2E8F0' };
  }
}

function ctaTextStyle(cta: CrewTool['cta']) {
  switch (cta) {
    case 'add':
    case 'unlock':
    case 'open':
    case 'view_bundle':
      return { color: '#FFFFFF' };
    default:
      return { color: colors.textPrimary };
  }
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.92 },
  rowBadgeAbs: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
  },
  rowCard: {
    width: 200,
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.md,
    paddingTop: 36,
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  rowIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(181, 22, 30, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  rowSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  storeCard: {
    width: 220,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  storeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  storeIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(181, 22, 30, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  storeSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  ratingText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  hint: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', marginTop: 6 },
  ctaBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  ctaText: { fontSize: 13, fontWeight: '800' },
  ctaMuted: { backgroundColor: '#F1F5F9' },
  ctaMutedText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  featured: {
    width: 260,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginRight: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  featuredHero: {
    height: 120,
    backgroundColor: 'rgba(181, 22, 30, 0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredBody: { padding: spacing.md },
  featuredTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' },
  featuredTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, flex: 1 },
  featuredSub: { fontSize: 13, color: colors.textSecondary, marginTop: 6 },
  heroCard: { width: 200, marginRight: 12 },
  heroImage: {
    height: 120,
    borderRadius: radius.md,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroBadge: { position: 'absolute', top: 10, right: 10 },
  heroTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginTop: 10 },
  heroSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
});
