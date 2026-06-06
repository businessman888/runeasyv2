import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { toSeconds, fromSeconds, formatHMS } from '../../utils/timeFormat';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DS = {
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    cyan: '#00D4FF',
    card: '#1C1C2E',
    cardInner: '#0E0E1F',
    cardLabel: '#15152A',
};

const CARD_WIDTH = Math.min(SCREEN_WIDTH - 40, 360);
const COL_GAP = 4;
const COL_WIDTH = (CARD_WIDTH - 16 * 2 - COL_GAP) / 2; // inner padding 16
const INNER_CARD_HEIGHT = 170;

// RunEasy makes you ~12% faster over the SAME distance. Honest, defensible.
// Bars represent SPEED (taller = faster = better); since speed ∝ 1/time, the
// "without" bar is exactly (1 - SPEEDUP) as tall as the "with" bar.
const SPEEDUP = 0.12;
const BAR_HEIGHT_WITH = INNER_CARD_HEIGHT * 0.72;        // faster → tallest
const BAR_HEIGHT_WITHOUT = BAR_HEIGHT_WITH * (1 - SPEEDUP); // ~12% shorter

// A single bar that grows from its base on mount.
const AnimatedBar: React.FC<{
    targetHeight: number;
    color: string;
    label: string;
    labelColor: string;
}> = ({ targetHeight, color, label, labelColor }) => {
    const h = useSharedValue(0);

    useEffect(() => {
        h.value = withTiming(targetHeight, {
            duration: 900,
            easing: Easing.out(Easing.cubic),
        });
    }, [targetHeight, h]);

    const animStyle = useAnimatedStyle(() => ({ height: h.value }));

    return (
        <Animated.View style={[styles.bar, { backgroundColor: color }, animStyle]}>
            <Text style={[styles.barLabel, { color: labelColor }]}>{label}</Text>
        </Animated.View>
    );
};

export function TimeCompareScreen() {
    const { data } = useOnboardingStore();

    const userDistance = data.recentDistance ?? 10;
    const userTimeSec = data.distanceTime ? toSeconds(data.distanceTime) : 6050; // fallback 1:40:50
    const fasterTimeSec = Math.round(userTimeSec * (1 - SPEEDUP));

    const userTimeLabel = formatHMS(fromSeconds(userTimeSec));
    const fasterTimeLabel = formatHMS(fromSeconds(fasterTimeSec));
    const distanceLabel = `${userDistance} km`;

    return (
        <>
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Corra a <Text style={styles.titleHighlight}>mesma distância</Text>{'\n'}
                    em <Text style={styles.titleHighlight}>menos tempo</Text> com a{' '}
                    <Text style={styles.titleHighlight}>RunEasy</Text> vs treinando sozinho.
                </Text>
            </View>

            {/* Distance context — same on both sides, stated once. */}
            <View style={styles.distancePill}>
                <Text style={styles.distancePillText}>{distanceLabel}</Text>
            </View>

            <View style={styles.card}>
                <View style={styles.row}>
                    {/* WITHOUT RunEasy */}
                    <View style={styles.column}>
                        <View style={styles.innerCard}>
                            <Text style={styles.innerHeader}>Sem RunEasy</Text>
                            <View style={styles.barFiller}>
                                <AnimatedBar
                                    targetHeight={BAR_HEIGHT_WITHOUT}
                                    color={DS.cardLabel}
                                    label={distanceLabel}
                                    labelColor={DS.textSecondary}
                                />
                            </View>
                        </View>
                        <View style={styles.timeWrap}>
                            <Text style={styles.timeLabelGray}>{userTimeLabel}</Text>
                        </View>
                    </View>

                    {/* WITH RunEasy */}
                    <View style={styles.column}>
                        <View style={styles.innerCard}>
                            <Text style={styles.innerHeader}>Com RunEasy</Text>
                            <View style={styles.barFiller}>
                                <AnimatedBar
                                    targetHeight={BAR_HEIGHT_WITH}
                                    color={DS.cyan}
                                    label={distanceLabel}
                                    labelColor={DS.cardInner}
                                />
                            </View>
                        </View>
                        <View style={styles.timeWrap}>
                            <Text style={styles.timeLabelCyan}>{fasterTimeLabel}</Text>
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>~12% mais rápido</Text>
                            </View>
                        </View>
                    </View>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        RunEasy torna isso possível, fácil e seguro.
                    </Text>
                </View>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 16,
    },
    title: {
        fontFamily: 'Poppins-Medium',
        fontSize: 20,
        fontWeight: '500',
        color: DS.text,
        lineHeight: 30,
    },
    titleHighlight: {
        color: DS.cyan,
        fontWeight: '600',
    },
    distancePill: {
        alignSelf: 'center',
        backgroundColor: DS.card,
        borderRadius: 999,
        paddingHorizontal: 16,
        paddingVertical: 6,
        marginBottom: 14,
    },
    distancePillText: {
        fontFamily: 'Poppins-Medium',
        fontSize: 13,
        fontWeight: '500',
        color: DS.textSecondary,
    },
    card: {
        width: CARD_WIDTH,
        backgroundColor: DS.card,
        borderRadius: 20,
        padding: 16,
        alignSelf: 'center',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: COL_GAP,
    },
    column: {
        width: COL_WIDTH,
        alignItems: 'center',
    },
    innerCard: {
        width: COL_WIDTH,
        height: INNER_CARD_HEIGHT,
        backgroundColor: DS.cardInner,
        borderRadius: 15,
        paddingTop: 12,
        paddingHorizontal: 0,
        position: 'relative',
        overflow: 'hidden',
    },
    innerHeader: {
        fontFamily: 'Poppins-Medium',
        fontSize: 10,
        fontWeight: '500',
        color: DS.text,
        marginLeft: 16,
    },
    barFiller: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    bar: {
        width: COL_WIDTH - 8,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 8,
        marginBottom: 2,
        overflow: 'hidden',
    },
    barLabel: {
        fontFamily: 'Poppins-Medium',
        fontSize: 13,
        fontWeight: '500',
    },
    timeWrap: {
        marginTop: 10,
        minHeight: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    timeLabelGray: {
        fontFamily: 'Poppins-Medium',
        fontSize: 16,
        fontWeight: '500',
        color: DS.text,
    },
    timeLabelCyan: {
        fontFamily: 'Poppins-Medium',
        fontSize: 16,
        fontWeight: '500',
        color: DS.cyan,
    },
    badge: {
        marginTop: 6,
        backgroundColor: 'rgba(0, 212, 255, 0.12)',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 3,
    },
    badgeText: {
        fontFamily: 'Poppins-Medium',
        fontSize: 11,
        fontWeight: '600',
        color: DS.cyan,
    },
    footer: {
        marginTop: 22,
        paddingHorizontal: 8,
    },
    footerText: {
        fontFamily: 'Poppins-Medium',
        fontSize: 14,
        fontWeight: '500',
        color: DS.text,
        textAlign: 'center',
        lineHeight: 21,
    },
});

export default TimeCompareScreen;
