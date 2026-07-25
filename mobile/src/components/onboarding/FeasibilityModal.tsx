/**
 * Modal de viabilidade da meta (Fase C).
 *
 * Aparece ANTES de finalizar o onboarding quando o pré-check (/onboarding/precheck)
 * diz que a meta não cabe no prazo. Reusa o shell de sheet do ValueInputSheet
 * (Modal transparente + overlay + handle + tokens QUIZ, CTA ciano) e a copy de
 * coach de onboardingCopyMatrix. Tom não-alarmista — orientação, não erro (sem
 * vermelho). Dois modos:
 *
 *  - `forced` (metas de DISTÂNCIA): duas alavancas numa única superfície — estender
 *    prazo (chips 1/3/6 meses) e reduzir meta (5/10/21/42) — revalidando a cada
 *    mudança. O CTA só libera quando a combinação vira viável. Como 5 km @ 6 meses
 *    é sempre viável, nunca há beco sem saída. Sem "gerar assim mesmo".
 *  - `informational` (PROVAS): data/distância são fixas, não há o que ajustar —
 *    então só avisa ("prova próxima pra sua preparação; o plano prioriza chegar em
 *    segurança") com um único CTA "Entendi, continuar". Não bloqueia.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    Modal,
    Pressable,
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { QUIZ } from '../../screens/quiz/_tokens';
import { SelectableOption } from './SelectableOption';
import { getGoalAchievableCopy } from '../../utils/onboardingCopyMatrix';
import type { ViabilityCheck } from '../../stores/onboardingStore';

type Mode = 'forced' | 'informational';

interface FeasibilityModalProps {
    visible: boolean;
    mode: Mode;
    goal: string;
    goalTimeframe: number | null;
    level?: string | null;
    goalType?: string | null;
    raceDistance?: number | null;
    raceName?: string | null;
    initialVerdict: ViabilityCheck;
    onCheck: (overrides: { goal?: string; goalTimeframe?: number }) => Promise<ViabilityCheck>;
    onConfirm: (choice: { goal: string; goalTimeframe: number }) => void;
    onAcknowledge: () => void;
    onClose: () => void;
}

const TIMEFRAMES = [1, 3, 6]; // meses (cap em 6 — decisão de produto)
const DISTANCE_GOALS: { value: string; label: string }[] = [
    { value: '5k', label: '5 km' },
    { value: '10k', label: '10 km' },
    { value: 'half_marathon', label: 'Meia maratona · 21 km' },
    { value: 'marathon', label: 'Maratona · 42 km' },
];

export function FeasibilityModal({
    visible,
    mode,
    goal,
    goalTimeframe,
    level,
    goalType,
    raceDistance,
    raceName,
    initialVerdict,
    onCheck,
    onConfirm,
    onAcknowledge,
    onClose,
}: FeasibilityModalProps) {
    const insets = useSafeAreaInsets();

    const [localGoal, setLocalGoal] = useState(goal);
    const [localTf, setLocalTf] = useState<number>(goalTimeframe || 3);
    const [verdict, setVerdict] = useState<ViabilityCheck>(initialVerdict);
    const [checking, setChecking] = useState(false);
    const skipFirstCheck = useRef(true);

    // Reseed toda vez que abre (o veredito inicial já corresponde à seleção atual).
    useEffect(() => {
        if (visible) {
            setLocalGoal(goal);
            setLocalTf(goalTimeframe || 3);
            setVerdict(initialVerdict);
            setChecking(false);
            skipFirstCheck.current = true;
        }
    }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

    // Revalida (debounced) a cada ajuste — só no modo forçado.
    useEffect(() => {
        if (mode !== 'forced' || !visible) return;
        if (skipFirstCheck.current) {
            skipFirstCheck.current = false;
            return;
        }
        let cancelled = false;
        setChecking(true);
        const timer = setTimeout(async () => {
            const v = await onCheck({ goal: localGoal, goalTimeframe: localTf });
            if (!cancelled) {
                setVerdict(v);
                setChecking(false);
            }
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [localGoal, localTf, mode, visible]); // eslint-disable-line react-hooks/exhaustive-deps

    const copy = getGoalAchievableCopy(mode === 'informational' ? goal : localGoal, level ?? undefined, {
        goalType,
        raceDistance,
        raceName,
    });
    const goalLabel = copy.goalLabel;
    const minMonths = Math.max(1, Math.ceil((verdict.minWeeksRecommended || 0) / 4));
    // Informativo tem dois motivos: prova (data fixa) ou base fraca (nenhuma meta
    // de distância é viável — capacidade muito baixa). A copy muda por motivo.
    const isRace = goalType === 'race';

    const canGenerate = mode === 'forced' && verdict.feasible && !checking;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable
                    style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}
                    onPress={() => {}}
                >
                    <View style={styles.handleBar} />

                    <ScrollView
                        style={styles.scroll}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        <Text style={styles.title}>
                            {mode === 'informational'
                                ? isRace
                                    ? 'Sobre o seu prazo'
                                    : 'Vamos construir sua base'
                                : 'Vamos ajustar sua meta'}
                        </Text>

                        {/* Explicação — tom de coach, não-alarmista (bulb ciano). */}
                        <View style={styles.tipCard}>
                            <Ionicons name="bulb-outline" size={20} color={QUIZ.color.cyan} />
                            <Text style={styles.tipText}>
                                {mode === 'informational'
                                    ? isRace
                                        ? `Sua prova de ${goalLabel} está próxima para a sua preparação atual. Seu plano vai priorizar chegar em segurança — não a performance máxima.`
                                        : `A partir de onde você está hoje, o melhor é começar construindo uma base com segurança. Seu plano vai priorizar aumentar seu volume de forma gradual — o caminho certo pra evoluir sem se machucar.`
                                    : `Para ${goalLabel} a partir de onde você está hoje, o ideal é um pouco mais de tempo — ou uma meta um pouco menor. Ajuste abaixo até liberar.`}
                            </Text>
                        </View>

                        {mode === 'forced' && (
                            <>
                                {/* Estender prazo */}
                                <Text style={styles.sectionLabel}>Prazo</Text>
                                <View style={styles.chipRow}>
                                    {TIMEFRAMES.map((m) => {
                                        const selected = localTf === m;
                                        return (
                                            <Pressable
                                                key={m}
                                                style={[styles.chip, selected && styles.chipSelected]}
                                                onPress={() => setLocalTf(m)}
                                                accessibilityRole="button"
                                                accessibilityState={{ selected }}
                                                accessibilityLabel={`${m} ${m === 1 ? 'mês' : 'meses'}`}
                                            >
                                                <Text
                                                    style={[styles.chipText, selected && styles.chipTextSelected]}
                                                >
                                                    {m} {m === 1 ? 'mês' : 'meses'}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                {/* Reduzir meta */}
                                <Text style={styles.sectionLabel}>Meta</Text>
                                <View style={styles.goalList}>
                                    {DISTANCE_GOALS.map((g) => (
                                        <SelectableOption
                                            key={g.value}
                                            title={g.label}
                                            selected={localGoal === g.value}
                                            onPress={() => setLocalGoal(g.value)}
                                        />
                                    ))}
                                </View>

                                {/* Dica sutil — orienta sem escolher pelo usuário. */}
                                <View style={styles.hintRow}>
                                    {checking ? (
                                        <ActivityIndicator size="small" color={QUIZ.color.cyan} />
                                    ) : verdict.feasible ? (
                                        <Text style={styles.hintOk}>
                                            ✓ Essa combinação prepara você com segurança.
                                        </Text>
                                    ) : (
                                        <Text style={styles.hint}>
                                            Para {goalLabel} daqui, o ideal são cerca de {minMonths}{' '}
                                            {minMonths === 1 ? 'mês' : 'meses'} — estenda o prazo ou
                                            escolha uma meta menor.
                                        </Text>
                                    )}
                                </View>
                            </>
                        )}
                    </ScrollView>

                    {mode === 'informational' ? (
                        <Pressable
                            style={styles.confirmButton}
                            onPress={onAcknowledge}
                            accessibilityRole="button"
                            accessibilityLabel="Entendi, continuar"
                        >
                            <Text style={styles.confirmText}>Entendi, continuar</Text>
                        </Pressable>
                    ) : (
                        <Pressable
                            style={[styles.confirmButton, !canGenerate && styles.confirmButtonDisabled]}
                            onPress={() =>
                                canGenerate && onConfirm({ goal: localGoal, goalTimeframe: localTf })
                            }
                            disabled={!canGenerate}
                            accessibilityRole="button"
                            accessibilityLabel="Gerar meu plano"
                            accessibilityState={{ disabled: !canGenerate }}
                        >
                            <Text style={styles.confirmText}>Gerar meu plano</Text>
                        </Pressable>
                    )}
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#15152A',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        maxHeight: '88%',
    },
    handleBar: {
        width: 40,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.16)',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 16,
    },
    scroll: { flexGrow: 0 },
    scrollContent: { paddingBottom: 4 },
    title: {
        fontFamily: QUIZ.title.fontFamily,
        fontSize: 22,
        color: QUIZ.color.text,
        marginBottom: 14,
    },
    tipCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        backgroundColor: QUIZ.color.card,
        borderRadius: QUIZ.card.radius,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: QUIZ.color.stroke,
        padding: 14,
        marginBottom: 20,
    },
    tipText: {
        flex: 1,
        fontFamily: QUIZ.subtitle.fontFamily,
        fontSize: 14,
        lineHeight: 20,
        color: QUIZ.color.text,
    },
    sectionLabel: {
        fontFamily: QUIZ.optionTitle.fontFamily,
        fontSize: 14,
        color: QUIZ.color.textDim,
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    chipRow: {
        flexDirection: 'row',
        gap: QUIZ.gapOptions,
        marginBottom: 22,
    },
    chip: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: QUIZ.card.radius,
        borderWidth: QUIZ.card.borderWidth,
        borderColor: QUIZ.color.stroke,
        backgroundColor: QUIZ.color.card,
        alignItems: 'center',
    },
    chipSelected: {
        borderColor: QUIZ.color.cyan,
        backgroundColor: QUIZ.color.selectedFill,
    },
    chipText: {
        fontFamily: QUIZ.optionTitle.fontFamily,
        fontSize: 15,
        color: QUIZ.color.text,
    },
    chipTextSelected: {
        color: QUIZ.color.cyan,
    },
    goalList: {
        gap: QUIZ.gapOptions,
        marginBottom: 16,
    },
    hintRow: {
        minHeight: 22,
        justifyContent: 'center',
        marginBottom: 4,
    },
    hint: {
        fontFamily: QUIZ.subtitle.fontFamily,
        fontSize: 13,
        lineHeight: 18,
        color: QUIZ.color.textDim,
    },
    hintOk: {
        fontFamily: QUIZ.subtitle.fontFamily,
        fontSize: 13,
        lineHeight: 18,
        color: QUIZ.color.cyan,
    },
    confirmButton: {
        backgroundColor: QUIZ.color.cyan,
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 16,
    },
    confirmButtonDisabled: {
        opacity: 0.4,
    },
    confirmText: {
        fontFamily: QUIZ.optionTitle.fontFamily,
        fontSize: 16,
        color: '#0F0F1E',
    },
});

export default FeasibilityModal;
