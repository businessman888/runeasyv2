import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton, SkeletonText } from '../Skeleton';
import { colors, spacing, borderRadius } from '../../theme';

/**
 * Full-screen skeleton shown while the wellness summary loads.
 * Mirrors the section ordering of WellnessScreen so layout doesn't jump.
 */
export function WellnessSkeleton() {
    return (
        <View style={styles.container}>
            {/* Readiness card */}
            <View style={[styles.section, styles.card, { height: 168 }]}>
                <SkeletonText width="60%" height={14} />
                <SkeletonText width="80%" height={22} style={{ marginTop: spacing.md }} />
                <SkeletonText width="50%" height={14} style={{ marginTop: spacing.sm }} />
                <Skeleton width="100%" height={44} borderRadius={borderRadius.lg} style={{ marginTop: spacing.lg }} />
            </View>

            {/* Performance grid */}
            <SkeletonText width="40%" height={18} style={styles.heading} />
            <View style={styles.grid}>
                {Array.from({ length: 6 }).map((_, i) => (
                    <View key={i} style={[styles.card, styles.gridItem]}>
                        <SkeletonText width="50%" height={12} />
                        <SkeletonText width="70%" height={22} style={{ marginTop: spacing.sm }} />
                        <SkeletonText width="35%" height={10} style={{ marginTop: spacing.xs }} />
                    </View>
                ))}
            </View>

            {/* Health */}
            <SkeletonText width="40%" height={18} style={styles.heading} />
            <View style={[styles.card, { height: 120 }]} />

            {/* Zones */}
            <SkeletonText width="50%" height={18} style={styles.heading} />
            <View style={[styles.card, { gap: spacing.sm, paddingVertical: spacing.lg }]}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} width="100%" height={14} borderRadius={borderRadius.full} />
                ))}
            </View>

            {/* Evolution */}
            <SkeletonText width="35%" height={18} style={styles.heading} />
            <View style={[styles.card, { height: 220 }]} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: spacing.base,
        gap: spacing.md,
    },
    section: {
        marginBottom: spacing.md,
    },
    heading: {
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    gridItem: {
        width: '48%',
        height: 96,
    },
});
