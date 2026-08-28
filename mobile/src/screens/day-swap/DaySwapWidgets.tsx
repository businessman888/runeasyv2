import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
    FadeIn,
    FadeOut,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import {
    borderRadius,
    fonts,
    spacing,
    typography,
    useThemedStyles,
    type ThemeColors,
} from '../../theme';
import { motionDuration, motionEasing } from '../../theme/motion';
import { useMotionPreferences } from '../../hooks/useMotionPreferences';
import { AppIcon } from '../../components/ui/AppIcon';
import { formatarData, labelDoTipo, weekdayOf } from '../../hooks/useDaySwapChat';
import type {
    DaySwapChange,
    DaySwapFreeDate,
    DaySwapPreviewResult,
    DaySwapWeekWorkout,
    Weekday,
} from '../../types/planAdaptation.types';
import { SpacingBadge } from './SpacingBadge';

const DAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
const DAY_FULL = [
    'domingo',
    'segunda-feira',
    'terça-feira',
    'quarta-feira',
    'quinta-feira',
    'sexta-feira',
    'sábado',
] as const;

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

// ─────────────────────────────────────────────────────────────────────────────
// Botões de modo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Os dois modos.
 *
 * ── OPÇÃO IMPOSSÍVEL FICA VISÍVEL, MAS EXPLICADA ─────────────────────────────
 *
 * Quando um modo não tem como rodar (plano na última semana, semana sem dia
 * livre), o botão aparece desabilitado COM O MOTIVO no lugar da dica. Esconder
 * seria mais limpo e seria pior: o corredor que já usou a feature procuraria a
 * opção sumida sem entender. Oferecer e recusar depois do toque é pior ainda —
 * leva a um beco sem saída.
 */
