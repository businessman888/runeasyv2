import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    Animated,
} from 'react-native';
import Svg, {
    Path,
    Line as SvgLine,
    Circle as SvgCircle,
    G,
} from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DS = {
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    cyan: '#00D4FF',
    cyanGlow: 'rgba(0, 127, 153, 0.3)',
    card: '#1C1C2E',
    glassBorder: 'rgba(235, 235, 245, 0.1)',
};

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

const CARD_WIDTH = Math.min(SCREEN_WIDTH - 40, 360);
const CHART_PADDING_X = 16;
const CHART_W = CARD_WIDTH - 2 * CHART_PADDING_X;
const CHART_H = 138;

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
    const animVal = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(animVal, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: false,
        }).start();
    }, [animVal]);

    // Without RunEasy: injuries INCREASE over 6 months (gray dashed-feel ascending curve)
    const tradicionalPoints = [
        { x: CHART_W * 0.0, y: CHART_H * 0.78 },
        { x: CHART_W * 0.2, y: CHART_H * 0.65 },
        { x: CHART_W * 0.4, y: CHART_H * 0.5 },
        { x: CHART_W * 0.6, y: CHART_H * 0.36 },
        { x: CHART_W * 0.8, y: CHART_H * 0.22 },
        { x: CHART_W * 1.0, y: CHART_H * 0.1 },
    ];

    // With RunEasy: injuries DECREASE over 6 months (cyan glowing descending curve)
    const runEasyPoints = [
        { x: CHART_W * 0.0, y: CHART_H * 0.18 },
        { x: CHART_W * 0.2, y: CHART_H * 0.32 },
        { x: CHART_W * 0.4, y: CHART_H * 0.5 },
        { x: CHART_W * 0.6, y: CHART_H * 0.66 },
        { x: CHART_W * 0.8, y: CHART_H * 0.8 },
        { x: CHART_W * 1.0, y: CHART_H * 0.92 },
    ];

    const tradicionalPath = buildPath(tradicionalPoints);
    const runEasyPath = buildPath(runEasyPoints);

    const strokeOpacity = animVal.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const lastTrad = tradicionalPoints[tradicionalPoints.length - 1];
    const lastCyan = runEasyPoints[runEasyPoints.length - 1];

    return (
        <>
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    RunEasy cria resultados{'\n'}no longo prazo
                </Text>
            </View>

            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <Text style={styles.cardHeaderText}>Suas lesões</Text>
                </View>

                <View style={styles.chartWrap}>
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

                        {/* gray traditional line (ascending) */}
                        <AnimatedPath
                            d={tradicionalPath}
                            stroke={DS.textSecondary}
                            strokeWidth={1.3}
                            fill="none"
                            strokeLinecap="round"
                            strokeOpacity={strokeOpacity}
                        />
                        <AnimatedCircle
                            cx={lastTrad.x}
                            cy={lastTrad.y}
                            r={4}
                            fill={DS.textSecondary}
                            opacity={strokeOpacity}
                        />

                        {/* cyan RunEasy line (descending) — glow via stroke */}
                        <G>
                            <AnimatedPath
                                d={runEasyPath}
                                stroke={DS.cyan}
                                strokeWidth={4}
                                strokeOpacity={0.25}
                                fill="none"
                                strokeLinecap="round"
                            />
                            <AnimatedPath
                                d={runEasyPath}
                                stroke={DS.cyan}
                                strokeWidth={1.6}
                                fill="none"
                                strokeLinecap="round"
                                strokeOpacity={strokeOpacity}
                            />
                        </G>
                        <AnimatedCircle
                            cx={lastCyan.x}
                            cy={lastCyan.y}
                            r={4}
                            fill={DS.cyan}
                            opacity={strokeOpacity}
                        />
                    </Svg>

                    {/* Inline labels for the 2 lines */}
                    <Text style={[styles.lineLabel, styles.lineLabelTrad]}>
                        Assessoria de corrida{'\n'}tradicional
                    </Text>
                    <Text style={[styles.lineLabel, styles.lineLabelCyan]}>
                        Como assessor de Corrida
                    </Text>
                </View>

                <View style={styles.axisLabels}>
                    <Text style={styles.axisText}>Mês 1</Text>
                    <Text style={[styles.axisText, styles.axisTextCyan]}>Mês 6</Text>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        80% dos usuários que utilizam ou migram para{'\n'}
                        a RunEasy, diminuem suas lesões, aumentando a{'\n'}
                        performance em 90% em 6 meses.
                    </Text>
                </View>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 24,
    },
    title: {
        fontFamily: 'Poppins-Bold',
        fontSize: 24,
        fontWeight: '700',
        color: DS.text,
        lineHeight: 36,
    },
    card: {
        width: CARD_WIDTH,
        backgroundColor: DS.card,
        borderRadius: 20,
        paddingTop: 16,
        paddingBottom: 18,
        paddingHorizontal: CHART_PADDING_X,
        alignSelf: 'center',
    },
    cardHeader: {
        marginBottom: 14,
    },
    cardHeaderText: {
        fontFamily: 'Poppins-Bold',
        fontSize: 16,
        fontWeight: '700',
        color: DS.text,
    },
    chartWrap: {
        position: 'relative',
        height: CHART_H + 12,
    },
    lineLabel: {
        position: 'absolute',
        fontFamily: 'Inter-Medium',
        fontSize: 9,
        fontWeight: '500',
        lineHeight: 11,
    },
    lineLabelTrad: {
        top: 12,
        right: 4,
        color: DS.textSecondary,
        textAlign: 'right',
    },
    lineLabelCyan: {
        bottom: 18,
        left: CHART_W * 0.18,
        color: DS.cyan,
    },
    axisLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 6,
        paddingHorizontal: 4,
    },
    axisText: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 11,
        fontWeight: '600',
        color: DS.cyan,
    },
    axisTextCyan: {
        color: DS.cyan,
    },
    footer: {
        marginTop: 16,
        paddingHorizontal: 8,
    },
    footerText: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 11,
        fontWeight: '600',
        color: DS.text,
        textAlign: 'center',
        lineHeight: 14,
    },
});

export default AssessoriaCompareScreen;
