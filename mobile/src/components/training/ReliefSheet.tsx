import React, { useCallback, useEffect, useState } from 'react';
import {
    Modal,
    Pressable,
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, typography, spacing, borderRadius, fonts, createThemeStyles, useThemeSubscription } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import { getReliefPreview, applyRelief } from '../../services/planAdaptation';
import { useTrainingStore } from '../../stores/trainingStore';
import type {
    ReliefLevel,
    ReliefOption,
    ReliefPreviewResult,
} from '../../types/planAdaptation.types';

/**
 * ALIVIAR ESTE TREINO — a estreia do contrato do apply no mobile (Fase 6.2).
 *
 * ── O CICLO QUE ESTA FOLHA IMPLEMENTA ────────────────────────────────────────
 *
 *   preview  →  carrega as opções JÁ CALCULADAS e o digest do momento
 *   apply    →  envia o digest DA PREVIEW, nunca um buscado agora
 *   sucesso  →  invalida o cache do plano; todas as telas convergem
 *   conflito →  mostra a preview RECALCULADA e pede reconfirmação
 *
 * ── POR QUE O DIGEST MORA DENTRO DO `preview` ────────────────────────────────
 *
 * Um único `useState` guarda os dois. Se fossem campos separados, existiria uma
 * janela em que um está novo e o outro velho — e o apply aplicaria sobre um
 * estado que o corredor não viu, que é exatamente o que a concorrência otimista
 * existe para impedir. Estado curto, e descartado ao fechar: um digest que
 * sobrevive à folha produz conflito garantido na próxima abertura.
 *
 * ── POR QUE OS NÚMEROS VÊM PRONTOS DO SERVIDOR ───────────────────────────────
 *
 * Cada opção traz `distanceKm` já calculado, não um percentual para a UI
 * aplicar. Os pisos do motor (o `main` não desce de 1 km, o intervalado não desce
 * de 2 tiros) podem impedir a redução nominal, e um app que exibisse "−35%"
 * sobre um treino que só cedeu 17% estaria mentindo. O que se mostra é o treino
 * resultante.
 */

interface ReliefSheetProps {
    visible: boolean;
    workoutId: string;
    onClose: () => void;
    /** Chamado após um alívio confirmado — a tela recarrega o treino. */
    onApplied?: () => void;
}

const formatKm = (km: number): string =>
    (Math.round(km * 10) / 10).toString().replace('.', ',');

const formatMin = (seconds: number): string => `${Math.round(seconds / 60)} min`;

const LEVEL_LABEL: Record<ReliefLevel, string> = {
    light: 'Um pouco',
    strong: 'Bastante',
};

