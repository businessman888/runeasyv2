import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, useWindowDimensions, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    FadeIn,
    FadeInLeft,
    FadeInRight,
    FadeOut,
    ReduceMotion,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    runOnJS,
} from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';

import { ScreenContainer } from '../components/ScreenContainer';
import { BASE_API_URL } from '../config/api.config';
import { authedFetch } from '../services/apiClient';
import * as Storage from '../utils/storage';
import { colors, fonts } from '../theme';
import { semanticColors } from '../theme/semanticColors';
import { openSystemShareSheet } from './sharing/utils/shareHandlers';

import { gradientForCard, CLIMAX_CARD_INDEX, storyType } from './retrospective/storyTheme';
import { StoryProgressBar } from './retrospective/StoryProgressBar';
import {
    CardOpening,
    CardVolume,
    CardConsistency,
    CardPace,
    CardFun,
    CardClimax,
    CardNextGoal,
    type NextGoalOption,
} from './retrospective/StoryCards';
import { AnimatedStoryBackground } from './retrospective/AnimatedStoryBackground';
import { ShareSummaryCard } from './retrospective/ShareSummaryCard';
import type { RetrospectiveData } from './retrospective/types';
import { retrospectiveGoalService } from '../services/retrospectiveGoalService';
import type { RootStackParamList } from '../navigation/navigationRef';

/**
 * Retrospectiva de fim de ciclo em formato STORIES (Fase 1B).
 *
 * ── NAVEGAÇÃO ─────────────────────────────────────────────────────────────────
 *
 * Padrão do Instagram, de propósito: barra segmentada no topo, toque na metade
 * direita avança, na esquerda volta, swipe horizontal também. Reinventar a
 * navegação de stories seria custo de aprendizado sem ganho — o usuário já sabe
 * operar isto.
 *
 * NÃO há autoplay por tempo. Os cards têm números para ler e comparar; um timer
 * empurraria o usuário para fora do card antes de ele terminar.
 *
 * ── OS NÚMEROS ────────────────────────────────────────────────────────────────
 *
 * Nada é calculado aqui. Todos os valores vêm prontos da retrospectiva (Fase
 * 1A/1B), inclusive os dois escopos que não se misturam — aderência ao plano e
 * total corrido. Ver `retrospective/types.ts`.
 */

const TOTAL_CARDS = 7;
const BACKGROUND_IN = FadeIn.duration(420).reduceMotion(ReduceMotion.System);
const BACKGROUND_OUT = FadeOut.duration(320).reduceMotion(ReduceMotion.System);

