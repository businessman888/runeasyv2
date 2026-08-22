import React, { useCallback } from 'react';
import {
    ScrollView,
    StyleSheet,
    StatusBar,
    View,
    Text,
    RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, typography, spacing, fonts } from '../theme';
import { semanticColors } from '../theme/semanticColors';
import { useWellnessStore } from '../stores/wellnessStore';
import { useHealthKitStore } from '../stores/healthKitStore';
import { useReadinessStore } from '../stores/readinessStore';
import { ReadinessCard } from '../components/wellness/ReadinessCard';
import { PerformanceGrid } from '../components/wellness/PerformanceGrid';
import { HealthSection } from '../components/wellness/HealthSection';
import { ZonesChart } from '../components/wellness/ZonesChart';
import { EvolutionChart } from '../components/wellness/EvolutionChart';
import { WellnessSkeleton } from '../components/wellness/WellnessSkeleton';
import { UpgradeProCard } from '../components/upgrade/UpgradeProCard';
import { AppIcon } from '../components/ui/AppIcon';
import { useProFeature } from '../hooks/useProFeature';
import { useBreakpoint } from '../hooks/useBreakpoint';

type Nav = NativeStackNavigationProp<Record<string, object | undefined>>;

export function WellnessScreen() {
    const navigation = useNavigation<Nav>();
    // Tablet: coluna centralizada (a grade de performance já expande p/ 3-4 col).
    const { isTablet } = useBreakpoint();
    const summary = useWellnessStore((s) => s.summary);
    const loading = useWellnessStore((s) => s.loading);
    const error = useWellnessStore((s) => s.error);
    const fetchSummary = useWellnessStore((s) => s.fetchSummary);
    const evolutionTab = useWellnessStore((s) => s.evolutionTab);
    const setEvolutionTab = useWellnessStore((s) => s.setEvolutionTab);
    const syncHealthKit = useHealthKitStore((s) => s.syncRecentIfConnected);
    const readinessStatus = useReadinessStore((s) => s.readinessStatus);
    const fetchReadinessStatus = useReadinessStore((s) => s.fetchReadinessStatus);
    const { isProUser } = useProFeature();

    useFocusEffect(
        useCallback(() => {
            fetchSummary();
            // Pro-only: avoid an authenticated request that just shows a card
            if (isProUser) fetchReadinessStatus();
            // Trigger a fresh HealthKit sync on focus — store will invalidate
            // wellness cache if new activities are imported.
            syncHealthKit(7).catch(() => undefined);
        }, [fetchSummary, fetchReadinessStatus, syncHealthKit, isProUser]),
    );

    const onRefresh = useCallback(() => {
        fetchSummary(true);
    }, [fetchSummary]);

    const handleOpenQuiz = useCallback(() => {
        navigation.navigate('ReadinessQuiz');
    }, [navigation]);

    // Wait for BOTH summary and readiness status to land so the readiness
    // card doesn't flash the wrong variant (locked → pending or vice versa).
    // For Free users, readinessStatus isn't fetched — skip that part of the wait.
    const showSkeleton =
        (!summary && loading) || (isProUser && summary && readinessStatus === null);

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            <StatusBar barStyle="light-content" backgroundColor={semanticColors.canvas} />

            <View style={styles.header}>
                <Text style={styles.title}>Wellness</Text>
                <Text style={styles.subtitle}>Sua visão completa hoje</Text>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={loading && !!summary}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                        colors={[colors.primary]}
                    />
                }
            >
                {showSkeleton ? (
                    <WellnessSkeleton />
                ) : !summary ? (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorTitle}>
                            Não conseguimos carregar seu wellness
                        </Text>
                        <Text style={styles.errorText}>
                            {error || 'Verifique sua conexão e tente novamente.'}
                        </Text>
                    </View>
                ) : (
                    <View style={[styles.sections, isTablet && styles.tabletSections]}>
                        {isProUser ? (
                            <ReadinessCard
                                readiness={summary.readiness}
                                isUnlocked={readinessStatus?.isUnlocked ?? false}
                                onPressQuiz={handleOpenQuiz}
                            />
                        ) : (
                            <UpgradeProCard
                                variant="medium"
                                heroVariant="headline"
                                showHeader={false}
                                priceLabel="Como seu corpo está hoje?"
                                tagline="Faça o check-in e descubra a recomendação do Coach AI"
                                ctaLabel="Ver recomendação do Coach"
                            />
                        )}

                        <PerformanceGrid
                            performance={summary.performance}
                            frequencyPlanned={isProUser ? summary.overview.frequencyPlanned : 0}
                        />

                        <HealthSection health={summary.health} />

                        {isProUser ? (
                            <ZonesChart zones={summary.zones} />
                        ) : (
                            <UpgradeProCard
                                variant="compact"
                                tagline="Zonas de FC detalhadas com dados do relógio"
                            />
                        )}

                        <EvolutionChart
                            evolution={summary.evolution}
                            activeTab={evolutionTab}
                            onChangeTab={setEvolutionTab}
                        />

                        {summary.streak.current > 0 && (
                            <View style={styles.streakStrip}>
                                <Text style={styles.streakLabel}>Streak atual</Text>
                                <View style={styles.streakValueRow}>
                                    <AppIcon name="flame" size={16} tone="accent" variant="filled" />
                                    <Text style={styles.streakValue}>{summary.streak.current} dias</Text>
                                </View>
                                <Text style={styles.streakSub}>
                                    Recorde: {summary.streak.longest} dias
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: semanticColors.canvas,
    },
    header: {
        paddingHorizontal: spacing.base,
        paddingTop: spacing.sm,
        paddingBottom: spacing.md,
    },
    title: {
        fontSize: typography.fontSizes['3xl'],
        fontFamily: fonts.bold,
        color: semanticColors.textPrimary,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textSecondary,
        marginTop: 2,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: spacing.base,
        paddingBottom: 120, // floating tab bar clearance
    },
    sections: {
        gap: spacing.xl,
    },
    // Tablet: limita a largura e centraliza (phone nunca usa).
    tabletSections: {
        width: '100%',
        maxWidth: 900,
        alignSelf: 'center',
    },
    errorBox: {
        marginTop: spacing.xl,
        padding: spacing.lg,
        backgroundColor: semanticColors.surface2,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        alignItems: 'center',
        gap: spacing.xs,
    },
    errorTitle: {
        fontSize: typography.fontSizes.base,
        fontFamily: fonts.semibold,
        color: semanticColors.textPrimary,
    },
    errorText: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textSecondary,
        textAlign: 'center',
    },
    streakStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        backgroundColor: semanticColors.surface2,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    streakLabel: {
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textSecondary,
        fontFamily: fonts.medium,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    streakValueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    streakValue: {
        fontSize: typography.fontSizes.lg,
        fontFamily: fonts.bold,
        color: semanticColors.textPrimary,
    },
    streakSub: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textSecondary,
    },
});

export default WellnessScreen;
