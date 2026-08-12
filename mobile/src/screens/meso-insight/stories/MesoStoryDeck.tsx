import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography, fonts } from '../../../theme';
import { StoryProgressBar } from '../../retrospective/StoryProgressBar';
import { StoryCardShell } from '../../retrospective/StoryCards';
import { gradientForCard } from '../../retrospective/storyTheme';
import { openSystemShareSheet } from '../../sharing/utils/shareHandlers';
import { GlassSurface } from '../../../components/ui/GlassSurface';
import { DiffuseHeaderSurface } from '../../../components/ui/DiffuseHeaderSurface';
import {
    MESO_GRADIENT_INDEX,
    MesoCardOpening,
    MesoCardClimb,
    MesoCardConsistency,
    MesoCardClimax,
    MesoCardNext,
} from './MesoStoryCards';
import type { MesoStoryModel } from '../hooks/useMesoStory';
import type { NextBlock } from '../hooks/useNextBlock';

/**
 * PARTE 1 — os stories do capítulo.
 *
 * Composição espelhada de `RetrospectiveScreen`: barra segmentada no topo, toque
 * nas laterais para avançar/voltar, swipe com resistência, e um botão de
 * compartilhar por card que captura a superfície visível.
 *
 * ── O QUE MUDA EM RELAÇÃO À RETROSPECTIVA ────────────────────────────────────
 *
 * São 5 cards em vez de 7, num arco de cor mais frio (ver `MesoStoryCards`), e
 * há um destino a mais: o botão flutuante que abre o dashboard. A retrospectiva
 * termina nos stories; aqui eles são a porta de entrada de uma tela dupla.
 *
 * ── SÓ O CARD EM FOCO ANIMA ──────────────────────────────────────────────────
 *
 * Os cinco existem desde o mount. Se todos animassem, quatro coreografias
 * rodariam fora da tela e a que importa chegaria no fim — o oposto do efeito.
 */

const TOTAL_CARDS = 5;
const STORY_HEADER_HEIGHT = 52;

interface MesoStoryDeckProps {
    model: MesoStoryModel;
    next: NextBlock;
    onClose: () => void;
    /** Abre a Parte 2 — a transição vive na tela, não aqui. */
    onOpenDetails: () => void;
}

