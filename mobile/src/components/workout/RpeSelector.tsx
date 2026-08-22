import React, { memo, useCallback, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

/**
 * Coleta a percepção de esforço REPORTADA pelo atleta (Borg CR10, 1–10).
 *
 * POR QUE AQUI E NÃO NA TELA DE PROCESSAMENTO: a WorkoutProcessingScreen dispara
 * o submit da conclusão já no mount, antes de qualquer interação possível, e sai
 * da tela assim que o feedback da IA fica pronto (~7s). Perguntar lá daria uma
 * janela de segundos. Aqui — RunSummary (corrida livre/manual) e CoachAnalysis
 * (treino de plano) — o atleta responde sem pressão de tempo.
 *
 * NÃO confundir com o "RPE" já exibido no WorkoutDetailScreen: aquele vem de
 * `metadata.perceived_effort`, o esforço PRESCRITO pela IA. Este é o sentido.
 *
 * Opcional por decisão de produto: some da tela ao responder ou ao pular, e a
 * ausência de resposta nunca bloqueia nada.
 */

export interface RpeSelectorProps {
    /** Valor já gravado. Quando presente, o card renderiza em modo leitura. */
    value?: number | null;
    /** Dispara o PATCH. Deve resolver com sucesso/falha para o card reagir. */
    onSelect: (rpe: number) => Promise<void>;
    /** Dispensa o card nesta sessão (não grava nada). */
    onSkip?: () => void;
}

const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * Âncoras verbais da escala CR10. Só as pontas e o meio recebem rótulo — a
 * escala inteira legendada vira ruído visual e ninguém lê.
 */
const RPE_ANCHORS: Record<number, string> = {
    1: 'Muito leve',
    5: 'Moderado',
    10: 'Máximo',
};

/** Cor por faixa de esforço: leve → cyan, moderado → amarelo, forte → vermelho. */
function toneFor(rpe: number): string {
    if (rpe <= 3) return colors.primary;
    if (rpe <= 6) return colors.success;
    if (rpe <= 8) return colors.warning;
    return colors.error;
}

export const RpeSelector = memo(function RpeSelector({
    value,
    onSelect,
    onSkip,
}: RpeSelectorProps) {
    const [saving, setSaving] = useState<number | null>(null);
    const [saved, setSaved] = useState<number | null>(value ?? null);
    const [failed, setFailed] = useState(false);
    const [skipped, setSkipped] = useState(false);

    const handleSelect = useCallback(
        async (rpe: number) => {
            if (saving != null) return;
            setSaving(rpe);
            setFailed(false);
            try {
                await onSelect(rpe);
                setSaved(rpe);
            } catch {
                // Falhou o PATCH: mantém o card aberto para nova tentativa em vez
                // de fingir que gravou. O RPE é opcional — não vale um alert.
                setFailed(true);
            } finally {
                setSaving(null);
            }
        },
        [onSelect, saving],
    );

    const handleSkip = useCallback(() => {
        setSkipped(true);
        onSkip?.();
    }, [onSkip]);

    if (skipped) return null;

    // ── Modo leitura: já respondido (nesta sessão ou em sessão anterior) ──────
    if (saved != null) {
        return (
            <View style={styles.card}>
                <View style={styles.savedRow}>
                    <View
                        style={[
                            styles.savedBadge,
                            { borderColor: toneFor(saved), backgroundColor: `${toneFor(saved)}1F` },
                        ]}
                    >
                        <Text style={[styles.savedValue, { color: toneFor(saved) }]}>
                            {saved}
                        </Text>
                    </View>
                    <View style={styles.savedTextWrap}>
                        <Text style={styles.savedTitle}>Esforço registrado</Text>
                        <Text style={styles.savedHint}>
                            Toque num número para corrigir
                        </Text>
                    </View>
                    <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={colors.success}
                    />
                </View>

                <View style={styles.scaleRow}>
                    {RPE_VALUES.map((v) => (
                        <RpeDot
                            key={v}
                            value={v}
                            selected={v === saved}
                            busy={saving === v}
                            onPress={handleSelect}
                        />
                    ))}
                </View>
            </View>
        );
    }

    // ── Modo pergunta ────────────────────────────────────────────────────────
    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <View style={styles.headerTextWrap}>
                    <Text style={styles.title}>Como foi o esforço?</Text>
                    <Text style={styles.subtitle}>
                        Sua percepção ajuda o treinador a calibrar os próximos treinos.
                    </Text>
                </View>
                {onSkip && (
                    <Pressable
                        onPress={handleSkip}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Pular a pergunta de esforço percebido"
                    >
                        <Text style={styles.skip}>Pular</Text>
                    </Pressable>
                )}
            </View>

            <View style={styles.scaleRow}>
                {RPE_VALUES.map((v) => (
                    <RpeDot
                        key={v}
                        value={v}
                        selected={false}
                        busy={saving === v}
                        onPress={handleSelect}
                    />
                ))}
            </View>

            <View style={styles.anchorRow}>
                <Text style={styles.anchor}>{RPE_ANCHORS[1]}</Text>
                <Text style={styles.anchor}>{RPE_ANCHORS[5]}</Text>
                <Text style={styles.anchor}>{RPE_ANCHORS[10]}</Text>
            </View>

            {failed && (
                <Text style={styles.error}>
                    Não deu para salvar agora. Toque de novo.
                </Text>
            )}
        </View>
    );
});

