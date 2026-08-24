import React, { useCallback, useEffect, useState } from 'react';
import {
    Modal,
    Pressable,
    View,
    Text,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, typography, spacing, borderRadius, fonts, createThemeStyles, useThemeSubscription } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import {
    getWeekReliefPreview,
    applyWeekRelief,
} from '../../services/planAdaptation';
import { useTrainingStore } from '../../stores/trainingStore';
import type {
    ReliefLevel,
    WeekReliefChange,
    WeekReliefOption,
    WeekReliefPreviewResult,
} from '../../types/planAdaptation.types';

/**
 * ALIVIAR A PRÓXIMA SEMANA — Fase 6.3.
 *
 * ── O MESMO CONTRATO DA 6.2, UM NÍVEL ACIMA ──────────────────────────────────
 *
 *   preview  →  opções JÁ CALCULADAS + o digest do momento
 *   apply    →  o digest DA PREVIEW, nunca um buscado agora
 *   sucesso  →  invalida o cache do plano; todas as telas convergem
 *   conflito →  preview RECALCULADA e reconfirmação
 *
 * A diferença é o corpo: em vez de um treino com duas opções, uma semana com N
 * treinos. O digest continua morando dentro do mesmo objeto da preview, num
 * `set` só — separá-los abriria a janela em que um é novo e o outro velho.
 *
 * ── O QUE ESTA TELA PRECISA COMUNICAR ────────────────────────────────────────
 *
 * O número herói é o total da semana (34 → 27 km). Mas a informação que decide
 * a confiança do corredor é outra: **o treino de qualidade dele continua de
 * pé**. Por isso cada linha protegida leva ícone + rótulo "mantido", nunca só
 * uma cor — cor sozinha não comunica estado, e aqui o estado é uma promessa.
 *
 * ── POR QUE NÃO COMPARTILHA CÓDIGO COM A `ReliefSheet` ───────────────────────
 *
 * A máquina de estados é a mesma, e a tentação de extrair um hook é real. Mas a
 * `ReliefSheet` está validada no device, e refatorá-la agora colocaria risco em
 * algo provado para economizar ~50 linhas na SEGUNDA ocorrência. Se a 6.4 pedir
 * uma terceira, extrai-se então. O que já é compartilhado é o que importa: os
 * serviços, o tratamento de conflito e o vocabulário visual.
 */

interface WeekReliefSheetProps {
    visible: boolean;
    onClose: () => void;
    /** O insight que sugeriu — marca a origem no histórico e trava o replay. */
    insightId?: string;
    /** Chamado após um alívio confirmado. */
    onApplied?: () => void;
}

const formatKm = (km: number): string =>
    (Math.round(km * 10) / 10).toString().replace('.', ',');

const LEVEL_LABEL: Record<ReliefLevel, string> = {
    light: 'Um pouco',
    strong: 'Bastante',
};

const TYPE_LABEL: Record<string, string> = {
    long_run: 'Longão',
    easy_run: 'Rodagem leve',
    recovery: 'Regenerativo',
    tempo: 'Tempo run',
    intervals: 'Intervalado',
    fartlek: 'Fartlek',
    hill_repeats: 'Ladeira',
    repetition: 'Tiros curtos',
    progressive: 'Progressivo',
    race_simulation: 'Simulação de prova',
};

export function WeekReliefSheet({
    visible,
    onClose,
    insightId,
    onApplied,
}: WeekReliefSheetProps) {
    useThemeSubscription();
    const insets = useSafeAreaInsets();
    const invalidatePlanCaches = useTrainingStore((s) => s.invalidatePlanCaches);

    const [preview, setPreview] = useState<WeekReliefPreviewResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [selected, setSelected] = useState<ReliefLevel | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [conflict, setConflict] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const p = await getWeekReliefPreview(insightId);
            setPreview(p);
            setSelected(p.available ? (p.options?.[0]?.level ?? null) : null);
        } catch (e) {
            setError(
                e instanceof Error ? e.message : 'Não foi possível carregar.',
            );
        } finally {
            setLoading(false);
        }
    }, [insightId]);

    // Nada sobrevive entre aberturas — nem preview, nem digest, nem o conflito.
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
        if (!preview?.available || !selected || !preview.digest) return;

        setApplying(true);
        setError(null);
        try {
            const result = await applyWeekRelief(
                selected,
                preview.digest, // o digest DA PREVIEW
                insightId,
            );

            if (result.applied) {
                await invalidatePlanCaches();
                onApplied?.();
                onClose();
                return;
            }

            if (result.preview) {
                setPreview(result.preview);
                setSelected(
                    result.preview.available
                        ? (result.preview.options?.[0]?.level ?? null)
                        : null,
                );
                setConflict(true);
            }
            setError(result.message ?? 'Não foi possível aliviar a semana.');
        } catch {
            setError('Verifique sua conexão e tente novamente.');
        } finally {
            setApplying(false);
        }
    }, [
        preview,
        selected,
        insightId,
        invalidatePlanCaches,
        onApplied,
        onClose,
    ]);

    const option = preview?.options?.find((o) => o.level === selected) ?? null;

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

                <Text style={styles.title}>
                    {preview?.weekNumber
                        ? `Aliviar a semana ${preview.weekNumber}`
                        : 'Aliviar a próxima semana'}
                </Text>

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

                {!loading && preview?.available && (
                    <>
                        {conflict && (
                            <View style={styles.conflictBanner}>
                                <Ionicons
                                    name="refresh-circle"
                                    size={18}
                                    color={colors.accent}
                                />
                                <Text style={styles.conflictText}>
                                    Seu plano mudou desde que você abriu. Estas
                                    são as opções para a semana como ela está
                                    agora.
                                </Text>
                            </View>
                        )}

                        {/* O número herói: o total da semana. */}
                        <View style={styles.heroRow}>
                            <Text style={styles.heroFrom}>
                                {formatKm(preview.weekTotalKm ?? 0)} km
                            </Text>
                            {!!option && (
                                <>
                                    <Ionicons
                                        name="arrow-forward"
                                        size={18}
                                        color={colors.textMuted}
                                    />
                                    <Text style={styles.heroTo}>
                                        {formatKm(option.weekTotalKmAfter)} km
                                    </Text>
                                </>
                            )}
                        </View>
                        <Text style={styles.subtitle}>
                            {preview.workoutCount} treinos nesta semana
                        </Text>

                        <View style={styles.options}>
                            {(preview.options ?? []).map((opt) => (
                                <LevelRow
                                    key={opt.level}
                                    option={opt}
                                    weekTotalKm={preview.weekTotalKm ?? 0}
                                    selected={selected === opt.level}
                                    onSelect={() => setSelected(opt.level)}
                                />
                            ))}
                        </View>

                        {!!option && (
                            <ScrollView
                                style={styles.list}
                                contentContainerStyle={styles.listContent}
                                showsVerticalScrollIndicator={false}
                            >
                                {option.changes.map((c) => (
                                    <WorkoutRow key={c.workoutId} change={c} />
                                ))}
                            </ScrollView>
                        )}

                        <Text style={styles.footnote}>
                            O ritmo alvo continua o mesmo em todos os treinos.
                        </Text>

                        {!!error && (
                            <Text style={styles.errorText}>{error}</Text>
                        )}

                        <Pressable
                            onPress={handleApply}
                            disabled={applying || !selected}
                            accessibilityRole="button"
                            accessibilityLabel={
                                conflict ? 'Aplicar mesmo assim' : 'Aliviar a semana'
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
                                    {conflict
                                        ? 'Aplicar mesmo assim'
                                        : 'Aliviar a semana'}
                                </Text>
                            )}
                        </Pressable>
                    </>
                )}
            </View>
        </Modal>
    );
}