export const MesoStoryDeck = memo(function MesoStoryDeck({
    model,
    next,
    onClose,
    onOpenDetails,
}: MesoStoryDeckProps) {
    const insets = useSafeAreaInsets();
    const [index, setIndex] = useState(0);
    const [sharing, setSharing] = useState(false);
    const cardRef = useRef<View>(null);

    // Espelho do índice para os callbacks do gesto, que não se recriam a cada
    // render — mesmo padrão do RetrospectiveScreen.
    const indexRef = useRef(0);
    useEffect(() => {
        indexRef.current = index;
    }, [index]);

    const goTo = useCallback((nextIndex: number) => {
        setIndex((prev) => {
            const clamped = Math.max(0, Math.min(TOTAL_CARDS - 1, nextIndex));
            return clamped === prev ? prev : clamped;
        });
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

    // ── Compartilhar ─────────────────────────────────────────────────────────
    //
    // Mesmo fluxo do RetrospectiveScreen: captura a superfície visível e entrega
    // ao share sheet do sistema. O card não tem vidro justamente para isso —
    // `BlurView` sai transparente na captura do Android.
    const shareCard = useCallback(async () => {
        if (!cardRef.current || sharing) return;
        setSharing(true);
        try {
            const uri = await captureRef(cardRef, {
                format: 'png',
                quality: 1,
                result: 'tmpfile',
            });
            await openSystemShareSheet(uri);
        } catch {
            Alert.alert('Erro', 'Não deu para gerar a imagem deste card.');
        } finally {
            setSharing(false);
        }
    }, [sharing]);

    const gradient = gradientForCard(gradientIndexFor(index, model.climax));

    return (
        <View style={styles.root}>
            {/* Superfície sólida desde o topo físico do aparelho. O fade abaixo
                separa navegação e conteúdo sem amostrar o card em movimento. */}
            <DiffuseHeaderSurface style={styles.topBar}>
                <View style={[styles.topBarInner, { paddingTop: insets.top }]}>
                    <StoryProgressBar
                        total={TOTAL_CARDS}
                        current={index}
                        accent={gradient.accent}
                    />
                    <Pressable
                        onPress={onClose}
                        hitSlop={12}
                        style={styles.closeBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Fechar"
                    >
                        <Ionicons name="close" size={22} color={colors.textLight} />
                    </Pressable>
                </View>
            </DiffuseHeaderSurface>

            <GestureDetector gesture={swipe}>
                <Animated.View
                    style={[
                        styles.cardWrap,
                        { paddingTop: insets.top + STORY_HEADER_HEIGHT + spacing.sm },
                        cardAnimStyle,
                    ]}
                >
                    {/* `collapsable={false}`: sem isso o Android pode achatar a
                        View e `captureRef` não encontra nada para capturar. */}
                    <View ref={cardRef} collapsable={false} style={styles.captureArea}>
                        <StoryCardShell gradient={gradient} onShare={shareCard}>
                            <CardFor index={index} model={model} next={next} />
                        </StoryCardShell>
                    </View>

                    {/* Zonas de toque: metade esquerda volta, direita avança.
                        Não cobrem o rodapé, senão engoliriam o botão de detalhes
                        e o de compartilhar. */}
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
                </Animated.View>
            </GestureDetector>

            {/* O botão flutuante — a porta para o dashboard. */}
            <Pressable
                onPress={onOpenDetails}
                style={[
                    styles.detailsWrap,
                    { bottom: Math.max(spacing.xl, insets.bottom + spacing.sm) },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Ver detalhes do bloco"
                accessibilityHint="Abre o painel completo com os números das quatro semanas"
            >
                <GlassSurface style={styles.detailsPill}>
                    <View style={styles.detailsInner}>
                        <Text style={styles.detailsText}>Ver detalhes</Text>
                        <Ionicons name="chevron-down" size={18} color={colors.textLight} />
                    </View>
                </GlassSurface>
            </Pressable>
        </View>
    );
});

/** O card do índice — o 4 troca de conteúdo conforme o clímax disponível. */
const CardFor = memo(function CardFor({
    index,
    model,
    next,
}: {
    index: number;
    model: MesoStoryModel;
    next: NextBlock;
}) {
    switch (index) {
        case 0:
            return <MesoCardOpening model={model} />;
        case 1:
            return <MesoCardClimb model={model} animate />;
        case 2:
            return <MesoCardConsistency model={model} animate />;
        case 3:
            return <MesoCardClimax model={model} animate />;
        default:
            return <MesoCardNext next={next} />;
    }
});

/** Índice de gradiente por card; o 4 fica âmbar só quando o nível mudou. */
function gradientIndexFor(index: number, climax: MesoStoryModel['climax']): number {
    switch (index) {
        case 0:
            return MESO_GRADIENT_INDEX.opening;
        case 1:
            return MESO_GRADIENT_INDEX.climb;
        case 2:
            return MESO_GRADIENT_INDEX.consistency;
        case 3:
            return climax === 'vdot'
                ? MESO_GRADIENT_INDEX.climaxVdot
                : MESO_GRADIENT_INDEX.climaxQuality;
        default:
            return MESO_GRADIENT_INDEX.next;
    }
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },

    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 3,
        borderWidth: 0,
    },
    topBarInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.base,
        paddingBottom: spacing.sm,
    },
    closeBtn: {
        width: 44, // alvo mínimo da HIG
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },

    cardWrap: { flex: 1, padding: spacing.base },
    captureArea: { flex: 1 },

    tapZone: { position: 'absolute', top: 0, bottom: 120, width: '35%' },
    tapLeft: { left: 0 },
    tapRight: { right: 0 },

    detailsWrap: {
        position: 'absolute',
        alignSelf: 'center',
        zIndex: 4,
    },
    detailsPill: { minHeight: 48 },
    detailsInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm + 2,
    },
    detailsText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: colors.textLight,
    },
});
