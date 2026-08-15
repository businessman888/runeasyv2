import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AccessibilityInfo,
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import Animated, { Easing, FadeIn, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';

import { ScreenContainer } from '../components/ScreenContainer';
import { QuizHeader, Hl } from '../components/onboarding/QuizHeader';
import { DistanceTimeScreen } from './quiz/DistanceTimeScreen';
import { AvailableDaysScreen } from './quiz/AvailableDaysScreen';
import { borderRadius, colors, fonts, spacing } from '../theme';
import { PaceGoalFeasibility, retrospectiveGoalService } from '../services/retrospectiveGoalService';
import type { RootStackParamList } from '../navigation/navigationRef';

interface TimeValue {
    hours: number;
    minutes: number;
    seconds: number;
}

interface SelectOption {
    id: string;
    label: string;
    detail: string;
    icon: keyof typeof Ionicons.glyphMap;
}

const DISTANCES: SelectOption[] = [
    {
        id: '5k',
        label: '5 km',
        detail: 'Velocidade e consistência',
        icon: 'flash-outline',
    },
    {
        id: '10k',
        label: '10 km',
        detail: 'Resistência com ritmo',
        icon: 'speedometer-outline',
    },
    {
        id: 'half_marathon',
        label: '21,1 km',
        detail: 'Meia maratona',
        icon: 'trending-up-outline',
    },
    {
        id: 'marathon',
        label: '42,2 km',
        detail: 'Maratona',
        icon: 'flag-outline',
    },
];

const DURATIONS: SelectOption[] = [
    {
        id: '8',
        label: '8 semanas',
        detail: 'Ciclo compacto',
        icon: 'calendar-outline',
    },
    {
        id: '10',
        label: '10 semanas',
        detail: 'Progressão equilibrada',
        icon: 'calendar-outline',
    },
    {
        id: '12',
        label: '12 semanas',
        detail: 'Recomendado',
        icon: 'sparkles-outline',
    },
    {
        id: '16',
        label: '16 semanas',
        detail: 'Mais tempo para adaptar',
        icon: 'leaf-outline',
    },
];

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function secondsFromTime(value: TimeValue): number {
    return value.hours * 3600 + value.minutes * 60 + value.seconds;
}

function timeFromSeconds(total: number): TimeValue {
    return {
        hours: Math.floor(total / 3600),
        minutes: Math.floor((total % 3600) / 60),
        seconds: Math.round(total % 60),
    };
}

function formatTime(value: TimeValue): string {
    const hours = value.hours;
    const minutes = String(value.minutes).padStart(2, '0');
    const seconds = String(value.seconds).padStart(2, '0');
    return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

function distanceKm(goal: string): number {
    return { '5k': 5, '10k': 10, half_marathon: 21.1, marathon: 42.2 }[goal] ?? 5;
}

function CircleProgress({ current, total, reduceMotion }: { current: number; total: number; reduceMotion: boolean }) {
    const size = 48;
    const stroke = 4;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = useSharedValue(0);

    useEffect(() => {
        const next = current / total;
        progress.value = reduceMotion ? next : withTiming(next, { duration: 420, easing: Easing.out(Easing.cubic) });
    }, [current, progress, reduceMotion, total]);

    const animatedProps = useAnimatedProps(() => ({
        strokeDashoffset: circumference * (1 - progress.value),
    }));

    return (
        <View style={styles.progressWrap} accessibilityLabel={`Etapa ${current} de ${total}`}>
            <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={colors.border}
                    strokeWidth={stroke}
                    fill="none"
                />
                <AnimatedCircle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={colors.primary}
                    strokeWidth={stroke}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${circumference} ${circumference}`}
                    animatedProps={animatedProps}
                    rotation="-90"
                    origin={`${size / 2}, ${size / 2}`}
                />
            </Svg>
            <Text style={styles.progressText}>
                {current}/{total}
            </Text>
        </View>
    );
}

function CleanSelect({
    value,
    options,
    onChange,
}: {
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const selected = options.find((option) => option.id === value) ?? options[0];
    return (
        <View>
            <Pressable
                style={({ pressed }) => [styles.selectTrigger, pressed && styles.pressed]}
                onPress={() => setOpen((current) => !current)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
            >
                <View style={styles.selectIcon}>
                    <Ionicons name={selected.icon} size={20} color={colors.primary} />
                </View>
                <View style={styles.selectCopy}>
                    <Text style={styles.selectLabel}>{selected.label}</Text>
                    <Text style={styles.selectDetail}>{selected.detail}</Text>
                </View>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
            </Pressable>
            {open ? (
                <View style={styles.selectMenu}>
                    {options.map((option) => {
                        const active = option.id === value;
                        return (
                            <Pressable
                                key={option.id}
                                style={[styles.selectOption, active && styles.selectOptionActive]}
                                onPress={() => {
                                    onChange(option.id);
                                    setOpen(false);
                                }}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: active }}
                            >
                                <Ionicons
                                    name={option.icon}
                                    size={19}
                                    color={active ? colors.primary : colors.textSecondary}
                                />
                                <View style={styles.selectCopy}>
                                    <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                                        {option.label}
                                    </Text>
                                    <Text style={styles.selectDetail}>{option.detail}</Text>
                                </View>
                                {active ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
                            </Pressable>
                        );
                    })}
                </View>
            ) : null}
        </View>
    );
}

const VERDICT_COPY: Record<
    PaceGoalFeasibility['verdict'],
    { title: string; body: string; icon: keyof typeof Ionicons.glyphMap }
> = {
    feasible: {
        title: 'Meta viável',
        body: 'Está dentro de uma progressão tranquila para este ciclo.',
        icon: 'checkmark-circle',
    },
    aggressive: {
        title: 'Agressiva, mas possível',
        body: 'Vai exigir consistência e boa recuperação ao longo do ciclo.',
        icon: 'flame',
    },
    unrealistic: {
        title: 'Meta muito além deste ciclo',
        body: 'Você pode mantê-la como norte ou escolher a alternativa segura.',
        icon: 'compass',
    },
};

function FeasibilityCoach({
    value,
    loading,
    targetWeeks,
    onUseAlternative,
}: {
    value: PaceGoalFeasibility | null;
    loading: boolean;
    targetWeeks: number;
    onUseAlternative: () => void;
}) {
    if (loading) {
        return (
            <View style={styles.coachLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.coachLoadingText}>Analisando sua meta…</Text>
            </View>
        );
    }
    if (!value) return <Text style={styles.coachHint}>Digite o tempo completo para ver a análise do coach.</Text>;
    const copy = VERDICT_COPY[value.verdict];
    const meterPosition = value.verdict === 'feasible' ? '18%' : value.verdict === 'aggressive' ? '52%' : '84%';
    return (
        <View style={styles.coachCard}>
            <View style={styles.coachTitleRow}>
                <Ionicons name={copy.icon} size={20} color={colors.textLight} />
                <Text style={styles.coachTitle}>{copy.title}</Text>
            </View>
            <View
                style={styles.meterWrap}
                accessible
                accessibilityLabel={`${copy.title}. Diferença de ${value.vdotGap.toFixed(1)} no VDOT.`}
            >
                <LinearGradient
                    colors={[colors.success, colors.warning, colors.error]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.meter}
                />
                <View style={[styles.meterPointer, { left: meterPosition }]}>
                    <Ionicons name="caret-down" size={18} color={colors.textLight} />
                </View>
            </View>
            <Text style={styles.coachBody}>{copy.body}</Text>
            <Text style={styles.coachEvidence}>
                Seu alvo pede {value.vdotGap >= 0 ? '+' : ''}
                {value.vdotGap.toFixed(1)} no VDOT em {targetWeeks} semanas.
            </Text>
            {value.alternativeTimeFormatted ? (
                <Pressable style={styles.alternativeButton} onPress={onUseAlternative} accessibilityRole="button">
                    <View>
                        <Text style={styles.alternativeEyebrow}>ALTERNATIVA VIÁVEL</Text>
                        <Text style={styles.alternativeTime}>{value.alternativeTimeFormatted}</Text>
                    </View>
                    <Text style={styles.alternativeAction}>Usar este alvo</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

function OverviewRow({
    icon,
    label,
    value,
    last,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string;
    last?: boolean;
}) {
    return (
        <View style={styles.timelineRow}>
            <View style={styles.timelineRail}>
                <View style={styles.timelineDot}>
                    <Ionicons name={icon} size={15} color={colors.primary} />
                </View>
                {!last ? <View style={styles.timelineLine} /> : null}
            </View>
            <View style={styles.timelineCopy}>
                <Text style={styles.timelineLabel}>{label}</Text>
                <Text style={styles.timelineValue}>{value}</Text>
            </View>
        </View>
    );
}

export function CustomizeGoalScreen() {
    const navigation = useNavigation<
        NativeStackNavigationProp<RootStackParamList, 'CustomizeGoal'>
    >();
    const route = useRoute<RouteProp<RootStackParamList, 'CustomizeGoal'>>();
    const {
        retrospectiveId,
        goalKind = 'distance',
        manual = false,
    } = route.params;
    const [distanceGoal, setDistanceGoal] = useState('5k');
    const [durationWeeks, setDurationWeeks] = useState(12);
    const [frequency, setFrequency] = useState(3);
    const [selectedDays, setSelectedDays] = useState<number[]>([]);
    const [targetTime, setTargetTime] = useState<TimeValue>({
        hours: 0,
        minutes: 0,
        seconds: 0,
    });
    const [timeKey, setTimeKey] = useState(0);
    const [feasibility, setFeasibility] = useState<PaceGoalFeasibility | null>(null);
    const [checking, setChecking] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [step, setStep] = useState(0);
    const [reduceMotion, setReduceMotion] = useState(false);

    const steps = useMemo(
        () =>
            goalKind === 'pace'
                ? ['distance', 'duration', 'time', 'days', 'overview']
                : ['distance', 'duration', 'days', 'overview'],
        [goalKind],
    );
    const current = steps[step];

    useEffect(() => {
        AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
        const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
        return () => sub.remove();
    }, []);

    useEffect(() => {
        if (goalKind !== 'pace' || secondsFromTime(targetTime) < 300) {
            setFeasibility(null);
            return;
        }
        const timer = setTimeout(async () => {
            setChecking(true);
            try {
                const result = await retrospectiveGoalService.assessPaceGoal(retrospectiveId, {
                    distance_goal: distanceGoal,
                    time_goal: formatTime(targetTime),
                    duration_weeks: durationWeeks,
                });
                setFeasibility(result);
            } catch {
                setFeasibility(null);
            } finally {
                setChecking(false);
            }
        }, 450);
        return () => clearTimeout(timer);
    }, [distanceGoal, durationWeeks, goalKind, retrospectiveId, targetTime]);

    const canContinue =
        current === 'time'
            ? secondsFromTime(targetTime) >= 300 && feasibility !== null && !checking
            : current === 'days'
              ? selectedDays.length === frequency
              : true;

    const goBack = useCallback(() => {
        if (step === 0) navigation.goBack();
        else setStep((value) => value - 1);
    }, [navigation, step]);

    const submit = useCallback(async () => {
        if (selectedDays.length !== frequency) return;
        setSubmitting(true);
        try {
            await retrospectiveGoalService.customize(retrospectiveId, {
                goal_kind: goalKind,
                distance_goal: distanceGoal,
                time_goal: goalKind === 'pace' ? formatTime(targetTime) : undefined,
                duration_weeks: durationWeeks,
                training_days: selectedDays.map((day) => DAY_LABELS[day]),
            });
            // RootStack registers the tab navigator under `Main`; `MainTabs`
            // is only its component function/id and is not a navigable route.
            navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        } catch (error) {
            Alert.alert('Não foi possível gerar o plano', error instanceof Error ? error.message : 'Tente novamente.');
        } finally {
            setSubmitting(false);
        }
    }, [distanceGoal, durationWeeks, frequency, goalKind, navigation, retrospectiveId, selectedDays, targetTime]);

    const next = () => {
        if (!canContinue) return;
        if (step === steps.length - 1) void submit();
        else setStep((value) => value + 1);
    };

    const useAlternative = () => {
        if (!feasibility?.alternativeTimeSeconds) return;
        setTargetTime(timeFromSeconds(feasibility.alternativeTimeSeconds));
        setTimeKey((value) => value + 1);
    };

    const selectedDistance = DISTANCES.find((item) => item.id === distanceGoal)!;
    const selectedDuration = DURATIONS.find((item) => item.id === String(durationWeeks))!;
    const entrance = reduceMotion ? FadeIn.duration(120) : FadeIn.duration(220);

    return (
        <ScreenContainer centered>
            <View style={styles.header}>
                <Pressable
                    style={styles.iconButton}
                    onPress={goBack}
                    accessibilityRole="button"
                    accessibilityLabel="Voltar"
                >
                    <Ionicons name="chevron-back" size={24} color={colors.textLight} />
                </Pressable>
                <View style={styles.headerCopy}>
                    <Text style={styles.eyebrow}>
                        {manual ? 'CONFIGURAÇÃO MANUAL' : goalKind === 'pace' ? 'META DE TEMPO' : 'META DE DISTÂNCIA'}
                    </Text>
                    <Text style={styles.headerTitle}>Seu próximo ciclo</Text>
                </View>
                <CircleProgress current={step + 1} total={steps.length} reduceMotion={reduceMotion} />
            </View>

            <Animated.View key={`${current}-${step}`} entering={entrance} style={styles.stepShell}>
                {current === 'distance' ? (
                    <ScrollView contentContainerStyle={styles.stepContent}>
                        <QuizHeader
                            title={
                                <>
                                    Qual <Hl>distância</Hl> guia este ciclo?
                                </>
                            }
                            subtitle="Ela define a estrutura do plano. Você poderá mudar de meta em um novo ciclo."
                        />
                        <CleanSelect value={distanceGoal} options={DISTANCES} onChange={setDistanceGoal} />
                    </ScrollView>
                ) : null}

                {current === 'duration' ? (
                    <ScrollView contentContainerStyle={styles.stepContent}>
                        <QuizHeader
                            title={
                                <>
                                    Quanto tempo para <Hl>construir</Hl>?
                                </>
                            }
                            subtitle="Mais semanas permitem absorver a carga com mais calma."
                        />
                        <CleanSelect
                            value={String(durationWeeks)}
                            options={DURATIONS}
                            onChange={(value) => setDurationWeeks(Number(value))}
                        />
                    </ScrollView>
                ) : null}

                {current === 'time' ? (
                    <ScrollView
                        style={styles.timeStep}
                        contentContainerStyle={styles.timeStepContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentInsetAdjustmentBehavior="never"
                        overScrollMode="never"
                    >
                        <DistanceTimeScreen
                            key={timeKey}
                            mode="target"
                            recentDistance={distanceKm(distanceGoal)}
                            value={targetTime}
                            onChange={setTargetTime}
                            coaching={
                                <FeasibilityCoach
                                    value={feasibility}
                                    loading={checking}
                                    targetWeeks={durationWeeks}
                                    onUseAlternative={useAlternative}
                                />
                            }
                        />
                    </ScrollView>
                ) : null}

                {current === 'days' ? (
                    <ScrollView contentContainerStyle={styles.stepContent}>
                        <QuizHeader
                            title={
                                <>
                                    Quantos dias cabem na sua <Hl>semana</Hl>?
                                </>
                            }
                            subtitle="Escolha a frequência primeiro e depois os dias reais."
                        />
                        <View style={styles.frequencyRow}>
                            {[2, 3, 4, 5, 6].map((item) => (
                                <Pressable
                                    key={item}
                                    style={[styles.frequencyButton, frequency === item && styles.frequencyButtonActive]}
                                    onPress={() => {
                                        setFrequency(item);
                                        setSelectedDays([]);
                                    }}
                                    accessibilityRole="radio"
                                    accessibilityState={{ checked: frequency === item }}
                                >
                                    <Text
                                        style={[
                                            styles.frequencyValue,
                                            frequency === item && styles.frequencyValueActive,
                                        ]}
                                    >
                                        {item}
                                    </Text>
                                    <Text style={styles.frequencyUnit}>dias</Text>
                                </Pressable>
                            ))}
                        </View>
                        <View style={styles.daysReuse}>
                            <AvailableDaysScreen value={selectedDays} maxDays={frequency} onChange={setSelectedDays} />
                        </View>
                    </ScrollView>
                ) : null}

                {current === 'overview' ? (
                    <ScrollView contentContainerStyle={styles.stepContent}>
                        <QuizHeader
                            title={
                                <>
                                    Tudo pronto para <Hl>começar</Hl>.
                                </>
                            }
                            subtitle="Confira o ciclo. Um plano novo será criado; o anterior não será editado."
                        />
                        <View style={styles.overviewCard}>
                            <OverviewRow
                                icon="flag-outline"
                                label="Objetivo"
                                value={
                                    goalKind === 'pace'
                                        ? `${selectedDistance.label} em ${formatTime(targetTime)}`
                                        : selectedDistance.label
                                }
                            />
                            <OverviewRow icon="calendar-outline" label="Duração" value={selectedDuration.label} />
                            <OverviewRow
                                icon="repeat-outline"
                                label="Rotina"
                                value={`${frequency}x por semana · ${selectedDays.map((day) => DAY_LABELS[day]).join(', ')}`}
                            />
                            {goalKind === 'pace' && feasibility ? (
                                <OverviewRow
                                    icon="pulse-outline"
                                    label="Leitura do coach"
                                    value={VERDICT_COPY[feasibility.verdict].title}
                                    last
                                />
                            ) : (
                                <OverviewRow
                                    icon="shield-checkmark-outline"
                                    label="Progressão"
                                    value="Paces ancorados na sua aptidão atual"
                                    last
                                />
                            )}
                        </View>
                    </ScrollView>
                ) : null}
            </Animated.View>

            <View style={styles.footer}>
                {step > 0 ? (
                    <Pressable style={styles.backTextButton} onPress={goBack}>
                        <Text style={styles.backText}>Voltar</Text>
                    </Pressable>
                ) : (
                    <View />
                )}
                <Pressable
                    style={[styles.nextButton, !canContinue && styles.nextButtonDisabled]}
                    onPress={next}
                    disabled={!canContinue || submitting}
                    accessibilityRole="button"
                >
                    {submitting ? (
                        <ActivityIndicator color={colors.background} />
                    ) : (
                        <>
                            <Text style={styles.nextText}>
                                {step === steps.length - 1 ? 'Gerar meu plano' : 'Continuar'}
                            </Text>
                            <Ionicons
                                name={step === steps.length - 1 ? 'sparkles' : 'arrow-forward'}
                                size={18}
                                color={colors.background}
                            />
                        </>
                    )}
                </Pressable>
            </View>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    header: {
        minHeight: 82,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.base,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    iconButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 22,
        backgroundColor: colors.glassLight,
    },
    headerCopy: { flex: 1, marginLeft: 12 },
    eyebrow: {
        fontFamily: fonts.bold,
        fontSize: 10,
        letterSpacing: 1.2,
        color: colors.primary,
    },
    headerTitle: {
        marginTop: 3,
        fontFamily: fonts.semibold,
        fontSize: 17,
        color: colors.textLight,
    },
    progressWrap: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressText: {
        fontFamily: fonts.bold,
        fontSize: 11,
        color: colors.textLight,
        fontVariant: ['tabular-nums'],
    },
    stepShell: { flex: 1 },
    stepContent: {
        flexGrow: 1,
        paddingHorizontal: spacing.xl,
        paddingTop: spacing.xl,
        paddingBottom: 120,
    },
    timeStep: {
        flex: 1,
    },
    timeStepContent: {
        flexGrow: 1,
        paddingHorizontal: spacing.xl,
        paddingTop: spacing.base,
        paddingBottom: spacing['2xl'],
    },
    selectTrigger: {
        minHeight: 76,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        borderRadius: 22,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 12,
    },
    selectIcon: {
        width: 42,
        height: 42,
        borderRadius: 14,
        backgroundColor: 'rgba(0,212,255,0.10)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectCopy: { flex: 1 },
    selectLabel: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: colors.textLight,
    },
    selectDetail: {
        marginTop: 2,
        fontFamily: fonts.regular,
        fontSize: 12,
        color: colors.textSecondary,
    },
    selectMenu: {
        marginTop: 10,
        padding: 6,
        borderRadius: 22,
        backgroundColor: colors.cardDark,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 4,
    },
    selectOption: {
        minHeight: 62,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        paddingHorizontal: 14,
        gap: 12,
    },
    selectOptionActive: { backgroundColor: 'rgba(0,212,255,0.09)' },
    optionLabel: {
        fontFamily: fonts.semibold,
        fontSize: 15,
        color: colors.textLight,
    },
    optionLabelActive: { color: colors.primary },
    pressed: { opacity: 0.72 },
    coachLoading: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    coachLoadingText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: colors.textSecondary,
    },
    coachHint: {
        textAlign: 'center',
        fontFamily: fonts.regular,
        fontSize: 13,
        lineHeight: 19,
        color: colors.textSecondary,
    },
    coachCard: {
        padding: spacing.base,
        borderRadius: borderRadius['2xl'],
        backgroundColor: colors.glassLight,
        borderWidth: 1,
        borderColor: colors.border,
    },
    coachTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    coachTitle: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22, color: colors.textLight },
    meterWrap: { height: 28, marginTop: spacing.md, justifyContent: 'flex-end' },
    meter: { height: 8, borderRadius: 999 },
    meterPointer: { position: 'absolute', top: 0, marginLeft: -9 },
    coachBody: {
        marginTop: spacing.md,
        fontFamily: fonts.regular,
        fontSize: 14,
        lineHeight: 20,
        color: colors.textSecondary,
    },
    coachEvidence: {
        marginTop: spacing.sm,
        fontFamily: fonts.semibold,
        fontSize: 13,
        lineHeight: 20,
        color: colors.textLight,
    },
    alternativeButton: {
        marginTop: spacing.base,
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md,
        borderRadius: borderRadius.xl,
        backgroundColor: 'rgba(16,185,129,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.32)',
    },
    alternativeEyebrow: {
        fontFamily: fonts.bold,
        fontSize: 9,
        letterSpacing: 0.8,
        color: colors.success,
    },
    alternativeTime: {
        marginTop: 1,
        fontFamily: fonts.bold,
        fontSize: 18,
        color: colors.textLight,
        fontVariant: ['tabular-nums'],
    },
    alternativeAction: {
        fontFamily: fonts.semibold,
        fontSize: 12,
        color: colors.success,
    },
    frequencyRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    frequencyButton: {
        flex: 1,
        minHeight: 60,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
    },
    frequencyButtonActive: {
        borderColor: colors.primary,
        backgroundColor: 'rgba(0,212,255,0.10)',
    },
    frequencyValue: {
        fontFamily: fonts.bold,
        fontSize: 19,
        color: colors.textSecondary,
    },
    frequencyValueActive: { color: colors.primary },
    frequencyUnit: {
        fontFamily: fonts.regular,
        fontSize: 9,
        color: colors.textMuted,
    },
    daysReuse: { marginTop: 2 },
    overviewCard: {
        padding: 18,
        borderRadius: 24,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
    },
    timelineRow: { minHeight: 70, flexDirection: 'row' },
    timelineRail: { width: 42, alignItems: 'center' },
    timelineDot: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,212,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(0,212,255,0.25)',
    },
    timelineLine: { flex: 1, width: 1, backgroundColor: colors.border },
    timelineCopy: { flex: 1, paddingLeft: 10, paddingBottom: 20 },
    timelineLabel: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: colors.textSecondary,
    },
    timelineValue: {
        marginTop: 3,
        fontFamily: fonts.bold,
        fontSize: 15,
        lineHeight: 21,
        color: colors.textLight,
    },
    footer: {
        minHeight: 82,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.base,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
        backgroundColor: colors.background,
    },
    backTextButton: {
        minWidth: 72,
        minHeight: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backText: {
        fontFamily: fonts.semibold,
        fontSize: 14,
        color: colors.textSecondary,
    },
    nextButton: {
        minWidth: 156,
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 22,
        borderRadius: 26,
        backgroundColor: colors.primary,
    },
    nextButtonDisabled: { opacity: 0.35 },
    nextText: { fontFamily: fonts.bold, fontSize: 15, color: colors.background },
});
