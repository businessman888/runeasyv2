import React, { memo, useId, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { colors, fonts } from "../../../theme";

interface ResultMetricProps {
  label: string;
  value: string;
  series: number[];
  color: string;
}

function buildPaths(data: number[], width: number, height: number) {
  const values = data.filter(Number.isFinite);
  if (values.length === 0) return null;
  const drawable = values.length === 1 ? [values[0], values[0]] : values;
  const min = Math.min(...drawable);
  const max = Math.max(...drawable);
  const range = max - min || 1;
  const horizontalPadding = 2;
  const verticalPadding = 4;
  const usableWidth = width - horizontalPadding * 2;
  const usableHeight = height - verticalPadding * 2;
  const points = drawable.map((entry, index) => ({
    x: horizontalPadding + (index / (drawable.length - 1)) * usableWidth,
    y:
      max === min
        ? height / 2
        : verticalPadding + (1 - (entry - min) / range) * usableHeight,
  }));
  const stroke = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
    )
    .join(" ");
  return { stroke, area: `${stroke} L${width},${height} L0,${height} Z` };
}

export const ResultMetric = memo(function ResultMetric({
  label,
  value,
  series,
  color,
}: ResultMetricProps) {
  const rawId = useId();
  const gradientId = `resultMetric${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const paths = useMemo(() => buildPaths(series, 92, 43), [series]);

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={styles.label} maxFontSizeMultiplier={1.25}>
        {label}
      </Text>
      <Text style={styles.value} maxFontSizeMultiplier={1.15} numberOfLines={1}>
        {value}
      </Text>
      <View style={styles.chart}>
        {paths ? (
          <Svg width="100%" height={43} viewBox="0 0 92 43">
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={paths.area} fill={`url(#${gradientId})`} />
            <Path
              d={paths.stroke}
              fill="none"
              stroke={color}
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : (
          <View style={styles.emptyLine} />
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, minWidth: 0 },
  label: {
    color: "rgba(235,235,245,0.60)",
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 15,
  },
  value: {
    color: colors.textLight,
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 29,
    letterSpacing: -0.5,
    marginTop: 3,
  },
  chart: { height: 43, marginTop: 7, justifyContent: "center" },
  emptyLine: {
    width: "72%",
    height: 1,
    backgroundColor: "rgba(235,235,245,0.12)",
  },
});