const LevelRow = React.memo(function LevelRow({
    option,
    weekTotalKm,
    selected,
    onSelect,
}: {
    option: WeekReliefOption;
    weekTotalKm: number;
    selected: boolean;
    onSelect: () => void;
}) {
    useThemeSubscription();
    // O percentual exibido é o ALCANÇADO, não o pedido. Quando os pisos limitam,
    // "−35%" seria uma promessa que a semana não cumpre.
    const limitado = option.achievedPct < option.targetPct;

    return (
        <Pressable
            onPress={onSelect}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${LEVEL_LABEL[option.level]}: de ${formatKm(
                weekTotalKm,
            )} para ${formatKm(option.weekTotalKmAfter)} quilômetros`}
            style={[styles.option, selected && styles.optionSelected]}
        >
            <View style={styles.radio}>
                {selected && <View style={styles.radioDot} />}
            </View>

            <View style={styles.optionText}>
                <Text style={styles.optionLabel}>
                    {LEVEL_LABEL[option.level]}
                </Text>
                {limitado && (
                    <Text style={styles.optionNote}>
                        máximo sem tocar na qualidade
                    </Text>
                )}
            </View>

            <View style={styles.optionValue}>
                <Text style={styles.optionTo}>
                    {formatKm(option.weekTotalKmAfter)} km
                </Text>
                <Text style={styles.optionPct}>−{option.achievedPct}%</Text>
            </View>
        </Pressable>
    );
});

const WorkoutRow = React.memo(function WorkoutRow({
    change,
}: {
    change: WeekReliefChange;
}) {
    useThemeSubscription();
    const label = TYPE_LABEL[change.type ?? ''] ?? change.title ?? 'Treino';

    return (
        <View style={styles.row}>
            <Ionicons
                name={change.isProtected ? 'shield-checkmark' : 'remove-circle-outline'}
                size={15}
                color={change.isProtected ? colors.success : colors.textMuted}
            />
            <Text style={styles.rowLabel} numberOfLines={1}>
                {label}
            </Text>

            {change.isProtected ? (
                // Ícone + palavra, nunca só cor: é a promessa central da tela.
                <Text style={styles.rowKept}>mantido · {formatKm(change.beforeKm)} km</Text>
            ) : change.changed ? (
                <Text style={styles.rowChanged}>
                    {formatKm(change.beforeKm)} → {formatKm(change.afterKm)} km
                </Text>
            ) : (
                <Text style={styles.rowKept}>{formatKm(change.beforeKm)} km</Text>
            )}
        </View>
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
        maxHeight: '88%',
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
    heroRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginTop: spacing.xs,
    },
    heroFrom: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.lg,
        color: semanticColors.textTertiary,
        textDecorationLine: 'line-through',
    },
    heroTo: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes['2xl'],
        color: semanticColors.accent,
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
        minHeight: 56, // > 44pt
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
    optionText: { flex: 1 },
    optionLabel: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: semanticColors.textPrimary,
    },
    optionNote: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textTertiary,
    },
    optionValue: { alignItems: 'flex-end' },
    optionTo: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.md,
        color: semanticColors.accent,
    },
    optionPct: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textTertiary,
    },
    list: { maxHeight: 168 },
    listContent: { gap: spacing.xs, paddingVertical: spacing.xs },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    rowLabel: {
        flex: 1,
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textSecondary,
    },
    rowChanged: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textPrimary,
    },
    rowKept: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textTertiary,
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

export default WeekReliefSheet;
