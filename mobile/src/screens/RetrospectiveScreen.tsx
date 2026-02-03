import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ScreenContainer } from '../components/ScreenContainer';
import { PoweredByStrava } from '../components/PoweredByStrava';
import { BASE_API_URL } from '../config/api.config';
import * as Storage from '../utils/storage';

interface RetrospectiveData {
    id: string;
    totalDistanceKm: number;
    totalWorkoutsCompleted: number;
    totalWorkoutsPlanned: number;
    avgPaceSeconds: number;
    avgPaceFormatted: string;
    completionRate: number;
    distanceVsGoalPercent: number;
    paceVsGoalPercent: number;
    frequencyVsGoalPercent: number;
    aiInsights: string;
    suggestedNextGoal: string;
    suggestedNextGoalType: string;
}

const COLORS = {
    background: '#0E0E1F',
    cardBg: '#1A1A2E',
    cardBgLight: 'rgba(0, 212, 255, 0.08)',
    cyanPrimary: '#00D4FF',
    textPrimary: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    success: '#32CD32',
    warning: '#FFC400',
    dark: '#15152A',
};

export function RetrospectiveScreen() {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<RetrospectiveData | null>(null);
    const [accepting, setAccepting] = useState(false);

    useEffect(() => {
        loadRetrospective();
    }, []);

    const loadRetrospective = async () => {
        try {
            const userId = await Storage.getItemAsync('user_id');
            if (!userId) return;

            const response = await fetch(`${BASE_API_URL}/training/retrospective/latest`, {
                headers: { 'x-user-id': userId },
            });
            const result = await response.json();

            if (result.hasRetrospective) {
                setData(result.retrospective);
            }
        } catch (error) {
            console.error('Failed to load retrospective:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleShare = async () => {
        if (!data) return;
        try {
            await Share.share({
                message: `🏃 Completei meu ciclo de treino no RunEasy!\n\n📏 ${data.totalDistanceKm}km percorridos\n⏱️ Pace médio: ${data.avgPaceFormatted}/km\n✅ ${data.completionRate}% dos treinos completados\n\n#RunEasy #Corrida`,
            });
        } catch (error) {
            console.error('Share failed:', error);
        }
    };

    const handleAcceptSuggestion = async () => {
        if (!data) return;
        setAccepting(true);
        try {
            const userId = await Storage.getItemAsync('user_id');
            await fetch(`${BASE_API_URL}/training/retrospective/${data.id}/accept`, {
                method: 'POST',
                headers: { 'x-user-id': userId || '' },
            });
            // Success! The plan is already generated.
            // Navigate back to Home (MainTabs) to see the new workout
            (navigation as any).reset({
                index: 0,
                routes: [{ name: 'MainTabs' }],
            });
        } catch (error) {
            console.error('Failed to accept:', error);
        } finally {
            setAccepting(false);
        }
    };

    const handleCustomize = () => {
        if (!data) return;
        (navigation as any).navigate('CustomizeGoal', { retrospectiveId: data.id });
    };

    if (loading) {
        return (
            <ScreenContainer>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.cyanPrimary} />
                    <Text style={styles.loadingText}>Carregando retrospectiva...</Text>
                </View>
            </ScreenContainer>
        );
    }

    if (!data) {
        return (
            <ScreenContainer>
                <View style={styles.emptyContainer}>
                    <MaterialCommunityIcons name="trophy-outline" size={64} color={COLORS.textSecondary} />
                    <Text style={styles.emptyText}>Nenhuma retrospectiva disponível</Text>
                    <Text style={styles.emptySubtext}>
                        Complete seu primeiro ciclo de treino para ver sua retrospectiva!
                    </Text>
                </View>
            </ScreenContainer>
        );
    }

    const distanceGoalMet = data.distanceVsGoalPercent >= 100;
    const distanceDiff = data.distanceVsGoalPercent - 100;
    const paceDiff = data.paceVsGoalPercent - 100;

    return (
        <ScreenContainer>
            <ScrollView
                style={styles.container}
                contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        style={styles.backButton}
                    >
                        <Ionicons name="chevron-back" size={28} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Retrospectiva</Text>
                    <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
                        <Feather name="share-2" size={22} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                </View>

                {/* Success Card */}
                <View style={styles.successCard}>
                    <View style={styles.badgeContainer}>
                        <MaterialCommunityIcons name="trophy" size={16} color={COLORS.cyanPrimary} />
                        <Text style={styles.badgeText}>
                            {distanceGoalMet ? 'META BATIDA' : 'CICLO CONCLUÍDO'}
                        </Text>
                    </View>
                    <Text style={styles.successTitle}>Ciclo concluído!</Text>
                    <Text style={styles.successSubtitle}>
                        {distanceGoalMet
                            ? `Você superou as expectativas! Sua meta foi batida com maestria!`
                            : `Parabéns por completar seu ciclo de treino!`
                        }
                    </Text>

                    {/* Progress Bar */}
                    <View style={styles.progressContainer}>
                        <View style={styles.progressBarBg}>
                            <View
                                style={[
                                    styles.progressBarFill,
                                    { width: `${Math.min(data.completionRate, 100)}%` }
                                ]}
                            />
                        </View>
                        <Text style={styles.progressText}>{data.completionRate}%</Text>
                    </View>
                </View>

                {/* Performance Section */}
                <Text style={styles.sectionTitle}>Performance</Text>

                <View style={styles.metricsRow}>
                    {/* Distance Card */}
                    <View style={styles.metricCard}>
                        <View style={styles.metricHeader}>
                            <Text style={styles.metricLabel}>Distância</Text>
                            <MaterialCommunityIcons
                                name="map-marker-distance"
                                size={20}
                                color={COLORS.cyanPrimary}
                            />
                        </View>
                        <Text style={styles.metricValue}>
                            {data.totalDistanceKm}<Text style={styles.metricUnit}>km</Text>
                        </Text>
                        <View style={styles.metricDivider} />
                        <Text style={styles.metricComparison}>
                            Meta: {Math.round(data.totalDistanceKm / (data.distanceVsGoalPercent / 100))}km{' '}
                            <Text style={distanceDiff >= 0 ? styles.positive : styles.negative}>
                                ({distanceDiff >= 0 ? '+' : ''}{distanceDiff}%)
                            </Text>
                        </Text>
                        <PoweredByStrava width={60} align="left" style={styles.stravaLogo} />
                    </View>

                    {/* Pace Card */}
                    <View style={styles.metricCard}>
                        <View style={styles.metricHeader}>
                            <Text style={styles.metricLabel}>Pace Médio</Text>
                            <MaterialCommunityIcons
                                name="speedometer"
                                size={20}
                                color={COLORS.cyanPrimary}
                            />
                        </View>
                        <Text style={styles.metricValue}>
                            {data.avgPaceFormatted}<Text style={styles.metricUnit}>/km</Text>
                        </Text>
                        <View style={styles.metricDivider} />
                        <Text style={styles.metricComparison}>
                            Meta: 5:30{' '}
                            <Text style={paceDiff >= 0 ? styles.positive : styles.negative}>
                                ({paceDiff >= 0 ? '+' : ''}{paceDiff}%)
                            </Text>
                        </Text>
                        <PoweredByStrava width={60} align="left" style={styles.stravaLogo} />
                    </View>
                </View>

                {/* Frequency Card */}
                <View style={styles.frequencyCard}>
                    <View style={styles.frequencyLeft}>
                        <Text style={styles.metricLabel}>Frequência Semanal</Text>
                        <Text style={styles.frequencyValue}>
                            {data.completionRate}%{' '}
                            <Text style={styles.frequencyDiff}>
                                {data.frequencyVsGoalPercent >= 100 ? '+' : ''}
                                {data.frequencyVsGoalPercent - 100}% vs Meta
                            </Text>
                        </Text>
                    </View>
                    <View style={styles.frequencyBars}>
                        {[1, 2, 3, 4].map((_, i) => (
                            <View
                                key={i}
                                style={[
                                    styles.frequencyBar,
                                    { height: 20 + (i * 12), opacity: 0.4 + (i * 0.2) }
                                ]}
                            />
                        ))}
                    </View>
                </View>

                {/* AI Insights Card */}
                <View style={styles.insightsCard}>
                    <View style={styles.insightsHeader}>
                        <MaterialCommunityIcons
                            name="lightbulb-on"
                            size={24}
                            color={COLORS.cyanPrimary}
                        />
                        <Text style={styles.insightsTitle}>Insights do Treinador IA</Text>
                    </View>
                    <Text style={styles.insightsText}>{data.aiInsights}</Text>
                </View>

                {/* Next Goal Section */}
                <View style={styles.nextGoalSection}>
                    <Text style={styles.nextGoalLabel}>Próxima Meta Sugerida</Text>
                    <Text style={styles.nextGoalValue}>{data.suggestedNextGoal}</Text>
                    <Text style={styles.nextGoalSubtext}>Baseado no seu progresso atual</Text>

                    <TouchableOpacity
                        style={styles.acceptButton}
                        onPress={handleAcceptSuggestion}
                        disabled={accepting}
                    >
                        {accepting ? (
                            <ActivityIndicator color={COLORS.dark} />
                        ) : (
                            <Text style={styles.acceptButtonText}>Aceitar Sugestão do Treinador</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.customizeButton}
                        onPress={handleCustomize}
                    >
                        <Text style={styles.customizeButtonText}>Personalizar Novas Metas</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 16,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        color: COLORS.textSecondary,
        fontSize: 16,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    emptyText: {
        marginTop: 16,
        color: COLORS.textPrimary,
        fontSize: 18,
        fontWeight: '600',
    },
    emptySubtext: {
        marginTop: 8,
        color: COLORS.textSecondary,
        fontSize: 14,
        textAlign: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        marginTop: 8,
    },
    backButton: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    shareButton: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    successCard: {
        backgroundColor: COLORS.cardBg,
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.2)',
    },
    badgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 212, 255, 0.15)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        alignSelf: 'flex-start',
        marginBottom: 12,
    },
    badgeText: {
        color: COLORS.cyanPrimary,
        fontSize: 12,
        fontWeight: '700',
        marginLeft: 6,
    },
    successTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginBottom: 8,
    },
    successSubtitle: {
        fontSize: 14,
        color: COLORS.textSecondary,
        lineHeight: 20,
        marginBottom: 16,
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    progressBarBg: {
        flex: 1,
        height: 8,
        backgroundColor: 'rgba(0, 212, 255, 0.2)',
        borderRadius: 4,
        marginRight: 12,
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: COLORS.cyanPrimary,
        borderRadius: 4,
    },
    progressText: {
        color: COLORS.cyanPrimary,
        fontSize: 14,
        fontWeight: '600',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: COLORS.textPrimary,
        marginBottom: 16,
    },
    metricsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    metricCard: {
        flex: 1,
        backgroundColor: COLORS.cardBg,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    metricHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    metricLabel: {
        fontSize: 14,
        color: COLORS.textSecondary,
    },
    metricValue: {
        fontSize: 32,
        fontWeight: '700',
        color: COLORS.cyanPrimary,
    },
    metricUnit: {
        fontSize: 16,
        fontWeight: '500',
    },
    metricDivider: {
        height: 3,
        backgroundColor: COLORS.cyanPrimary,
        borderRadius: 2,
        marginVertical: 12,
        width: '60%',
    },
    metricComparison: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
    positive: {
        color: COLORS.success,
    },
    negative: {
        color: COLORS.warning,
    },
    stravaLogo: {
        marginTop: 8,
    },
    frequencyCard: {
        backgroundColor: COLORS.cardBg,
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    frequencyLeft: {
        flex: 1,
    },
    frequencyValue: {
        fontSize: 28,
        fontWeight: '700',
        color: COLORS.cyanPrimary,
        marginTop: 4,
    },
    frequencyDiff: {
        fontSize: 14,
        fontWeight: '500',
        color: COLORS.success,
    },
    frequencyBars: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 6,
    },
    frequencyBar: {
        width: 16,
        backgroundColor: COLORS.cyanPrimary,
        borderRadius: 4,
    },
    insightsCard: {
        backgroundColor: COLORS.cardBgLight,
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.3)',
    },
    insightsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    insightsTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.cyanPrimary,
        marginLeft: 10,
    },
    insightsText: {
        fontSize: 14,
        color: COLORS.textPrimary,
        lineHeight: 22,
    },
    nextGoalSection: {
        backgroundColor: COLORS.cardBg,
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        marginBottom: 24,
    },
    nextGoalLabel: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginBottom: 8,
    },
    nextGoalValue: {
        fontSize: 28,
        fontWeight: '700',
        color: COLORS.cyanPrimary,
        textAlign: 'center',
    },
    nextGoalSubtext: {
        fontSize: 12,
        color: COLORS.textSecondary,
        marginTop: 8,
        marginBottom: 24,
    },
    acceptButton: {
        backgroundColor: COLORS.cyanPrimary,
        borderRadius: 15,
        paddingVertical: 16,
        paddingHorizontal: 32,
        width: '100%',
        alignItems: 'center',
        marginBottom: 12,
    },
    acceptButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.dark,
    },
    customizeButton: {
        borderWidth: 1,
        borderColor: COLORS.cyanPrimary,
        borderRadius: 15,
        paddingVertical: 16,
        paddingHorizontal: 32,
        width: '100%',
        alignItems: 'center',
    },
    customizeButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.cyanPrimary,
    },
});

export default RetrospectiveScreen;
