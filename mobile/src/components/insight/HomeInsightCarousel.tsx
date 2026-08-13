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
import { colors, spacing } from '../../theme';
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

/** Compact, persistent counterpart of the insight sheet carousel. */
export const HomeInsightCarousel = memo(function HomeInsightCarousel({
    weekly,
    meso,
    onOpenWeekly,
    onOpenMeso,
}: HomeInsightCarouselProps) {
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

    const handleLayout = useCallback(
        (event: LayoutChangeEvent) => {
            const nextWidth = Math.round(event.nativeEvent.layout.width);
            if (nextWidth <= 0 || nextWidth === measuredWidth) return;
            setMeasuredWidth(nextWidth);
            requestAnimationFrame(() => {
                scrollRef.current?.scrollTo({ x: index * nextWidth, animated: false });
            });
        },
        [index, measuredWidth],
    );

    const handleScrollEnd = useCallback(
        (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            if (pageWidth <= 0) return;
            setIndex(
                Math.max(
                    0,
                    Math.min(
                        pages.length - 1,
                        Math.round(event.nativeEvent.contentOffset.x / pageWidth),
                    ),
                ),
            );
        },
        [pageWidth, pages.length],
    );

    if (pages.length === 0) return null;

    return (
        <View style={styles.root} onLayout={handleLayout}>
            <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
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

const styles = StyleSheet.create({
    root: {
        width: '100%',
        gap: spacing.sm,
    },
    card: {
        minHeight: 88,
    },
    // O gutter vive dentro da largura usada pelo `pagingEnabled`: separa os
    // cards durante o gesto sem alterar o ponto exato em que cada página para.
    pageWithGap: {
        paddingRight: spacing.base,
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
});

export default HomeInsightCarousel;