export const ModeButtons = memo(function ModeButtons({
    onChoose,
    structuralBlockedReason,
    singleBlockedReason,
}: {
    onChoose: (mode: 'structural' | 'single') => void;
    structuralBlockedReason?: string;
    singleBlockedReason?: string;
}) {
    const styles = useThemedStyles(createStyles);
    return (
        <View style={styles.stack}>
            <ChoiceButton
                icon="swapDays"
                label="Trocar meus dias de vez"
                hint={
                    structuralBlockedReason ??
                    'Vale da próxima semana até o fim do plano'
                }
                disabled={!!structuralBlockedReason}
                onPress={() => onChoose('structural')}
            />
            <ChoiceButton
                icon="calendar"
                label="Mexer num treino desta semana"
                hint={singleBlockedReason ?? 'Move um treino só, para outro dia'}
                disabled={!!singleBlockedReason}
                onPress={() => onChoose('single')}
            />
        </View>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Modo 1 — o seletor de dias
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Um SELETOR DE MENU, com a quantidade travada.
 *
 * ── POR QUE MENU E NÃO SETE CHIPS SOLTOS ─────────────────────────────────────
 *
 * Sete chips lado a lado cabem, mas obrigam o corredor a decodificar
 * "D S T Q Q S S" — duas iniciais repetidas, sem rótulo. Num campo fechado que
 * abre a lista, cada dia aparece pelo nome inteiro, e o que já foi escolhido
 * fica visível no próprio campo, como resposta em construção. A escolha vira
 * uma frase que ele lê antes de mandar, não sete quadradinhos para conferir.
 *
 * ── A QUANTIDADE É TRAVADA, NUNCA RECUSADA DEPOIS ────────────────────────────
 *
 * Atingido o alvo, os dias restantes ficam `disabled` com o estado anunciado —
 * o v1 troca QUAIS dias, nunca QUANTOS. Mudar a quantidade seria quase
 * regenerar o plano, e está fora do escopo. Travar na UI é mais gentil que
 * deixar escolher e recusar depois do toque.
 */
export const DayPicker = memo(function DayPicker({
    currentDays,
    dayCount,
    onConfirm,
}: {
    currentDays: Weekday[];
    dayCount: number;
    onConfirm: (dias: Weekday[]) => void;
}) {
    const styles = useThemedStyles(createStyles);
    const { reduceMotion } = useMotionPreferences();
    const [selected, setSelected] = useState<Weekday[]>([]);
    const [open, setOpen] = useState(false);

    const atMax = selected.length >= dayCount;
    const faltam = dayCount - selected.length;
    const igualAoAtual =
        selected.length === currentDays.length &&
        [...selected].sort().join() === [...currentDays].sort().join();

    // Na ordem da semana, não na ordem em que ele tocou: o campo tem que se
    // parecer com um calendário, não com um histórico de toques.
    const emOrdem = useMemo(
        () => [...selected].sort((a, b) => a - b),
        [selected],
    );

    const toggle = useCallback(
        (d: Weekday) => {
            setSelected((prev) =>
                prev.includes(d)
                    ? prev.filter((x) => x !== d)
                    : prev.length >= dayCount
                      ? prev
                      : [...prev, d],
            );
        },
        [dayCount],
    );

    const rotation = useSharedValue(0);
    useEffect(() => {
        const alvo = open ? 1 : 0;
        rotation.value = reduceMotion
            ? alvo
            : withTiming(alvo, {
                  duration: motionDuration.fast,
                  easing: motionEasing.standard,
              });
    }, [open, reduceMotion, rotation]);

    const chevronStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value * 180}deg` }],
    }));

    return (
        <View>
            <Pressable
                onPress={() => setOpen((v) => !v)}
                style={({ pressed }) => [
                    styles.field,
                    open && styles.fieldOpen,
                    pressed && styles.fieldPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Escolher os dias de treino"
                accessibilityHint={
                    selected.length === 0
                        ? `Escolha ${dayCount} dias`
                        : `${selected.length} de ${dayCount} escolhidos: ${emOrdem.map((d) => DAY_FULL[d]).join(', ')}`
                }
                accessibilityState={{ expanded: open }}
            >
                <View style={styles.fieldContent}>
                    {emOrdem.length === 0 ? (
                        <Text
                            style={styles.fieldPlaceholder}
                            maxFontSizeMultiplier={1.3}
                        >
                            Escolha {dayCount} dias
                        </Text>
                    ) : (
                        emOrdem.map((d) => (
                            <Pressable
                                key={d}
                                onPress={() => toggle(d)}
                                style={styles.tag}
                                hitSlop={6}
                                accessibilityRole="button"
                                accessibilityLabel={`Tirar ${DAY_FULL[d]}`}
                            >
                                <Text
                                    style={styles.tagText}
                                    maxFontSizeMultiplier={1.2}
                                >
                                    {DAY_SHORT[d]}
                                </Text>
                                <AppIcon name="close" size={16} tone="accent" />
                            </Pressable>
                        ))
                    )}
                </View>

                <View style={styles.fieldTrailing}>
                    <Text style={styles.counter} maxFontSizeMultiplier={1.2}>
                        {selected.length}/{dayCount}
                    </Text>
                    <Animated.View style={chevronStyle}>
                        <AppIcon name="chevronDown" size={20} tone="secondary" />
                    </Animated.View>
                </View>
            </Pressable>

            {open && (
                <Animated.View
                    entering={
                        reduceMotion
                            ? undefined
                            : FadeIn.duration(motionDuration.fast).easing(
                                  motionEasing.enter,
                              )
                    }
                    exiting={
                        reduceMotion
                            ? undefined
                            : FadeOut.duration(motionDuration.instant)
                    }
                    style={styles.menu}
                >
                    {ALL_DAYS.map((d, i) => {
                        const on = selected.includes(d);
                        const blocked = !on && atMax;
                        return (
                            <Pressable
                                key={d}
                                onPress={() => toggle(d)}
                                disabled={blocked}
                                style={({ pressed }) => [
                                    styles.option,
                                    i > 0 && styles.optionDivided,
                                    pressed && styles.optionPressed,
                                    blocked && styles.optionBlocked,
                                ]}
                                accessibilityRole="checkbox"
                                accessibilityState={{
                                    checked: on,
                                    disabled: blocked,
                                }}
                                accessibilityLabel={DAY_FULL[d]}
                            >
                                <View style={[styles.box, on && styles.boxOn]}>
                                    {on && (
                                        <AppIcon
                                            name="selected"
                                            size={16}
                                            tone="onAccent"
                                        />
                                    )}
                                </View>
                                <Text
                                    style={[
                                        styles.optionLabel,
                                        on && styles.optionLabelOn,
                                    ]}
                                    maxFontSizeMultiplier={1.3}
                                >
                                    {DAY_FULL[d]}
                                </Text>
                                {currentDays.includes(d) && (
                                    <Text
                                        style={styles.optionNote}
                                        maxFontSizeMultiplier={1.2}
                                    >
                                        hoje
                                    </Text>
                                )}
                            </Pressable>
                        );
                    })}
                </Animated.View>
            )}

            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
                {igualAoAtual
                    ? 'Esses já são os seus dias de hoje.'
                    : faltam > 0
                      ? `Faltam ${faltam} ${faltam === 1 ? 'dia' : 'dias'}.`
                      : 'Prontinho, pode conferir como fica.'}
            </Text>

            <PrimaryButton
                label="Ver como fica"
                disabled={selected.length !== dayCount || igualAoAtual}
                onPress={() => onConfirm([...selected].sort((a, b) => a - b))}
            />
        </View>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Modo 2 — treino e destino
// ─────────────────────────────────────────────────────────────────────────────

export const WorkoutPicker = memo(function WorkoutPicker({
    workouts,
    onChoose,
}: {
    workouts: DaySwapWeekWorkout[];
    onChoose: (w: DaySwapWeekWorkout) => void;
}) {
    const styles = useThemedStyles(createStyles);
    return (
        <View style={styles.stack}>
            {workouts.map((w) => (
                <ChoiceButton
                    key={w.workoutId}
                    icon="running"
                    label={w.title ?? labelDoTipo(w.type)}
                    hint={formatarData(w.date)}
                    onPress={() => onChoose(w)}
                />
            ))}
        </View>
    );
});

/**
 * Os destinos possíveis.
 *
 * A lista vem PRONTA do backend — só dias que ainda não passaram e que estão
 * livres. A UI nunca a monta sozinha: é essa filtragem que faz o passado e a
 * colisão sumirem por construção, e não por validação depois do toque.
 */
export const DatePicker = memo(function DatePicker({
    dates,
    onChoose,
}: {
    dates: DaySwapFreeDate[];
    onChoose: (date: string) => void;
}) {
    const styles = useThemedStyles(createStyles);
    return (
        <View style={styles.dateWrap}>
            {dates.map((d) => (
                <Pressable
                    key={d.date}
                    onPress={() => onChoose(d.date)}
                    style={styles.dateChip}
                    accessibilityRole="button"
                    accessibilityLabel={`${DAY_FULL[d.weekday]}, ${formatarData(d.date)}`}
                >
                    <Text style={styles.dateDay} maxFontSizeMultiplier={1.2}>
                        {DAY_SHORT[d.weekday]}
                    </Text>
                    <Text style={styles.dateNum} maxFontSizeMultiplier={1.2}>
                        {d.date.slice(8, 10)}/{d.date.slice(5, 7)}
                    </Text>
                </Pressable>
            ))}
        </View>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// O resumo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O que muda, em duas camadas: a REGRA e uma SEMANA CONCRETA.
 *
 * ── POR QUE NÃO A LISTA INTEIRA ──────────────────────────────────────────────
 *
 * Um Modo 1 num plano de 12 semanas mexe em ~30 treinos. Trinta linhas numa
 * bolha de conversa ninguém lê — e "não ler" é pior que "ver menos", porque o
 * corredor confirma sem conferir nada.
 *
 * As setas dão a regra (dá para entender); a primeira semana que muda dá o
 * concreto (dá para conferir). As duas juntas geram confiança verificável.
 *
 * ── AS SETAS VÊM DAS MUDANÇAS REAIS ──────────────────────────────────────────
 *
 * Derivadas de `changes` (`weekdayOf(from) → weekdayOf(to)`), nunca do par
 * "i-ésimo dia atual → i-ésimo dia novo". O pareamento real é cronológico
 * dentro da janela da semana e depende da âncora do plano; supor a ordem
 * mostraria uma seta que não é o que vai acontecer.
 */
export const SwapSummary = memo(function SwapSummary({
    preview,
}: {
    preview: DaySwapPreviewResult;
}) {
    const styles = useThemedStyles(createStyles);
    const changes = preview.changes ?? [];

    const primeiraSemana = useMemo(() => {
        if (changes.length === 0) return [];
        const menor = Math.min(...changes.map((c) => c.weekNumber));
        return changes
            .filter((c) => c.weekNumber === menor)
            .sort((a, b) => (a.to < b.to ? -1 : 1));
    }, [changes]);

    // Um par por dia-da-semana, sem repetir quando a mesma troca se repete nas
    // semanas seguintes.
    const setas = useMemo(() => {
        const vistos = new Set<string>();
        const out: Array<{ de: Weekday; para: Weekday }> = [];
        for (const c of primeiraSemana) {
            const de = weekdayOf(c.from);
            const para = weekdayOf(c.to);
            const chave = `${de}-${para}`;
            if (vistos.has(chave)) continue;
            vistos.add(chave);
            out.push({ de, para });
        }
        return out;
    }, [primeiraSemana]);

    const outrasSemanas = Math.max(0, (preview.weeksAffected ?? 1) - 1);

    return (
        <View>
            {preview.mode === 'structural' && setas.length > 0 && (
                <View style={styles.arrowBox}>
                    {setas.map((s) => (
                        <View key={`${s.de}-${s.para}`} style={styles.arrowRow}>
                            <Text style={styles.arrowFrom} maxFontSizeMultiplier={1.2}>
                                {DAY_SHORT[s.de]}
                            </Text>
                            <AppIcon name="arrowForward" size={16} tone="tertiary" />
                            <Text style={styles.arrowTo} maxFontSizeMultiplier={1.2}>
                                {DAY_SHORT[s.para]}
                            </Text>
                        </View>
                    ))}
                </View>
            )}

            <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.3}>
                {preview.mode === 'structural' ? 'Na próxima semana' : 'Fica assim'}
            </Text>

            {primeiraSemana.map((c) => (
                <ChangeRow key={c.workoutId} change={c} />
            ))}

            {preview.mode === 'structural' && outrasSemanas > 0 && (
                <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
                    E assim nas outras {outrasSemanas}{' '}
                    {outrasSemanas === 1 ? 'semana' : 'semanas'}.
                </Text>
            )}

            {!!preview.spacing && <SpacingBadge spacing={preview.spacing} />}
        </View>
    );
});

const ChangeRow = memo(function ChangeRow({ change }: { change: DaySwapChange }) {
    const styles = useThemedStyles(createStyles);
    return (
        <View
            style={styles.changeRow}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${change.title ?? labelDoTipo(change.type)}, de ${formatarData(change.from)} para ${formatarData(change.to)}`}
        >
            <Text style={styles.changeDate} maxFontSizeMultiplier={1.2}>
                {formatarData(change.to)}
            </Text>
            <Text style={styles.changeName} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {change.title ?? labelDoTipo(change.type)}
            </Text>
            <Text style={styles.changeWas} maxFontSizeMultiplier={1.1}>
                era {formatarData(change.from)}
            </Text>
        </View>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Confirmar / cancelar / recomeçar
// ─────────────────────────────────────────────────────────────────────────────

export const ConfirmButtons = memo(function ConfirmButtons({
    onConfirm,
    onCancel,
    busy,
}: {
    onConfirm: () => void;
    onCancel: () => void;
    busy?: boolean;
}) {
    const styles = useThemedStyles(createStyles);
    return (
        <View style={styles.stack}>
            <PrimaryButton
                label={busy ? 'Trocando...' : 'Confirmar troca'}
                onPress={onConfirm}
                disabled={busy}
            />
            <Pressable
                onPress={onCancel}
                disabled={busy}
                style={styles.ghostButton}
                accessibilityRole="button"
                accessibilityLabel="Cancelar"
            >
                <Text style={styles.ghostLabel} maxFontSizeMultiplier={1.3}>
                    Cancelar
                </Text>
            </Pressable>
        </View>
    );
});

export const RestartButton = memo(function RestartButton({
    onPress,
    label = 'Recomeçar',
}: {
    onPress: () => void;
    label?: string;
}) {
    const styles = useThemedStyles(createStyles);
    return (
        <Pressable
            onPress={onPress}
            style={styles.ghostButton}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <AppIcon name="refresh" size={16} tone="accent" />
            <Text style={styles.ghostLabel} maxFontSizeMultiplier={1.3}>
                {label}
            </Text>
        </Pressable>
    );
});

// ─────────────────────────────────────────────────────────────────────────────

const ChoiceButton = memo(function ChoiceButton({
    icon,
    label,
    hint,
    onPress,
    disabled,
}: {
    icon: 'swapDays' | 'calendar' | 'running';
    label: string;
    hint?: string;
    onPress: () => void;
    disabled?: boolean;
}) {
    const styles = useThemedStyles(createStyles);
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={({ pressed }) => [
                styles.choice,
                pressed && styles.choicePressed,
                disabled && styles.choiceDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={hint}
            accessibilityState={{ disabled: !!disabled }}
        >
            <AppIcon
                name={icon}
                size={20}
                tone={disabled ? 'tertiary' : 'accent'}
            />
            <View style={styles.choiceText}>
                <Text style={styles.choiceLabel} maxFontSizeMultiplier={1.3}>
                    {label}
                </Text>
                {!!hint && (
                    <Text style={styles.choiceHint} maxFontSizeMultiplier={1.2}>
                        {hint}
                    </Text>
                )}
            </View>
        </Pressable>
    );
});

const PrimaryButton = memo(function PrimaryButton({
    label,
    onPress,
    disabled,
}: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
}) {
    const styles = useThemedStyles(createStyles);
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={[styles.primary, disabled && styles.primaryDisabled]}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !!disabled }}
        >
            <Text style={styles.primaryLabel} maxFontSizeMultiplier={1.3}>
                {label}
            </Text>
        </Pressable>
    );
});

