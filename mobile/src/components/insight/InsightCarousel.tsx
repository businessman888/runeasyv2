import React, { memo, useCallback, useState } from 'react';
import {
    View,
    StyleSheet,
    Modal,
    Pressable,
    ScrollView,
    useWindowDimensions,
    type NativeSyntheticEvent,
    type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, createThemeStyles, useThemeSubscription } from '../../theme';
import { WeeklyInsightCardBody } from './cards/WeeklyInsightCardBody';
import { MesoInsightCardBody } from './cards/MesoInsightCardBody';
import type { WeeklyInsight } from '../../types/weeklyInsight.types';
import type { MesoInsight } from '../../types/mesoInsight.types';
import { semanticColors } from "../../theme/semanticColors";

/**
 * CARROSSEL DE INSIGHTS — a folha de entrada quando há mais de um resumo novo.
 *
 * ── POR QUE LADO A LADO, E NÃO EMPILHADO POR PRIORIDADE ──────────────────────
 *
 * A cada 4 semanas, dois insights ficam prontos na mesma madrugada (o semanal e
 * o de bloco). Empilhá-los verticalmente faria o segundo virar rodapé do
 * primeiro; escolher só um faria o outro sumir. Lado a lado, cada um mantém o
 * próprio tamanho, e o gesto horizontal já é vocabulário conhecido de "tem mais
 * de um aqui".
 *
 * ── ORDEM: MAIOR ALTITUDE PRIMEIRO ───────────────────────────────────────────
 *
 * O bloco vem antes da semana. Ele é o mais raro (1 a cada 4) e o que contextualiza
 * o outro — ler "as últimas 4 semanas foram assim" e só depois "e a última delas
 * foi assim" é a ordem natural. O semanal continua a um deslize de distância,
 * com o CTA que leva à tela onde a AÇÃO dele vive.
 *
 * ── FOLHA, NÃO TELA ──────────────────────────────────────────────────────────
 *
 * Segue o padrão de bottom sheet do app (`RaceDetailSheet`, `ValueInputSheet`,
 * e o próprio insight semanal antes desta fase): `Modal transparent
 * animationType="slide"` + backdrop tocável. Não há lib de bottom sheet no
 * projeto, e introduzir uma para esta tela seria inconsistente com as cinco
 * folhas que já existem.
 *
 * ── FECHAR NÃO PERDE ─────────────────────────────────────────────────────────
 *
 * O X e o backdrop só dispensam a folha NESTA sessão; não carimbam nada que não
 * tenha sido visto. O card persistente da home continua sendo a rede de
 * segurança de quem fechou sem ler.
 */

export interface InsightCarouselProps {
    weekly: WeeklyInsight | null;
    meso: MesoInsight | null;
    visible: boolean;
    onClose: () => void;
    /** Abre a tela do insight semanal (onde vive a bandeja de ajuste). */
    onOpenWeekly: () => void;
    /** Abre a tela do insight de bloco (stories + dashboard). */
    onOpenMeso: () => void;
}

type Page =
    | { kind: 'meso'; id: string; insight: MesoInsight }
    | { kind: 'weekly'; id: string; insight: WeeklyInsight };

export const InsightCarousel = memo(function InsightCarousel({
    weekly,
    meso,
    visible,
    onClose,
    onOpenWeekly,
    onOpenMeso,
}: InsightCarouselProps) {
    useThemeSubscription();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const [index, setIndex] = useState(0);

    const pages: Page[] = [];
    if (meso) pages.push({ kind: 'meso', id: meso.id, insight: meso });
    if (weekly) pages.push({ kind: 'weekly', id: weekly.id, insight: weekly });

    /**
     * VER O CARD NÃO É TER VISTO O INSIGHT.
     *
     * Até a Fase 4 (mobile) o carrossel carimbava `seen_at` ao card entrar em
     * foco, e o primeiro era carimbado já no `onShow`. Abrir a folha e fechá-la
     * no mesmo segundo queimava o insight para sempre: na sessão seguinte
     * aquele card não voltava, e a folha aparecia com um só — ora sem o
     * semanal, ora sem o bloco, conforme qual tinha sido carimbado antes.
     *
     * Agora quem carimba é a TELA, ao ser aberta — o padrão que a 2B já usava.
     * Quem não abriu não viu, e o card volta na próxima sessão. Fechar a folha
     * continua dispensando-a só nesta sessão.
     */
    const handleShow = useCallback(() => setIndex(0), []);

    const handleScrollEnd = useCallback(
        (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
        },
        [width],
    );

    if (pages.length === 0) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
            onShow={handleShow}
            statusBarTranslucent
        >
            <Pressable
                style={styles.backdrop}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Fechar"
            />

            <View
                style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
            >
                <View style={styles.grabber} />

                <Pressable
                    onPress={onClose}
                    hitSlop={12}
                    style={styles.closeBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Fechar"
                    accessibilityHint="O resumo continua disponível no card da tela inicial"
                >
                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                </Pressable>

                <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={handleScrollEnd}
                    // Um card só não é carrossel: sem gesto, sem pontos.
                    scrollEnabled={pages.length > 1}
                >
                    {pages.map((page) => (
                        <View key={page.id} style={[styles.page, { width }]}>
                            {page.kind === 'meso' ? (
                                <MesoInsightCardBody
                                    insight={page.insight}
                                    onOpen={onOpenMeso}
                                />
                            ) : (
                                <WeeklyInsightCardBody
                                    insight={page.insight}
                                    onOpen={onOpenWeekly}
                                />
                            )}
                        </View>
                    ))}
                </ScrollView>

                {pages.length > 1 && (
                    <View
                        style={styles.dots}
                        accessibilityRole="adjustable"
                        accessibilityLabel={`Resumo ${index + 1} de ${pages.length}`}
                    >
                        {pages.map((page, i) => (
                            <View
                                key={page.id}
                                style={[styles.dot, i === index && styles.dotActive]}
                            />
                        ))}
                    </View>
                )}
            </View>
        </Modal>
    );
});

const styles = createThemeStyles(() => ({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: semanticColors.scrim,
    },
    sheet: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.cardDark,
        borderTopLeftRadius: borderRadius['2xl'],
        borderTopRightRadius: borderRadius['2xl'],
        paddingTop: spacing.sm,
        gap: spacing.base,
    },
    grabber: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: semanticColors.fillStrong,
        marginBottom: spacing.xs,
    },
    // Absoluto: as páginas rolam por baixo dele, então o X fica no mesmo lugar
    // em vez de deslizar junto com o card.
    closeBtn: {
        position: 'absolute',
        top: spacing.base,
        right: spacing.lg,
        zIndex: 2,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: semanticColors.fillSubtle,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // O padding horizontal vive na PÁGINA, não na folha: a folha precisa ir de
    // borda a borda para o `pagingEnabled` casar com a largura da tela.
    page: { paddingHorizontal: spacing.lg },

    dots: {
        flexDirection: 'row',
        alignSelf: 'center',
        gap: spacing.xs,
        paddingTop: spacing.xs,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: semanticColors.fillStrong,
    },
    dotActive: { backgroundColor: colors.primary, width: 18 },
}));
