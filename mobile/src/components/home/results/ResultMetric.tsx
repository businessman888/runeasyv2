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
  const verticalPadding = 5;
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
  const paths = useMemo(() => buildPaths(series, 62, 20), [series]);

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
          <Svg width={62} height={20} viewBox="0 0 62 20">
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.05} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={paths.area} fill={`url(#${gradientId})`} />
            <Path
              d={paths.stroke}
              fill="none"
              stroke={color}
              strokeOpacity={0.68}
              strokeWidth={0.9}
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
    color: "rgba(235,235,245,0.56)",
    fontFamily: fonts.regular,
    fontSize: 10,
    lineHeight: 14,
  },
  value: {
    color: colors.textLight,
    fontFamily: fonts.bold,
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  chart: {
    width: 62,
    height: 20,
    marginTop: 4,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  emptyLine: {
    width: "64%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(235,235,245,0.10)",
  },
});
