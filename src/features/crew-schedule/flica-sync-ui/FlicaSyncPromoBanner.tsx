import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentProps } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOW, SPACING } from '../../../styles/theme';
import type { FlicaSyncPromoItem } from './flicaSyncPromoConfig';

type Variant = 'featured' | 'slim' | 'embedded';

export type FlicaSyncPromoPresentationMode = 'interactive' | 'sync';

type Props = {
  item: FlicaSyncPromoItem;
  /** `slim` = success follow-up. `embedded` = inside hero card (no outer shadow stack). */
  variant?: Variant;
  /**
   * `sync` = informational only — no navigation, no links; CTAs look real but are decorative.
   */
  presentationMode?: FlicaSyncPromoPresentationMode;
};

function PromoInnerBody({
  item,
  variant,
  sync,
}: {
  item: FlicaSyncPromoItem;
  variant: Variant;
  sync: boolean;
}) {
  const isSlim = variant === 'slim';
  const isEmbedded = variant === 'embedded';

  return (
    <>
      <LinearGradient
        colors={[COLORS.red, COLORS.redDark ?? '#8F0F16']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[
          styles.strip,
          isSlim && styles.stripSlim,
          isEmbedded && styles.stripEmbedded,
        ]}
      >
        <Ionicons
          name={item.icon as ComponentProps<typeof Ionicons>['name']}
          size={isSlim ? 18 : isEmbedded ? 20 : 22}
          color="#fff"
        />
      </LinearGradient>
      <View style={styles.copy}>
        {!isSlim ? (
          item.badge?.trim() && (item.badge.includes('NEW') || item.badge.includes('FEATURED')) ? (
            <View style={styles.badgePill}>
              <Text style={styles.badgePillTxt}>{item.badge.trim().toUpperCase()}</Text>
            </View>
          ) : (
            <Text style={[styles.kicker, isEmbedded && styles.kickerEmbedded]}>
              {item.badge?.trim() ? item.badge.trim() : 'Featured in Flight Club'}
            </Text>
          )
        ) : (
          <Text style={styles.kickerSlim}>{item.badge?.trim() ? item.badge.trim().toUpperCase() : 'YOU MIGHT LIKE'}</Text>
        )}
        <Text
          style={[styles.title, isSlim && styles.titleSlim, item.ctaVariant === 'outline' && !isSlim && styles.titleAccent]}
          numberOfLines={isSlim ? 1 : 2}
        >
          {item.title}
        </Text>
        <Text style={[styles.sub, isSlim && styles.subSlim]} numberOfLines={isSlim ? 1 : 2}>
          {item.subtitle}
        </Text>
        {sync ? (
          item.ctaVariant === 'outline' && item.ctaLabel ? (
            <View style={[styles.outlinePill, isSlim && styles.outlinePillSlim, styles.decoMuted]}>
              <Text style={[styles.outlinePillTxt, isSlim && styles.outlinePillTxtSlim]}>{item.ctaLabel}</Text>
              <Ionicons name="chevron-forward" size={isSlim ? 14 : 16} color={COLORS.text2} />
            </View>
          ) : item.route || item.ctaLabel ? (
            <View style={[styles.ctaRow, isSlim && styles.ctaRowSlim, styles.decoMuted]}>
              <Text style={[styles.cta, isSlim && styles.ctaSlim, styles.ctaDeco]}>{isSlim ? 'Open' : 'Learn more'}</Text>
              <Ionicons name="chevron-forward" size={isSlim ? 16 : 18} color={COLORS.text2} />
            </View>
          ) : null
        ) : item.route && item.ctaVariant === 'outline' && item.ctaLabel ? (
          <View style={[styles.outlinePill, isSlim && styles.outlinePillSlim]}>
            <Text style={[styles.outlinePillTxt, isSlim && styles.outlinePillTxtSlim]}>{item.ctaLabel}</Text>
            <Ionicons name="chevron-forward" size={isSlim ? 14 : 16} color={COLORS.red} />
          </View>
        ) : item.route ? (
          <View style={[styles.ctaRow, isSlim && styles.ctaRowSlim]}>
            <Text style={[styles.cta, isSlim && styles.ctaSlim]}>{isSlim ? 'Open' : 'Learn more'}</Text>
            <Ionicons name="chevron-forward" size={isSlim ? 16 : 18} color={COLORS.red} />
          </View>
        ) : null}
      </View>
    </>
  );
}

