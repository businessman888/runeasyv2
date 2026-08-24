import React from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { Skeleton, SkeletonCircle } from '../Skeleton';
import { colors, spacing, createThemeStyles, useThemeSubscription } from '../../theme';

/**
 * Premium, layout-aware skeletons per screen. Each one mirrors the real screen's
 * structure (header/cards/rows) so the transition to loaded content doesn't shift
 * layout or flash. All built from the shared <Skeleton> primitive (sliding shimmer
 * + Reduce Motion fallback), so animation/theming stays consistent app-wide.
 */

/** A single list row: avatar + two text lines + trailing value (ranking / history). */
function RowSkeleton({ showAvatar = true }: { showAvatar?: boolean }) {
    useThemeSubscription();
    return (
        <View style={styles.row}>
            {showAvatar && <SkeletonCircle size={44} style={{ marginRight: spacing.md }} />}
            <View style={{ flex: 1 }}>
                <Skeleton width="55%" height={14} borderRadius={4} />
                <Skeleton width="35%" height={11} borderRadius={4} style={{ marginTop: 8 }} />
            </View>
            <Skeleton width={42} height={18} borderRadius={6} />
        </View>
    );
}

/** Ranking: podium (3 columns) + list rows. Rendered in place of the spinner. */
export function RankingSkeleton() {
    useThemeSubscription();
    return (
        <View style={{ paddingHorizontal: spacing.lg }}>
            <View style={styles.podium}>
                <PodiumCol height={88} />
                <PodiumCol height={116} />
                <PodiumCol height={72} />
            </View>
            <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
                {Array.from({ length: 6 }).map((_, i) => (
                    <View key={i} style={styles.card}>
                        <RowSkeleton />
                    </View>
                ))}
            </View>
        </View>
    );
}

function PodiumCol({ height }: { height: number }) {
    useThemeSubscription();
    return (
        <View style={styles.podiumCol}>
            <SkeletonCircle size={56} />
            <Skeleton width={56} height={12} borderRadius={4} style={{ marginTop: 8 }} />
            <Skeleton width={'90%'} height={height} borderRadius={14} style={{ marginTop: 10 }} />
        </View>
    );
}

/** Training history: grouped list rows. Rendered in place of "Carregando treinos...". */
export function WorkoutHistorySkeleton() {
    useThemeSubscription();
    return (
        <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
            {Array.from({ length: 5 }).map((_, i) => (
                <View key={i} style={styles.card}>
                    <RowSkeleton />
                </View>
            ))}
        </View>
    );
}

/** Badges: grid of badge tiles. Rendered while badges load. */
export function BadgesGridSkeleton() {
    useThemeSubscription();
    return (
        <View style={{ marginTop: spacing.lg }}>
            <Skeleton width={140} height={16} borderRadius={4} style={{ marginBottom: spacing.md }} />
            <View style={styles.grid}>
                {Array.from({ length: 9 }).map((_, i) => (
                    <View key={i} style={styles.badgeTile}>
                        <SkeletonCircle size={56} />
                        <Skeleton width={'70%'} height={10} borderRadius={4} style={{ marginTop: 10 }} />
                    </View>
                ))}
            </View>
        </View>
    );
}

/** Calendar body: stats bar + a stack of workout cards. */
export function CalendarBodySkeleton() {
    useThemeSubscription();
    return (
        <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
            <Skeleton width="100%" height={64} borderRadius={16} />
            {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} width="100%" height={96} borderRadius={16} />
            ))}
        </View>
    );
}

/** Coach analysis: title + paragraph lines + a couple of metric chips. */
export function CoachAnalysisSkeleton() {
    useThemeSubscription();
    return (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.md }}>
            <Skeleton width="100%" height={120} borderRadius={20} />
            <Skeleton width="45%" height={16} borderRadius={4} style={{ marginTop: spacing.sm }} />
            <Skeleton width="100%" height={14} borderRadius={4} />
            <Skeleton width="92%" height={14} borderRadius={4} />
            <Skeleton width="80%" height={14} borderRadius={4} />
            <View style={[styles.grid, { marginTop: spacing.sm }]}>
                <Skeleton width="48%" height={80} borderRadius={14} />
                <Skeleton width="48%" height={80} borderRadius={14} />
            </View>
        </View>
    );
}

/** Home: workout card placeholder (used until the main workout resolves). */
export function WorkoutCardSkeleton() {
    useThemeSubscription();
    return (
        <View style={{ gap: spacing.md }}>
            <Skeleton width="100%" height={180} borderRadius={20} />
            <Skeleton width="100%" height={120} borderRadius={20} />
        </View>
    );
}

/** Feedback: full-page hero + sections. Replaces the full-screen spinner. */
export function FeedbackSkeleton() {
    useThemeSubscription();
    return (
        <SafeAreaView style={styles.page}>
            <View style={{ padding: spacing.lg, gap: spacing.lg }}>
                <Skeleton width="100%" height={130} borderRadius={16} />
                <View>
                    <Skeleton width="35%" height={16} borderRadius={4} style={{ marginBottom: spacing.md }} />
                    <View style={styles.grid}>
                        <Skeleton width="48%" height={90} borderRadius={14} />
                        <Skeleton width="48%" height={90} borderRadius={14} />
                    </View>
                </View>
                <View>
                    <Skeleton width="40%" height={16} borderRadius={4} style={{ marginBottom: spacing.md }} />
                    <Skeleton width="100%" height={80} borderRadius={14} style={{ marginBottom: spacing.sm }} />
                    <Skeleton width="100%" height={80} borderRadius={14} />
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = createThemeStyles(() => ({
    page: {
        flex: 1,
        backgroundColor: colors.background,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
    },
    podium: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginTop: spacing.lg,
    },
    podiumCol: {
        flex: 1,
        alignItems: 'center',
        marginHorizontal: spacing.xs,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    badgeTile: {
        width: '31%',
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
}));
