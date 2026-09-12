import React from 'react';
import { View, Text, StatusBar, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import {
    colors,
    typography,
    spacing,
    fonts,
    createThemeStyles,
    useThemeSubscription,
    getThemeStatusBarStyle,
} from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import { iconSizes, type AppIconName, type IconTone } from '../../theme/iconography';
import { AppIcon } from '../ui/AppIcon';

/**
 * UMA TELA DE ESTADO do readiness: ícone centrado, título, corpo, nota e ação.
 *
 * É o desenho que a cópia órfã `EvolutionScreen.tsx` tinha para "já respondeu
 * hoje" — preservado em `references/DESENHO-readiness-estado-ja-respondeu.md` §2
 * antes da deleção — generalizado para os estados em que o fluxo NÃO mostra
 * perguntas nem veredito: abaixo do piso, indisponível, já respondeu sem
 * análise, fora do Pro, análise não encontrada.
 *
 * O cadeado (`visual="padlock"`) é o SVG do overlay de bloqueio da mesma cópia
 * (§3), o único desenho de cadeado do repo, com o ciano cravado em hex trocado
 * pelo token `accent`. Do overlay só não veio o scrim absoluto: ele cobria um
 * quiz montado por baixo, e o quiz vivo — corretamente — nem busca as perguntas
 * quando está bloqueado. Não há o que cobrir.
 */

export interface ReadinessStateAction {
    label: string;
    onPress: () => void;
}

interface ReadinessStateViewProps {
    visual: 'padlock' | AppIconName;
    tone?: IconTone;
    title: string;
    body: string;
    note?: string;
    primaryAction?: ReadinessStateAction;
    secondaryAction?: ReadinessStateAction;
}

function Padlock() {
    useThemeSubscription();
    return (
        <Svg width="48" height="56" viewBox="0 0 48 56" fill="none">
            <Path
                d="M42 24H39V16C39 7.164 31.836 0 23 0C14.164 0 7 7.164 7 16V24H4C1.794 24 0 25.794 0 28V52C0 54.206 1.794 56 4 56H42C44.206 56 46 54.206 46 52V28C46 25.794 44.206 24 42 24ZM23 42C20.794 42 19 40.206 19 38C19 35.794 20.794 34 23 34C25.206 34 27 35.794 27 38C27 40.206 25.206 42 23 42ZM31.8 24H14.2V16C14.2 11.03 18.03 7.2 23 7.2C27.97 7.2 31.8 11.03 31.8 16V24Z"
                fill={semanticColors.accent}
                fillOpacity={0.5}
            />
        </Svg>
    );
}

export function ReadinessStateView({
    visual,
    tone = 'accent',
    title,
    body,
    note,
    primaryAction,
    secondaryAction,
}: ReadinessStateViewProps) {
    useThemeSubscription();
    const insets = useSafeAreaInsets();

    return (
        <View
            style={[
                styles.container,
                { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg },
            ]}
        >
            <StatusBar barStyle={getThemeStatusBarStyle()} backgroundColor={semanticColors.canvas} />

            <View style={styles.content}>
                {visual === 'padlock' ? (
                    <View style={styles.padlockWrap}>
                        <Padlock />
                    </View>
                ) : (
                    // 80 px de alvo visual, como no desenho preservado; o ícone
                    // fica no maior token (`hero`) dentro da bolha.
                    <View style={styles.iconBubble}>
                        <AppIcon name={visual} size={iconSizes.hero} tone={tone} variant="filled" />
                    </View>
                )}

                <Text style={styles.title} accessibilityRole="header">
                    {title}
                </Text>
                <Text style={styles.body}>{body}</Text>
                {note ? <Text style={styles.note}>{note}</Text> : null}

                {primaryAction ? (
                    <TouchableOpacity
                        style={styles.primaryCta}
                        onPress={primaryAction.onPress}
                        accessibilityRole="button"
                        accessibilityLabel={primaryAction.label}
                    >
                        <Text style={styles.primaryCtaText}>{primaryAction.label}</Text>
                    </TouchableOpacity>
                ) : null}

                {secondaryAction ? (
                    <TouchableOpacity
                        style={styles.secondaryCta}
                        onPress={secondaryAction.onPress}
                        accessibilityRole="button"
                        accessibilityLabel={secondaryAction.label}
                    >
                        <Text style={styles.secondaryCtaText}>{secondaryAction.label}</Text>
                    </TouchableOpacity>
                ) : null}
            </View>
        </View>
    );
}

const styles = createThemeStyles(() => ({
    container: {
        flex: 1,
        backgroundColor: semanticColors.canvas,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
    },
    padlockWrap: {
        opacity: 0.7,
    },
    iconBubble: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        // Neutra: o tom do ícone (sucesso, aviso, secundário) já carrega o estado.
        backgroundColor: semanticColors.glass,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes['2xl'],
        color: semanticColors.textPrimary,
        textAlign: 'center',
        marginTop: spacing.lg,
    },
    body: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.md,
        color: semanticColors.textSecondary,
        textAlign: 'center',
        lineHeight: 24,
        marginTop: spacing.md,
        maxWidth: 400,
    },
    note: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textTertiary,
        textAlign: 'center',
        lineHeight: 20,
        marginTop: spacing.sm,
        maxWidth: 400,
    },
    primaryCta: {
        backgroundColor: colors.primary,
        paddingVertical: 16,
        paddingHorizontal: 40,
        borderRadius: 30,
        marginTop: spacing.xl,
    },
    primaryCtaText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: semanticColors.textOnAccent,
    },
    secondaryCta: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        marginTop: spacing.sm,
    },
    secondaryCtaText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: colors.primary,
    },
}));
