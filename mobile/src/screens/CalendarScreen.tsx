import React, { useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    Animated,
    Modal,
    Platform,
    Dimensions,
    Linking,
    Alert,
    PanResponder,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { useTrainingStore, useStatsStore, ScheduleDay } from '../stores';
import { ScreenContainer } from '../components/ScreenContainer';

// Icon components using @expo/vector-icons
function BackIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <Ionicons name="chevron-back" size={size} color={color} />;
}

function BellIcon({ size = 24, color = '#EBEBF5' }: { size?: number; color?: string }) {
    return <Ionicons name="notifications" size={size} color={color} />;
}

function CheckIcon({ size = 16, color = '#32CD32' }: { size?: number; color?: string }) {
    return <Ionicons name="checkmark" size={size} color={color} />;
}

function XIcon({ size = 14, color = '#FF4444' }: { size?: number; color?: string }) {
    return <Ionicons name="close" size={size} color={color} />;
}

function BoltIcon({ size = 14, color = '#A78BFA' }: { size?: number; color?: string }) {
    return <Ionicons name="flash" size={size} color={color} />;
}

function MoonIcon({ size = 48, color = '#A78BFA' }: { size?: number; color?: string }) {
    return <Ionicons name="moon" size={size} color={color} />;
}

function TimerIcon({ size = 18, color = '#EBEBF5' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="timer-outline" size={size} color={color} />;
}

function PaceClockIcon({ size = 18, color = '#EBEBF5' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="speedometer" size={size} color={color} />;
}

function ArrowRightIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <Ionicons name="arrow-forward" size={size} color={color} />;
}

function ProximoIcon({ size = 47 }: { size?: number }) {
    return (
        <View style={{ width: size, height: size, borderRadius: 10, backgroundColor: 'rgba(0,127,153,0.5)', borderWidth: 1, borderColor: '#00D4FF', justifyContent: 'center', alignItems: 'center' }}>
            <MaterialCommunityIcons name="run" size={size * 0.55} color="#00D4FF" />
        </View>
    );
}

function DistanceIcon({ size = 20, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="map-marker-distance" size={size} color={color} />;
}

function RPEIcon({ size = 20, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="heart-pulse" size={size} color={color} />;
}

function ClockOutlineIcon({ size = 20, color = 'rgba(235,235,245,0.6)' }: { size?: number; color?: string }) {
    return <Ionicons name="time-outline" size={size} color={color} />;
}

function RunnerWarmupIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="walk" size={size} color={color} />;
}

function RunnerSprintIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="run-fast" size={size} color={color} />;
}

function CooldownIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="yoga" size={size} color={color} />;
}

function IdeaIcon({ size = 24, color = '#FFD700' }: { size?: number; color?: string }) {
    return <Ionicons name="bulb" size={size} color={color} />;
}

