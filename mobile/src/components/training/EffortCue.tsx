import React, { memo } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
    typography,
    spacing,
    borderRadius,
    fonts,
    createThemeStyles,
    useThemeSubscription,
} from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import { formatPaceLabel } from '../../utils/pace';
import type { EffortCueDiagnosis } from '../../screens/weekly-insight/adjustmentCopy';

/**
 * A ORIENTAÇÃO DE ESFORÇO NAS TELAS DE EXECUÇÃO — Fase 6.4.
 *
 * ── O ENQUADRAMENTO ──────────────────────────────────────────────────────────
 *
 * "A faixa já é a orientação; isto só ensina a lê-la." O plano prescreve
 * `pace_min–pace_max` e o cue `aliviar_ritmo` dispara quando o corredor passa da
 * borda RÁPIDA. Então a mensagem honesta não é "seu plano vai mudar" nem
 * "ignore o número" — é **mire na ponta lenta da faixa que já está aí**.
 *
 * Por isso todo texto daqui fecha com "Seu plano não muda". É a linha que
 * impede a 6.4 de virar promessa de prescrição — e o plano, de fato, não muda:
 * nada nestes componentes escreve coisa alguma.
 *
 * ── POR QUE ÂMBAR, E POR QUE DISCRETO ────────────────────────────────────────
 *
 * Ciano é "isto é tocável" em todo o app; âmbar já significa "dica sem ação"
 * desde a `AdjustmentTray`. Nada aqui é tocável, então âmbar. O chip usa
 * exatamente o mesmo par de tokens do badge "rápido demais" do `IntensityCard`
 * (`warningSubtle` + `warning`), o que faz as duas pontas da mesma história
 * — o diagnóstico no insight e a orientação no treino — parecerem a mesma voz.
 *
 * O chip é deliberadamente APAGADO: uma semana tem vários treinos fáceis, e
 * âmbar chapado repetido 4 vezes viraria ruído ansioso em vez de orientação.
 * Ícone + rótulo sempre — cor sozinha não comunica estado.
 */

/**
 * O treino é de esforço FÁCIL — o único onde "segure o ritmo" faz sentido?
 *
 * ── ZONA PRIMEIRO, TIPO COMO REDE ────────────────────────────────────────────
 *
 * A zona do próprio segmento é a resposta EXATA: o cue mede Z1/Z2, e num tempo
 * ou intervalado correr forte É o objetivo — pedir para segurar ali seria
 * repreender a pessoa por executar bem.
 *
 * Mas o prompt de geração PEDE `zone` em cada segmento sem que nada normalize
 * isso depois: um plano em que a IA omitiu o campo teria a orientação sumindo em
 * silêncio, e silêncio é exatamente o ponto cego que já custou caro nas fases
 * anteriores. Então o `type` entra como rede — mais grosseiro, e suficiente:
 * este conjunto é o complemento exato de `PROTECTED_FROM_VOLUME_CUT` no
 * backend, os treinos que existem para acumular volume, não intensidade.
 */
const EASY_TYPES: ReadonlySet<string> = new Set([
    'easy_run',
    'long_run',
    'recovery',
    'walk_run',
]);

export function isEasyEffort(
    zone: string | null | undefined,
    type: string | null | undefined,
): boolean {
    if (zone) return zone === 'Z1' || zone === 'Z2';
    return !!type && EASY_TYPES.has(type);
}

interface EffortCueChipProps {
    /** Borda LENTA da faixa deste treino, em segundos/km. */
    targetPaceSec?: number | null;
}

/**
 * O marcador do card do dia. Mora colado na faixa de pace: o card mostra a
 * faixa inteira e o chip aponta para qual extremidade mirar.
 */
export const EffortCueChip = memo(function EffortCueChip({
    targetPaceSec,
}: EffortCueChipProps) {
    useThemeSubscription();

    const alvo = targetPaceSec ? `${formatPaceLabel(targetPaceSec)}/km` : null;

    return (
        <View
            style={styles.chip}
            accessible
            accessibilityLabel={
                alvo
                    ? `Orientação da semana: mire na ponta lenta da faixa, ${alvo}`
                    : 'Orientação da semana: mire na ponta lenta da faixa'
            }
        >
            <Ionicons
                name="trending-down"
                size={11}
                color={semanticColors.warning}
            />
            <Text style={styles.chipText}>ponta lenta</Text>
        </View>
    );
});

interface EffortCueCardProps {
    diagnosis: EffortCueDiagnosis;
    /** Borda LENTA da faixa deste treino, em segundos/km. */
    targetPaceSec?: number | null;
}

/**
 * A mensagem inteira, no detalhe do treino — onde a faixa prescrita está
 * visível logo abaixo, e onde o texto tem espaço para justificar o conselho com
 * o número que o corredor realmente correu.
 */
export const EffortCueCard = memo(function EffortCueCard({
    diagnosis,
    targetPaceSec,
}: EffortCueCardProps) {
    useThemeSubscription();

    const alvo = targetPaceSec ? formatPaceLabel(targetPaceSec) : null;
    const medido =
        diagnosis.easyMeasured > 0 && diagnosis.easyTooFast > 0
            ? `${diagnosis.easyTooFast} dos ${diagnosis.easyMeasured} leves da semana passada ${
                  diagnosis.easyTooFast === 1
                      ? 'saiu mais rápido'
                      : 'saíram mais rápidos'
              } que o alvo.`
            : null;

    return (
        <View style={styles.card} accessible>
            <View style={styles.cardHead}>
                <Ionicons
                    name="trending-down"
                    size={14}
                    color={semanticColors.warning}
                />
                <Text style={styles.cardBadge}>Orientação da semana</Text>
            </View>

            <Text style={styles.cardTitle}>Segure na ponta lenta</Text>

            <Text style={styles.cardBody}>
                {medido ? `${medido} ` : ''}
                {alvo
                    ? `Nesta semana, mire em ${alvo}/km — a ponta lenta da faixa deste treino.`
                    : 'Nesta semana, mire na ponta lenta da faixa deste treino.'}
            </Text>

            {/* A linha que impede o conselho de virar promessa de prescrição. */}
            <Text style={styles.cardFootnote}>Seu plano não muda.</Text>
        </View>
    );
});

const styles = createThemeStyles(() => ({
    // ── Chip: mesmo par de tokens do badge "rápido demais" do IntensityCard ──
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 3,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: borderRadius.full,
        backgroundColor: semanticColors.warningSubtle,
    },
    chipText: {
        fontFamily: fonts.semibold,
        fontSize: 10,
        color: semanticColors.warning,
    },

    // ── Card: a moldura âmbar da bandeja, sem nenhum alvo de toque ──
    card: {
        borderRadius: borderRadius['2xl'],
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        backgroundColor: semanticColors.warningSubtle,
        padding: spacing.lg,
        gap: spacing.xs,
    },
    cardHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    cardBadge: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xs,
        color: semanticColors.warning,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    cardTitle: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.lg,
        color: semanticColors.textPrimary,
    },
    cardBody: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.md,
        lineHeight: 21,
        color: semanticColors.textSecondary,
    },
    cardFootnote: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textTertiary,
    },
}));
