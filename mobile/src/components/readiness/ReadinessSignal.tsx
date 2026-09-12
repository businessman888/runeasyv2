import React, { memo } from 'react';
import { View, Text } from 'react-native';

import { typography, spacing, borderRadius, fonts, createThemeStyles, useThemeSubscription } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import { AppIcon } from '../ui/AppIcon';
import type { ReadinessStatusColor } from '../../types/wellness.types';
import { SIGNAL_ICON, SIGNAL_TONE, signalLabel } from '../../utils/readinessPresentation';

/**
 * O SEMÁFORO DO READINESS — a fonte única de cor, tom de ícone e rótulo.
 *
 * ── POR QUE EXISTE ────────────────────────────────────────────────────────────
 *
 * Eram dois mapas inline que discordavam no verde: o card pintava `success` (o
 * verde semântico) e a tela de resultado pintava `accent` (o ciano da marca) e
 * escrevia, por extenso, "Sinal azul". Na mesma sessão o corredor via o card
 * verde e o resultado azul. Decisão do João: tudo converge para o verde.
 *
 * O rótulo vem do veredito (`status_label` — "Dia de recuperação", escrito pelo
 * motor), e o mapa estático só entra se ele faltar. A tela de resultado nunca
 * mostrava o texto do motor; mostrava o mapa.
 *
 * Sempre ícone + palavra, com três formas distintas: estado não pode depender só
 * de cor.
 */

/**
 * As cores do semáforo para quem pinta uma superfície inteira (o gradiente do
 * card, o traço do gauge).
 *
 * ⚠️ Chame NO RENDER, nunca numa constante de módulo: `semanticColors` troca de
 * valores com o tema, e uma constante congelaria as cores do tema do boot.
 */
export function readinessSignalColors(color: ReadinessStatusColor): {
    accent: string;
    subtle: string;
} {
    switch (color) {
        case 'yellow':
            return { accent: semanticColors.warning, subtle: semanticColors.warningSubtle };
        case 'red':
            return { accent: semanticColors.danger, subtle: semanticColors.dangerSubtle };
        case 'green':
        default:
            return { accent: semanticColors.success, subtle: semanticColors.successSubtle };
    }
}

interface ReadinessSignalProps {
    color: ReadinessStatusColor;
    /** O `status_label` do veredito. Vazio/ausente → o rótulo padrão da cor. */
    label?: string | null;
    variant?: 'inline' | 'chip';
    size?: 'sm' | 'md';
}

function ReadinessSignalComponent({
    color,
    label,
    variant = 'inline',
    size = 'md',
}: ReadinessSignalProps) {
    useThemeSubscription();
    const { accent, subtle } = readinessSignalColors(color);
    const texto = signalLabel(color, label);

    return (
        <View
            style={[
                styles.row,
                variant === 'chip' && [styles.chip, { backgroundColor: subtle, borderColor: accent }],
            ]}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Prontidão: ${texto}`}
        >
            <AppIcon
                name={SIGNAL_ICON[color]}
                size={size === 'sm' ? 16 : 20}
                tone={SIGNAL_TONE[color]}
                variant="filled"
            />
            <Text
                style={[size === 'sm' ? styles.labelSm : styles.labelMd, { color: accent }]}
                numberOfLines={2}
            >
                {texto}
            </Text>
        </View>
    );
}

export const ReadinessSignal = memo(ReadinessSignalComponent);

const styles = createThemeStyles(() => ({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        alignSelf: 'flex-start',
    },
    chip: {
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
        borderWidth: 1,
    },
    labelSm: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.sm,
        flexShrink: 1,
    },
    labelMd: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        flexShrink: 1,
    },
}));