function createStyles(colors: ThemeColors) {
    return StyleSheet.create({
        stack: {
            gap: spacing.sm,
        },
        choice: {
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.base,
            paddingVertical: spacing.sm,
            borderRadius: borderRadius.md,
            backgroundColor: colors.surface3,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderSubtle,
        },
        choicePressed: {
            backgroundColor: colors.fillSubtle,
        },
        choiceDisabled: {
            opacity: 0.45,
        },
        choiceText: { flex: 1 },
        choiceLabel: {
            fontSize: typography.fontSizes.base,
            fontFamily: fonts.medium,
            color: colors.textPrimary,
        },
        choiceHint: {
            marginTop: 2,
            fontSize: typography.fontSizes.xs,
            fontFamily: fonts.regular,
            color: colors.textSecondary,
        },
        // ── O seletor de dias ────────────────────────────────────────────────
        field: {
            minHeight: 52,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingLeft: spacing.md,
            paddingRight: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: borderRadius.lg,
            backgroundColor: colors.surface3,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderSubtle,
        },
        // Aberto, o campo é a borda de cima da lista: a mesma superfície,
        // continuada, em vez de dois cartões empilhados.
        fieldOpen: {
            borderColor: colors.accent,
            borderBottomLeftRadius: borderRadius.sm,
            borderBottomRightRadius: borderRadius.sm,
        },
        fieldPressed: {
            backgroundColor: colors.fillSubtle,
        },
        fieldContent: {
            flex: 1,
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: spacing.xs,
        },
        fieldPlaceholder: {
            fontSize: typography.fontSizes.lg,
            fontFamily: fonts.regular,
            color: colors.textTertiary,
        },
        fieldTrailing: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
        },
        counter: {
            fontSize: typography.fontSizes.sm,
            fontFamily: fonts.medium,
            color: colors.textSecondary,
            fontVariant: ['tabular-nums'],
        },
        tag: {
            minHeight: 32,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            paddingLeft: spacing.sm,
            paddingRight: spacing.xs + 2,
            borderRadius: borderRadius.md,
            backgroundColor: colors.accentSubtle,
        },
        tagText: {
            fontSize: typography.fontSizes.base,
            fontFamily: fonts.medium,
            color: colors.accent,
        },
        menu: {
            marginTop: spacing.xs,
            overflow: 'hidden',
            borderRadius: borderRadius.lg,
            backgroundColor: colors.surface3,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderSubtle,
        },
        option: {
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
        },
        optionDivided: {
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderSubtle,
        },
        optionPressed: {
            backgroundColor: colors.fillSubtle,
        },
        optionBlocked: {
            opacity: 0.35,
        },
        box: {
            width: 22,
            height: 22,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: borderRadius.sm + 2,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderStrong,
        },
        boxOn: {
            backgroundColor: colors.accent,
            borderColor: colors.accent,
        },
        optionLabel: {
            flex: 1,
            fontSize: typography.fontSizes.lg,
            fontFamily: fonts.regular,
            color: colors.textPrimary,
        },
        optionLabelOn: {
            fontFamily: fonts.medium,
        },
        optionNote: {
            fontSize: typography.fontSizes.sm,
            fontFamily: fonts.regular,
            color: colors.textTertiary,
        },
        helper: {
            marginTop: spacing.sm,
            marginBottom: spacing.xs,
            fontSize: typography.fontSizes.xs,
            fontFamily: fonts.regular,
            color: colors.textSecondary,
        },
        dateWrap: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: spacing.xs,
        },
        dateChip: {
            minWidth: 64,
            minHeight: 56,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing.sm,
            borderRadius: borderRadius.md,
            backgroundColor: colors.surface3,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderSubtle,
        },
        dateDay: {
            fontSize: typography.fontSizes.xs,
            fontFamily: fonts.regular,
            color: colors.textSecondary,
        },
        dateNum: {
            marginTop: 2,
            fontSize: typography.fontSizes.sm,
            fontFamily: fonts.semibold,
            color: colors.textPrimary,
        },
        // Sem cartão: o resumo mora DENTRO da bolha, e superfície sobre
        // superfície empilha profundidade que não significa nada.
        arrowBox: {
            gap: spacing.xs,
            paddingBottom: spacing.md,
            marginBottom: spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderSubtle,
        },
        arrowRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
        },
        arrowFrom: {
            minWidth: 32,
            fontSize: typography.fontSizes.sm,
            fontFamily: fonts.regular,
            color: colors.textSecondary,
        },
        arrowTo: {
            fontSize: typography.fontSizes.sm,
            fontFamily: fonts.semibold,
            color: colors.accent,
        },
        sectionLabel: {
            marginBottom: spacing.xs,
            fontSize: typography.fontSizes.xs,
            fontFamily: fonts.semibold,
            color: colors.textTertiary,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
        },
        changeRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingVertical: spacing.xs,
        },
        changeDate: {
            minWidth: 74,
            fontSize: typography.fontSizes.sm,
            fontFamily: fonts.semibold,
            color: colors.textPrimary,
        },
        changeName: {
            flex: 1,
            fontSize: typography.fontSizes.sm,
            fontFamily: fonts.regular,
            color: colors.textPrimary,
        },
        changeWas: {
            fontSize: typography.fontSizes.xs,
            fontFamily: fonts.regular,
            color: colors.textTertiary,
        },
        primary: {
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: borderRadius.md,
            backgroundColor: colors.accent,
        },
        primaryDisabled: {
            opacity: 0.4,
        },
        primaryLabel: {
            fontSize: typography.fontSizes.base,
            fontFamily: fonts.semibold,
            color: colors.textOnAccent,
        },
        ghostButton: {
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.xs,
        },
        ghostLabel: {
            fontSize: typography.fontSizes.sm,
            fontFamily: fonts.medium,
            color: colors.accent,
        },
    });
}
