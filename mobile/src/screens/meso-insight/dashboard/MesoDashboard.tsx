import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography, fonts, createThemeStyles, useThemeSubscription } from '../../../theme';
import { useEnterAnimation } from '../../weekly-insight/hooks/useEnterAnimation';
import { CoachCallout } from '../../weekly-insight/components/CoachCallout';
import { SectionHeader } from '../../weekly-insight/components/SectionHeader';
import { ZonesRadar } from '../../weekly-insight/components/ZonesRadar';
import { CountUp } from '../../weekly-insight/components/CountUp';
import { formatKm, formatPercent, formatPace } from '../../weekly-insight/format';
import { DiffuseHeaderSurface } from '../../../components/ui/DiffuseHeaderSurface';
import { MesoVolumeArc } from './MesoVolumeArc';
import type { MesoInsight } from '../../../types/mesoInsight.types';
import type { MesoStoryModel } from '../hooks/useMesoStory';
import type { NextBlock } from '../hooks/useNextBlock';

/**
 * PARTE 2 — o painel do bloco, no idioma da `WeeklyInsightScreen`.
 *
 * Mesma gramática visual da 2B: um herói no topo, seções com identidade
 * (`SectionHeader`), cards com moldura própria, e tudo revelado em onda pelo
 * `useEnterAnimation`. O que muda é a ESCALA do que se mede — quatro semanas em
 * vez de uma — e, por consequência, o que ganha o posto de herói.
 *
 * ── A ORDEM DE LEITURA ───────────────────────────────────────────────────────
 *
 * Os índices são a coreografia: a seção `n` entra `n × 45ms` depois da
 * primeira. Trocá-los muda a ordem em que a tela se revela, não só a posição.
 *
 * ── SÓ NÚMERO MEDIDO ─────────────────────────────────────────────────────────
 *
 * Todo valor exibido sai da linha de `plan_meso_insights`. Nada é recalculado
 * aqui — nem "média por semana", nem projeção. É a lição da Fase 3 aplicada à
 * apresentação: a tela não sabe nada que o backend não mediu.
 */

const IDX = {
    coach: 0,
    hero: 1,
    arc: 2,
    volume: 3,
    radar: 4,
    quality: 5,
    next: 6,
} as const;

const DASHBOARD_HEADER_HEIGHT = 52;

interface MesoDashboardProps {
    insight: MesoInsight;
    model: MesoStoryModel;
    next: NextBlock;
    /** `false` enquanto o painel ainda está fora da tela — segura o stagger. */
    active: boolean;
    onBack: () => void;
}

