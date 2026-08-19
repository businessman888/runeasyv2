import React, { memo, useCallback, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, fonts } from '../../../theme';
import {
    ADJUSTMENT_COPY,
    APPLY_ERROR_COPY,
    actionKindOf,
    isActionable,
} from '../adjustmentCopy';
import {
    isConflictReason,
    type SuggestedAdjustment,
} from '../../../types/weeklyInsight.types';

/**
 * BANDEJA DE REAJUSTE — a peça central da tela.
 *
 * ── A DISTINÇÃO QUE ELA EXISTE PARA FAZER ────────────────────────────────────
 *
 * Duas formas visuais, governadas pela CLASSE do enum (decidida no backend):
 *
 *   `schedule`     → CIANO, com botão SÓLIDO. Toca e o calendário se reorganiza.
 *   `prescription` → ÂMBAR, sem nada tocável. É uma dica de execução.
 *
 * A distinção é reforçada por três canais independentes, não só por cor — cor
 * sozinha não comunica estado (HIG, e também acessibilidade): o **selo**
 * ("Ação disponível" × "Dica da semana"), a **moldura** (ciano × âmbar) e a
 * **presença do botão**. Um card de conselho não tem nenhum alvo de toque, então
 * é impossível tocar esperando ação e não receber nada.
 *
 * ── POR QUE ÂMBAR NO CONSELHO (e não cinza) ──────────────────────────────────
 *
 * O ciano é a cor de "isto é interativo" em todo o app. Dar cinza ao conselho o
 * fazia desaparecer no meio dos outros cards; dar ciano o faria parecer
 * clicável. O âmbar resolve os dois: ganha presença sem herdar a promessa de
 * toque, e passa a significar "dica" de forma consistente — o mesmo papel que o
 * badge "rápido demais" já tem no card de intensidade.
 */

interface AdjustmentTrayProps {
    adjustment: SuggestedAdjustment;
    /** Já aplicado? Vem de `adjustment_applied_at`. */
    applied: boolean;
    applying: boolean;
    onApply: () => Promise<{ applied: boolean; reason?: string }>;
    /**
     * Chamado quando o servidor recusa por CONFLITO — o estado mudou entre o que
     * a tela mostra e o que o corredor tentou aplicar. Recarrega a tela para ele
     * decidir sobre a situação real, em vez de tentar de novo contra um estado
     * que não existe mais.
     */
    onConflict?: () => void;
    /**
     * Fase 6.3 — abre a folha de alívio da semana.
     *
     * `volume` não aplica no toque como `schedule`: reescrever treinos exige que
     * o corredor VEJA o resultado antes. Quem mostra é a folha, com o mesmo
     * contrato de preview/digest/conflito que a 6.2 estabeleceu.
     */
    onOpenWeekRelief?: () => void;
}

