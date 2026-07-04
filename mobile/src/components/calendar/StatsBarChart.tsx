import React, { memo, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withDelay,
    withSpring,
} from 'react-native-reanimated';
import { colors, fonts } from '../../theme';
import type { PeriodBreakdownItem } from '../../stores/statsStore';

/**
 * Lightweight animated bar chart for the Calendar stats card (no chart lib —
 * just Animated.View bars, per the design spec). Each bar grows from 0 to its
 * value with a staggered spring; the whole set re-animates whenever `animKey`
 * changes (new period/scope) via remount. Y-axis uses dynamic "nice" steps.
 */

const CHART_H = 150;
const BAR_STAGGER_MS = 60;
const SPRING = { damping: 16, stiffness: 160 } as const;

interface NiceScale {
    niceMax: number;
    lines: number[];
}

// Smallest 1/2/5×10^k step that keeps ≤4 gridlines; niceMax rounds up to it.
function niceScale(max: number): NiceScale {
    if (max <= 0) return { niceMax: 4, lines: [1, 2, 3, 4] };
    const pow = Math.pow(10, Math.floor(Math.log10(max)));
    const step = [1, 2, 5, 10].map((s) => s * pow).find((s) => max / s <= 4) ?? 10 * pow;
    const niceMax = Math.ceil(max / step) * step;
    const lines: number[] = [];
    for (let v = step; v <= niceMax + 1e-9; v += step) lines.push(Math.round(v * 10) / 10);
    return { niceMax, lines };
}

const fmt = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(1));

// Taller bar (more km) → stronger cyan; shorter → fainter. Makes the chart read
// as "alive"/interactive. Base is the app cyan (colors.primary = #00D4FF).
function barColor(ratio: number): string {
    const t = Math.max(0, Math.min(1, ratio));
    const opacity = 0.32 + 0.68 * t;
    return `rgba(0, 212, 255, ${opacity.toFixed(2)})`;
}

interface BarProps {
    value: number;
    niceMax: number;
    index: number;
    color: string;
}

const Bar = memo(function Bar({ value, niceMax, index, color }: BarProps) {
    const reduced = useReducedMotion();
    const progress = useSharedValue(0);
    const heightPct = niceMax > 0 ? Math.min(value / niceMax, 1) : 0;

    useEffect(() => {
        if (reduced) {
            progress.value = 1;
            return;
        }
        progress.value = withDelay(index * BAR_STAGGER_MS, withSpring(1, SPRING));
    }, [reduced, index, progress]);

    const animatedStyle = useAnimatedStyle(() => ({
        height: `${heightPct * 100 * progress.value}%` as `${number}%`,
    }));

    return (
        <View style={styles.barTrack}>
            <Animated.View style={[styles.bar, { backgroundColor: color }, animatedStyle]} />
        </View>
    );
});

interface StatsBarChartProps {
    data: PeriodBreakdownItem[];
    /** Changes when period/scope changes → remounts bars so they re-animate. */
    animKey: string;
}

export const StatsBarChart = memo(function StatsBarChart({ data, animKey }: StatsBarChartProps) {
    const max = data.reduce((m, d) => Math.max(m, d.distance_km), 0);
    const { niceMax, lines } = niceScale(max);

    return (
        <View style={styles.container}>
            <View style={styles.plotRow}>
                {/* Bars */}
                <View style={styles.barsArea}>
                    {data.map((d, i) => (
                        <View key={`${animKey}-col-${i}`} style={styles.column}>
                            <Bar
                                key={`${animKey}-bar-${i}`}
                                value={d.distance_km}
                                niceMax={niceMax}
                                index={i}
                                color={barColor(max > 0 ? d.distance_km / max : 0)}
                            />
                            <Text style={styles.dayLabel} numberOfLines={1}>
                                {d.label}
                            </Text>
                        </View>
                    ))}
                </View>

                {/* Right gutter — dynamic Y-axis labels */}
                <View style={styles.gutter}>
                    {lines.map((v) => (
                        <Text
                            key={`line-${v}`}
                            style={[styles.gridLabel, { bottom: (v / niceMax) * CHART_H - 7 }]}
                        >
                            {fmt(v)} km
                        </Text>
                    ))}
                </View>
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        marginTop: 8,
    },
    plotRow: {
        flexDirection: 'row',
    },
    barsArea: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'flex-end',
        height: CHART_H + 22, // bars + day-label row
    },
    column: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    barTrack: {
        width: '100%',
        height: CHART_H,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    bar: {
        width: '74%',
        maxWidth: 44,
        borderRadius: 10,
    },
    dayLabel: {
        marginTop: 6,
        height: 16,
        fontFamily: fonts.semibold,
        fontSize: 10,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    gutter: {
        width: 46,
        height: CHART_H,
        position: 'relative',
    },
    gridLabel: {
        position: 'absolute',
        right: 0,
        textAlign: 'right',
        width: '100%',
        fontFamily: fonts.semibold,
        fontSize: 10,
        color: colors.textLight,
    },
});

export default StatsBarChart;