function RunFastIcon({ size = 30, color = '#0E0E1F' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="run-fast" size={size} color={color} />;
}

function CloseIcon({ size = 24, color = '#EBEBF5' }: { size?: number; color?: string }) {
    return <Ionicons name="close" size={size} color={color} />;
}

function LockIcon({ size = 60, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <Ionicons name="lock-closed" size={size} color={color} />;
}

// Workout data interface
interface WorkoutBlock {
    id: string;
    title: string;
    subtitle: string;
    type: 'warmup' | 'main' | 'cooldown';
    duration?: string;
    description?: string;
    pace?: string;
    recovery?: string;
}

interface WorkoutData {
    id: string;
    title: string;
    distance: string;
    duration: string;
    rpe: string;
    blocks: WorkoutBlock[];
    insight: string;
}

// Mock workout data for testing modal
const mockWorkoutData: WorkoutData = {
    id: '1',
    title: 'Intervalados - 8x400m',
    distance: '8.5 km',
    duration: '55 min',
    rpe: 'RPE 7/10',
    blocks: [
        {
            id: '1',
            title: 'Aquecimento',
            subtitle: 'Bloco 01',
            type: 'warmup',
            duration: '10 min',
            description: 'Trote leve z1/z2 para ativar',
        },
        {
            id: '2',
            title: 'Tiros de 400m',
            subtitle: 'Bloco 02 - PRINCIPAL',
            type: 'main',
            duration: '8x400m',
            description: 'Ritmo forte, focado na técnica',
            pace: '3:45/km',
            recovery: 'Recuperação 1:30 min\nTrote ou caminhada leve',
        },
        {
            id: '3',
            title: 'Desaquecimento',
            subtitle: 'Bloco 03',
            type: 'cooldown',
            duration: '10 min',
            description: 'Trote muito leve + alongamento estático.',
        },
    ],
    insight: 'Você descansou bem ontem. Sua prontidão está alta. Tente focar em aumentar a cadência nos últimos 2 tiros quando o cansaço bater.',
};

export function CalendarScreen({ navigation }: any) {
    const { workouts, fetchWorkouts, upcomingWorkouts, fetchUpcomingWorkouts, plan, fetchPlan, generationStatus, checkPlanStatus, schedule, today, nextWorkout: storeNextWorkout, fetchSchedule } = useTrainingStore();
    const { summary, fetchSummary } = useStatsStore();
    const [selectedDate, setSelectedDate] = React.useState(new Date().getDate());
    const [currentMonth, setCurrentMonth] = React.useState(new Date());
    const [isScheduleLocked, setIsScheduleLocked] = React.useState(false);

    // Modal states
    const [modalVisible, setModalVisible] = React.useState(false);
    const [selectedWorkout, setSelectedWorkout] = React.useState<WorkoutData | null>(null);
    const [showStartButton, setShowStartButton] = React.useState(false);
    const lastClickedDate = React.useRef<number | null>(null);
    const lastClickTime = React.useRef<number>(0);
    const modalSlideAnim = React.useRef(new Animated.Value(0)).current;
    const panY = React.useRef(new Animated.Value(0)).current;
    const pollingInterval = React.useRef<NodeJS.Timeout | null>(null);

    const DOUBLE_CLICK_DELAY = 400; // ms
    const POLLING_INTERVAL = 3000; // 3 seconds
    const SCREEN_HEIGHT = Dimensions.get('window').height;
    const DISMISS_THRESHOLD = 150;

    // PanResponder for drag-to-dismiss
    const panResponder = React.useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return gestureState.dy > 0; // Only respond to downward drags
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    panY.setValue(gestureState.dy);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > DISMISS_THRESHOLD) {
                    // Close modal
                    closeModal();
                } else {
                    // Snap back
                    Animated.spring(panY, {
                        toValue: 0,
                        useNativeDriver: true,
                        tension: 100,
                        friction: 10,
                    }).start();
                }
            },
        })
    ).current;

    // Fetch plan on mount
    React.useEffect(() => {
        fetchPlan();
    }, []);

    // Check if schedule is locked based on generation status
    React.useEffect(() => {
        const isLocked = generationStatus === 'partial' || generationStatus === 'generating';
        setIsScheduleLocked(isLocked);

        // Start polling if locked
        if (isLocked && plan?.id) {
            pollingInterval.current = setInterval(async () => {
                const isComplete = await checkPlanStatus(plan.id);
                if (isComplete) {
                    setIsScheduleLocked(false);
                    if (pollingInterval.current) {
                        clearInterval(pollingInterval.current);
                        pollingInterval.current = null;
                    }
                }
            }, POLLING_INTERVAL);
        }

        return () => {
            if (pollingInterval.current) {
                clearInterval(pollingInterval.current);
                pollingInterval.current = null;
            }
        };
    }, [generationStatus, plan?.id]);

    React.useEffect(() => {
        const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
        fetchSchedule(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
        fetchWorkouts(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
        fetchUpcomingWorkouts();
        fetchSummary();
    }, [currentMonth]);

    // Helper: Transform API workout to UI WorkoutData format
    const transformWorkoutToUI = (workout: any): WorkoutData => {
        const blocks: WorkoutBlock[] = (workout.instructions_json || []).map((segment: any, index: number) => ({
            id: String(index + 1),
            title: segment.type === 'warmup' ? 'Aquecimento' : segment.type === 'cooldown' ? 'Desaquecimento' : 'Principal',
            subtitle: `Bloco ${String(index + 1).padStart(2, '0')}${segment.type === 'main' ? ' - PRINCIPAL' : ''}`,
            type: segment.type,
            duration: `${segment.distance_km} km`,
            description: segment.type === 'warmup'
                ? 'Trote leve z1/z2 para ativar'
                : segment.type === 'cooldown'
                    ? 'Trote muito leve + alongamento estático.'
                    : 'Ritmo forte, focado na técnica',
            pace: segment.pace_min && segment.pace_max
                ? `${segment.pace_min.toFixed(0)}:${((segment.pace_min % 1) * 60).toFixed(0).padStart(2, '0')}/km`
                : undefined,
        }));

        const workoutTypeLabels: Record<string, string> = {
            'easy_run': 'Rodagem Leve',
            'long_run': 'Longão',
            'intervals': 'Intervalados',
            'tempo': 'Tempo Run',
            'recovery': 'Recuperação',
        };

        return {
            id: workout.id,
            title: `${workoutTypeLabels[workout.type] || workout.type} - ${workout.distance_km}km`,
            distance: `${workout.distance_km} km`,
            duration: `${Math.round(workout.distance_km * 6)} min`, // Estimate based on 6 min/km
            rpe: 'RPE 6/10',
            blocks,
            insight: workout.objective || 'Mantenha o foco e aproveite o treino!'
        };
    };

    // Helper: Find workout for a specific day
    const getWorkoutForDay = (day: number) => {
        const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return workouts.find(w => w.scheduled_date === dateStr);
    };

    // Handle day press with double-click detection
    const handleDayPress = (day: number) => {
        const now = Date.now();
        const timeDiff = now - lastClickTime.current;

        if (lastClickedDate.current === day && timeDiff < DOUBLE_CLICK_DELAY) {
            // Double click detected - open modal without start button
            openWorkoutModal(day, false);
        } else {
            // Single click - select the day
            setSelectedDate(day);
        }

        lastClickedDate.current = day;
        lastClickTime.current = now;
    };

    // Open workout modal
    const openWorkoutModal = (day: number, withStartButton: boolean = false) => {
        const workout = getWorkoutForDay(day);
        if (workout) {
            setSelectedWorkout(transformWorkoutToUI(workout));
            setShowStartButton(withStartButton);
            setModalVisible(true);
            Animated.spring(modalSlideAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 65,
                friction: 11,
            }).start();
        }
    };

    // Close modal
    const closeModal = () => {
        Animated.timing(modalSlideAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            setModalVisible(false);
            setSelectedWorkout(null);
            panY.setValue(0); // Reset pan position
            setShowStartButton(false);
        });
    };

    // Handle next workout card press (without start button)
    const handleNextWorkoutPress = () => {
        if (upcomingWorkouts.length > 1) {
            setSelectedWorkout(transformWorkoutToUI(upcomingWorkouts[1]));
            setShowStartButton(false);
            setModalVisible(true);
            Animated.spring(modalSlideAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 65,
                friction: 11,
            }).start();
        }
    };

    // Handle today's workout card press (with start button)
    const handleTodayWorkoutPress = () => {
        if (upcomingWorkouts.length > 0) {
            setSelectedWorkout(transformWorkoutToUI(upcomingWorkouts[0]));
            setShowStartButton(true);
            setModalVisible(true);
            Animated.spring(modalSlideAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 65,
                friction: 11,
            }).start();
        }
    };

    // DEBUG: Force open modal with mock data for testing
    const handleTestModalPress = () => {
        setSelectedWorkout(mockWorkoutData);
        setShowStartButton(true);
        setModalVisible(true);
        Animated.spring(modalSlideAnim, {
            toValue: 1,
            useNativeDriver: true,
            tension: 65,
            friction: 11,
        }).start();
    };

    const getDaysInMonth = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const days = [];
        for (let i = 0; i < firstDay; i++) {
            days.push(null);
        }
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(i);
        }
        return days;
    };

    // Get workout status for a day based on API schedule data
    const getScheduleForDay = (day: number): ScheduleDay | null => {
        const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return schedule.find(s => s.date === dateStr) || null;
    };

    // Get workout status for a day based on API data
    // Returns null for days outside plan period (no icon rendered)
    const getWorkoutStatus = (day: number | null): 'completed' | 'missed' | 'planned' | 'recovery' | null => {
        if (!day) return null;
        const scheduleDay = getScheduleForDay(day);
        if (!scheduleDay) return null;

        // Days outside plan period have type: null - don't render any icon
        if (scheduleDay.type === null) return null;

        if (scheduleDay.type === 'recovery') return 'recovery';
        if (scheduleDay.status === 'completed') return 'completed';
        if (scheduleDay.status === 'missed') return 'missed';
        if (scheduleDay.status === 'pending') return 'planned';
        return null;
    };

    // Get today's data from API schedule (authoritative source)
    const todaySchedule = today;
    const isTodayWithinPlan = todaySchedule?.type !== null && todaySchedule?.type !== undefined;
    const isTodayRecovery = todaySchedule?.type === 'recovery';
    const todayWorkout = todaySchedule?.type === 'workout' ? todaySchedule.workout : null;
    // Next workout from API (always type: 'workout')
    const nextWorkout = storeNextWorkout;

    // Calculate total volume and frequency
    const totalVolume = workouts.reduce((sum, w) => sum + (w.distance_km || 0), 0);
    const completedCount = workouts.filter(w => w.status === 'completed').length;
    const totalCount = workouts.length;

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    const days = getDaysInMonth();

    return (
        <ScreenContainer>
            {/* Locked State Overlay */}
            {isScheduleLocked && (
                <View style={styles.lockedOverlay}>
                    <View style={styles.lockedContent}>
                        <LockIcon size={80} color="#00D4FF" />
                        <Text style={styles.lockedTitle}>Cronograma em Preparação</Text>
                        <Text style={styles.lockedMessage}>
                            Aguarde alguns instantes até que seu cronograma de treino fique completo.
                        </Text>
                        <View style={styles.lockedLoadingDots}>
                            <View style={[styles.loadingDot, styles.loadingDot1]} />
                            <View style={[styles.loadingDot, styles.loadingDot2]} />
                            <View style={[styles.loadingDot, styles.loadingDot3]} />
                        </View>
                    </View>
                </View>
            )}

            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                    >
                        <BackIcon size={24} color="#00D4FF" />
                    </TouchableOpacity>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerSubtitle}>Agenda</Text>
                        <Text style={styles.headerTitle}>Calendário</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.notificationButton}
                        onPress={() => navigation.navigate('Notifications')}
                    >
                        <BellIcon size={24} color="#EBEBF5" />
                    </TouchableOpacity>
                </View>

                {/* Stats Bar */}
                <View style={styles.statsBar}>
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>Volume</Text>
                        <View style={styles.statValueRow}>
                            <Text style={styles.statValue}>{Math.round(summary?.total_distance_km || 0)}</Text>
                            <Text style={styles.statUnit}> km</Text>
                        </View>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>Frequência</Text>
                        <View style={styles.statValueRow}>
                            <Text style={styles.statValue}>{summary?.total_runs || 0}</Text>
                            <Text style={styles.statUnitMuted}> dias</Text>
                        </View>
                    </View>
                </View>

                {/* Month Selector */}
                <View style={styles.monthSelector}>
                    <Text style={styles.monthTitle}>
                        {monthNames[currentMonth.getMonth()]} <Text style={styles.yearText}>{currentMonth.getFullYear()}</Text>
                    </Text>
                    <View style={styles.monthNav}>
                        <TouchableOpacity
                            style={styles.monthNavButton}
                            onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                        >
                            <Ionicons name="chevron-back" size={20} color="rgba(235, 235, 245, 0.8)" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.monthNavButton}
                            onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                        >
                            <Ionicons name="chevron-forward" size={20} color="rgba(235, 235, 245, 0.8)" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Calendar Grid */}
                <View style={styles.calendarContainer}>
                    {/* Week days header */}
                    <View style={styles.weekDaysRow}>
                        {weekDays.map((day, i) => (
                            <Text key={i} style={styles.weekDayText}>{day}</Text>
                        ))}
                    </View>

                    {/* Days grid */}
                    <View style={styles.daysGrid}>
                        {days.map((day, index) => {
                            const workoutStatus = getWorkoutStatus(day);
                            const isSelected = day === selectedDate;

                            return (
                                <TouchableOpacity
                                    key={index}
                                    style={styles.dayCell}
                                    onPress={() => day && handleDayPress(day)}
                                    disabled={!day}
                                >
                                    {day ? (
                                        <View style={[
                                            styles.dayContent,
                                            isSelected && styles.daySelected,
                                        ]}>
                                            <Text style={[
                                                styles.dayNumber,
                                                isSelected && styles.dayNumberSelected,
                                            ]}>
                                                {day}
                                            </Text>
                                            {/* Workout indicator based on API type/status */}
                                            {workoutStatus === 'completed' && !isSelected && (
                                                <View style={styles.completedIndicator}>
                                                    <CheckIcon size={14} color="#32CD32" />
                                                </View>
                                            )}
                                            {workoutStatus === 'missed' && !isSelected && (
                                                <View style={styles.missedIndicator}>
                                                    <XIcon size={12} color="#FF4444" />
                                                </View>
                                            )}
                                            {workoutStatus === 'recovery' && !isSelected && (
                                                <View style={styles.recoveryIndicator}>
                                                    <BoltIcon size={12} color="#A78BFA" />
                                                </View>
                                            )}
                                            {workoutStatus === 'planned' && !isSelected && (
                                                <View style={styles.plannedIndicator} />
                                            )}
                                        </View>
                                    ) : null}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Legend - inside calendar card */}
                    <View style={styles.legend}>
                        <View style={styles.legendItem}>
                            <View style={styles.legendLine} />
                            <Text style={styles.legendText}>Rodagem</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendLine, styles.legendLineCyan]} />
                            <Text style={styles.legendText}>Intervalado</Text>
                        </View>
                    </View>
                </View>

                {/* Today's Section - Conditional based on API type */}
                <View style={styles.todaySection}>
                    <View style={styles.todaySectionHeader}>
                        <View>
                            <Text style={styles.todayDate}>• Hoje, {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).toUpperCase()}</Text>
                            <Text style={styles.todayTitle}>
                                {!isTodayWithinPlan ? 'Sem Plano Ativo' : isTodayRecovery ? 'Dia de Recuperação' : 'Treinos do dia'}
                            </Text>
                        </View>
                        {isTodayWithinPlan && !isTodayRecovery && todayWorkout && (
                            <View style={styles.totalKm}>
                                <Text style={styles.totalKmValue}>{todayWorkout?.distance_km || 0} <Text style={styles.totalKmUnit}>km</Text></Text>
                                <Text style={styles.totalKmLabel}>total</Text>
                            </View>
                        )}
                    </View>

                    {/* Recovery Card - Shown when type === 'recovery' */}
                    {isTodayRecovery ? (
                        <View style={styles.recoveryCard}>
                            <View style={styles.recoveryCardHeader}>
                                <MoonIcon size={48} color="#A78BFA" />
                                <View style={styles.recoveryCardInfo}>
                                    <Text style={styles.recoveryTitle}>Hoje é dia de Recovery</Text>
                                    <Text style={styles.recoverySubtitle}>
                                        Descanse para maximizar seus ganhos
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.recoveryTips}>
                                <View style={styles.recoveryTipItem}>
                                    <BoltIcon size={16} color="#A78BFA" />
                                    <Text style={styles.recoveryTipText}>Hidrate-se bem</Text>
                                </View>
                                <View style={styles.recoveryTipItem}>
                                    <BoltIcon size={16} color="#A78BFA" />
                                    <Text style={styles.recoveryTipText}>Durma 7-8 horas</Text>
                                </View>
                                <View style={styles.recoveryTipItem}>
                                    <BoltIcon size={16} color="#A78BFA" />
                                    <Text style={styles.recoveryTipText}>Alongamento leve</Text>
                                </View>
                            </View>
                        </View>
                    ) : todayWorkout ? (
                        /* Workout Detail Card - Shown when type === 'workout' */
                        <View style={styles.workoutDetailCard}>
                            {/* Card Top Section */}
                            <View style={styles.cardTopSection}>
                                <View style={styles.workoutDetailHeader}>
                                    <View style={styles.intensityBadge}>
                                        <Text style={styles.intensityText}>
                                            {todayWorkout.type === 'intervals' || todayWorkout.type === 'tempo' ? 'ALTA INTENSIDADE' : 'MODERADO'}
                                        </Text>
                                    </View>
                                    <View style={styles.pendingBadge}>
                                        <View style={styles.pendingDot} />
                                        <Text style={styles.pendingText}>
                                            {todaySchedule?.status === 'completed' ? 'Concluído' : 'Pendente'}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.workoutDetailBody}>
                                    <View style={styles.workoutInfo}>
                                        <Text style={styles.workoutTitle}>
                                            {(() => {
                                                const labels: Record<string, string> = {
                                                    'easy_run': 'Rodagem Leve',
                                                    'long_run': 'Longão',
                                                    'intervals': 'Intervalados',
                                                    'tempo': 'Tempo Run',
                                                    'recovery': 'Recuperação',
                                                };
                                                return `${labels[todayWorkout.type] || todayWorkout.type} - ${todayWorkout.distance_km}km`;
                                            })()}
                                        </Text>
                                        <Text style={styles.workoutDescription}>{todayWorkout.objective || 'Treino do dia'}</Text>
                                        <View style={styles.workoutMetrics}>
                                            <View style={styles.metricItem}>
                                                <TimerIcon size={20} color="#00D4FF" />
                                                <Text style={styles.metricText}>{Math.round(todayWorkout.distance_km * 6)} min</Text>
                                            </View>
                                            <View style={styles.metricItem}>
                                                <PaceClockIcon size={20} color="#00D4FF" />
                                                <Text style={styles.metricText}>
                                                    {todayWorkout.instructions_json?.[0]?.pace_min
                                                        ? `${Math.floor(todayWorkout.instructions_json[0].pace_min)}:${String(Math.round((todayWorkout.instructions_json[0].pace_min % 1) * 60)).padStart(2, '0')} /km`
                                                        : '6:00 /km'}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                    <Image
                                        source={{ uri: 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=100&h=100&fit=crop' }}
                                        style={styles.workoutImage}
                                    />
                                </View>
                            </View>

                            {/* View Details Button - Bottom Section of Card */}
                            <TouchableOpacity
                                style={styles.viewDetailsButton}
                                onPress={handleTodayWorkoutPress}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.viewDetailsText}>Ver detalhes do  treino</Text>
                                <ArrowRightIcon size={20} color="#FFFFFF" />
                            </TouchableOpacity>
                        </View>
                    ) : !isTodayWithinPlan ? (
                        /* No Plan Active - Show informative message */
                        <View style={styles.workoutDetailCard}>
                            <View style={styles.cardTopSection}>
                                <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                    <Ionicons name="calendar-outline" size={40} color="rgba(235, 235, 245, 0.4)" />
                                    <Text style={[styles.workoutTitle, { textAlign: 'center', marginTop: 12 }]}>
                                        Nenhum plano ativo para este período
                                    </Text>
                                    <Text style={[styles.workoutDescription, { textAlign: 'center', marginTop: 8 }]}>
                                        Seu plano de treino já foi concluído ou ainda não começou
                                    </Text>
                                </View>
                            </View>
                        </View>
                    ) : (
                        <View style={styles.workoutDetailCard}>
                            <View style={styles.cardTopSection}>
                                <Text style={[styles.workoutTitle, { textAlign: 'center', paddingVertical: 20 }]}>
                                    Nenhum treino agendado para hoje
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Next Workout Section */}
                    {nextWorkout && (
                        <View style={styles.nextWorkoutSection}>
                            <View style={styles.nextWorkoutDivider} />
                            <Text style={styles.nextWorkoutLabel}>
                                Próximo: {(() => {
                                    const date = new Date(nextWorkout.scheduled_date);
                                    const days = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];
                                    return days[date.getDay()];
                                })()}
                            </Text>
                            <TouchableOpacity
                                style={styles.nextWorkoutCard}
                                onPress={handleNextWorkoutPress}
                                activeOpacity={0.7}
                            >
                                <ProximoIcon size={47} />
                                <View style={styles.nextWorkoutInfo}>
                                    <Text style={styles.nextWorkoutTitle}>
                                        {(() => {
                                            const labels: Record<string, string> = {
                                                'easy_run': 'Rodagem Leve',
                                                'long_run': 'Longão',
                                                'intervals': 'Intervalados',
                                                'tempo': 'Tempo Run',
                                                'recovery': 'Recuperação',
                                            };
                                            return `${labels[nextWorkout.type] || nextWorkout.type} de ${nextWorkout.distance_km}km`;
                                        })()}
                                    </Text>
                                    <Text style={styles.nextWorkoutSubtitle}>
                                        {nextWorkout.type === 'intervals' || nextWorkout.type === 'tempo'
                                            ? 'Corrida de rua - alta intensidade'
                                            : 'Corrida de rua - média intensidade'}
                                    </Text>
                                </View>
                                <ArrowRightIcon size={24} color="rgba(235,235,245,0.3)" />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Workout Details Modal */}
            <Modal
                visible={modalVisible}
                transparent={true}
                animationType="none"
                onRequestClose={closeModal}
            >
                {/* Dark overlay - closes modal on tap */}
                <View style={styles.modalOverlay}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={closeModal}
                    />

                    {/* Modal Content - stops touch propagation */}
                    <Animated.View
                        style={[
                            styles.modalContainer,
                            {
                                transform: [
                                    {
                                        translateY: Animated.add(
                                            modalSlideAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [Dimensions.get('window').height, 0],
                                            }),
                                            panY
                                        )
                                    }
                                ]
                            }
                        ]}
                    >
                        {/* Inner container with flex: 1 */}
                        <View style={styles.modalInnerContainer}>
                            {/* DRAG HANDLE ONLY - PanResponder here */}
                            <View
                                {...panResponder.panHandlers}
                                style={styles.dragHandleArea}
                            >
                                <View style={styles.modalHandle} />
                            </View>

                            {/* Static Header - no PanResponder */}
                            <Text style={styles.modalTitle}>
                                {selectedWorkout?.title || 'Treino do Dia'}
                            </Text>

                            {/* Scrollable Content - captures its own touches */}
                            <ScrollView
                                style={styles.modalScrollView}
                                contentContainerStyle={styles.modalScrollContent}
                                showsVerticalScrollIndicator={false}
                                bounces={false}
                                nestedScrollEnabled={true}
                                onStartShouldSetResponder={() => true}
                                onMoveShouldSetResponder={() => true}
                            >
                                {/* Metrics Badges */}
                                <View style={styles.modalBadges}>
                                    <View style={styles.modalBadge}>
                                        <DistanceIcon size={16} color="#00D4FF" />
                                        <Text style={styles.modalBadgeText}>{selectedWorkout?.distance}</Text>
                                    </View>
                                    <View style={styles.modalBadge}>
                                        <TimerIcon size={16} color="#00D4FF" />
                                        <Text style={styles.modalBadgeText}>{selectedWorkout?.duration}</Text>
                                    </View>
                                    <View style={styles.modalBadge}>
                                        <RPEIcon size={16} color="#00D4FF" />
                                        <Text style={styles.modalBadgeText}>{selectedWorkout?.rpe}</Text>
                                    </View>
                                </View>

                                {/* Workout Blocks */}
                                {selectedWorkout?.blocks.map((block, index) => (
                                    <View
                                        key={block.id}
                                        style={[
                                            styles.workoutBlock,
                                            block.type === 'main' && styles.workoutBlockMain
                                        ]}
                                    >
                                        {/* Block Header */}
                                        <View style={styles.blockHeader}>
                                            <View>
                                                <Text style={[
                                                    styles.blockSubtitle,
                                                    block.type === 'main' && styles.blockSubtitleMain
                                                ]}>
                                                    {block.subtitle}
                                                </Text>
                                                <Text style={styles.blockTitle}>{block.title}</Text>
                                            </View>
                                            {block.type === 'warmup' && <RunnerWarmupIcon size={28} color="#00D4FF" />}
                                            {block.type === 'main' && <RunnerSprintIcon size={28} color="#00D4FF" />}
                                            {block.type === 'cooldown' && <CooldownIcon size={28} color="#00D4FF" />}
                                        </View>

                                        {/* Block Content */}
                                        <View style={styles.blockContent}>
                                            {/* For main block: show duration and pace on same line */}
                                            {block.type === 'main' && block.pace ? (
                                                <>
                                                    <View style={styles.blockDurationPaceRow}>
                                                        <View style={styles.blockDurationWithIcon}>
                                                            <ClockOutlineIcon size={18} color="rgba(235,235,245,0.6)" />
                                                            <Text style={styles.blockDuration}>{block.duration}</Text>
                                                        </View>
                                                        <Text style={styles.blockPace}>{block.pace}</Text>
                                                    </View>
                                                    <Text style={styles.blockDescriptionMain}>{block.description}</Text>
                                                </>
                                            ) : (
                                                <>
                                                    <View style={styles.blockDurationRow}>
                                                        <ClockOutlineIcon size={18} color="rgba(235,235,245,0.6)" />
                                                        <Text style={styles.blockDuration}>{block.duration}</Text>
                                                    </View>
                                                    <Text style={styles.blockDescription}>{block.description}</Text>
                                                </>
                                            )}

                                            {/* Recovery section for main block */}
                                            {block.type === 'main' && block.recovery && (
                                                <View style={styles.blockRecovery}>
                                                    <Text style={styles.blockRecoveryTitle}>Recuperação 1:30 min</Text>
                                                    <Text style={styles.blockRecoveryText}>Trote ou caminhada leve</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                ))}

                                {/* AI Insight Card */}
                                <View style={styles.insightCard}>
                                    <View style={styles.insightHeader}>
                                        <IdeaIcon size={20} color="#FFD700" />
                                        <Text style={styles.insightTitle}>RUNEASY TRAINING INSIGHT</Text>
                                    </View>
                                    <Text style={styles.insightText}>{selectedWorkout?.insight}</Text>
                                </View>

                                {/* Bottom spacing for scroll */}
                                <View style={{ height: showStartButton ? 20 : 40 }} />
                            </ScrollView>

                            {/* Fixed Start Workout Button at bottom */}
                            {showStartButton && (
                                <View style={styles.startWorkoutContainer}>
                                    <TouchableOpacity
                                        style={styles.startWorkoutButton}
                                        onPress={closeModal}
                                        activeOpacity={0.8}
                                    >
                                        <RunFastIcon size={24} color="#0E0E1F" />
                                        <Text style={styles.startWorkoutText}>Começar treino</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    </Animated.View>
                </View>
            </Modal>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A18',
    },
    scrollView: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.md,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    headerSubtitle: {
        fontSize: typography.fontSizes.xs,
        color: '#00D4FF',
        letterSpacing: 1,
    },
    headerTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFFFFF',
    },
    notificationButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statsBar: {
        flexDirection: 'row',
        backgroundColor: '#15152A',
        marginHorizontal: spacing.lg,
        marginVertical: spacing.md,
        borderRadius: borderRadius['2xl'],
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.3)',
        padding: spacing.md,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statDivider: {
        width: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    statLabel: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.6)',
        marginBottom: 4,
    },
    statValueRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    statValue: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFFFFF',
    },
    statUnit: {
        fontSize: typography.fontSizes.sm,
        color: '#00D4FF',
    },
    statUnitMuted: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.4)',
    },
    monthSelector: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.lg,
        marginTop: spacing.md,
    },
    monthTitle: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFFFFF',
    },
    yearText: {
        fontWeight: typography.fontWeights.normal as any,
        color: 'rgba(235, 235, 245, 0.4)',
    },
    monthNav: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    monthNavButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.25)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    chevronIcon: {
        fontSize: 18,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    calendarContainer: {
        backgroundColor: '#1C1C2E',
        marginHorizontal: spacing.md,
        marginBottom: spacing.lg,
        borderRadius: 24,
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.md,
    },
    weekDaysRow: {
        flexDirection: 'row',
        marginBottom: spacing.lg,
    },
    weekDayText: {
        flex: 1,
        textAlign: 'center',
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.4)',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%',
        height: 60,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    dayContent: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 18,
        position: 'relative',
    },
    daySelected: {
        backgroundColor: '#00D4FF',
        width: 40,
        height: 56,
        borderRadius: 20,
    },
    dayNumber: {
        fontSize: 16,
        color: 'rgba(235, 235, 245, 0.8)',
    },
    dayNumberSelected: {
        fontWeight: typography.fontWeights.bold as any,
        color: '#0A0A18',
    },
    completedIndicator: {
        position: 'absolute',
        bottom: -8,
    },
    plannedIndicator: {
        position: 'absolute',
        bottom: -8,
        width: 20,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: '#00D4FF',
    },
    missedIndicator: {
        position: 'absolute',
        bottom: -8,
    },
    recoveryIndicator: {
        position: 'absolute',
        bottom: -8,
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        paddingHorizontal: spacing.md,
        gap: spacing.xl,
        marginTop: spacing.lg,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    legendLine: {
        width: 24,
        height: 2,
        backgroundColor: 'rgba(235, 235, 245, 0.3)',
    },
    legendLineCyan: {
        backgroundColor: '#00D4FF',
    },
    legendText: {
        fontSize: 16,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    todaySection: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.xl,
        paddingBottom: 120,
    },
    todaySectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: spacing.lg,
    },
    todayDate: {
        fontSize: typography.fontSizes.xs,
        color: '#00D4FF',
        marginBottom: 4,
    },
    todayTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFFFFF',
    },
    totalKm: {
        alignItems: 'flex-end',
    },
    totalKmValue: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold as any,
        color: '#00D4FF',
    },
    totalKmUnit: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.normal as any,
    },
    totalKmLabel: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.4)',
    },
    workoutDetailCard: {
        marginBottom: spacing.lg,
        borderRadius: 24,
        overflow: 'hidden',
    },
    cardTopSection: {
        backgroundColor: '#1C1C2E',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: spacing.lg,
    },
    workoutDetailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        marginBottom: spacing.md,
    },
    intensityBadge: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#00D4FF',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.md,
    },
    intensityText: {
        fontSize: 11,
        fontWeight: typography.fontWeights.bold as any,
        color: '#00D4FF',
        letterSpacing: 0.5,
    },
    pendingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    pendingDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#FFC107',
    },
    pendingText: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    workoutDetailBody: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    workoutImage: {
        width: 72,
        height: 72,
        borderRadius: 36,
    },
    workoutInfo: {
        flex: 1,
    },
    workoutTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    workoutDescription: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.6)',
        marginBottom: spacing.sm,
    },
    workoutMetrics: {
        flexDirection: 'row',
        gap: spacing.lg,
    },
    metricItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    metricText: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    viewDetailsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.lg,
        backgroundColor: '#0E0E1F',
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
    },
    viewDetailsText: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.semibold as any,
        color: '#FFFFFF',
    },
    nextWorkoutSection: {
        marginTop: spacing.lg,
    },
    nextWorkoutDivider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: spacing.lg,
    },
    nextWorkoutLabel: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.4)',
        marginBottom: spacing.md,
    },
    nextWorkoutCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: '#1A1A2E',
        padding: spacing.md,
        borderRadius: borderRadius['2xl'],
    },
    nextWorkoutIconContainer: {
        width: 48,
        height: 48,
        borderRadius: borderRadius.xl,
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    nextWorkoutInfo: {
        flex: 1,
    },
    nextWorkoutTitle: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFFFFF',
    },
    nextWorkoutSubtitle: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.6)',
        marginTop: 2,
    },

    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: '#1C1C2E',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
        height: Dimensions.get('window').height * 0.85,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 20,
    },
    modalInnerContainer: {
        flex: 1,
    },
    dragHandleArea: {
        paddingVertical: 8,
        alignItems: 'center',
        backgroundColor: '#1C1C2E',
    },
    modalScrollView: {
        flex: 1,
        paddingHorizontal: spacing.lg,
    },
    modalScrollContent: {
        paddingBottom: 20,
        flexGrow: 1,
    },
    modalHandle: {
        width: 40,
        height: 5,
        backgroundColor: 'rgba(235, 235, 245, 0.3)',
        borderRadius: 3,
        alignSelf: 'center',
        marginTop: spacing.md,
        marginBottom: spacing.xl,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: typography.fontWeights.bold as any,
        color: '#EBEBF5',
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    modalBadges: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: spacing.md,
        marginBottom: spacing.xl,
    },
    modalBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(0, 212, 255, 0.15)',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.3)',
    },
    modalBadgeText: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.semibold as any,
        color: '#EBEBF5',
    },

    // Workout Block Styles
    workoutBlock: {
        backgroundColor: '#15152A',
        borderRadius: 16,
        marginBottom: spacing.md,
        overflow: 'hidden',
    },
    workoutBlockMain: {
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.3)',
    },
    blockHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    blockSubtitle: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.5)',
        marginBottom: 4,
    },
    blockSubtitleMain: {
        color: '#00D4FF',
        fontWeight: typography.fontWeights.bold as any,
    },
    blockTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: '#EBEBF5',
    },
    blockContent: {
        padding: spacing.md,
    },
    blockDurationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.xs,
    },
    blockDurationPaceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.xs,
    },
    blockDurationWithIcon: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    blockDuration: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#EBEBF5',
    },
    blockDescription: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.6)',
        marginLeft: 26,
    },
    blockDescriptionMain: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    blockPaceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: spacing.md,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
    },
    blockPaceLabel: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#EBEBF5',
    },
    blockPace: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#00D4FF',
    },
    blockRecovery: {
        marginTop: spacing.md,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
    },
    blockRecoveryTitle: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#EBEBF5',
        marginBottom: 4,
    },
    blockRecoveryText: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.6)',
    },

    // Insight Card Styles
    insightCard: {
        backgroundColor: 'rgba(0, 127, 153, 0.3)',
        borderRadius: 16,
        padding: spacing.lg,
        marginTop: spacing.md,
        marginBottom: spacing.lg,
        borderWidth: 1,
        borderColor: '#00D4FF',
    },
    insightHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.md,
    },
    insightTitle: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.bold as any,
        color: '#00D4FF',
        letterSpacing: 0.5,
    },
    insightText: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.8)',
        lineHeight: 20,
    },

    // Start Workout Button Container (Fixed at bottom)
    startWorkoutContainer: {
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
        backgroundColor: '#1C1C2E',
    },
    startWorkoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: '#00D4FF',
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        borderRadius: 20,
        shadowColor: '#00D4FF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
        elevation: 3,
    },
    startWorkoutText: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#0E0E1F',
    },

    // Locked State Overlay Styles
    lockedOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(14, 14, 31, 0.95)',
        zIndex: 100,
        justifyContent: 'center',
        alignItems: 'center',
    },
    lockedContent: {
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    lockedTitle: {
        fontSize: 22,
        fontWeight: '700' as any,
        color: '#EBEBF5',
        marginTop: 24,
        marginBottom: 12,
        textAlign: 'center',
    },
    lockedMessage: {
        fontSize: 15,
        fontWeight: '400' as any,
        color: 'rgba(235, 235, 245, 0.6)',
        textAlign: 'center',
        lineHeight: 22,
    },
    lockedLoadingDots: {
        flexDirection: 'row',
        marginTop: 24,
        gap: 8,
    },
    loadingDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#00D4FF',
    },
    loadingDot1: {
        opacity: 0.4,
    },
    loadingDot2: {
        opacity: 0.7,
    },
    loadingDot3: {
        opacity: 1,
    },

    // Recovery Card Styles
    recoveryCard: {
        backgroundColor: 'rgba(167, 139, 250, 0.1)',
        borderRadius: 16,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: 'rgba(167, 139, 250, 0.3)',
    },
    recoveryCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        marginBottom: spacing.lg,
    },
    recoveryCardInfo: {
        flex: 1,
    },
    recoveryTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: '#A78BFA',
        marginBottom: 4,
    },
    recoverySubtitle: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    recoveryTips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.md,
    },
    recoveryTipItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: 'rgba(167, 139, 250, 0.15)',
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        borderRadius: 12,
    },
    recoveryTipText: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.8)',
    },
});