export const AdjustmentTray = memo(function AdjustmentTray({
    adjustment,
    applied,
    applying,
    onApply,
    onConflict,
    onOpenWeekRelief,
}: AdjustmentTrayProps) {
    const [justApplied, setJustApplied] = useState(false);
    const copy = ADJUSTMENT_COPY[adjustment.code];
    // Pelo CÓDIGO, não pela classe: insights gerados antes da 6.3 têm
    // `class: 'prescription'` congelado no jsonb para `reduzir_volume`.
    const actionable = isActionable(adjustment.code);
    const kind = actionKindOf(adjustment.code);
    const done = applied || justApplied;

    const handlePress = useCallback(() => {
        // ── `volume` abre a preview em vez de aplicar ─────────────────────────
        //
        // Reescrever o volume de N treinos não cabe num diálogo de confirmação:
        // o corredor precisa ver quanto cada treino fica e — principalmente —
        // que o treino de qualidade dele continua de pé. Quem mostra isso é a
        // folha, com o mesmo contrato de digest/conflito da 6.2.
        if (kind === 'volume') {
            onOpenWeekRelief?.();
            return;
        }

        // Confirmação obrigatória: a ação MOVE O CALENDÁRIO INTEIRO e não tem
        // desfazer. Nunca aplicar direto no primeiro toque.
        Alert.alert(
            copy.confirmTitle ?? 'Aplicar ajuste?',
            copy.confirmBody ?? '',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: copy.actionLabel ?? 'Aplicar',
                    style: 'default',
                    onPress: () => {
                        void (async () => {
                            try {
                                const result = await onApply();
                                // `justApplied` SÓ sob confirmação explícita do
                                // servidor: marcá-lo sobre um conflito faria o
                                // botão anunciar um ajuste que não aconteceu.
                                if (result.applied) {
                                    setJustApplied(true);
                                    Alert.alert(
                                        'Pronto',
                                        'Seu calendário foi reorganizado. Os treinos que faltavam voltam a partir de hoje.',
                                    );
                                    return;
                                }

                                // Conflito tem saída própria: recarregar, não
                                // repetir. Repetir contra o estado velho falha
                                // sempre — seria um beco sem fim.
                                if (isConflictReason(result.reason)) {
                                    Alert.alert(
                                        'Seu plano mudou',
                                        APPLY_ERROR_COPY[result.reason],
                                        [
                                            {
                                                text: 'Ver o que mudou',
                                                onPress: () => onConflict?.(),
                                            },
                                        ],
                                    );
                                    return;
                                }

                                Alert.alert(
                                    'Não foi possível aplicar',
                                    APPLY_ERROR_COPY[result.reason ?? ''] ??
                                        'Tente novamente em instantes.',
                                );
                            } catch {
                                Alert.alert(
                                    'Não foi possível aplicar',
                                    'Verifique sua conexão e tente novamente.',
                                );
                            }
                        })();
                    },
                },
            ],
        );
    }, [copy, kind, onApply, onConflict, onOpenWeekRelief]);

    if (adjustment.code === 'manter') {
        return (
            <View style={[styles.card, styles.cardNeutral]}>
                <View style={styles.header}>
                    <Ionicons
                        name={copy.icon as keyof typeof Ionicons.glyphMap}
                        size={18}
                        color={colors.success}
                    />
                    <Text style={[styles.badge, { color: colors.success }]}>
                        {copy.badge}
                    </Text>
                </View>
                <Text style={styles.title}>{copy.title}</Text>
                <Text style={styles.body}>{copy.body}</Text>
            </View>
        );
    }

    const accent = actionable ? colors.primary : colors.accent;

    return (
        <View
            style={[styles.card, actionable ? styles.cardAction : styles.cardAdvice]}
        >
            <View style={styles.header}>
                <View
                    style={[
                        styles.iconWrap,
                        {
                            backgroundColor: actionable
                                ? 'rgba(0,212,255,0.14)'
                                : 'rgba(245,158,11,0.16)',
                        },
                    ]}
                >
                    <Ionicons
                        name={copy.icon as keyof typeof Ionicons.glyphMap}
                        size={15}
                        color={accent}
                    />
                </View>
                <Text style={[styles.badge, { color: accent }]}>{copy.badge}</Text>
            </View>

            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.body}>{copy.body}</Text>

            {actionable &&
                (done ? (
                    <View style={styles.appliedRow}>
                        <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color={colors.success}
                        />
                        <Text style={styles.appliedText}>
                            {kind === 'volume'
                                ? 'Semana aliviada'
                                : 'Ajuste aplicado'}
                        </Text>
                    </View>
                ) : (
                    <Pressable
                        onPress={handlePress}
                        disabled={applying}
                        accessibilityRole="button"
                        accessibilityLabel={copy.actionLabel}
                        accessibilityHint={
                            kind === 'volume'
                                ? 'Mostra como a próxima semana ficaria, sem aplicar nada ainda'
                                : 'Reorganiza os treinos pendentes do seu plano a partir de hoje'
                        }
                        accessibilityState={{ busy: applying, disabled: applying }}
                        style={({ pressed }) => [
                            styles.button,
                            pressed && styles.buttonPressed,
                            applying && styles.buttonDisabled,
                        ]}
                    >
                        {applying ? (
                            <ActivityIndicator size="small" color="#0F0F1E" />
                        ) : (
                            <Text style={styles.buttonText}>{copy.actionLabel}</Text>
                        )}
                    </Pressable>
                ))}

            {/* Sem botão em `prescription` — e o rodapé explica por quê, para a
                ausência não parecer omissão. */}
            {!actionable && (
                <Text style={styles.footnote}>
                    Seu plano segue como está. Esta é uma orientação de execução.
                </Text>
            )}
        </View>
    );
});

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        borderWidth: 1,
        gap: spacing.sm,
    },
    // Ciano = tocável. Âmbar = dica. Cinza = nada a fazer.
    cardAction: {
        borderColor: 'rgba(0,212,255,0.35)',
        backgroundColor: 'rgba(0,212,255,0.05)',
    },
    cardAdvice: {
        borderColor: 'rgba(245,158,11,0.32)',
        backgroundColor: 'rgba(245,158,11,0.05)',
    },
    cardNeutral: {
        borderColor: colors.border,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    iconWrap: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badge: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xs,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xl,
        color: colors.text,
    },
    body: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.md,
        lineHeight: 21,
        color: colors.textSecondary,
    },
    button: {
        marginTop: spacing.sm,
        height: 52, // > 44pt de alvo mínimo
        borderRadius: borderRadius.full,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonPressed: {
        opacity: 0.85,
        transform: [{ scale: 0.985 }],
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.lg,
        color: '#0F0F1E',
    },
    appliedRow: {
        marginTop: spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    appliedText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: colors.success,
    },
    footnote: {
        marginTop: spacing.xs,
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
    },
});
