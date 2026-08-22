import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Alert,
    ActivityIndicator,
    useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    FadeIn,
    FadeInLeft,
    FadeInRight,
    FadeOut,
    ReduceMotion,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fonts } from '../../../theme';
import { semanticColors } from '../../../theme/semanticColors';
import { StoryProgressBar } from '../../retrospective/StoryProgressBar';
import { AnimatedStoryBackground } from '../../retrospective/AnimatedStoryBackground';
import { gradientForCard } from '../../retrospective/storyTheme';
import { openSystemShareSheet } from '../../sharing/utils/shareHandlers';
import { GlassSurface } from '../../../components/ui/GlassSurface';
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
const BACKGROUND_IN = FadeIn.duration(420).reduceMotion(ReduceMotion.System);
const BACKGROUND_OUT = FadeOut.duration(320).reduceMotion(ReduceMotion.System);

interface MesoStoryDeckProps {
    model: MesoStoryModel;
    next: NextBlock;
    onClose: () => void;
    /** Abre a Parte 2 — a transição vive na tela, não aqui. */
    onOpenDetails: () => void;
    /** Suspende o fundo quando o dashboard cobre os stories. */
    active: boolean;
}

export const MesoStoryDeck = memo(function MesoStoryDeck({
    model,
    next,
    onClose,
    onOpenDetails,
    active,
}: MesoStoryDeckProps) {
    const insets = useSafeAreaInsets();
    const isFocused = useIsFocused();
    const { height } = useWindowDimensions();
    const [index, setIndex] = useState(0);
    const [direction, setDirection] = useState<1 | -1>(1);
    const [sharing, setSharing] = useState(false);
    const cardRef = useRef<View>(null);

    // Espelho do índice para os callbacks do gesto, que não se recriam a cada
    // render — mesmo padrão do RetrospectiveScreen.
    const indexRef = useRef(0);
    useEffect(() => {
        indexRef.current = index;
    }, [index]);

    const goTo = useCallback((nextIndex: number) => {
        const current = indexRef.current;
        const clamped = Math.max(0, Math.min(TOTAL_CARDS - 1, nextIndex));
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
    const compact = height < 720;

    return (
        <View style={styles.root}>
            <GestureDetector gesture={swipe}>
                <Animated.View style={[styles.stage, cardAnimStyle]}>
                    {/* A captura inclui a composição fullscreen, mas exclui o
                        chrome de navegação que flutua por cima. */}
                    <View ref={cardRef} collapsable={false} style={styles.captureArea}>
                        <Animated.View
                            key={`meso-background-${index}`}
                            entering={BACKGROUND_IN}
                            exiting={BACKGROUND_OUT}
                            collapsable={false}
                            style={StyleSheet.absoluteFill}
                        >
                            <AnimatedStoryBackground
                                gradient={gradient}
                                active={active && isFocused}
                            />
                        </Animated.View>
                        <Animated.View
                            key={`meso-story-${index}`}
                            entering={storyEntering}
                            style={[
                                styles.storyContent,
                                {
                                    paddingTop: insets.top + (compact ? 76 : 92),
                                    paddingBottom: Math.max(
                                        insets.bottom + 96,
                                        compact ? 104 : 120,
                                    ),
                                },
                            ]}
                        >
                            <CardFor index={index} model={model} next={next} />
                        </Animated.View>
                    </View>

                    {/* Zonas de toque: metade esquerda volta, direita avança.
                        Não cobrem o rodapé, senão engoliriam o botão de detalhes. */}
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

            {/* Mesmo chrome flutuante da retrospectiva: o conteúdo segue
                fullscreen e a navegação não rouba altura do story. */}
            <View style={[styles.chrome, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
                <StoryProgressBar
                    total={TOTAL_CARDS}
                    current={index}
                    accent={gradient.accent}
                />
                <View style={styles.header}>
                    <View>
                        <Text style={styles.brand}>Resumo do bloco</Text>
                        <Text style={styles.counter}>{index + 1} de {TOTAL_CARDS}</Text>
                    </View>
                    <View style={styles.headerActions}>
                        <Pressable
                            onPress={shareCard}
                            hitSlop={8}
                            style={styles.headerBtn}
                            disabled={sharing}
                            accessibilityRole="button"
                            accessibilityLabel="Compartilhar este resumo do bloco"
                            accessibilityState={{ busy: sharing }}
                        >
                            {sharing ? (
                                <ActivityIndicator size="small" color={colors.textLight} />
                            ) : (
                                <Ionicons name="share-outline" size={20} color={colors.textLight} />
                            )}
                        </Pressable>
                        <Pressable
                            onPress={onClose}
                            hitSlop={8}
                            style={styles.headerBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Fechar resumo do bloco"
                        >
                            <Ionicons name="close" size={24} color={colors.textLight} />
                        </Pressable>
                    </View>
                </View>
            </View>

            {/* O único material glass da view: um controle, não um card de
                conteúdo. O rótulo permanece completo para leitor de tela. */}
            <Pressable
                onPress={onOpenDetails}
                style={({ pressed }) => [
                    styles.detailsWrap,
                    { bottom: Math.max(spacing.xl, insets.bottom + spacing.base) },
                    pressed && styles.detailsPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Ver detalhes do bloco"
                accessibilityHint="Abre o painel completo com os números das quatro semanas"
            >
                <GlassSurface
                    radius={26}
                    intensity={32}
                    bordered={false}
                    veilColor="rgba(21, 21, 42, 0.28)"
                    style={styles.detailsGlass}
                >
                    <Ionicons name="arrow-down" size={20} color={colors.textLight} />
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

    stage: { flex: 1 },
    captureArea: { flex: 1, overflow: 'hidden' },
    storyContent: {
        flex: 1,
        width: '100%',
        maxWidth: 560,
        alignSelf: 'center',
        paddingHorizontal: spacing.xl,
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
        paddingHorizontal: spacing.base,
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
        gap: spacing.xs,
    },
    headerBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: semanticColors.overlaySoft,
    },

    tapZone: { position: 'absolute', top: 104, bottom: 112, width: '30%' },
    tapLeft: { left: 0 },
    tapRight: { right: 0 },

    detailsWrap: {
        position: 'absolute',
        alignSelf: 'center',
        zIndex: 6,
        width: 52,
        height: 52,
    },
    detailsPressed: {
        opacity: 0.78,
        transform: [{ scale: 0.96 }],
    },
    detailsGlass: {
        width: 52,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.proGlassBorder,
    },
});
