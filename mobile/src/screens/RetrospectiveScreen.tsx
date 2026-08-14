import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, useWindowDimensions, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';

import { ScreenContainer } from '../components/ScreenContainer';
import { BASE_API_URL } from '../config/api.config';
import { authedFetch } from '../services/apiClient';
import * as Storage from '../utils/storage';
import { colors, fonts } from '../theme';
import { openSystemShareSheet } from './sharing/utils/shareHandlers';

import { gradientForCard, CLIMAX_CARD_INDEX, storyType } from './retrospective/storyTheme';
import { StoryProgressBar } from './retrospective/StoryProgressBar';
import {
    StoryCardShell,
    CardOpening,
    CardVolume,
    CardConsistency,
    CardPace,
    CardFun,
    CardClimax,
    CardNextGoal,
    type NextGoalOption,
} from './retrospective/StoryCards';
import { ShareSummaryCard } from './retrospective/ShareSummaryCard';
import type { RetrospectiveData } from './retrospective/types';
import { retrospectiveGoalService } from '../services/retrospectiveGoalService';

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

export function RetrospectiveScreen() {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<RetrospectiveData | null>(null);
    const [index, setIndex] = useState(0);
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

    const goTo = useCallback((next: number) => {
        setIndex((prev) => {
            const clamped = Math.max(0, Math.min(TOTAL_CARDS - 1, next));
            return clamped === prev ? prev : clamped;
        });
    }, []);

    const advance = useCallback(() => goTo(indexRef.current + 1), [goTo]);
    const rewind = useCallback(() => goTo(indexRef.current - 1), [goTo]);

    // Espelho do índice para os callbacks do gesto, que não re-criam a cada render.
    const indexRef = useRef(0);
    useEffect(() => {
        indexRef.current = index;
    }, [index]);

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
            (navigation as any).reset({ index: 0, routes: [{ name: 'MainTabs' }] });
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
            (navigation as any).navigate('CustomizeGoal', {
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

    return (
        <ScreenContainer>
            <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
                <StoryProgressBar total={TOTAL_CARDS} current={index} accent={gradient.accent} />

                <View style={styles.header}>
                    <Text style={styles.brand}>Retrospectiva</Text>
                    <Pressable
                        onPress={() => navigation.goBack()}
                        hitSlop={12}
                        style={styles.closeBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Fechar retrospectiva"
                    >
                        <Ionicons name="close" size={24} color={colors.textLight} />
                    </Pressable>
                </View>

                <GestureDetector gesture={swipe}>
                    <Animated.View style={[styles.stage, cardAnimStyle]}>
                        {/* A ref de captura envolve só o card — o share sai sem a
                            barra de progresso nem o header. */}
                        <View ref={cardRef} collapsable={false} style={styles.captureArea}>
                            <StoryCardShell gradient={gradient} onShare={shareCurrentCard}>
                                {renderCard(index, data, nextGoalOptions)}
                            </StoryCardShell>
                        </View>

                        {/* Zonas de toque: metade esquerda volta, direita avança.
                            Ficam ABAIXO do botão de share na ordem de render, então
                            não engolem o toque dele. */}
                        <Pressable
                            style={[styles.tapZone, { left: 0, width: width * 0.3 }]}
                            onPress={rewind}
                            accessibilityRole="button"
                            accessibilityLabel="Card anterior"
                        />
                        <Pressable
                            style={[styles.tapZone, { right: 0, width: width * 0.3 }]}
                            onPress={advance}
                            accessibilityRole="button"
                            accessibilityLabel="Próximo card"
                        />
                    </Animated.View>
                </GestureDetector>

                {/* O compartilhamento do compilado só faz sentido no fim do arco. */}
                {isLastCard && (
                    <Pressable
                        onPress={shareSummary}
                        style={styles.summaryShareBtn}
                        disabled={sharing}
                        accessibilityRole="button"
                        accessibilityLabel="Compartilhar resumo do ciclo"
                        accessibilityState={{ busy: sharing }}
                    >
                        <Ionicons name="share-outline" size={18} color={colors.textLight} />
                        <Text style={styles.summaryShareText}>Compartilhar resumo</Text>
                    </Pressable>
                )}
            </View>

            {/* Fora do viewport: existe só para ser capturado. */}
            <View style={styles.offscreen} pointerEvents="none">
                <ShareSummaryCard ref={summaryRef} data={data} />
            </View>
        </ScreenContainer>
    );
}

function renderCard(index: number, data: RetrospectiveData, nextGoalOptions: NextGoalOption[]) {
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
            return <CardNextGoal data={data} options={nextGoalOptions} />;
    }
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    brand: {
        fontFamily: fonts.semibold,
        fontSize: 15,
        color: 'rgba(235,235,245,0.65)',
    },
    closeBtn: {
        width: 44,
        height: 44,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    stage: {
        flex: 1,
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    captureArea: {
        flex: 1,
        borderRadius: 28,
        overflow: 'hidden',
    },
    tapZone: {
        position: 'absolute',
        top: 0,
        bottom: 80, // libera o canto do botão de share
    },
    summaryShareBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginHorizontal: 16,
        marginBottom: 16,
        minHeight: 48,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(235,235,245,0.18)',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    summaryShareText: {
        fontFamily: fonts.semibold,
        fontSize: 15,
        color: colors.textLight,
    },
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
