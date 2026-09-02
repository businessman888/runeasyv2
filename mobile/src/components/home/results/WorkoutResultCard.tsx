import React, { memo, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, fonts, elevation, createThemeStyles, useThemeSubscription } from "../../../theme";
import { semanticColors } from "../../../theme/semanticColors";
import type { LatestActivityData } from "../../../stores/feedbackStore";
import { ResultMetric } from "./ResultMetric";
import { ResultRoutePreview } from "./ResultRoutePreview";

export const RESULT_CARD_HEIGHT = 388;

interface WorkoutResultCardProps {
  data: LatestActivityData;
  title: string;
  ctaLabel: string;
  isButtonEnabled: boolean;
  isRetrying?: boolean;
  isActive: boolean;
  onPress: () => void;
}

function formatDistance(value: number): string {
  return `${(value / 1000).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} km`;
}

function formatSpeed(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km/h`;
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export const WorkoutResultCard = memo(function WorkoutResultCard({
  data,
  title,
  ctaLabel,
  isButtonEnabled,
  isRetrying = false,
  isActive,
  onPress,
}: WorkoutResultCardProps) {
  useThemeSubscription();
  const activity = data.activity;
  const isTreadmill = activity?.environment === "treadmill";
  const route = activity?.route_preview ?? [];
  const series = activity?.metric_series;
  const achievements = data.achievements?.count ?? 0;

  const metrics = useMemo(() => {
    if (!activity) return [];
    if (isTreadmill) {
      return [
        {
          label: "Distância",
          value: formatDistance(activity.distance),
          series: series?.distance ?? [],
          color: colors.primary,
        },
        {
          label: "Velocidade média",
          value: formatSpeed(activity.average_speed_kmh ?? 0),
          series: series?.speed ?? [],
          color: colors.warning,
        },
        {
          label: "Tempo",
          value: formatDuration(activity.moving_time),
          series: series?.time ?? [],
          color: colors.completed,
        },
      ];
    }
    return [
      {
        label: "Distância",
        value: formatDistance(activity.distance),
        series: series?.distance ?? [],
        color: colors.primary,
      },
      {
        label: "Pace",
        value: `${activity.formatted_pace} /km`,
        series: series?.pace ?? [],
        color: colors.warning,
      },
      {
        label: "Elevação",
        value: `${Math.round(activity.elevation_gain)} m`,
        series: series?.elevation ?? [],
        color: colors.completed,
      },
    ];
  }, [activity, isTreadmill, series]);

  if (!activity) return null;

  return (
    <View
      style={styles.card}
      accessible={false}
      accessibilityElementsHidden={!isActive}
      importantForAccessibility={isActive ? "yes" : "no-hide-descendants"}
    >
      <View style={styles.mapRegion}>
        <ResultRoutePreview
          activityId={activity.id}
          route={route}
          isTreadmill={isTreadmill}
          isActive={isActive}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headingCopy}>
            <Text
              style={styles.title}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
            >
              {title}
            </Text>
            <Text
              style={styles.subtitle}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
            >
              {activity.name || "Corrida"} - {activity.date_label}
            </Text>
          </View>
          <View
            style={styles.achievements}
            accessible
            accessibilityLabel={`${achievements} conquistas neste treino`}
          >
            <Text style={styles.achievementLabel} maxFontSizeMultiplier={1.2}>
              Conquistas
            </Text>
            <View style={styles.achievementValue}>
              <MaterialCommunityIcons
                name="shield-outline"
                size={25}
                color={colors.primary}
              />
              <Text style={styles.achievementCount}>{achievements}</Text>
            </View>
          </View>
        </View>

        <View style={styles.metrics}>
          {metrics.map((metric) => (
            <ResultMetric key={metric.label} {...metric} />
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.cta,
            !isButtonEnabled && styles.ctaDisabled,
            pressed && isButtonEnabled && styles.ctaPressed,
          ]}
          onPress={onPress}
          disabled={!isButtonEnabled}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          accessibilityState={{ disabled: !isButtonEnabled, busy: isRetrying }}
        >
          {isRetrying ? (
            <ActivityIndicator size="small" color={colors.backgroundLight} />
          ) : null}
          <Text
            style={styles.ctaText}
            numberOfLines={1}
            maxFontSizeMultiplier={1.15}
          >
            {ctaLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = createThemeStyles(() => ({
  card: {
    height: RESULT_CARD_HEIGHT,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: semanticColors.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.borderSubtle,
    ...elevation.md,
  },
  mapRegion: { height: 156, backgroundColor: semanticColors.surface1 },
  content: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 248,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: semanticColors.surface2,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    // Upward shadow — the footer lifts off the card above it, so the direction
    // is deliberate and this keeps its own geometry instead of an elevation step.
    shadowColor: semanticColors.shadow,
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 12,
  },
  header: {
    minHeight: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  headingCopy: { flex: 1, minWidth: 0 },
  title: {
    color: colors.textLight,
    fontFamily: fonts.bold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  subtitle: {
    color: semanticColors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  achievements: { alignItems: "flex-end", minWidth: 72 },
  achievementLabel: {
    color: semanticColors.textTertiary,
    fontFamily: fonts.regular,
    fontSize: 10,
    lineHeight: 14,
  },
  achievementValue: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  achievementCount: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 20,
    lineHeight: 26,
  },
  metrics: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  cta: {
    position: "absolute",
    left: "18%",
    right: "18%",
    bottom: 14,
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...elevation.sm,
  },
  ctaDisabled: {
    backgroundColor: semanticColors.surface3,
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaPressed: { opacity: 0.88 },
  ctaText: {
    color: colors.backgroundLight,
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 18,
  },
}));
