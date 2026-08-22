import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, AccessibilityInfo } from 'react-native';
import Svg, {
    Path,
    Line as SvgLine,
    Circle as SvgCircle,
    G,
} from 'react-native-svg';
import Animated, {
    FadeIn,
    useSharedValue,
    useAnimatedProps,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';
import { fonts } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DS = {
    text: semanticColors.textPrimary,
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    cyan: semanticColors.accent,
    cyanGlow: 'rgba(0, 127, 153, 0.3)',
    card: semanticColors.surface2,
    glassBorder: 'rgba(235, 235, 245, 0.1)',
};

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

const CARD_WIDTH = Math.min(SCREEN_WIDTH - 40, 360);
const CHART_PADDING_X = 16;
const CHART_W = CARD_WIDTH - 2 * CHART_PADDING_X;
const CHART_H = 138;

// Estimated path lengths for the draw animation. Overestimated slightly so the
// stroke is never clipped (getTotalLength() is unreliable on RN-SVG). The
// rising cyan curve travels farther than the near-flat gray one.
const GRAY_LEN = CHART_W * 1.1;
const CYAN_LEN = CHART_W * 1.6;

// Build a Catmull-Rom smoothed path through points
function buildPath(points: { x: number; y: number }[]): string {
    if (points.length === 0) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        const cp1x = points[i - 1].x + (points[i].x - points[i - 1].x) * 0.5;
        const cp1y = points[i - 1].y;
        const cp2x = points[i - 1].x + (points[i].x - points[i - 1].x) * 0.5;
        const cp2y = points[i].y;
        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${points[i].x} ${points[i].y}`;
    }
    return d;
}

export function AssessoriaCompareScreen() {
    const [reduceMotion, setReduceMotion] = useState(false);

    // 1 = fully offset (hidden), 0 = fully drawn.
    const grayProgress = useSharedValue(1);
    const cyanProgress = useSharedValue(1);

    useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
            if (!mounted) return;
            setReduceMotion(enabled);
            if (enabled) {
                // Show both curves immediately, no draw animation.
                grayProgress.value = 0;
                cyanProgress.value = 0;
                return;
            }
            // Draw the gray "stagnation" line first, then the cyan "progress" line
            // rising — reads as a clear before → after.
            grayProgress.value = withTiming(0, { duration: 1100, easing: Easing.out(Easing.cubic) });
            cyanProgress.value = withDelay(
                250,
                withTiming(0, { duration: 1100, easing: Easing.out(Easing.cubic) }),
            );
        });
        return () => {
            mounted = false;
        };
    }, [grayProgress, cyanProgress]);

    // "Treino sem estrutura" — starts low and stagnates near the bottom.
    const semEstruturaPoints = [
        { x: CHART_W * 0.0, y: CHART_H * 0.72 },
        { x: CHART_W * 0.2, y: CHART_H * 0.70 },
        { x: CHART_W * 0.4, y: CHART_H * 0.69 },
        { x: CHART_W * 0.6, y: CHART_H * 0.70 },
        { x: CHART_W * 0.8, y: CHART_H * 0.69 },
        { x: CHART_W * 1.0, y: CHART_H * 0.70 },
    ];

    // "Com um plano progressivo" — rises gradually, week after week.
    const planoPoints = [
        { x: CHART_W * 0.0, y: CHART_H * 0.80 },
        { x: CHART_W * 0.2, y: CHART_H * 0.66 },
        { x: CHART_W * 0.4, y: CHART_H * 0.52 },
        { x: CHART_W * 0.6, y: CHART_H * 0.38 },
        { x: CHART_W * 0.8, y: CHART_H * 0.24 },
        { x: CHART_W * 1.0, y: CHART_H * 0.12 },
    ];

    const semEstruturaPath = buildPath(semEstruturaPoints);
    const planoPath = buildPath(planoPoints);

    const lastGray = semEstruturaPoints[semEstruturaPoints.length - 1];
    const lastCyan = planoPoints[planoPoints.length - 1];

    const grayPathProps = useAnimatedProps(() => ({
        strokeDashoffset: grayProgress.value * GRAY_LEN,
    }));
    const cyanPathProps = useAnimatedProps(() => ({
        strokeDashoffset: cyanProgress.value * CYAN_LEN,
    }));
    const grayDotProps = useAnimatedProps(() => ({ opacity: 1 - grayProgress.value }));
    const cyanDotProps = useAnimatedProps(() => ({ opacity: 1 - cyanProgress.value }));

    const cardEntering = reduceMotion ? FadeIn.duration(150) : FadeIn.duration(400);

    return (
        <>
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Treino com propósito{'\n'}vs treino no escuro
                </Text>
            </View>

            <Animated.View entering={cardEntering} style={styles.card}>
                <View style={styles.chartWrap}>
                    {/* Y axis label — rotated, dim */}
                    <View style={styles.yAxisWrap} pointerEvents="none">
                        <Text style={styles.yAxisLabel}>Sua evolução</Text>
                    </View>

                    <Svg width={CHART_W} height={CHART_H + 8}>
                        {/* gridlines (top + middle dashed) */}
                        <SvgLine
                            x1={0}
                            y1={CHART_H * 0.04}
                            x2={CHART_W}
                            y2={CHART_H * 0.04}
                            stroke={DS.glassBorder}
                            strokeWidth={1}
                            strokeDasharray="4,4"
                        />
                        <SvgLine
                            x1={0}
                            y1={CHART_H * 0.5}
                            x2={CHART_W}
                            y2={CHART_H * 0.5}
                            stroke={DS.glassBorder}
                            strokeWidth={1}
                            strokeDasharray="4,4"
                        />
                        {/* solid cyan baseline at bottom */}
                        <SvgLine
                            x1={0}
                            y1={CHART_H - 2}
                            x2={CHART_W}
                            y2={CHART_H - 2}
                            stroke={DS.cyan}
                            strokeWidth={1}
                            strokeOpacity={0.4}
                        />

                        {/* gray "sem estrutura" line (stagnating) — drawn first */}
                        <AnimatedPath
                            d={semEstruturaPath}
                            stroke={DS.textSecondary}
                            strokeWidth={1.3}
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={GRAY_LEN}
                            animatedProps={grayPathProps}
                        />
                        <AnimatedCircle
                            cx={lastGray.x}
                            cy={lastGray.y}
                            r={4}
                            fill={DS.textSecondary}
                            animatedProps={grayDotProps}
                        />

                        {/* cyan "plano progressivo" line (rising) — glow + main, drawn second */}
                        <G>
                            <AnimatedPath
                                d={planoPath}
                                stroke={DS.cyan}
                                strokeWidth={4}
                                strokeOpacity={0.25}
                                fill="none"
                                strokeLinecap="round"
                                strokeDasharray={CYAN_LEN}
                                animatedProps={cyanPathProps}
                            />
                            <AnimatedPath
                                d={planoPath}
                                stroke={DS.cyan}
                                strokeWidth={1.6}
                                fill="none"
                                strokeLinecap="round"
                                strokeDasharray={CYAN_LEN}
                                animatedProps={cyanPathProps}
                            />
                        </G>
                        <AnimatedCircle
                            cx={lastCyan.x}
                            cy={lastCyan.y}
                            r={4}
                            fill={DS.cyan}
                            animatedProps={cyanDotProps}
                        />
                    </Svg>

                    {/* Inline labels for the 2 lines */}
                    <Text style={[styles.lineLabel, styles.lineLabelGray]}>
                        Treino sem{'\n'}estrutura
                    </Text>
                    <Text style={[styles.lineLabel, styles.lineLabelCyan]}>
                        Com um plano{'\n'}progressivo
                    </Text>
                </View>

                {/* X axis label — no numbers */}
                <View style={styles.xAxisWrap}>
                    <Text style={styles.xAxisLabel}>Semanas</Text>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        Treinos repetidos e sem progressão tendem a estagnar. Um plano que
                        evolui de forma gradual mantém você avançando, semana após semana —
                        e é isso que o RunEasy monta pra você.
                    </Text>
                </View>
            </Animated.View>
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 24,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 24,
        color: DS.text,
        lineHeight: 36,
    },
    card: {
        width: CARD_WIDTH,
        backgroundColor: DS.card,
        borderRadius: 20,
        paddingTop: 18,
        paddingBottom: 18,
        paddingHorizontal: CHART_PADDING_X,
        alignSelf: 'center',
    },
    chartWrap: {
        position: 'relative',
        height: CHART_H + 12,
    },
    yAxisWrap: {
        position: 'absolute',
        left: -2,
        top: 0,
        bottom: 12,
        width: 16,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    yAxisLabel: {
        fontFamily: fonts.medium,
        fontSize: 9,
        color: DS.textSecondary,
        transform: [{ rotate: '-90deg' }],
        width: CHART_H,
        textAlign: 'center',
    },
    lineLabel: {
        position: 'absolute',
        fontFamily: fonts.medium,
        fontSize: 9,
        lineHeight: 11,
    },
    lineLabelGray: {
        bottom: 18,
        right: 4,
        color: DS.textSecondary,
        textAlign: 'right',
    },
    lineLabelCyan: {
        top: 8,
        right: 4,
        color: DS.cyan,
        textAlign: 'right',
    },
    xAxisWrap: {
        marginTop: 6,
        alignItems: 'center',
    },
    xAxisLabel: {
        fontFamily: fonts.semibold,
        fontSize: 11,
        color: DS.textSecondary,
    },
    footer: {
        marginTop: 16,
        paddingHorizontal: 8,
    },
    footerText: {
        fontFamily: fonts.semibold,
        fontSize: 11,
        color: DS.text,
        textAlign: 'center',
        lineHeight: 15,
    },
});

export default AssessoriaCompareScreen;
