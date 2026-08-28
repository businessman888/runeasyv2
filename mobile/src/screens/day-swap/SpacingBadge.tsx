import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
    borderRadius,
    fonts,
    spacing,
    typography,
    useThemedStyles,
    type ThemeColors,
} from '../../theme';
import { AppIcon } from '../../components/ui/AppIcon';
import type { SpacingVerdict } from '../../types/planAdaptation.types';

/**
 * O veredito de espaçamento pesado/leve.
 *
 * ── ÍCONE + PALAVRA + COR, NUNCA SÓ COR ──────────────────────────────────────
 *
 * Mesma regra do "mantido" da 6.3: cor sozinha não comunica estado. Quem tem
 * daltonismo, quem está no sol, quem usa o app com brilho baixo — todos leem a
 * palavra. A cor é o terceiro reforço, não o único.
 *
 * ── É AVISO, NÃO ERRO ────────────────────────────────────────────────────────
 *
 * `apertado` usa `warning`, jamais `danger`. O arranjo é perfeitamente
 * treinável; o app está informando, não reprovando. Vermelho diria "você errou",
 * e a decisão é do corredor — a mesma postura do feasibility da Fase 5.
 */

interface SpacingBadgeProps {
    spacing: SpacingVerdict;
}

function SpacingBadgeInner({ spacing: verdict }: SpacingBadgeProps) {
    const styles = useThemedStyles(createStyles);

    // Arranjo bom não vira medalha: não há nada a dizer, e dizer "está ótimo"
    // toda vez treina o corredor a ignorar a área onde o aviso apareceria.
    if (verdict.verdict !== 'apertado') return null;

    const par = verdict.pairs[0];
    const detalhe = par
        ? `${nomeDoTreino(par.first)} e ${nomeDoTreino(par.second)} ficam em dias seguidos.`
        : 'Dois treinos pesados ficam em dias seguidos.';

    return (
        <View
            style={styles.container}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Atenção, espaçamento apertado. ${detalhe}`}
        >
            <AppIcon name="warning" size={16} tone="warning" variant="filled" />
            <View style={styles.text}>
                <Text style={styles.label} maxFontSizeMultiplier={1.3}>
                    Apertado
                </Text>
                <Text style={styles.detail} maxFontSizeMultiplier={1.3}>
                    {detalhe}
                </Text>
            </View>
        </View>
    );
}

function nomeDoTreino(w: { title: string | null; type: string | null }): string {
    return w.title ?? TIPO[w.type ?? ''] ?? 'um treino pesado';
}

const TIPO: Record<string, string> = {
    long_run: 'o longão',
    tempo: 'o tempo run',
    intervals: 'o intervalado',
    fartlek: 'o fartlek',
    hill_repeats: 'a ladeira',
    repetition: 'os tiros curtos',
    progressive: 'o progressivo',
    race_simulation: 'a simulação de prova',
};

export const SpacingBadge = memo(SpacingBadgeInner);

function createStyles(colors: ThemeColors) {
    return StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: spacing.sm,
            marginTop: spacing.sm,
            padding: spacing.sm,
            borderRadius: borderRadius.md,
            backgroundColor: colors.warningSubtle,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.warning,
        },
        text: {
            flex: 1,
        },
        label: {
            fontSize: typography.fontSizes.sm,
            fontFamily: fonts.semibold,
            color: colors.warning,
        },
        detail: {
            marginTop: 2,
            fontSize: typography.fontSizes.xs,
            fontFamily: fonts.regular,
            color: colors.textSecondary,
            lineHeight: 16,
        },
    });
}

export default SpacingBadge;
