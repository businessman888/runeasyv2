import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatDistance, formatPace, formatDuration } from '../../utils/formatters';
import { BadgeShield } from '../../../../components/BadgeShield';
import { CardBrand } from '../CardBrand';
import { CardBase, CARD_WIDTH, CARD_HEIGHT } from './CardBase';
import { cardText } from './cardTypography';

interface Props {
  data: ShareCardData;
}

export function hasAchievement(data: ShareCardData): boolean {
  const gam = data.gamification;
  if (!gam) return false;
  return (
    (gam.currentStreak ?? 0) >= 3 ||
    (gam.recentBadges?.length ?? 0) > 0 ||
    (gam.currentLevel ?? 0) > 1
  );
}

type Hero =
  | { kind: 'badge'; slug: string; name: string; type: string; tier: number }
  | { kind: 'streak'; days: number }
  | { kind: 'level'; level: number; xp: number };

function pickHero(data: ShareCardData): Hero | null {
  const gam = data.gamification;
  if (!gam) return null;
  const badge = gam.recentBadges?.[0];
  if (badge && badge.slug) {
    return {
      kind: 'badge',
      slug: badge.slug,
      name: badge.name || 'Conquista',
      type: badge.type || 'milestone',
      tier: badge.tier || 1,
    };
  }
  if ((gam.currentStreak ?? 0) >= 3) {
    return { kind: 'streak', days: gam.currentStreak };
  }
  if ((gam.currentLevel ?? 0) > 1) {
    return { kind: 'level', level: gam.currentLevel, xp: gam.totalPoints ?? 0 };
  }
  return null;
}

export function Card03_Achievement({ data }: Props) {
  const hero = pickHero(data);

  return (
    <CardBase>
      <View style={styles.content}>
        <View style={styles.badge}>
          <Text style={cardText.badge}>CONQUISTA</Text>
        </View>

        <View style={styles.heroBlock}>
          {hero?.kind === 'badge' && (
            <>
              <BadgeShield
                type={hero.type}
                tier={hero.tier}
                slug={hero.slug}
                size={150}
                earned
              />
              <Text style={cardText.achievementTitle}>{hero.name}</Text>
              <Text style={cardText.achievementSubtitle}>Nova conquista desbloqueada</Text>
            </>
          )}
          {hero?.kind === 'streak' && (
            <>
              <View style={styles.iconWrap}>
                <MaterialCommunityIcons name="fire" size={96} color={colors.accent} />
              </View>
              <Text style={cardText.heroValueSm}>{hero.days}</Text>
              <Text style={cardText.achievementSubtitle}>Dias seguidos</Text>
            </>
          )}
          {hero?.kind === 'level' && (
            <>
              <View style={styles.iconWrap}>
                <Ionicons name="star" size={88} color={colors.warning} />
              </View>
              <Text style={cardText.heroValueSm}>Nível {hero.level}</Text>
              <Text style={cardText.achievementSubtitle}>{hero.xp} XP acumulados</Text>
            </>
          )}
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={cardText.metricValueMd}>{formatDistance(data.distanceKm)}</Text>
            <Text style={cardText.tileLabel}>km</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.metric}>
            <Text style={cardText.metricValueMd}>{formatPace(data.paceSecondsPerKm)}</Text>
            <Text style={cardText.tileLabel}>pace</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.metric}>
            <Text style={cardText.metricValueMd}>{formatDuration(data.durationSeconds)}</Text>
            <Text style={cardText.tileLabel}>tempo</Text>
          </View>
        </View>

        <CardBrand size="lg" />
      </View>
    </CardBase>
  );
}

const styles = StyleSheet.create({
  content: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    borderWidth: 1.2,
    borderColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  heroBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  metric: {
    alignItems: 'center',
    gap: 2,
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
});
