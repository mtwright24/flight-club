import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { honorShortLineForCard, type CrewHonorWinner } from '../../../lib/crewHonors';
import CrewHonorAvatar from './CrewHonorAvatar';
import { CH } from './crewHonorsTheme';

function categoryIon(slug: string): keyof typeof Ionicons.glyphMap {
  const s = slug.toLowerCase();
  if (s === 'crew-mvp' || s.includes('mvp')) return 'trophy';
  if (s.includes('calm') || s.includes('pressure')) return 'flash-outline';
  if (s.includes('mom') || s.includes('dad')) return 'heart-outline';
  return 'ribbon';
}

function avatarUri(w: CrewHonorWinner) {
  return !w.use_initials_avatar ? w.avatar_url : null;
}

export type CrewHonorMiniCardLayout = 'home' | 'featured' | 'grid';

type Props = {
  winner: CrewHonorWinner;
  onPress: () => void;
  layout: CrewHonorMiniCardLayout;
  /** Card width in px (home + grid from parent; featured defaults if omitted). */
  cardWidth?: number;
};

export default function CrewHonorMiniCard({ winner: w, onPress, layout, cardWidth }: Props) {
  const accent = w.category.accent_primary || CH.gold;
  const trim = w.category.trim_color || CH.cardBorder;

  const effW =
    layout === 'home' ? (cardWidth ?? 148) : layout === 'grid' ? (cardWidth ?? 168) : (cardWidth ?? 118);

  const avatarSize =
    layout === 'home'
      ? Math.min(68, Math.max(54, Math.floor(effW * 0.44)))
      : layout === 'featured'
        ? 70
        : Math.min(58, Math.max(48, Math.floor(effW * 0.44)));

  const reason = honorShortLineForCard(w, layout === 'home' ? { maxChars: 240 } : undefined);

  const engagement =
    w.total_reactions > 0 || w.comments_count > 0 ? (
      <View style={[styles.engageRow, layout === 'home' && styles.engageRowHome]}>
        <View style={[styles.engageCluster, layout === 'home' && styles.engageClusterHome]}>
          {w.total_reactions > 0 ? (
            <View style={styles.engageItem}>
              <Ionicons name="heart" size={13} color={layout === 'home' ? CH.red : CH.muted} />
              <Text style={[styles.engageNum, layout === 'home' && styles.engageNumHome]}>{w.total_reactions}</Text>
            </View>
          ) : null}
          {w.total_reactions > 0 && w.comments_count > 0 ? <View style={styles.engageBetweenRule} /> : null}
          {w.comments_count > 0 ? (
            <View style={styles.engageItem}>
              <Ionicons name="chatbubble-outline" size={13} color={CH.muted} />
              <Text style={[styles.engageNum, layout === 'home' && styles.engageNumHome]}>{w.comments_count}</Text>
            </View>
          ) : null}
        </View>
      </View>
    ) : null;

  if (layout === 'home') {
    return (
      <Pressable
        onPress={onPress}
        style={[styles.homeOuter, { width: effW, borderColor: trim }]}
        accessibilityRole="button"
        accessibilityLabel={`${w.category.title}, ${w.display_name}`}
      >
        <View style={[styles.homeFace, { minHeight: Math.max(200, Math.round(effW * 1.34)) }]}>
          <LinearGradient
            pointerEvents="none"
            colors={['#FFFFFB', '#FFF6E0', '#F4E4B8', '#E6CF8A', '#D4B45C', '#C4A14E']}
            locations={[0, 0.12, 0.38, 0.62, 0.86, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)', 'rgba(45,32,8,0.08)']}
            locations={[0, 0.28, 0.55, 1]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.homeContent}>
            <View style={styles.homeIconRow}>
              <Ionicons name={categoryIon(w.category.slug)} size={26} color={accent} />
            </View>
            <View style={styles.avatarBlockHome}>
              <CrewHonorAvatar uri={avatarUri(w)} initials={w.initials} size={avatarSize} borderColor={trim} ringWidth={3.5} />
            </View>
            <View style={styles.homeAwardBadge}>
              <Text
                style={styles.homeAwardTitle}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {w.category.title}
              </Text>
            </View>
            <Text style={styles.homeName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {w.display_name}
            </Text>
            <Text style={styles.homeReason} numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.82}>
              {reason}
            </Text>
            {engagement}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={[styles.outer, { width: effW }]}
      accessibilityRole="button"
      accessibilityLabel={`${w.category.title}, ${w.display_name}`}
    >
      <View style={[styles.innerPlate, { borderColor: CH.cardBorder }]}>
        <>
          <View style={[styles.catRail, { backgroundColor: CH.cardInner, borderLeftColor: accent }]}>
            <Ionicons name={categoryIon(w.category.slug)} size={12} color={accent} style={{ marginRight: 5 }} />
            <Text style={[styles.catLabel, { color: accent }]} numberOfLines={1}>
              {w.category.title.toUpperCase()}
            </Text>
          </View>

          <View style={styles.avatarBlock}>
            <CrewHonorAvatar uri={avatarUri(w)} initials={w.initials} size={avatarSize} borderColor={trim} ringWidth={3} />
          </View>

          <Text style={styles.nameLg} numberOfLines={1}>
            {w.display_name}
          </Text>
          <Text style={styles.reasonLg} numberOfLines={3}>
            {reason}
          </Text>

          {engagement}
        </>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** Home row: thick gold rim + ombre face (matches modal honor badge). */
  homeOuter: {
    borderRadius: 20,
    borderWidth: 2,
    padding: 3,
    backgroundColor: '#E8D5A0',
    shadowColor: '#1a1206',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },
  homeFace: {
    width: '100%',
    borderRadius: 17,
    overflow: 'hidden',
    position: 'relative',
  },
  homeContent: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  outer: {
    borderRadius: CH.radiusMd,
    borderWidth: 1.5,
    borderColor: CH.cardBorder,
    backgroundColor: CH.champagne,
    padding: 2,
    ...CH.shadow.card,
  },
  innerPlate: {
    borderRadius: CH.radiusSm,
    borderWidth: 1,
    backgroundColor: CH.card,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    overflow: 'hidden',
  },
  homeIconRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarBlockHome: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  /** Award title chip — frosted on ombre. */
  homeAwardBadge: {
    alignSelf: 'stretch',
    marginTop: 4,
    marginBottom: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 252, 248, 0.58)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 140, 50, 0.38)',
    justifyContent: 'center',
    minHeight: 32,
    shadowColor: '#2d1f0a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  homeAwardTitle: {
    width: '100%',
    textAlign: 'center',
    color: CH.navy,
    fontWeight: '800',
    fontSize: 12.5,
    lineHeight: 16,
  },
  homeName: {
    width: '100%',
    textAlign: 'center',
    color: CH.navy,
    fontWeight: '800',
    fontSize: 15,
    lineHeight: 19,
    marginTop: 5,
  },
  homeReason: {
    width: '100%',
    textAlign: 'center',
    color: CH.muted,
    fontWeight: '600',
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 5,
    marginBottom: 2,
  },
  catRail: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    borderLeftWidth: 3,
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderRadius: 6,
    marginBottom: 6,
  },
  catLabel: { fontWeight: '900', fontSize: 9, letterSpacing: 0.45, flex: 1, minWidth: 0 },
  avatarBlock: { alignItems: 'center', marginBottom: 6 },
  nameHome: { color: CH.navy, fontWeight: '900', fontSize: 13, textAlign: 'center', marginTop: 2 },
  nameLg: { color: CH.navy, fontWeight: '900', fontSize: 14, textAlign: 'center', marginTop: 2 },
  reasonHome: {
    color: CH.muted,
    fontWeight: '600',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 4,
  },
  reasonLg: {
    color: CH.muted,
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 4,
  },
  engageRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CH.line,
  },
  engageRowHome: {
    alignSelf: 'stretch',
    marginTop: 10,
    paddingTop: 0,
    paddingBottom: 0,
    borderTopWidth: 0,
    backgroundColor: 'rgba(255, 252, 248, 0.52)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 140, 50, 0.28)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowColor: '#2d1f0a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  engageCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  engageClusterHome: {
    gap: 0,
  },
  engageBetweenRule: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    marginHorizontal: 12,
    backgroundColor: 'rgba(148, 163, 184, 0.32)',
  },
  engageItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  engageNum: { color: CH.mutedLight, fontWeight: '800', fontSize: 11 },
  engageNumHome: { fontSize: 11.5 },
});