interface RpeDotProps {
    value: number;
    selected: boolean;
    busy: boolean;
    onPress: (rpe: number) => void;
}

const RpeDot = memo(function RpeDot({
    value,
    selected,
    busy,
    onPress,
}: RpeDotProps) {
    const tone = toneFor(value);
    return (
        <Pressable
            onPress={() => onPress(value)}
            disabled={busy}
            style={({ pressed }) => [
                styles.dot,
                selected && { borderColor: tone, backgroundColor: `${tone}26` },
                pressed && styles.dotPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Esforço ${value} de 10`}
            accessibilityState={{ selected, busy }}
        >
            {busy ? (
                <ActivityIndicator size="small" color={tone} />
            ) : (
                <Text style={[styles.dotText, selected && { color: tone }]}>
                    {value}
                </Text>
            )}
        </Pressable>
    );
});

const styles = StyleSheet.create({
    card: {
        backgroundColor: semanticColors.surface1,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 16,
        marginBottom: 14,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 14,
    },
    headerTextWrap: {
        flex: 1,
    },
    title: {
        fontFamily: fonts.bold,
        color: semanticColors.textPrimary,
        fontSize: 17,
        marginBottom: 4,
    },
    subtitle: {
        fontFamily: fonts.regular,
        color: semanticColors.textSecondary,
        fontSize: 12,
        lineHeight: 17,
    },
    skip: {
        fontFamily: fonts.medium,
        color: semanticColors.textSecondary,
        fontSize: 13,
        paddingTop: 2,
    },
    scaleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 5,
    },
    dot: {
        flex: 1,
        aspectRatio: 1,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        backgroundColor: semanticColors.glass,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dotPressed: {
        opacity: 0.6,
    },
    dotText: {
        fontFamily: fonts.semibold,
        color: semanticColors.textPrimary,
        fontSize: 13,
    },
    anchorRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
    },
    anchor: {
        fontFamily: fonts.regular,
        color: semanticColors.textTertiary,
        fontSize: 10,
    },
    error: {
        fontFamily: fonts.regular,
        color: colors.error,
        fontSize: 12,
        marginTop: 10,
    },
    savedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
    },
    savedBadge: {
        width: 40,
        height: 40,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    savedValue: {
        fontFamily: fonts.bold,
        fontSize: 17,
    },
    savedTextWrap: {
        flex: 1,
    },
    savedTitle: {
        fontFamily: fonts.semibold,
        color: semanticColors.textPrimary,
        fontSize: 15,
    },
    savedHint: {
        fontFamily: fonts.regular,
        color: semanticColors.textSecondary,
        fontSize: 12,
        marginTop: 2,
    },
});
