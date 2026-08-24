import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
    Easing,
    interpolate,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withDelay,
    withTiming,
    type SharedValue,
} from 'react-native-reanimated';
import { colors, useThemeSubscription, createThemeStyles } from '../../../theme';
import { storyType } from '../../retrospective/storyTheme';
import { CountUp } from '../../weekly-insight/components/CountUp';
import { formatKm } from '../../weekly-insight/format';
import type { MesoStoryModel } from '../hooks/useMesoStory';
import type { NextBlock } from '../hooks/useNextBlock';
import type { VolumeTrendPoint } from '../../../types/mesoInsight.types';
import { semanticColors } from "../../../theme/semanticColors";

/**
 * OS 5 CARDS DO CAPÍTULO.
 *
 * Regras herdadas dos stories da retrospectiva, e vale a pena repetir por quê:
 *  • UM número por card — cada card entrega uma ideia, grande e legível.
 *  • O número vem PRONTO do backend; nada aqui recalcula.
 *  • Comparação só contra o próprio corredor. Nunca contra outros.
 *
 * ── O REGISTRO É OUTRO ───────────────────────────────────────────────────────
 *
 * A retrospectiva é "final de temporada" e percorre os 7 gradientes, com âmbar
 * no clímax. Este é o "capítulo do meio": usa só o subconjunto FRIO da paleta
 * (ciano → ciano-profundo → azul → índigo) e guarda o âmbar para quando o nível
 * de fato mudou. Mesmo sistema de cor, temperatura menor — é o que impede o
 * resumo mensal de competir com o fim de ciclo.
 *
 * ── SEM VIDRO AQUI ───────────────────────────────────────────────────────────
 *
 * Estes cards vão para `captureRef`, e `BlurView` costuma sair transparente na
 * captura do Android. Um card compartilhado com um buraco no lugar do vidro é
 * pior que um card sem vidro. Profundidade aqui vem do gradiente.
 */

/** Índices em `STORY_GRADIENTS` — o arco frio, com âmbar só no clímax real. */
export const MESO_GRADIENT_INDEX = {
    opening: 0, // ciano da marca
    climb: 1, // ciano profundo
    consistency: 2, // azul
    climaxVdot: 5, // âmbar — o único tom quente, só quando o nível mudou
    climaxQuality: 3, // índigo
    next: 6, // volta ao ciano: o arco fecha onde começou
} as const;

// ── Peças comuns ─────────────────────────────────────────────────────────────

const Eyebrow = memo(function Eyebrow({ children }: { children: string }) {
    useThemeSubscription();
    return <Text style={storyType.eyebrow}>{children.toUpperCase()}</Text>;
});

/**
 * O número-herói. `animate` liga a contagem — só o card EM FOCO conta, senão
 * cinco decks animam fora de tela e o gesto some no meio do trabalho.
 */
const Hero = memo(function Hero({
    value,
    unit,
    decimals = 0,
    prefix,
    climax = false,
    animate,
}: {
    value: number;
    unit?: string;
    decimals?: number;
    prefix?: string;
    climax?: boolean;
    animate: boolean;
}) {
    useThemeSubscription();
    const style = climax ? storyType.heroClimax : storyType.hero;

    return (
        <View style={styles.heroRow}>
            {prefix ? <Text style={[style, styles.prefix]}>{prefix}</Text> : null}
            {animate ? (
                <CountUp value={value} decimals={decimals} style={style} duration={1100} />
            ) : (
                // `allowFontScaling={false}`: o card tem tamanho FIXO para a
                // captura sair igual em qualquer aparelho; deixar a fonte do
                // sistema crescer quebraria o layout da imagem compartilhada.
                <Text style={style} allowFontScaling={false}>
                    {value.toFixed(decimals).replace('.', ',')}
                </Text>
            )}
            {unit ? <Text style={[storyType.unit, styles.unit]}>{unit}</Text> : null}
        </View>
    );
});

// ── Card 1 — Abertura ────────────────────────────────────────────────────────

export const MesoCardOpening = memo(function MesoCardOpening({
    model,
}: {
    model: MesoStoryModel;
}) {
    useThemeSubscription();
    return (
        <View style={styles.center}>
            <MaterialCommunityIcons
                name="flag-checkered"
                size={40}
                color={semanticColors.textSecondary}
            />
            <Text style={[storyType.title, styles.openingTitle]}>
                Bloco {model.blockIndex}{'\n'}fechado
            </Text>
            <Text style={[storyType.body, styles.centerText]}>
                {capitalize(model.phaseLabel)} · semanas {model.weekStart} a{' '}
                {model.weekEnd}
            </Text>
        </View>
    );
});

// ── Card 2 — A escalada ──────────────────────────────────────────────────────