export function ReliefSheet({
    visible,
    workoutId,
    onClose,
    onApplied,
}: ReliefSheetProps) {
    useThemeSubscription();
    const insets = useSafeAreaInsets();
    const invalidatePlanCaches = useTrainingStore((s) => s.invalidatePlanCaches);

    const [preview, setPreview] = useState<ReliefPreviewResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [selected, setSelected] = useState<ReliefLevel | null>(null);
    const [error, setError] = useState<string | null>(null);
    /** Ligado depois de um conflito: o botão passa a pedir reconfirmação. */
    const [conflict, setConflict] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const p = await getReliefPreview(workoutId);
            setPreview(p);
            // Pré-seleciona o alívio mais leve: é o padrão conservador, e evita
            // um estado em que o botão existe sem nada escolhido.
            setSelected(p.available ? (p.options?.[0]?.level ?? null) : null);
        } catch (e) {
            setError(
                e instanceof Error ? e.message : 'Não foi possível carregar.',
            );
        } finally {
            setLoading(false);
        }
    }, [workoutId]);

    // Recarrega a cada abertura. Nada sobrevive entre aberturas — nem preview,
    // nem digest, nem o aviso de conflito.
    useEffect(() => {
        if (!visible) {
            setPreview(null);
            setSelected(null);
            setConflict(false);
            setError(null);
            return;
        }
        void load();
    }, [visible, load]);

    const handleApply = useCallback(async () => {
        if (!preview?.available || !selected) return;

        setApplying(true);
        setError(null);
        try {
            // O digest DA PREVIEW — o estado que o corredor de fato viu.
            const result = await applyRelief(
                workoutId,
                selected,
                preview.digest,
            );

            if (result.applied) {
                // A convergência: sem isto, calendário e Metas seguiriam
                // mostrando o volume antigo até o app ser reaberto.
                await invalidatePlanCaches();
                onApplied?.();
                onClose();
                return;
            }

            // Conflito: o servidor já devolveu a preview recalculada. Trocar o
            // estado por ela é o que transforma "deu erro" em "olhe de novo".
            if (result.preview) {
                setPreview(result.preview);
                setSelected(
                    result.preview.available
                        ? (result.preview.options?.[0]?.level ?? null)
                        : null,
                );
                setConflict(true);
            }
            setError(result.message ?? 'Não foi possível aplicar.');
        } catch (e) {
            setError(
                e instanceof Error
                    ? 'Verifique sua conexão e tente novamente.'
                    : 'Não foi possível aplicar.',
            );
        } finally {
            setApplying(false);
        }
    }, [
        preview,
        selected,
        workoutId,
        invalidatePlanCaches,
        onApplied,
        onClose,
    ]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <Pressable style={styles.overlay} onPress={onClose} />

            <View
                style={[
                    styles.sheet,
                    { paddingBottom: Math.max(insets.bottom, spacing.lg) },
                ]}
            >
                <View style={styles.handle} />

                <Text style={styles.title}>Aliviar este treino</Text>

                {loading && (
                    <View style={styles.centered}>
                        <ActivityIndicator color={colors.primary} />
                    </View>
                )}

                {!loading && preview && !preview.available && (
                    <View style={styles.centered}>
                        <Ionicons
                            name="information-circle-outline"
                            size={32}
                            color={colors.textMuted}
                        />
                        <Text style={styles.stateText}>{preview.message}</Text>
                    </View>
                )}

                {!loading && !preview && error && (
                    <View style={styles.centered}>
                        <Text style={styles.stateText}>{error}</Text>
                        <Pressable
                            onPress={load}
                            style={styles.retryBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Tentar novamente"
                        >
                            <Text style={styles.retryText}>
                                Tentar novamente
                            </Text>
                        </Pressable>
                    </View>
                )}

                {!loading && preview?.available && preview.current && (
                    <>
                        {/* Banner de conflito: a moldura âmbar já significa
                            "atenção" na bandeja do insight semanal. */}
                        {conflict && (
                            <View style={styles.conflictBanner}>
                                <Ionicons
                                    name="refresh-circle"
                                    size={18}
                                    color={colors.accent}
                                />
                                <Text style={styles.conflictText}>
                                    Seu plano mudou desde que você abriu. Estas
                                    são as opções para o treino como ele está
                                    agora.
                                </Text>
                            </View>
                        )}

                        <Text style={styles.subtitle}>
                            {preview.current.title ?? 'Treino'} ·{' '}
                            {preview.current.distanceKm > 0
                                ? `${formatKm(preview.current.distanceKm)} km`
                                : formatMin(preview.current.durationSeconds)}
                        </Text>

                        <View style={styles.options}>
                            {(preview.options ?? []).map((opt) => (
                                <OptionRow
                                    key={opt.level}
                                    option={opt}
                                    current={preview.current}
                                    selected={selected === opt.level}
                                    onSelect={() => setSelected(opt.level)}
                                />
                            ))}
                        </View>

                        <Text style={styles.footnote}>
                            O ritmo alvo continua o mesmo — muda só a distância.
                        </Text>

                        {!!error && <Text style={styles.errorText}>{error}</Text>}

                        <Pressable
                            onPress={handleApply}
                            disabled={applying || !selected}
                            accessibilityRole="button"
                            accessibilityLabel={
                                conflict ? 'Aplicar mesmo assim' : 'Aliviar'
                            }
                            accessibilityState={{
                                busy: applying,
                                disabled: applying || !selected,
                            }}
                            style={({ pressed }) => [
                                styles.button,
                                pressed && styles.buttonPressed,
                                (applying || !selected) && styles.buttonDisabled,
                            ]}
                        >
                            {applying ? (
                                <ActivityIndicator
                                    size="small"
                                    color={colors.cardDark}
                                />
                            ) : (
                                <Text style={styles.buttonText}>
                                    {conflict ? 'Aplicar mesmo assim' : 'Aliviar'}
                                </Text>
                            )}
                        </Pressable>
                    </>
                )}
            </View>
        </Modal>
    );
}