export const MesoDashboard = memo(function MesoDashboard({
    insight,
    model,
    next,
    active,
    onBack,
}: MesoDashboardProps) {
    useThemeSubscription();
    const insets = useSafeAreaInsets();
    const headerInset = insets.top + DASHBOARD_HEADER_HEIGHT;

    return (
        <View style={styles.root}>
            <DiffuseHeaderSurface style={styles.header}>
                <View style={[styles.headerInner, { paddingTop: insets.top }]}>
                    <Pressable
                        onPress={onBack}
                        hitSlop={12}
                        style={styles.backBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Voltar ao resumo"
                        accessibilityHint="Volta para os cards do capítulo"
                    >
                        <Ionicons name="chevron-up" size={22} color={colors.textLight} />
                    </Pressable>
                    <View style={styles.headerText}>
                        <Text style={styles.headerTitle}>
                            Bloco {model.blockIndex} · {model.phaseLabel}
                        </Text>
                        <Text style={styles.headerSub}>
                            Semanas {model.weekStart} a {model.weekEnd}
                        </Text>
                    </View>
                </View>
            </DiffuseHeaderSurface>

            <ScrollView
                contentContainerStyle={[
                    styles.scroll,
                    {
                        paddingTop: headerInset + spacing.lg,
                        paddingBottom: insets.bottom + spacing['2xl'],
                    },
                ]}
                showsVerticalScrollIndicator={false}
                contentInsetAdjustmentBehavior="never"
                scrollIndicatorInsets={{ top: headerInset, bottom: insets.bottom }}
            >
                {!!insight.ai_narrative && (
                    <CoachCallout
                        narrative={insight.ai_narrative}
                        index={IDX.coach}
                        enabled={active}
                    />
                )}

                <MesoHero model={model} active={active} />

                <Section index={IDX.arc} active={active}>
                    <SectionHeader
                        eyebrow="Trajetória"
                        title="A escalada do bloco"
                        note="km por semana"
                    />
                    <ArcSection trend={model.trend} active={active} />
                </Section>

                <Section index={IDX.volume} active={active}>
                    <SectionHeader
                        eyebrow="Aderência"
                        title="Prescrito × executado"
                        note={`${formatKm(insight.planned_distance_km)} km previstos`}
                    />
                    <View style={styles.statRow}>
                        <Stat
                            value={formatKm(insight.completed_distance_km)}
                            unit="km"
                            label="do plano"
                            accent
                        />
                        <View style={styles.statDivider} />
                        <Stat
                            value={String(model.completedWorkouts)}
                            unit={`/${model.plannedWorkouts}`}
                            label="treinos"
                        />
                        <View style={styles.statDivider} />
                        <Stat
                            value={formatPercent(insight.completion_rate)}
                            label="conclusão"
                        />
                    </View>
                </Section>

                {/* SEM `SectionHeader` aqui: o `ZonesRadar` renderiza o
                    proprio ("Intensidade / Distribuicao de zonas"). Ate agora
                    havia dois cabecalhos empilhados, e o de cima parecia uma
                    secao vazia logo acima do radar. Quem tem o header e o
                    componente, porque ele tambem muda o texto no caso sem zona
                    prescrita. */}
                {!!insight.zone_distribution && (
                    <ZonesRadar
                        prescribed={insight.zone_distribution.prescribed}
                        executed={insight.zone_distribution.executed}
                        index={IDX.radar}
                        enabled={active}
                    />
                )}

                <Section index={IDX.quality} active={active}>
                    <SectionHeader
                        eyebrow="Qualidade"
                        title="Os tiros do bloco"
                        note={model.qualityCount > 0 ? `${model.qualityCount} medidos` : undefined}
                    />
                    <QualityList insight={insight} />
                </Section>

                <Section index={IDX.next} active={active}>
                    <NextChapter next={next} />
                </Section>
            </ScrollView>
        </View>
    );
});

// ── Herói ────────────────────────────────────────────────────────────────────

/**
 * O marco do bloco. VDOT quando o nível se moveu — é a notícia maior que o app
 * tem para dar —, senão a escalada de volume, que é o que de fato aconteceu na
 * imensa maioria dos blocos.
 */
const MesoHero = memo(function MesoHero({
    model,
    active,
}: {
    model: MesoStoryModel;
    active: boolean;
}) {
    useThemeSubscription();
    const progress = useEnterAnimation(IDX.hero, active);
    const style = useAnimatedStyle(() => ({
        opacity: progress.value,
        transform: [{ translateY: (1 - progress.value) * 12 }],
    }));

    const vdot = model.climax === 'vdot' && model.vdotAfter != null;

    return (
        <Animated.View style={[styles.hero, style]}>
            <Text style={styles.heroEyebrow}>
                {vdot ? 'SEU NÍVEL EVOLUIU' : model.hasClimb ? 'VOCÊ SUBIU' : 'VOCÊ CORREU'}
            </Text>

            <View style={styles.heroRow}>
                {vdot ? (
                    <>
                        <Text style={styles.heroFrom}>{Math.round(model.vdotBefore ?? 0)}</Text>
                        <Ionicons
                            name="arrow-forward"
                            size={26}
                            color={colors.textMuted}
                            style={styles.heroArrow}
                        />
                        <CountUp
                            value={model.vdotAfter ?? 0}
                            index={IDX.hero}
                            style={styles.heroValue}
                        />
                    </>
                ) : model.hasClimb ? (
                    <>
                        <Text style={styles.heroValue}>+</Text>
                        <CountUp
                            value={model.climbPercent}
                            index={IDX.hero}
                            style={styles.heroValue}
                        />
                        <Text style={styles.heroUnit}>%</Text>
                    </>
                ) : (
                    <>
                        <CountUp
                            value={model.completedKm}
                            decimals={1}
                            index={IDX.hero}
                            style={styles.heroValue}
                        />
                        <Text style={styles.heroUnit}>km</Text>
                    </>
                )}
            </View>

            <Text style={styles.heroCaption}>
                {/* "do seu plano" desde a Fase 6.4 — ver MesoStoryCards. */}
                {vdot
                    ? 'Os ritmos do seu plano já foram ajustados'
                    : model.hasClimb
                        ? `de volume até o pico — de ${formatKm(model.baseKm)} a ${formatKm(model.peakKm)} km por semana`
                        : 'nas quatro semanas deste bloco'}
            </Text>
        </Animated.View>
    );
});

// ── Seção com stagger ────────────────────────────────────────────────────────

const Section = memo(function Section({
    index,
    active,
    children,
}: {
    index: number;
    active: boolean;
    children: React.ReactNode;
}) {
    useThemeSubscription();
    const progress = useEnterAnimation(index, active);
    const style = useAnimatedStyle(() => ({
        opacity: progress.value,
        transform: [{ translateY: (1 - progress.value) * 14 }],
    }));

    return <Animated.View style={[styles.section, style]}>{children}</Animated.View>;
});

/** O arco precisa do `progress` cru para as barras crescerem em sequência. */
const ArcSection = memo(function ArcSection({
    trend,
    active,
}: {
    trend: MesoStoryModel['trend'];
    active: boolean;
}) {
    useThemeSubscription();
    const progress = useEnterAnimation(IDX.arc, active);
    return <MesoVolumeArc trend={trend} progress={progress} />;
});

// ── Blocos menores ───────────────────────────────────────────────────────────

const Stat = memo(function Stat({
    value,
    unit,
    label,
    accent,
}: {
    value: string;
    unit?: string;
    label: string;
    accent?: boolean;
}) {
    useThemeSubscription();
    return (
        <View style={styles.stat}>
            <View style={styles.statValueRow}>
                <Text style={[styles.statValue, accent && styles.statAccent]}>{value}</Text>
                {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
            </View>
            <Text style={styles.statLabel}>{label}</Text>
        </View>
    );
});

/**
 * Os tiros medidos por GPS, com o alvo da zona ao lado — a mesma medição que
 * decide o VDOT. Quando não há nenhum, o bloco DIZ isso: silêncio aqui faria a
 * seção parecer quebrada, quando na verdade um bloco de base não tem tiros.
 */
const QualityList = memo(function QualityList({ insight }: { insight: MesoInsight }) {
    useThemeSubscription();
    const efforts = insight.quality_efforts ?? [];

    if (efforts.length === 0) {
        return (
            <View style={styles.emptyCard}>
                <MaterialCommunityIcons
                    name="run"
                    size={18}
                    color={colors.textSecondary}
                />
                <Text style={styles.emptyText}>
                    Bloco de volume aeróbico — sem treino de qualidade medido nestas
                    quatro semanas.
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.qualityCard}>
            {efforts.map((e, i) => {
                const noAlvo = e.deltaSeconds === 0;
                const rapido = e.deltaSeconds < 0;
                return (
                    <View
                        key={e.workoutId}
                        style={[styles.qualityRow, i > 0 && styles.qualityRowBorder]}
                    >
                        <View style={styles.qualityLeft}>
                            <Text style={styles.qualityZone}>{e.zones.join('/')}</Text>
                            <Text style={styles.qualityDate}>{e.dateStr}</Text>
                        </View>
                        <View style={styles.qualityRight}>
                            <Text style={styles.qualityPace}>
                                {formatPace(e.paceSecPerKm)}/km
                            </Text>
                            <Text
                                style={[
                                    styles.qualityDelta,
                                    noAlvo && styles.qualityOnTarget,
                                ]}
                            >
                                {noAlvo
                                    ? 'no alvo'
                                    : `${rapido ? '−' : '+'}${Math.abs(e.deltaSeconds)}s do alvo`}
                            </Text>
                        </View>
                    </View>
                );
            })}
        </View>
    );
});

const NextChapter = memo(function NextChapter({ next }: { next: NextBlock }) {
    useThemeSubscription();
    return (
        <View style={styles.nextCard}>
            <MaterialCommunityIcons
                name="arrow-top-right-thick"
                size={22}
                color={colors.primary}
            />
            <View style={styles.nextText}>
                <Text style={styles.nextTitle}>
                    {next.phaseLabel
                        ? `Vem o ${next.phaseLabel}`
                        : 'Próximo capítulo'}
                </Text>
                <Text style={styles.nextBody}>
                    {next.phaseLabel
                        ? next.isFinal
                            ? `Semanas ${next.weekStart} a ${next.weekEnd} — a reta final do plano.`
                            : `Bloco ${next.blockIndex} · semanas ${next.weekStart} a ${next.weekEnd}.`
                        : 'Suas próximas quatro semanas de treino.'}
                </Text>
            </View>
        </View>
    );
});

const styles = createThemeStyles(() => ({
    root: { flex: 1, backgroundColor: colors.background },

    header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3, borderWidth: 0 },
    headerInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.base,
        paddingBottom: spacing.sm,
    },
    backBtn: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerText: { flex: 1 },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.lg,
        color: colors.text,
    },
    headerSub: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },

    scroll: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing['2xl'],
        gap: spacing.lg,
    },
    section: { gap: spacing.sm },

    hero: { alignItems: 'center', gap: 4, paddingVertical: spacing.base },
    heroEyebrow: {
        fontFamily: fonts.semibold,
        fontSize: 12,
        letterSpacing: 1.4,
        color: colors.textMuted,
    },
    heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
    heroValue: {
        fontFamily: fonts.extrabold,
        fontSize: 56,
        lineHeight: 62,
        color: colors.primary,
        letterSpacing: -1,
    },
    heroFrom: {
        fontFamily: fonts.bold,
        fontSize: 34,
        lineHeight: 56,
        color: colors.textMuted,
    },
    heroArrow: { marginBottom: 12, marginHorizontal: 4 },
    heroUnit: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xl,
        color: colors.textSecondary,
        paddingBottom: 10,
    },
    heroCaption: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.sm,
        lineHeight: 20,
        color: colors.textSecondary,
        textAlign: 'center',
        paddingHorizontal: spacing.base,
    },

    statRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: spacing.base,
    },
    stat: { flex: 1, alignItems: 'center', gap: 2 },
    statValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
    statValue: {
        fontFamily: fonts.extrabold,
        fontSize: 24,
        lineHeight: 28,
        color: colors.text,
    },
    statAccent: { color: colors.primary },
    statUnit: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        paddingBottom: 3,
    },
    statLabel: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
    },
    statDivider: {
        width: StyleSheet.hairlineWidth,
        alignSelf: 'stretch',
        backgroundColor: colors.border,
        marginVertical: spacing.xs,
    },

    qualityCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: spacing.base,
    },
    qualityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.sm + 2,
    },
    qualityRowBorder: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    qualityLeft: { gap: 2 },
    qualityZone: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.sm,
        color: colors.textLight,
    },
    qualityDate: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
    },
    qualityRight: { alignItems: 'flex-end', gap: 2 },
    qualityPace: {
        fontFamily: fonts.extrabold,
        fontSize: typography.fontSizes.md,
        color: colors.text,
    },
    qualityDelta: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    qualityOnTarget: { color: colors.success },

    emptyCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.glassLight,
        borderRadius: borderRadius.lg,
        padding: spacing.base,
    },
    emptyText: {
        flex: 1,
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.sm,
        lineHeight: 19,
        color: colors.textSecondary,
    },

    nextCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.base,
        backgroundColor: 'rgba(0, 212, 255, 0.10)',
        borderRadius: borderRadius.xl,
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.22)',
        padding: spacing.base,
    },
    nextText: { flex: 1, gap: 2 },
    nextTitle: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.lg,
        color: colors.text,
    },
    nextBody: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.sm,
        lineHeight: 19,
        color: colors.textSecondary,
    },
}));