/**
 * A subida é medida até o PICO do bloco, nunca até a última semana — a 4ª é o
 * deload, e o motor de volume corta 25% dela de propósito. Ver `computeClimb`.
 *
 * Sem subida a celebrar, o card troca de assunto em vez de inventar uma: mostra
 * o volume total, que é verdade em qualquer cenário.
 */
export const MesoCardClimb = memo(function MesoCardClimb({
    model,
    animate,
}: {
    model: MesoStoryModel;
    animate: boolean;
}) {
    useThemeSubscription();
    return (
        <View style={styles.center}>
            {model.hasClimb ? (
                <>
                    <Eyebrow>Você subiu</Eyebrow>
                    <Hero
                        value={model.climbPercent}
                        prefix="+"
                        unit="%"
                        animate={animate}
                    />
                    <Text style={[storyType.body, styles.centerText]}>
                        de volume até o pico do bloco — de {formatKm(model.baseKm)} a{' '}
                        {formatKm(model.peakKm)} km por semana
                    </Text>
                </>
            ) : (
                <>
                    <Eyebrow>Você correu</Eyebrow>
                    <Hero
                        value={model.completedKm}
                        decimals={1}
                        unit="km"
                        animate={animate}
                    />
                    <Text style={[storyType.body, styles.centerText]}>
                        nestas quatro semanas de treino
                    </Text>
                </>
            )}

            <ClimbBars trend={model.trend} animate={animate} />
        </View>
    );
});

/**
 * As 4 semanas como barras. É o desenho que o insight semanal não tem como
 * fazer — ele só enxerga uma —, e a queda final é o deload aparecendo como
 * recuperação planejada, não como fracasso.
 */
const ClimbBars = memo(function ClimbBars({
    trend,
    animate,
}: {
    trend: VolumeTrendPoint[];
    animate: boolean;
}) {
    useThemeSubscription();
    if (trend.length === 0) return null;

    const max = Math.max(1, ...trend.map((p) => Math.max(p.plannedKm, p.completedKm)));

    return (
        <View style={styles.bars}>
            {trend.map((p, i) => (
                <View key={p.weekNumber} style={styles.barCol}>
                    <GrowBar
                        heightRatio={p.completedKm / max}
                        delay={i * 90}
                        animate={animate}
                    />
                    <Text style={storyType.caption}>S{p.weekNumber}</Text>
                </View>
            ))}
        </View>
    );
});

const BAR_MAX_H = 96;

/** Uma barra que cresce da base. Sem `useEnterAnimation`: o gatilho aqui é
 *  entrar em FOCO no deck, não montar a tela. */
const GrowBar = memo(function GrowBar({
    heightRatio,
    delay,
    animate,
}: {
    heightRatio: number;
    delay: number;
    animate: boolean;
}) {
    useThemeSubscription();
    const target = Math.max(3, Math.round(heightRatio * BAR_MAX_H));
    const progress = useStoryGrow(animate, delay);

    const style = useAnimatedStyle(() => ({
        height: interpolate(progress.value, [0, 1], [3, target]),
    }));

    return (
        <View style={styles.barTrack}>
            <Animated.View style={[styles.barFill, style]} />
        </View>
    );
});

// ── Card 3 — Consistência ────────────────────────────────────────────────────

export const MesoCardConsistency = memo(function MesoCardConsistency({
    model,
    animate,
}: {
    model: MesoStoryModel;
    animate: boolean;
}) {
    useThemeSubscription();
    return (
        <View style={styles.center}>
            <Eyebrow>Você concluiu</Eyebrow>
            <View style={styles.fractionRow}>
                <Hero value={model.completedWorkouts} animate={animate} />
                <Text style={[storyType.unit, styles.fractionOf]}>
                    de {model.plannedWorkouts}
                </Text>
            </View>
            <Text style={[storyType.body, styles.centerText]}>
                {model.perfect
                    ? 'treinos do bloco. Sem falhar um.'
                    : 'treinos do bloco'}
            </Text>
        </View>
    );
});

// ── Card 4 — O clímax ────────────────────────────────────────────────────────

/**
 * Duas versões e uma ausência.
 *
 * `vdot` é o clímax de verdade — e é raro: a cadência real permite ~1 movimento
 * por plano, e ele cai no bloco final, que não gera insight. O caso comum é
 * `quality`, e ele NÃO é consolo: "seus tiros vieram no alvo" é informação
 * verdadeira e útil. Sem nenhum dos dois (bloco de base pura), o card fecha o
 * assunto sem número inventado.
 */