const OptionRow = React.memo(function OptionRow({
    option,
    current,
    selected,
    onSelect,
}: {
    option: ReliefOption;
    current: { distanceKm: number; durationSeconds: number };
    selected: boolean;
    onSelect: () => void;
}) {
    useThemeSubscription();
    const byTime = current.distanceKm <= 0;
    const from = byTime
        ? formatMin(current.durationSeconds)
        : `${formatKm(current.distanceKm)} km`;
    const to = byTime
        ? formatMin(option.durationSeconds)
        : `${formatKm(option.distanceKm)} km`;

    return (
        <Pressable
            onPress={onSelect}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${LEVEL_LABEL[option.level]}: de ${from} para ${to}`}
            style={[styles.option, selected && styles.optionSelected]}
        >
            <View style={styles.radio}>
                {selected && <View style={styles.radioDot} />}
            </View>

            <Text style={styles.optionLabel}>{LEVEL_LABEL[option.level]}</Text>

            <View style={styles.optionValue}>
                <Text style={styles.optionFrom}>{from}</Text>
                <Ionicons
                    name="arrow-forward"
                    size={13}
                    color={colors.textMuted}
                />
                {/* O número RESULTANTE, não o percentual pedido. */}
                <Text style={styles.optionTo}>{to}</Text>
            </View>
        </Pressable>
    );
});

const styles = createThemeStyles(() => ({
    overlay: { flex: 1, backgroundColor: semanticColors.scrim },
    sheet: {
        backgroundColor: semanticColors.surface2,
        borderTopLeftRadius: borderRadius['2xl'],
        borderTopRightRadius: borderRadius['2xl'],
        paddingHorizontal: spacing.base,
        paddingTop: spacing.sm,
        gap: spacing.sm,
    },
    handle: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: semanticColors.borderStrong,
        marginBottom: spacing.sm,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xl,
        color: semanticColors.textPrimary,
    },
    subtitle: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textSecondary,
    },
    centered: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: spacing['2xl'],
    },
    stateText: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.md,
        color: semanticColors.textSecondary,
        textAlign: 'center',
    },
    conflictBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.xs,
        padding: spacing.sm,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: 'rgba(245,158,11,0.32)',
        backgroundColor: semanticColors.warningSubtle,
    },
    conflictText: {
        flex: 1,
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        lineHeight: 17,
        color: semanticColors.textSecondary,
    },
    options: { gap: spacing.xs, marginTop: spacing.xs },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        minHeight: 56, // > 44pt de alvo mínimo
        paddingHorizontal: spacing.md,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    optionSelected: {
        borderColor: semanticColors.accent,
        backgroundColor: semanticColors.accentSubtle,
    },
    radio: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: semanticColors.borderSubtle,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: semanticColors.accent,
    },
    optionLabel: {
        flex: 1,
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: semanticColors.textPrimary,
    },
    optionValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    optionFrom: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textTertiary,
        textDecorationLine: 'line-through',
    },
    optionTo: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.md,
        color: semanticColors.accent,
    },
    footnote: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textTertiary,
    },
    errorText: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: semanticColors.accent,
    },
    button: {
        marginTop: spacing.xs,
        height: 52,
        borderRadius: borderRadius.full,
        backgroundColor: semanticColors.accent,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonPressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
    buttonDisabled: { opacity: 0.6 },
    buttonText: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.lg,
        color: semanticColors.textOnAccent,
    },
    retryBtn: {
        marginTop: spacing.sm,
        paddingHorizontal: spacing.xl,
        height: 44,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        alignItems: 'center',
        justifyContent: 'center',
    },
    retryText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: semanticColors.textPrimary,
    },
}));

export default ReliefSheet;
