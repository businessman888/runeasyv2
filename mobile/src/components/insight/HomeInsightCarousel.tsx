import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    View,
    useWindowDimensions,
    type LayoutChangeEvent,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from 'react-native';
import { colors, spacing, createThemeStyles, useThemeSubscription } from '../../theme';
import { WeeklyInsightCard } from './WeeklyInsightCard';
import { MesoInsightCard } from './MesoInsightCard';
import type { WeeklyInsight } from '../../types/weeklyInsight.types';
import type { MesoInsight } from '../../types/mesoInsight.types';

interface HomeInsightCarouselProps {
    weekly: WeeklyInsight | null;
    meso: MesoInsight | null;
    onOpenWeekly: () => void;
    onOpenMeso: () => void;
}

type Page =
    | { kind: 'meso'; id: string; insight: MesoInsight }
    | { kind: 'weekly'; id: string; insight: WeeklyInsight };

const CARD_GAP = spacing.base;
const HOME_INSIGHT_CARD_HEIGHT = 112;

/** Compact, persistent counterpart of the insight sheet carousel. */
export const HomeInsightCarousel = memo(function HomeInsightCarousel({
    weekly,
    meso,
    onOpenWeekly,
    onOpenMeso,
}: HomeInsightCarouselProps) {
    useThemeSubscription();
    const { width: screenWidth } = useWindowDimensions();
    const scrollRef = useRef<ScrollView>(null);
    const [measuredWidth, setMeasuredWidth] = useState(0);
    const [index, setIndex] = useState(0);

    // Keep the same high-level-to-detail order used by the entry sheet.
    const pages = useMemo<Page[]>(() => {
        const result: Page[] = [];
        if (meso) result.push({ kind: 'meso', id: meso.id, insight: meso });
        if (weekly) result.push({ kind: 'weekly', id: weekly.id, insight: weekly });
        return result;
    }, [meso, weekly]);

    const pageWidth = measuredWidth || Math.max(0, screenWidth - spacing.lg * 2);
    const snapInterval = pageWidth + CARD_GAP;

    const handleLayout = useCallback(
        (event: LayoutChangeEvent) => {
            const nextWidth = Math.round(event.nativeEvent.layout.width);
            if (nextWidth <= 0 || nextWidth === measuredWidth) return;
            setMeasuredWidth(nextWidth);
            requestAnimationFrame(() => {
                scrollRef.current?.scrollTo({
                    x: index * (nextWidth + CARD_GAP),
                    animated: false,
                });
            });
        },
        [index, measuredWidth],
    );

    const handleScrollEnd = useCallback(
        (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            if (snapInterval <= 0) return;
            setIndex(
                Math.max(
                    0,
                    Math.min(
                        pages.length - 1,
                        Math.round(event.nativeEvent.contentOffset.x / snapInterval),
                    ),
                ),
            );
        },
        [pages.length, snapInterval],
    );

    if (pages.length === 0) return null;

    return (
        <View style={styles.root} onLayout={handleLayout}>
            <ScrollView
                ref={scrollRef}
                horizontal
                snapToInterval={snapInterval}
                snapToAlignment="start"
                disableIntervalMomentum
                nestedScrollEnabled
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                scrollEnabled={pages.length > 1}
                onMomentumScrollEnd={handleScrollEnd}
            >
                {pages.map((page, pageIndex) => (
                    <View
                        key={`${page.kind}-${page.id}`}
                        style={[
                            { width: pageWidth },
                            pageIndex < pages.length - 1 && styles.pageWithGap,
                        ]}
                    >
                        {page.kind === 'meso' ? (
                            <MesoInsightCard
                                insight={page.insight}
                                unread={page.insight.seen_at === null}
                                onPress={onOpenMeso}
                                style={styles.card}
                            />
                        ) : (
                            <WeeklyInsightCard
                                insight={page.insight}
                                unread={page.insight.seen_at === null}
                                onPress={onOpenWeekly}
                                style={styles.card}
                            />
                        )}
                    </View>
                ))}
            </ScrollView>

            {pages.length > 1 && (
                <View
                    style={styles.dots}
                    accessible
                    accessibilityLabel={`Insight ${index + 1} de ${pages.length}`}
                >
                    {pages.map((page, pageIndex) => (
                        <View
                            key={`${page.kind}-${page.id}`}
                            style={[styles.dot, pageIndex === index && styles.dotActive]}
                        />
                    ))}
                </View>
            )}
        </View>
    );
});

const styles = createThemeStyles(() => ({
    root: {
        width: '100%',
        gap: spacing.sm,
    },
    card: {
        height: HOME_INSIGHT_CARD_HEIGHT,
    },
    // O gutter fica entre páginas: ambos os cards preservam a largura total e
    // `snapToInterval` inclui esse espaço ao calcular cada ponto de parada.
    pageWithGap: {
        marginRight: CARD_GAP,
    },
    dots: {
        minHeight: spacing.sm,
        flexDirection: 'row',
        alignSelf: 'center',
        alignItems: 'center',
        gap: spacing.xs,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.textMuted,
    },
    dotActive: {
        width: 18,
        backgroundColor: colors.primary,
    },
}));

export default HomeInsightCarousel;