export default function FlicaSyncPromoBanner({ item, variant = 'featured', presentationMode = 'interactive' }: Props) {
  const router = useRouter();
  const isSlim = variant === 'slim';
  const isEmbedded = variant === 'embedded';
  const sync = presentationMode === 'sync';
  const hasArt = item.bannerImage != null;

  const navigate = () => {
    if (sync || !item.route) return;
    router.push(item.route as Href);
  };

  if (hasArt && !isEmbedded) {
    const face = (
      <LinearGradient
        colors={
          isSlim && item.surface === 'cream'
            ? ['#FFFBF0', '#FFF7E8']
            : ['#FFF5F5', COLORS.cardAlt]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.cardFace, isSlim && styles.cardFaceSlim, styles.cardFaceImageLed]}
      >
        <View style={styles.imageLedFrame}>
          <Image source={item.bannerImage} style={styles.bannerArtImage} resizeMode="cover" />
          <LinearGradient
            colors={['transparent', 'rgba(15, 23, 42, 0.82)']}
            style={styles.imageLedScrim}
          />
          <View style={styles.imageLedCopy}>
            {item.badge?.trim() ? (
              <View style={styles.imageLedBadge}>
                <Text style={styles.imageLedBadgeTxt}>{item.badge.trim().toUpperCase()}</Text>
              </View>
            ) : null}
            <Text style={styles.imageLedTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.imageLedSub} numberOfLines={2}>
              {item.subtitle}
            </Text>
          </View>
        </View>
      </LinearGradient>
    );

    if (sync) {
      return (
        <View
          style={styles.pressWrap}
          accessibilityRole="text"
          accessibilityLabel={`${item.title}. ${item.subtitle}`}
        >
          {face}
        </View>
      );
    }
    return (
      <Pressable
        style={({ pressed }) => [styles.pressWrap, pressed && styles.pressed]}
        onPress={navigate}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.subtitle}`}
      >
        {face}
      </Pressable>
    );
  }

  const body = <PromoInnerBody item={item} variant={variant} sync={sync} />;

  if (isEmbedded) {
    if (sync) {
      return (
        <View
          style={styles.embeddedWrap}
          accessibilityRole="text"
          accessibilityLabel={`${item.title}. ${item.subtitle}`}
        >
          <View style={styles.embeddedInner}>{body}</View>
        </View>
      );
    }
    return (
      <Pressable
        style={({ pressed }) => [styles.embeddedWrap, pressed && styles.pressed]}
        onPress={navigate}
        disabled={!item.route}
        accessibilityRole={item.route ? 'button' : 'text'}
        accessibilityLabel={`${item.title}. ${item.subtitle}`}
      >
        <View style={styles.embeddedInner}>{body}</View>
      </Pressable>
    );
  }

  if (sync) {
    return (
      <View
        style={styles.pressWrap}
        accessibilityRole="text"
        accessibilityLabel={`${item.title}. ${item.subtitle}`}
      >
        <LinearGradient
          colors={
            isSlim && item.surface === 'cream'
              ? ['#FFFBF0', '#FFF7E8']
              : ['#FFF5F5', COLORS.cardAlt]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.cardFace,
            isSlim && styles.cardFaceSlim,
            !isSlim && item.ctaVariant === 'outline' && styles.cardFacePromo,
          ]}
        >
          <View style={[styles.cardRow, isSlim && styles.cardRowSlim]}>{body}</View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.pressWrap, pressed && styles.pressed]}
      onPress={navigate}
      disabled={!item.route}
      accessibilityRole={item.route ? 'button' : 'text'}
      accessibilityLabel={`${item.title}. ${item.subtitle}`}
    >
      <LinearGradient
        colors={
          isSlim && item.surface === 'cream'
            ? ['#FFFBF0', '#FFF7E8']
            : ['#FFF5F5', COLORS.cardAlt]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.cardFace,
          isSlim && styles.cardFaceSlim,
          !isSlim && item.ctaVariant === 'outline' && styles.cardFacePromo,
        ]}
      >
        <View style={[styles.cardRow, isSlim && styles.cardRowSlim]}>{body}</View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressWrap: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    ...SHADOW.card,
  },
  pressed: { opacity: 0.94 },
  cardFace: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.line + 'CC',
  },
  cardFaceImageLed: {
    padding: 0,
    overflow: 'hidden',
  },
  imageLedFrame: {
    height: 128,
    borderRadius: RADIUS.lg - 1,
    overflow: 'hidden',
    position: 'relative',
  },
  bannerArtImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  imageLedScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  imageLedCopy: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    paddingTop: 28,
  },
  imageLedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  imageLedBadgeTxt: {
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.red,
    letterSpacing: 0.6,
  },
  imageLedTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 1 },
  },
  imageLedSub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    lineHeight: 16,
  },
  cardFacePromo: {
    borderColor: COLORS.tint,
  },
  cardFaceSlim: {
    borderRadius: RADIUS.md,
    ...SHADOW.soft,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 104,
  },
  cardRowSlim: { minHeight: 72 },
  embeddedWrap: {
    marginTop: SPACING.sm,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.cardAlt,
  },
  embeddedInner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 72,
  },
  strip: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: RADIUS.lg,
    borderBottomLeftRadius: RADIUS.lg,
  },
  stripSlim: {
    width: 52,
    borderTopLeftRadius: RADIUS.md,
    borderBottomLeftRadius: RADIUS.md,
  },
  stripEmbedded: {
    width: 48,
    borderTopLeftRadius: RADIUS.md,
    borderBottomLeftRadius: RADIUS.md,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    paddingVertical: SPACING.sm,
    paddingRight: SPACING.md,
    paddingLeft: SPACING.sm,
    justifyContent: 'center',
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.red,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    marginBottom: 3,
  },
  kickerEmbedded: { fontSize: 9, marginBottom: 2 },
  badgePill: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.red,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    marginBottom: 6,
  },
  badgePillTxt: {
    fontSize: 9,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.6,
  },
  titleAccent: {
    color: COLORS.red,
  },
  outlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: COLORS.red,
    backgroundColor: COLORS.card,
  },
  outlinePillSlim: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  outlinePillTxt: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.red,
  },
  outlinePillTxtSlim: { fontSize: 12 },
  decoMuted: {
    borderColor: COLORS.line,
    opacity: 0.92,
  },
  kickerSlim: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.navy,
    letterSpacing: -0.25,
    marginBottom: 3,
  },
  titleSlim: { fontSize: 14, marginBottom: 2 },
  sub: {
    fontSize: 13,
    color: COLORS.text2,
    lineHeight: 17,
    fontWeight: '600',
  },
  subSlim: { fontSize: 12, lineHeight: 15 },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 8,
  },
  ctaRowSlim: { marginTop: 6 },
  cta: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.red,
  },
  ctaSlim: { fontSize: 13 },
  ctaDeco: {
    color: COLORS.text2,
  },
});
