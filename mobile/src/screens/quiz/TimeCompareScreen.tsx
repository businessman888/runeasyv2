import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, AccessibilityInfo } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { fonts, useThemeSubscription, createThemeStyles } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

const getLocalThemePalette1 = () => ({
    text: semanticColors.textPrimary,
    textSecondary: semanticColors.textSecondary,
    cyan: semanticColors.accent,
    card: semanticColors.surface2,
    muted: semanticColors.textTertiary,
    cyanFill: semanticColors.accentSubtle,
    cyanBorder: semanticColors.accent,
});

const { width: SCREEN_WIDTH } = Dimensions.get('window');



const CARD_WIDTH = Math.min(SCREEN_WIDTH - 40, 360);

const SEM_PLANO = [
    'Treinos no escuro',
    'Sempre iguais',
    'Sem saber se você evolui',
    'Sempre na mesma intensidade',
];

const COM_PLANO = [
    'Cada treino tem um propósito',
    'Treinos catalogados',
    'Evolução visível',
    'Intensidade ajustada a você',
];

// A single bullet row. `delay` drives the staggered fade-in; reduce motion
// collapses every row to a short, uniform fade.
const Bullet: React.FC<{
    text: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    textColor: string;
    delay: number;
    reduceMotion: boolean;
}> = ({ text, icon, iconColor, textColor, delay, reduceMotion }) => {
    useThemeSubscription();
    const entering = reduceMotion
        ? FadeIn.duration(150)
        : FadeInDown.delay(delay).duration(360);

    return (
        <Animated.View entering={entering} style={styles.bulletRow}>
            <Ionicons name={icon} size={20} color={iconColor} />
            <Text style={[styles.bulletText, { color: textColor }]}>{text}</Text>
        </Animated.View>
    );
};

export function TimeCompareScreen() {
    useThemeSubscription();
    const [reduceMotion, setReduceMotion] = useState(false);

    useEffect(() => {
        AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
        const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
        return () => sub.remove();
    }, []);

    const headerEntering = (delay: number) =>
        reduceMotion ? FadeIn.duration(150) : FadeInDown.delay(delay).duration(360);

    return (
        <>
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Treinar com um <Text style={styles.titleHighlight}>plano personalizado</Text>{' '}
                    muda tudo.
                </Text>
            </View>

            {/* SEM PLANO */}
            <View style={styles.card}>
                <Animated.View entering={headerEntering(0)} style={styles.cardHeader}>
                    <Ionicons name="close-circle" size={22} color={getLocalThemePalette1().muted} />
                    <Text style={[styles.cardHeaderText, { color: getLocalThemePalette1().textSecondary }]}>
                        SEM PLANO
                    </Text>
                </Animated.View>

                {SEM_PLANO.map((text, i) => (
                    <Bullet
                        key={text}
                        text={text}
                        icon="close"
                        iconColor={getLocalThemePalette1().muted}
                        textColor={getLocalThemePalette1().textSecondary}
                        delay={90 + i * 90}
                        reduceMotion={reduceMotion}
                    />
                ))}
            </View>

            {/* COM PLANO */}
            <View style={[styles.card, styles.cardPremium]}>
                <Animated.View entering={headerEntering(480)} style={styles.cardHeader}>
                    <Ionicons name="checkmark-circle" size={22} color={getLocalThemePalette1().cyan} />
                    <Text style={[styles.cardHeaderText, { color: getLocalThemePalette1().text }]}>COM PLANO</Text>
                </Animated.View>

                {COM_PLANO.map((text, i) => (
                    <Bullet
                        key={text}
                        text={text}
                        icon="checkmark-circle"
                        iconColor={getLocalThemePalette1().cyan}
                        textColor={getLocalThemePalette1().text}
                        delay={570 + i * 90}
                        reduceMotion={reduceMotion}
                    />
                ))}
            </View>
        </>
    );
}

const styles = createThemeStyles(() => ({
    titleContainer: {
        marginBottom: 20,
    },
    title: {
        fontFamily: fonts.medium,
        fontSize: 20,
        color: getLocalThemePalette1().text,
        lineHeight: 30,
    },
    titleHighlight: {
        fontFamily: fonts.semibold,
        color: getLocalThemePalette1().cyan,
    },
    card: {
        width: CARD_WIDTH,
        backgroundColor: getLocalThemePalette1().card,
        borderRadius: 20,
        padding: 18,
        alignSelf: 'center',
        marginBottom: 14,
    },
    cardPremium: {
        backgroundColor: getLocalThemePalette1().cyanFill,
        borderWidth: 1,
        borderColor: getLocalThemePalette1().cyanBorder,
        marginBottom: 0,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
    },
    cardHeaderText: {
        fontFamily: fonts.bold,
        fontSize: 13,
        letterSpacing: 1,
    },
    bulletRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 32,
    },
    bulletText: {
        flex: 1,
        fontFamily: fonts.medium,
        fontSize: 14,
        lineHeight: 20,
    },
}));

export default TimeCompareScreen;
