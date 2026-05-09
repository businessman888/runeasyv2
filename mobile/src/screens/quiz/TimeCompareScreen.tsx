import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
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

// Bar visual ratios (inverse: short bar = without RunEasy / tall bar = with RunEasy)
const BAR_HEIGHT_WITHOUT = INNER_CARD_HEIGHT * 0.28; // small
const BAR_HEIGHT_WITH = INNER_CARD_HEIGHT * 0.70;    // tall

export function TimeCompareScreen() {
    const { data } = useOnboardingStore();

    const userDistance = data.recentDistance ?? 10;
    const userTimeSec = data.distanceTime ? toSeconds(data.distanceTime) : 6050; // fallback 1:40:50

    const doubleDistance = userDistance * 2;
    const fasterTimeSec = Math.max(60, Math.round(userTimeSec * 0.2)); // 5x faster

    const userTimeLabel = formatHMS(fromSeconds(userTimeSec));
    const fasterTimeLabel = formatHMS(fromSeconds(fasterTimeSec));

    return (
        <>
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Corra <Text style={styles.titleHighlight}>o dobro</Text> de distância com{'\n'}
                    <Text style={styles.titleHighlight}>a metade</Text> do tempo com a{'\n'}
                    <Text style={styles.titleHighlight}>RunEasy</Text>{'\n'}
                    VS Treinando sozinho.
                </Text>
            </View>

            <View style={styles.card}>
                <View style={styles.row}>
                    {/* WITHOUT RunEasy */}
                    <View style={styles.column}>
                        <View style={styles.innerCard}>
                            <Text style={styles.innerHeader}>Sem RunEasy</Text>
                            <View style={styles.barFillerWithout}>
                                <View style={[styles.bar, styles.barWithout]}>
                                    <Text style={styles.barLabelGray}>{userDistance} km</Text>
                                </View>
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
                            <View style={styles.barFillerWith}>
                                <View style={[styles.bar, styles.barWith]}>
                                    <Text style={styles.barLabelDark}>
                                        {doubleDistance} km
                                    </Text>
                                </View>
                            </View>
                        </View>
                        <View style={styles.timeWrap}>
                            <Text style={styles.timeLabelCyan}>{fasterTimeLabel}</Text>
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
    barFillerWithout: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    barFillerWith: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    bar: {
        width: COL_WIDTH - 8,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    barWithout: {
        height: BAR_HEIGHT_WITHOUT,
        backgroundColor: DS.cardLabel,
    },
    barWith: {
        height: BAR_HEIGHT_WITH,
        backgroundColor: DS.cyan,
    },
    barLabelGray: {
        fontFamily: 'Poppins-Medium',
        fontSize: 13,
        fontWeight: '500',
        color: DS.textSecondary,
    },
    barLabelDark: {
        fontFamily: 'Poppins-Medium',
        fontSize: 13,
        fontWeight: '500',
        color: DS.cardInner,
    },
    timeWrap: {
        marginTop: 10,
        height: 30,
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
