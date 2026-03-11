import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    Platform,
    Linking,
    Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Storage from '../utils/storage';
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { useAuthStore, useGamificationStore, useTrainingStore, useFeedbackStore, useStatsStore, useNotificationStore } from '../stores';
import { CircularProgress } from '../components/CircularProgress';
import { Skeleton, SkeletonCircle, SkeletonText } from '../components/Skeleton';
import { ScreenContainer } from '../components/ScreenContainer';

import { BASE_API_URL } from '../config/api.config';

// Icon components using @expo/vector-icons
function FireIcon({ size = 24, color = '#FFC400' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="fire" size={size} color={color} />;
}

function RunningIcon({ size = 30, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="run" size={size} color={color} />;
}

function DistanceIcon({ size = 18, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="map-marker-distance" size={size} color={color} />;
}

function PaceIcon({ size = 18, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="timer-outline" size={size} color={color} />;
}

function CalendarSmallIcon({ size = 18, color = 'rgba(235, 235, 245, 0.6)' }: { size?: number; color?: string }) {
    return <Ionicons name="calendar-outline" size={size} color={color} />;
}

function ShoeIcon({ size = 24, color = '#0E0E1F' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="shoe-sneaker" size={size} color={color} />;
}

function BinocularsIcon({ size = 35, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="binoculars" size={size} color={color} />;
}

function TrendUpIcon({ size = 20, color = '#32CD32' }: { size?: number; color?: string }) {
    return <Ionicons name="trending-up" size={size} color={color} />;
}

function ArrowRightIcon({ size = 16, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <Ionicons name="arrow-forward" size={size} color={color} />;
}

function BellIcon({ size = 24, color = '#EBEBF5' }: { size?: number; color?: string }) {
    return <Ionicons name="notifications" size={size} color={color} />;
}

function LockIcon({ size = 24, color = '#6B7280' }: { size?: number; color?: string }) {
    return <Ionicons name="lock-closed" size={size} color={color} />;
}

function MoonIcon({ size = 30, color = '#A78BFA' }: { size?: number; color?: string }) {
    return <Ionicons name="moon" size={size} color={color} />;
}

function BedIcon({ size = 24, color = '#A78BFA' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="bed" size={size} color={color} />;
}

export function HomeScreen({ navigation }: any) {
    const { user } = useAuthStore();
    const { stats, fetchStats, isLoading: gamificationLoading } = useGamificationStore();
    const { upcomingWorkouts, fetchUpcomingWorkouts, isLoading: trainingLoading, today, nextWorkout: storeNextWorkout, fetchSchedule, clearScheduleData } = useTrainingStore();
    const { latestSummary, fetchLatestSummary, latestActivity, latestActivityLoading, fetchLatestActivity } = useFeedbackStore();
    const { summary, fetchSummary, isLoading: statsLoading } = useStatsStore();
    const { unreadCount, fetchUnreadCount } = useNotificationStore();
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [recoveryTimeLeft, setRecoveryTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
    const [recoveryProgress, setRecoveryProgress] = useState(0);
    const [retrospectiveReady, setRetrospectiveReady] = useState(false);

    const insets = useSafeAreaInsets();

    // Use useFocusEffect to refetch data when screen gains focus (revalidate on every visit)
    useFocusEffect(
        useCallback(() => {
            const loadData = async () => {
                // Clear stale data immediately to show skeleton
                clearScheduleData();
                setIsInitialLoading(true);

                // Use dynamic dates: start of current month for calendar history, end 1 month ahead
                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                const startStr = startOfMonth.toISOString().split('T')[0];
                const endDate = new Date(now);
                endDate.setMonth(endDate.getMonth() + 1);
                const endStr = endDate.toISOString().split('T')[0];

                await Promise.all([
                    fetchStats(),
                    fetchUpcomingWorkouts(),
                    fetchLatestSummary(),
                    fetchLatestActivity(),
                    fetchSummary(),
                    fetchUnreadCount(),
                    fetchSchedule(startStr, endStr),
                ]);

                // Check if retrospective is ready
                try {
                    const userId = await Storage.getItemAsync('user_id');
                    if (userId) {
                        const response = await fetch(`${BASE_API_URL}/training/retrospective/ready`, {
                            headers: { 'x-user-id': userId },
                        });
                        const result = await response.json();
                        setRetrospectiveReady(result.isReady || false);
                    }
                } catch (e) {
                    console.log('Retrospective check failed:', e);
                }

                setIsInitialLoading(false);
            };
            loadData();
        }, [])
    );

    // Recovery countdown timer
    useEffect(() => {
        const updateRecoveryTimer = () => {
            const now = new Date();
            const endOfDay = new Date(now);
            endOfDay.setHours(23, 59, 59, 999);

            const diffMs = endOfDay.getTime() - now.getTime();
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

            setRecoveryTimeLeft({ hours, minutes, seconds });

            // Calculate progress: percentage of day completed
            const startOfDay = new Date(now);
            startOfDay.setHours(0, 0, 0, 0);
            const totalDayMs = 24 * 60 * 60 * 1000;
            const elapsedMs = now.getTime() - startOfDay.getTime();
            setRecoveryProgress(Math.min((elapsedMs / totalDayMs) * 100, 100));
        };

        updateRecoveryTimer();
        const interval = setInterval(updateRecoveryTimer, 1000);
        return () => clearInterval(interval);
    }, []);

    // Use API data: today from store is authoritative
    const todayData = today;
    const isRecoveryDay = todayData?.type === 'recovery';
    const nextWorkout = storeNextWorkout;
    const todayWorkout = todayData?.type === 'workout' ? todayData.workout : null;

    // Refetch feedback when workout status changes to 'completed'
    useEffect(() => {
        if (todayData?.status === 'completed') {
            // Delay to allow AI feedback to be generated
            const timer = setTimeout(() => {
                fetchLatestActivity();
            }, 2000);

            // Retry after 5 more seconds if still loading or no data
            const retryTimer = setTimeout(() => {
                fetchLatestActivity();
            }, 7000);

            return () => {
                clearTimeout(timer);
                clearTimeout(retryTimer);
            };
        }
    }, [todayData?.status]);

    const currentLevel = stats?.current_level ?? 1;
    const totalPoints = stats?.total_points ?? 0;
    const pointsToNext = stats?.points_to_next_level ?? 100;
    const currentStreak = stats?.current_streak ?? 0;
    const progress = pointsToNext > 0 ? Math.min((totalPoints / pointsToNext) * 100, 100) : 0;

    const hasCompletedWorkouts = (summary?.total_runs ?? 0) > 0;

    // Check if workout is for today (used for button enable/disable)
    const isWorkoutToday = (dateStr: string): boolean => {
        const workoutDate = new Date(dateStr + 'T00:00:00');
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        workoutDate.setHours(0, 0, 0, 0);
        return workoutDate.getTime() === todayDate.getTime();
    };

    const handleStartWorkout = async () => {
        // TODO: Implement native workout tracking or GPS recording
        Alert.alert(
            'Iniciar Treino',
            'A funcionalidade de gravação de treinos será implementada em breve.',
            [{ text: 'OK' }]
        );
    };

    const userName = user?.profile?.firstname
        ? `${user.profile.firstname}${user.profile.lastname ? ' ' + user.profile.lastname : ''}`
        : 'Corredor';
    const profilePic = user?.profile?.profile_pic || 'https://i.pravatar.cc/100';

    const getWorkoutTypeName = (type: string): string => {
        const typeNames: Record<string, string> = {
            easy_run: 'Rodagem Leve',
            long_run: 'Longão',
            intervals: 'Intervalado',
            tempo: 'Tempo Run',
            recovery: 'Recuperação',
        };
        return typeNames[type] || type;
    };

    const formatWorkoutDate = (dateStr: string): string => {
        const date = new Date(dateStr + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (date.getTime() === today.getTime()) {
            return 'Hoje';
        } else if (date.getTime() === tomorrow.getTime()) {
            return 'Amanhã';
        } else {
            return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
        }
    };

    const getWorkoutPace = (workout: any): string => {
        if (workout.instructions_json && workout.instructions_json.length > 0) {
            const mainBlock = workout.instructions_json.find((i: any) => i.type === 'main') || workout.instructions_json[0];
            if (mainBlock && mainBlock.pace_min) {
                const paceMin = Math.floor(mainBlock.pace_min);
                const paceSec = Math.round((mainBlock.pace_min - paceMin) * 60);
                return `${paceMin}:${paceSec.toString().padStart(2, '0')}`;
            }
        }
        const defaultPaces: Record<string, string> = {
            easy_run: '6:30',
            long_run: '6:00',
            intervals: '5:00',
            tempo: '5:30',
            recovery: '7:00',
        };
        return defaultPaces[workout.type] || '6:00';
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Bom dia';
        if (hour < 18) return 'Boa tarde';
        return 'Boa noite';
    };

    const formatTimeUnit = (value: number): string => {
        return value.toString().padStart(2, '0');
    };

    // Determine the main workout to display: today's workout takes priority
    const hasTodayWorkout = todayWorkout !== null;
    const mainWorkout = hasTodayWorkout ? { ...todayWorkout, scheduled_date: todayData?.date } : nextWorkout;

    // Button is enabled only if there's a workout for TODAY that is still pending
    const isTodayWorkoutPending = hasTodayWorkout && todayData?.status === 'pending';
    const isButtonEnabled = isTodayWorkoutPending;

    return (
        <ScreenContainer>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        {isInitialLoading ? (
                            <SkeletonCircle size={48} />
                        ) : (
                            <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
                                {profilePic && profilePic.startsWith('http') ? (
                                    <Image
                                        source={{ uri: profilePic }}
                                        style={styles.profileImage}
                                    />
                                ) : (
                                    <View style={styles.profileImageInitials}>
                                        <Text style={styles.profileInitialsText}>
                                            {userName.split(' ').length > 1
                                                ? (userName.split(' ')[0][0] + userName.split(' ')[userName.split(' ').length - 1][0]).toUpperCase()
                                                : userName[0].toUpperCase()}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        )}
                        <View style={styles.headerText}>
                            <Text style={styles.greetingText}>{getGreeting()}</Text>
                            {isInitialLoading ? (
                                <SkeletonText width={120} height={20} />
                            ) : (
                                <Text style={styles.userName}>{userName}</Text>
                            )}
                        </View>
                    </View>
                    <TouchableOpacity
                        style={styles.notificationButton}
                        onPress={() => navigation.navigate('Notifications')}
                    >
                        <BellIcon size={24} color="#EBEBF5" />
                        {unreadCount > 0 && (
                            <View style={styles.notificationBadge}>
                                <Text style={styles.notificationBadgeText}>
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Streak Banner - Only show when streak > 0 */}
                {currentStreak > 0 && (
                    <View style={styles.streakBanner}>
                        <FireIcon size={22} color="#FFC400" />
                        <Text style={styles.streakText}>{currentStreak} dias de sequência!</Text>
                    </View>
                )}

                {/* Retrospective Card - Show when ready */}
                {retrospectiveReady && (
                    <TouchableOpacity
                        style={styles.retrospectiveCard}
                        onPress={() => navigation.navigate('Retrospective')}
                    >
                        <View style={styles.retrospectiveContent}>
                            <View style={styles.retrospectiveBadge}>
                                <MaterialCommunityIcons name="trophy" size={18} color="#00D4FF" />
                            </View>
                            <View style={styles.retrospectiveText}>
                                <Text style={styles.retrospectiveTitle}>Sua retrospectiva está pronta!</Text>
                                <Text style={styles.retrospectiveSubtitle}>Veja como foi seu desempenho no ciclo</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={24} color="#00D4FF" />
                        </View>
                    </TouchableOpacity>
                )}

                {/* Level Card */}
                <View style={styles.levelCard}>
                    <View style={styles.levelHeader}>
                        <View style={styles.eliteBadge}>
                            <Text style={styles.eliteBadgeText}>Elite status</Text>
                        </View>
                        <View style={styles.diamondIcon}>
                            <Text style={styles.diamondEmoji}>💎</Text>
                        </View>
                    </View>

                    <Text style={styles.levelTitle}>Nível {currentLevel}</Text>

                    <View style={styles.levelProgressRow}>
                        <CircularProgress
                            percentage={progress}
                            size={70}
                            strokeWidth={6}
                            color={colors.primary}
                            backgroundColor={colors.border}
                        />
                        <View style={styles.levelInfo}>
                            <View style={styles.xpRow}>
                                <Text style={styles.xpLabel}>Current XP</Text>
                                <Text style={styles.xpValue}>
                                    {totalPoints}<Text style={styles.xpTotal}> / {pointsToNext}</Text>
                                </Text>
                            </View>
                            <View style={styles.horizontalProgressBar}>
                                <View style={[styles.horizontalProgressFill, { width: `${progress}%` }]} />
                            </View>
                            <Text style={styles.xpNextGoal}>
                                {pointsToNext - totalPoints} XP para desbloquear plano <Text style={styles.xpBold}>Maratona</Text>
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Recovery Card - Show when it's a recovery day */}
                {isRecoveryDay && (
                    <View style={styles.recoveryCard}>
                        <View style={styles.recoveryHeader}>
                            <View style={styles.recoveryBadge}>
                                <BedIcon size={16} color="#A78BFA" />
                                <Text style={styles.recoveryBadgeText}>Dia de Descanso</Text>
                            </View>
                            <MoonIcon size={30} color="#A78BFA" />
                        </View>

                        <Text style={styles.recoveryTitle}>Recuperação Ativa</Text>
                        <Text style={styles.recoverySubtitle}>
                            Seu corpo está se recuperando. Descanse bem para o próximo treino!
                        </Text>

                        {/* Countdown Timer */}
                        <View style={styles.recoveryTimerContainer}>
                            <Text style={styles.recoveryTimerLabel}>Tempo restante hoje</Text>
                            <View style={styles.recoveryTimer}>
                                <View style={styles.timerUnit}>
                                    <Text style={styles.timerValue}>{formatTimeUnit(recoveryTimeLeft.hours)}</Text>
                                    <Text style={styles.timerLabel}>horas</Text>
                                </View>
                                <Text style={styles.timerSeparator}>:</Text>
                                <View style={styles.timerUnit}>
                                    <Text style={styles.timerValue}>{formatTimeUnit(recoveryTimeLeft.minutes)}</Text>
                                    <Text style={styles.timerLabel}>min</Text>
                                </View>
                                <Text style={styles.timerSeparator}>:</Text>
                                <View style={styles.timerUnit}>
                                    <Text style={styles.timerValue}>{formatTimeUnit(recoveryTimeLeft.seconds)}</Text>
                                    <Text style={styles.timerLabel}>seg</Text>
                                </View>
                            </View>
                        </View>

                        {/* Recovery Progress Bar */}
                        <View style={styles.recoveryProgressContainer}>
                            <View style={styles.recoveryProgressBar}>
                                <View style={[styles.recoveryProgressFill, { width: `${recoveryProgress}%` }]} />
                            </View>
                            <Text style={styles.recoveryProgressText}>
                                {Math.round(recoveryProgress)}% do dia concluído
                            </Text>
                        </View>

                        {/* Next Workout Preview (secondary) */}
                        {nextWorkout && (
                            <View style={styles.nextWorkoutPreview}>
                                <CalendarSmallIcon size={16} color="rgba(235, 235, 245, 0.6)" />
                                <Text style={styles.nextWorkoutPreviewText}>
                                    Próximo: <Text style={styles.nextWorkoutPreviewBold}>
                                        {getWorkoutTypeName(nextWorkout.type)}
                                    </Text> - {formatWorkoutDate(nextWorkout.scheduled_date)}
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                {/* Workout Card - Show when it's NOT a recovery day and there's a workout to show */}
                {!isRecoveryDay && mainWorkout && (
                    <View key={`main-workout-${mainWorkout.id || mainWorkout.scheduled_date}`} style={styles.workoutCard}>
                        <View style={styles.workoutHeader}>
                            <View style={styles.proximoBadge}>
                                <View style={[styles.proximoDot, hasTodayWorkout && { backgroundColor: '#00D4FF' }]} />
                                <Text style={styles.proximoText}>{hasTodayWorkout ? 'Hoje' : 'Próximo'}</Text>
                            </View>
                            <View style={styles.runnerIcon}>
                                <RunningIcon size={30} color="#00D4FF" />
                            </View>
                        </View>

                        <Text style={styles.workoutTitle}>{getWorkoutTypeName(mainWorkout.type)}</Text>
                        <View style={styles.workoutTimeRow}>
                            <CalendarSmallIcon size={16} />
                            <Text style={styles.workoutTime}>{formatWorkoutDate(mainWorkout.scheduled_date)}</Text>
                        </View>

                        <View style={styles.workoutStats}>
                            <View style={styles.statBox}>
                                <View style={styles.statHeader}>
                                    <DistanceIcon size={18} color="#00D4FF" />
                                    <Text style={styles.statLabel}>Distância</Text>
                                </View>
                                <Text style={styles.statValue}>
                                    {mainWorkout.distance_km.toFixed(1)} <Text style={styles.statUnit}>km</Text>
                                </Text>
                            </View>
                            <View style={styles.statBox}>
                                <View style={styles.statHeader}>
                                    <PaceIcon size={18} color="#00D4FF" />
                                    <Text style={styles.statLabel}>Pace</Text>
                                </View>
                                <Text style={styles.statValue}>
                                    {getWorkoutPace(mainWorkout)} <Text style={styles.statUnit}>/km</Text>
                                </Text>
                            </View>
                        </View>


                        <TouchableOpacity
                            style={[
                                styles.startButton,
                                !isButtonEnabled && styles.startButtonDisabled
                            ]}
                            onPress={handleStartWorkout}
                            disabled={!isButtonEnabled}
                        >
                            <ShoeIcon size={24} color={isButtonEnabled ? "#0E0E1F" : "#6B7280"} />
                            <Text style={[
                                styles.startButtonText,
                                !isButtonEnabled && styles.startButtonTextDisabled
                            ]}>
                                {isButtonEnabled ? 'Iniciar Treino' : hasTodayWorkout ? 'Treino Concluído' : 'Disponível ' + formatWorkoutDate(mainWorkout.scheduled_date)}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* No Workout Card - Only show if no recovery and no workout */}
                {
                    !mainWorkout && !isRecoveryDay && (
                        <View style={styles.workoutCard}>
                            <View style={styles.lockedContent}>
                                <RunningIcon size={48} color="#6B7280" />
                                <Text style={styles.lockedText}>Nenhum treino agendado</Text>
                            </View>
                        </View>
                    )
                }

                {/* AI Analysis Card */}
                <View style={styles.aiCard}>
                    {latestActivityLoading ? (
                        <View style={styles.aiLoadingContainer}>
                            <Skeleton width="50%" height={20} style={{ marginBottom: 8 }} />
                            <Skeleton width="30%" height={14} style={{ marginBottom: 16 }} />
                            <Skeleton width="40%" height={36} style={{ marginBottom: 8 }} />
                            <Skeleton width="60%" height={24} />
                        </View>
                    ) : latestActivity?.activity ? (
                        <>
                            <View style={styles.aiHeader}>
                                <View>
                                    <Text style={styles.aiTitle}>Análise do Treinador</Text>
                                    <Text style={styles.aiSubtitle}>
                                        {latestActivity.activity.name || 'Corrida'} - {latestActivity.activity.date_label}
                                    </Text>
                                </View>
                                <BinocularsIcon size={35} color="#00D4FF" />
                            </View>

                            <View style={styles.aiStats}>
                                <View style={styles.aiPaceSection}>
                                    <Text style={styles.aiPace}>
                                        {latestActivity.activity.formatted_pace} <Text style={styles.aiPaceUnit}>km</Text>
                                    </Text>
                                    <View style={styles.efficiencyBadge}>
                                        <TrendUpIcon size={18} color={latestActivity.efficiency_percent >= 0 ? "#32CD32" : "#FF6B6B"} />
                                        <Text style={[
                                            styles.efficiencyText,
                                            { color: latestActivity.efficiency_percent >= 0 ? "#32CD32" : "#FF6B6B" }
                                        ]}>
                                            {latestActivity.efficiency_percent >= 0 ? '+' : ''}{latestActivity.efficiency_percent}% EFICIENTE
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.miniChart}>
                                    <View style={[styles.bar, { height: 20 }]} />
                                    <View style={[styles.bar, { height: 28 }]} />
                                    <View style={[styles.bar, { height: 24 }]} />
                                    <View style={[styles.barActive, { height: 40 }]} />
                                    <View style={[styles.bar, { height: 32 }]} />
                                    <View style={[styles.barActive, { height: 48 }]} />
                                </View>
                            </View>

                            <TouchableOpacity
                                style={styles.feedbackButton}
                                onPress={() => navigation.navigate('CoachAnalysis', {
                                    activityId: latestActivity.activity?.id,
                                    feedbackId: latestActivity.feedback?.id,
                                })}
                            >
                                <Text style={styles.feedbackButtonText}>Ver feedback completo</Text>
                                <ArrowRightIcon size={18} color="#00D4FF" />
                            </TouchableOpacity>


                        </>
                    ) : hasCompletedWorkouts ? (
                        <>
                            <View style={styles.aiHeader}>
                                <View>
                                    <Text style={styles.aiTitle}>Análise do Treinador</Text>
                                    <Text style={styles.aiSubtitle}>Carregando dados...</Text>
                                </View>
                                <BinocularsIcon size={35} color="#00D4FF" />
                            </View>
                        </>
                    ) : (
                        <View style={styles.lockedContainer}>
                            <View style={styles.aiHeader}>
                                <View>
                                    <Text style={styles.aiTitle}>Análise do Treinador</Text>
                                    <Text style={styles.aiSubtitle}>Funcionalidade bloqueada</Text>
                                </View>
                                <LockIcon size={35} color="#6B7280" />
                            </View>
                            <View style={styles.lockedContent}>
                                <LockIcon size={48} color="#6B7280" />
                                <Text style={styles.lockedText}>
                                    Complete o primeiro treino para desbloquear
                                </Text>
                            </View>
                        </View>
                    )}
                </View>
            </ScrollView>


        </ScreenContainer >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollView: {
        flex: 1,
    },
    content: {
        paddingHorizontal: spacing.lg,
        paddingBottom: 120,
        gap: spacing.lg,
    },

    // Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: spacing.lg,
        paddingBottom: spacing.md,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    profileImage: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 2,
        borderColor: colors.primary,
    },
    profileImageInitials: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 2,
        borderColor: colors.primary,
        backgroundColor: '#1C1C2E',
        justifyContent: 'center',
        alignItems: 'center',
    },
    profileInitialsText: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.primary,
        textTransform: 'uppercase',
    },
    headerText: {
        gap: 2,
    },
    greetingText: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
    },
    userName: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    notificationButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.card,
        justifyContent: 'center',
        alignItems: 'center',
    },
    bellIcon: {
        fontSize: 20,
    },
    notificationBadge: {
        position: 'absolute',
        top: -2,
        right: -2,
        backgroundColor: '#FF3B30',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    notificationBadgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: 'bold' as any,
    },

    // Streak Banner
    streakBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: 'rgba(139, 119, 42, 0.3)',
        borderWidth: 1,
        borderColor: 'rgba(179, 152, 45, 0.6)',
        borderRadius: borderRadius['2xl'],
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
    },
    streakText: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFC400',
    },

    // Level Card
    levelCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        gap: spacing.md,
    },
    levelHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    eliteBadge: {
        backgroundColor: `${colors.primary}20`,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.md,
    },
    eliteBadgeText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.semibold as any,
        color: colors.primary,
    },
    diamondIcon: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    diamondEmoji: {
        fontSize: 24,
    },
    levelTitle: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    levelProgressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
    },
    levelInfo: {
        flex: 1,
        gap: spacing.xs,
    },
    xpRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: spacing.sm,
    },
    xpLabel: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    xpValue: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    xpTotal: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.normal as any,
        color: colors.textMuted,
    },
    xpNextGoal: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    xpBold: {
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    horizontalProgressBar: {
        height: 6,
        backgroundColor: colors.border,
        borderRadius: 3,
        overflow: 'hidden',
    },
    horizontalProgressFill: {
        height: '100%',
        backgroundColor: colors.primary,
        borderRadius: 3,
    },

    // Recovery Card
    recoveryCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        gap: spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(167, 139, 250, 0.3)',
    },
    recoveryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    recoveryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: 'rgba(167, 139, 250, 0.2)',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.full,
    },
    recoveryBadgeText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.semibold as any,
        color: '#A78BFA',
    },
    recoveryTitle: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    recoverySubtitle: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        lineHeight: 20,
    },
    recoveryTimerContainer: {
        alignItems: 'center',
        paddingVertical: spacing.md,
    },
    recoveryTimerLabel: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        marginBottom: spacing.sm,
    },
    recoveryTimer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    timerUnit: {
        alignItems: 'center',
    },
    timerValue: {
        fontSize: 32,
        fontWeight: typography.fontWeights.bold as any,
        color: '#A78BFA',
        fontVariant: ['tabular-nums'],
    },
    timerLabel: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    timerSeparator: {
        fontSize: 28,
        fontWeight: typography.fontWeights.bold as any,
        color: '#A78BFA',
        marginBottom: 16,
    },
    recoveryProgressContainer: {
        gap: spacing.sm,
    },
    recoveryProgressBar: {
        height: 8,
        backgroundColor: 'rgba(167, 139, 250, 0.2)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    recoveryProgressFill: {
        height: '100%',
        backgroundColor: '#A78BFA',
        borderRadius: 4,
    },
    recoveryProgressText: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    nextWorkoutPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: '#0E0E1F',
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginTop: spacing.sm,
    },
    nextWorkoutPreviewText: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
    },
    nextWorkoutPreviewBold: {
        fontWeight: typography.fontWeights.semibold as any,
        color: colors.text,
    },

    // Workout Card
    workoutCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        gap: spacing.md,
    },
    workoutHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    proximoBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: `${colors.primary}20`,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.full,
    },
    proximoDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.primary,
    },
    proximoText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.semibold as any,
        color: colors.primary,
    },
    runnerIcon: {
        width: 40,
        height: 40,
        borderRadius: borderRadius.lg,
        backgroundColor: colors.highlight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    runnerEmoji: {
        fontSize: 24,
    },
    workoutTitle: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    workoutTime: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
    },
    workoutTimeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    workoutStats: {
        flexDirection: 'row',
        gap: spacing.md,
        marginTop: spacing.sm,
    },
    statBox: {
        flex: 1,
        backgroundColor: '#0E0E1F',
        borderRadius: borderRadius.xl,
        padding: spacing.md,
        gap: spacing.sm,
    },
    statHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    statIcon: {
        fontSize: 14,
    },
    statLabel: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    statValue: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    statUnit: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.normal as any,
        color: colors.textMuted,
    },
    startButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.primary,
        borderRadius: borderRadius.xl,
        paddingVertical: spacing.md,
        marginTop: spacing.sm,
        ...shadows.neon,
    },
    startButtonDisabled: {
        backgroundColor: '#2A2A3E',
        opacity: 0.7,
        shadowOpacity: 0,
        elevation: 0,
    },
    startIcon: {
        fontSize: 18,
    },
    startButtonText: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#0A0A18',
    },
    startButtonTextDisabled: {
        color: '#6B7280',
    },

    // AI Card
    aiCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        gap: spacing.lg,
    },
    aiLoadingContainer: {
        padding: spacing.md,
    },
    aiHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    aiTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    aiSubtitle: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        marginTop: 2,
    },
    aiIcon: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    aiEmoji: {
        fontSize: 24,
    },
    aiStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    aiPaceSection: {
        gap: spacing.sm,
    },
    aiPace: {
        fontSize: typography.fontSizes['3xl'],
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    aiPaceUnit: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.normal as any,
        color: colors.textMuted,
    },
    efficiencyBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: `${colors.success}20`,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.md,
        alignSelf: 'flex-start',
    },
    efficiencyIcon: {
        fontSize: 12,
    },
    efficiencyText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.bold as any,
        color: colors.success,
    },
    miniChart: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 6,
        height: 48,
    },
    bar: {
        width: 8,
        backgroundColor: colors.border,
        borderRadius: 4,
    },
    barActive: {
        width: 8,
        backgroundColor: colors.primary,
        borderRadius: 4,
        ...(Platform.OS === 'web' ? {
            boxShadow: '0 0 8px rgba(0, 212, 255, 0.4)'
        } : {}),
    },
    feedbackButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.cardDark,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
    },
    feedbackButtonText: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.medium as any,
        color: colors.textLight,
    },
    feedbackArrow: {
        fontSize: typography.fontSizes.lg,
        color: colors.accent,
    },
    // Locked state styles
    lockedContainer: {
        width: '100%',
    },
    lockedContent: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.xl,
        gap: spacing.md,
    },
    lockedText: {
        fontSize: typography.fontSizes.sm,
        color: '#6B7280',
        textAlign: 'center' as const,
    },
    // Retrospective Card
    retrospectiveCard: {
        backgroundColor: 'rgba(0, 212, 255, 0.08)',
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.3)',
        padding: spacing.md,
        marginBottom: spacing.md,
    },
    retrospectiveContent: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
    },
    retrospectiveBadge: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0, 212, 255, 0.15)',
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginRight: spacing.md,
    },
    retrospectiveText: {
        flex: 1,
    },
    retrospectiveTitle: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.semibold as any,
        color: colors.textLight,
        marginBottom: 2,
    },
    retrospectiveSubtitle: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
    },
    floatingFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        // Optional: gradient background fade if needed, but transparent with just button is ok relative to Tab Bar.
        // Actually, TabBar has a background. If button floats above it, it overlaps page content.
    },
    floatingStartButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: '#00D4FF',
        paddingVertical: 16,
        paddingHorizontal: spacing.xl,
        borderRadius: 32,
        shadowColor: '#00D4FF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
    },
});