export const MesoCardClimax = memo(function MesoCardClimax({
    model,
    animate,
}: {
    model: MesoStoryModel;
    animate: boolean;
}) {
    useThemeSubscription();
    if (model.climax === 'vdot' && model.vdotAfter != null) {
        const subiu = (model.vdotAfter ?? 0) >= (model.vdotBefore ?? 0);
        return (
            <View style={styles.center}>
                <Eyebrow>{subiu ? 'Você ficou mais rápido' : 'Ajustamos seu ritmo'}</Eyebrow>
                <Hero
                    value={model.vdotAfter}
                    decimals={0}
                    climax
                    animate={animate}
                />
                <Text style={[storyType.body, styles.centerText]}>
                    Seu nível estimado saiu de {fmtVdot(model.vdotBefore)} e os ritmos
                    dos próximos treinos já acompanharam
                </Text>
            </View>
        );
    }

    if (model.climax === 'quality') {
        const todosNoAlvo = model.qualityOnTarget === model.qualityCount;
        return (
            <View style={styles.center}>
                <Eyebrow>Seus tiros</Eyebrow>
                <View style={styles.fractionRow}>
                    <Hero value={model.qualityOnTarget} animate={animate} />
                    <Text style={[storyType.unit, styles.fractionOf]}>
                        de {model.qualityCount}
                    </Text>
                </View>
                <Text style={[storyType.body, styles.centerText]}>
                    {todosNoAlvo
                        ? 'vieram dentro do ritmo alvo. Execução no ponto.'
                        : 'treinos de qualidade vieram dentro do ritmo alvo'}
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.center}>
            <MaterialCommunityIcons
                name="run"
                size={40}
                color={semanticColors.textSecondary}
            />
            <Text style={[storyType.title, styles.centerText]}>
                Quatro semanas{'\n'}de base
            </Text>
            <Text style={[storyType.body, styles.centerText]}>
                Bloco de volume aeróbico — a fundação que sustenta a intensidade
                que vem depois
            </Text>
        </View>
    );
});

// ── Card 5 — O gancho ────────────────────────────────────────────────────────

export const MesoCardNext = memo(function MesoCardNext({
    next,
}: {
    next: NextBlock;
}) {
    useThemeSubscription();
    return (
        <View style={styles.center}>
            <MaterialCommunityIcons
                name="arrow-top-right-thick"
                size={40}
                color={colors.primary}
            />
            {next.phaseLabel ? (
                <>
                    <Text style={[storyType.title, styles.centerText]}>
                        Vem o{'\n'}
                        {capitalize(next.phaseLabel)}
                    </Text>
                    <Text style={[storyType.body, styles.centerText]}>
                        {next.isFinal
                            ? `Semanas ${next.weekStart} a ${next.weekEnd} — a reta final do seu plano. Você está pronto.`
                            : `Bloco ${next.blockIndex} · semanas ${next.weekStart} a ${next.weekEnd}. Você está pronto.`}
                    </Text>
                </>
            ) : (
                // `planOverview` não carregado (entrada direta pelo push). O
                // gancho existe sem citar uma fase que não foi lida.
                <>
                    <Text style={[storyType.title, styles.centerText]}>
                        Próximo{'\n'}capítulo
                    </Text>
                    <Text style={[storyType.body, styles.centerText]}>
                        Quatro semanas fechadas. Você está pronto para as próximas.
                    </Text>
                </>
            )}
        </View>
    );
});

// ── Utilidades ───────────────────────────────────────────────────────────────

/**
 * Crescimento disparado por FOCO no deck, não por mount da tela.
 *
 * `useEnterAnimation` (do dashboard) anima uma vez, ao montar. Aqui os cinco
 * cards existem desde o começo e só um está visível: o gatilho tem que ser
 * "entrei em foco", e voltar a 0 ao sair para a animação existir de novo se o
 * usuário retroceder.
 */
function useStoryGrow(animate: boolean, delay: number): SharedValue<number> {
    const reduced = useReducedMotion();
    const progress = useSharedValue(0);

    React.useEffect(() => {
        if (!animate) {
            progress.value = 0;
            return;
        }
        if (reduced) {
            progress.value = 1;
            return;
        }
        progress.value = withDelay(
            delay,
            withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }),
        );
    }, [animate, delay, reduced, progress]);

    return progress;
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtVdot(v: number | null): string {
    if (v == null) return '—';
    return String(Math.round(v));
}

const styles = createThemeStyles(() => ({
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    centerText: { textAlign: 'center' },
    openingTitle: { textAlign: 'center', fontSize: 34, lineHeight: 40 },

    heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
    prefix: { opacity: 0.9 },
    unit: { paddingBottom: 12 },

    fractionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
    fractionOf: { paddingBottom: 14 },

    bars: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 14,
        marginTop: 24,
        height: BAR_MAX_H + 24,
    },
    barCol: { alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
    barTrack: {
        width: 26,
        height: BAR_MAX_H,
        justifyContent: 'flex-end',
    },
    barFill: {
        width: '100%',
        borderRadius: 6,
        backgroundColor: semanticColors.textPrimary,
    },
}));