export function RetrospectiveScreen() {
    const navigation = useNavigation<
        NativeStackNavigationProp<RootStackParamList, 'Retrospective'>
    >();
    const isFocused = useIsFocused();
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<RetrospectiveData | null>(null);
    const [index, setIndex] = useState(0);
    const [direction, setDirection] = useState<1 | -1>(1);
    const [sharing, setSharing] = useState(false);
    const [goalAction, setGoalAction] = useState<'coach' | null>(null);

    // Ref do card VISÍVEL — o share por card captura exatamente o que está na tela.
    const cardRef = useRef<View>(null);
    // Ref do compilado, renderizado fora do viewport e capturado sob demanda.
    const summaryRef = useRef<View>(null);

    useEffect(() => {
        void loadRetrospective();
    }, []);

    const loadRetrospective = async () => {
        try {
            const userId = await Storage.getItemAsync('user_id');
            if (!userId) return;

            const response = await authedFetch(`${BASE_API_URL}/training/retrospective/latest`, {
                headers: { 'x-user-id': userId },
            });
            const result = await response.json();
            if (result.hasRetrospective) setData(result.retrospective);
        } catch (error) {
            console.error('Failed to load retrospective:', error);
        } finally {
            setLoading(false);
        }
    };

    // ── Navegação ─────────────────────────────────────────────────────────────

    // Espelho do índice para os callbacks do gesto, que não re-criam a cada render.
    const indexRef = useRef(0);
    useEffect(() => {
        indexRef.current = index;
    }, [index]);

    const goTo = useCallback((next: number) => {
        const current = indexRef.current;
        const clamped = Math.max(0, Math.min(TOTAL_CARDS - 1, next));
        if (clamped === current) return;
        setDirection(clamped > current ? 1 : -1);
        setIndex(clamped);
    }, []);

    const advance = useCallback(() => goTo(indexRef.current + 1), [goTo]);
    const rewind = useCallback(() => goTo(indexRef.current - 1), [goTo]);

    const translateX = useSharedValue(0);

    const swipe = Gesture.Pan()
        .activeOffsetX([-20, 20])
        .onUpdate((e) => {
            translateX.value = e.translationX * 0.35; // resistência
        })
        .onEnd((e) => {
            if (e.translationX < -60) runOnJS(advance)();
            else if (e.translationX > 60) runOnJS(rewind)();
            translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        });

    const cardAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const storyEntering = React.useMemo(
        () =>
            (direction > 0 ? FadeInRight : FadeInLeft)
                .springify()
                .damping(20)
                .stiffness(190)
                .reduceMotion(ReduceMotion.System),
        [direction],
    );

    // ── Compartilhar ──────────────────────────────────────────────────────────

    const shareView = useCallback(
        async (ref: React.RefObject<View | null>, label: string) => {
            if (!ref.current || sharing) return;
            setSharing(true);
            try {
                const uri = await captureRef(ref, {
                    format: 'png',
                    quality: 1,
                    result: 'tmpfile',
                });
                await openSystemShareSheet(uri);
            } catch {
                Alert.alert('Erro', `Não deu para gerar a imagem ${label}.`);
            } finally {
                setSharing(false);
            }
        },
        [sharing],
    );

    const shareCurrentCard = useCallback(() => shareView(cardRef, 'deste card'), [shareView]);
    const shareSummary = useCallback(() => shareView(summaryRef, 'do resumo'), [shareView]);

    // ── Próxima meta ──────────────────────────────────────────────────────────
    //
    // Lista de opções, não um botão fixo. A Fase 5 acrescenta a meta de
    // pace/tempo empurrando outro item aqui — o card não presume "meta =
    // distância" em lugar nenhum.
    const acceptCoachPlan = useCallback(async () => {
        if (!data || goalAction) return;
        setGoalAction('coach');
        try {
            await retrospectiveGoalService.acceptSuggestion(data.id);
            // `MainTabs` is the component function/id; the RootStack route is
            // registered as `Main`. Reset to the registered route so Home owns
            // the generation overlay and polling after this screen unmounts.
            navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        } catch (error) {
            Alert.alert(
                'Não foi possível gerar o plano',
                error instanceof Error ? error.message : 'Tente novamente em instantes.',
            );
        } finally {
            setGoalAction(null);
        }
    }, [data, goalAction, navigation]);

    const nextGoalOptions: NextGoalOption[] = React.useMemo(() => {
        if (!data) return [];
        const openWizard = (goalKind: 'distance' | 'pace', manual = false) =>
            navigation.navigate('CustomizeGoal', {
                retrospectiveId: data.id,
                goalKind,
                manual,
            });
        return [
            {
                kind: 'coach',
                label: 'Aceitar o plano do coach',
                description: 'Um toque e o próximo ciclo começa a ser criado',
                onPress: acceptCoachPlan,
                loading: goalAction === 'coach',
                disabled: goalAction !== null,
            },
            {
                kind: 'distance',
                label: 'Meta de distância',
                description: 'Escolha a distância do próximo ciclo',
                onPress: () => openWizard('distance'),
                disabled: goalAction !== null,
            },
            {
                kind: 'pace',
                label: 'Meta de tempo',
                description: 'Defina seu tempo-alvo com análise de viabilidade',
                onPress: () => openWizard('pace'),
                disabled: goalAction !== null,
            },
            {
                kind: 'manual',
                label: 'Ajustar manualmente',
                description: 'Configurar os detalhes do ciclo',
                onPress: () => openWizard('distance', true),
                disabled: goalAction !== null,
            },
        ];
    }, [acceptCoachPlan, data, goalAction, navigation]);

    // ── Estados ───────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <ScreenContainer>
                <View style={styles.stateContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </ScreenContainer>
        );
    }

    if (!data) {
        return (
            <ScreenContainer>
                <View style={styles.stateContainer}>
                    <Ionicons name="documents-outline" size={44} color={colors.textMuted} />
                    <Text style={styles.emptyTitle}>Nenhuma retrospectiva ainda</Text>
                    <Text style={styles.emptyBody}>Ela fica pronta quando você concluir um ciclo de treino.</Text>
                    <Pressable
                        onPress={() => navigation.goBack()}
                        style={styles.emptyBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Voltar"
                    >
                        <Text style={styles.emptyBtnText}>Voltar</Text>
                    </Pressable>
                </View>
            </ScreenContainer>
        );
    }

    const gradient = gradientForCard(index);
    const isLastCard = index === TOTAL_CARDS - 1;
    const compact = height < 720;

    return (
        <View style={styles.root}>
            <GestureDetector gesture={swipe}>
                <Animated.View style={[styles.stage, cardAnimStyle]}>
                    {/* Captura a composição fullscreen sem o chrome de navegação. */}
                    <View ref={cardRef} collapsable={false} style={styles.captureArea}>
                        <Animated.View
                            key={`retrospective-background-${index}`}
                            entering={BACKGROUND_IN}
                            exiting={BACKGROUND_OUT}
                            collapsable={false}
                            style={StyleSheet.absoluteFill}
                        >
                            <AnimatedStoryBackground gradient={gradient} active={isFocused} />
                        </Animated.View>
                        <Animated.View
                            key={`retrospective-story-${index}`}
                            entering={storyEntering}
                            style={[
                                styles.storyContent,
                                {
                                    paddingTop: insets.top + (compact ? 76 : 92),
                                    paddingBottom: Math.max(insets.bottom + 24, compact ? 32 : 48),
                                },
                            ]}
                        >
                            {renderCard(index, data, nextGoalOptions, compact)}
                        </Animated.View>
                    </View>

                    {/* No CTA final as zonas laterais somem: nenhum overlay pode
                        interceptar os botões de criação de plano. */}
                    {!isLastCard && (
                        <>
                            <Pressable
                                style={[styles.tapZone, styles.tapLeft]}
                                onPress={rewind}
                                accessibilityRole="button"
                                accessibilityLabel="Card anterior"
                            />
                            <Pressable
                                style={[styles.tapZone, styles.tapRight]}
                                onPress={advance}
                                accessibilityRole="button"
                                accessibilityLabel="Próximo card"
                            />
                        </>
                    )}
                </Animated.View>
            </GestureDetector>

            {/* Chrome flutua sobre o story; não rouba altura do conteúdo. */}
            <View style={[styles.chrome, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
                <StoryProgressBar total={TOTAL_CARDS} current={index} accent={gradient.accent} />
                <View style={styles.header}>
                    <View>
                        <Text style={styles.brand}>Retrospectiva</Text>
                        <Text style={styles.counter}>{index + 1} de {TOTAL_CARDS}</Text>
                    </View>
                    <View style={styles.headerActions}>
                        <Pressable
                            onPress={isLastCard ? shareSummary : shareCurrentCard}
                            hitSlop={8}
                            style={styles.headerBtn}
                            disabled={sharing}
                            accessibilityRole="button"
                            accessibilityLabel={
                                isLastCard ? 'Compartilhar resumo do ciclo' : 'Compartilhar este card'
                            }
                            accessibilityState={{ busy: sharing }}
                        >
                            {sharing ? (
                                <ActivityIndicator size="small" color={colors.textLight} />
                            ) : (
                                <Ionicons name="share-outline" size={20} color={colors.textLight} />
                            )}
                        </Pressable>
                        <Pressable
                            onPress={() => navigation.goBack()}
                            hitSlop={8}
                            style={styles.headerBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Fechar retrospectiva"
                        >
                            <Ionicons name="close" size={24} color={colors.textLight} />
                        </Pressable>
                    </View>
                </View>
            </View>

            {/* Fora do viewport: existe só para ser capturado. */}
            <View style={styles.offscreen} pointerEvents="none">
                <ShareSummaryCard ref={summaryRef} data={data} />
            </View>
        </View>
    );
}

function renderCard(
    index: number,
    data: RetrospectiveData,
    nextGoalOptions: NextGoalOption[],
    compact: boolean,
) {
    switch (index) {
        case 0:
            return <CardOpening data={data} />;
        case 1:
            return <CardVolume data={data} />;
        case 2:
            return <CardConsistency data={data} />;
        case 3:
            return <CardPace data={data} />;
        case 4:
            return <CardFun data={data} />;
        case CLIMAX_CARD_INDEX:
            return <CardClimax data={data} />;
        default:
            return <CardNextGoal data={data} options={nextGoalOptions} compact={compact} />;
    }
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: colors.background,
    },
    chrome: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 5,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 10,
    },
    brand: {
        fontFamily: fonts.semibold,
        fontSize: 15,
        color: colors.textLight,
    },
    counter: {
        marginTop: 2,
        fontFamily: fonts.medium,
        fontSize: 11,
        color: 'rgba(235,235,245,0.58)',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    headerBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: semanticColors.overlaySoft,
    },
    stage: {
        flex: 1,
    },
    captureArea: {
        flex: 1,
        overflow: 'hidden',
    },
    storyContent: {
        flex: 1,
        width: '100%',
        maxWidth: 560,
        alignSelf: 'center',
        paddingHorizontal: 24,
    },
    tapZone: {
        position: 'absolute',
        top: 104,
        bottom: 32,
        width: '30%',
    },
    tapLeft: { left: 0 },
    tapRight: { right: 0 },
    offscreen: {
        position: 'absolute',
        left: -9999,
        top: -9999,
        opacity: 0,
    },
    stateContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 32,
    },
    emptyTitle: {
        ...storyType.title,
        fontSize: 20,
        textAlign: 'center',
    },
    emptyBody: {
        ...storyType.body,
        fontSize: 15,
        textAlign: 'center',
    },
    emptyBtn: {
        marginTop: 16,
        minHeight: 48,
        justifyContent: 'center',
        paddingHorizontal: 32,
        borderRadius: 24,
        backgroundColor: colors.primary,
    },
    emptyBtnText: {
        fontFamily: fonts.bold,
        fontSize: 15,
        color: colors.background,
    },
});
