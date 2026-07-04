import React, { useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    Animated,
    Modal,
    Dimensions,
    PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, shadows, fonts } from '../theme';
import { useResponsiveTheme } from '../theme/responsive';
import { ZONE_COLORS, ZONE_LABELS, PHASE_LABELS, getZoneColor } from '../theme/zoneColors';
import { useTrainingStore, useWorkoutScopeStore, useTrialModalStore, ScheduleDay } from '../stores';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import type { TrainingZone, WorkoutPhase } from '../stores/trainingStore';
import { ScreenContainer } from '../components/ScreenContainer';
import { CalendarBodySkeleton } from '../components/skeletons/ScreenSkeletons';
import { UpgradeProCard } from '../components/upgrade/UpgradeProCard';
import { GlassTeaseOverlay } from '../components/upgrade/GlassTeaseOverlay';
import { ProTeaseBadge } from '../components/upgrade/ProTeaseBadge';
import { PlanGeneratingOverlay } from '../components/loading/PlanGeneratingOverlay';
import { usePlanGenerationGate } from '../hooks/usePlanGenerationGate';
import { SegmentedTabs } from '../components/ui/SegmentedTabs';
import { AgendaCalendar, type CalendarViewMode } from '../components/calendar/AgendaCalendar';
import { StatsPeriodCard } from '../components/calendar/StatsPeriodCard';
import type { CalendarDayStatus } from '../components/calendar/DayIndicator';
import { startOfDay, toLocalDateStr } from '../components/calendar/useCalendarGrid';
import { FriendlyEmptyCard } from '../components/ui/FriendlyEmptyCard';
import { WorkoutDayCard, type DayWorkout } from '../components/training/WorkoutDayCard';
import { useProFeature } from '../hooks/useProFeature';
import { useStartWorkoutFlow } from '../hooks/useStartWorkoutFlow';

// Decorative mock workout shown (blurred) under the Calendar day teaser for
// Free users — looks like a real planned workout. Never interactive.
const MOCK_DAY_WORKOUT: DayWorkout = {
    id: 'tease-day',
    type: 'intervals',
    distance_km: 8,
    source: 'plan',
    status: 'pending',
    objective: 'Treino do dia',
    instructions_json: [{ pace_min: 5.0 }],
};


// Icon components using @expo/vector-icons
function BackIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <Ionicons name="chevron-back" size={size} color={color} />;
}

function BellIcon({ size = 24, color = '#EBEBF5' }: { size?: number; color?: string }) {
    return <Ionicons name="notifications" size={size} color={color} />;
}

function GoalsIcon({ size = 24, color = '#EBEBF5' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="clipboard-list-outline" size={size} color={color} />;
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

/**
 * Format raw `distance_km` for display.
 *
 * The native tracker persists distance as a float computed from GPS samples,
 * so values like `0.299992798064442` are routine. Rendering them verbatim
 * blows out the layout and reads as a bug to users — round to 2 decimals
 * and strip trailing zeros so the cards show "0.3", "8.5", "21.1".
 */
const formatKm = (km: number | null | undefined): string => {
    if (typeof km !== 'number' || !isFinite(km)) return '0';
    return Number(km.toFixed(2)).toString();
};

// Stable reference so the memoized SegmentedTabs doesn't re-render needlessly.
const SCOPE_TABS: { key: 'plan' | 'activity'; label: string }[] = [
    { key: 'plan', label: 'Treinos' },
    { key: 'activity', label: 'Atividades' },
];

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
    zone?: TrainingZone | null;
}

interface WorkoutData {
    id: string;
    title: string;
    distance: string;
    duration: string;
    rpe: string;
    blocks: WorkoutBlock[];
    insight: string;
    zone?: TrainingZone | null;
    phase?: WorkoutPhase | null;
    weekNumber?: number | null;
}

export function CalendarScreen({ navigation }: any) {
    const { workouts: rawWorkouts, fetchWorkouts, fetchUpcomingWorkouts, plan, fetchPlan, generationStatus, checkPlanStatus, schedule: rawSchedule, fetchSchedule, isLoading: isTrainingLoading } = useTrainingStore();
    const { isProUser } = useProFeature();
    const { scope, setScope } = useWorkoutScopeStore();
    const { startRun } = useStartWorkoutFlow();

    // Free users have no plan — never surface plan schedule/workouts in the calendar
    // grid, day detail, or "Próximo" card. Pre-gating accounts may still carry an
    // orphan plan in the DB, so gate at the data source rather than per-element.
    const workouts = isProUser ? rawWorkouts : [];
    const schedule = isProUser ? rawSchedule : [];
    // Free users on the Treinos tab get the conversion teaser: a blurred mock
    // calendar + locked day card with the upgrade card floating on top.
    const isPlanTease = !isProUser && scope === 'plan';
    // Full Date (not day-of-month) so the Week view can select days that spill
    // into the previous/next month. `currentMonth` stays the fetch anchor.
    const [selectedDay, setSelectedDay] = React.useState<Date>(() => startOfDay(new Date()));
    const [currentMonth, setCurrentMonth] = React.useState(new Date());
    const [viewMode, setViewMode] = React.useState<CalendarViewMode>('month');
    // Plan-generation lock — shared gate hook (reads trainingStore.generationStatus
    // + polls while focused, independent of the Pro flag).
    const { isGenerating: isScheduleLocked } = usePlanGenerationGate({
        onComplete: () => {
            const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
            const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 2, 0);
            fetchSchedule(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
            fetchWorkouts(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
            fetchUpcomingWorkouts();
        },
    });

    // Modal states
    const [modalVisible, setModalVisible] = React.useState(false);
    const [selectedWorkout, setSelectedWorkout] = React.useState<WorkoutData | null>(null);
    /**
     * Raw workout backing the open modal — needed by the start button so it
     * can read source/instructions/target_pace/etc. for the *exact* workout
     * the user tapped (the same date may now hold plan + manual + free).
     */
    const [selectedRawWorkout, setSelectedRawWorkout] = React.useState<any | null>(null);
    const [showStartButton, setShowStartButton] = React.useState(false);
    const modalSlideAnim = React.useRef(new Animated.Value(0)).current;
    const panY = React.useRef(new Animated.Value(0)).current;
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

    // Fetch schedule when month changes
    React.useEffect(() => {
        const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
        fetchSchedule(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
        fetchWorkouts(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
        fetchUpcomingWorkouts();
    }, [currentMonth]);

    // Refetch data when screen gains focus for reactivity
    useFocusEffect(
        useCallback(() => {
            const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
            const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 2, 0); // Extra month for tomorrow logic
            fetchSchedule(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
            fetchWorkouts(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
            fetchUpcomingWorkouts();
            fetchPlan();
        }, [currentMonth])
    );

    // One-time (per app open) "Iniciar Teste Grátis" promo — Free only, and only
    // once the subscription has resolved (avoids flashing it to a Pro user).
    const trialIsLoading = useSubscriptionStore((s) => s.isLoading);
    useFocusEffect(
        useCallback(() => {
            if (!isProUser && !trialIsLoading) useTrialModalStore.getState().show();
        }, [isProUser, trialIsLoading])
    );

    // Helper: Get tomorrow's schedule entry (today + 1)
    const getTomorrowEntry = (): ScheduleDay | null => {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Construct YYYY-MM-DD using local time components to avoid UTC shift
        const year = tomorrow.getFullYear();
        const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const day = String(tomorrow.getDate()).padStart(2, '0');
        const tomorrowStr = `${year}-${month}-${day}`;

        return schedule.find(s => s.date === tomorrowStr) || null;
    };

    // Helper: Transform API workout to UI WorkoutData format.
    //
    // When the backend ships the new `metadata` payload (Daniels enrichment),
    // we surface its zone/effort/scientific note plus per-segment zones and
    // descriptions. For workouts created before the refinement (`metadata`
    // null), we fall back to the original hardcoded copy so nothing breaks.
    const transformWorkoutToUI = (workout: any): WorkoutData => {
        const metadata = workout?.metadata ?? null;
        const segmentDescriptions: Array<{ zone?: string | null; description?: string | null }> =
            metadata?.segment_descriptions ?? [];

        const blocks: WorkoutBlock[] = (workout.instructions_json || []).map((segment: any, index: number) => {
            const md = segmentDescriptions[index];
            const fallbackDescription =
                segment.type === 'warmup'
                    ? 'Trote leve z1/z2 para ativar'
                    : segment.type === 'cooldown'
                        ? 'Trote muito leve + alongamento estático.'
                        : 'Ritmo forte, focado na técnica';

            return {
                id: String(index + 1),
                title: segment.type === 'warmup' ? 'Aquecimento' : segment.type === 'cooldown' ? 'Desaquecimento' : 'Principal',
                subtitle: `Bloco ${String(index + 1).padStart(2, '0')}${segment.type === 'main' ? ' - PRINCIPAL' : ''}`,
                type: segment.type,
                duration: `${formatKm(segment.distance_km)} km`,
                description: md?.description || fallbackDescription,
                pace: segment.pace_min && segment.pace_max
                    ? `${segment.pace_min.toFixed(0)}:${((segment.pace_min % 1) * 60).toFixed(0).padStart(2, '0')}/km`
                    : undefined,
                zone: (md?.zone as TrainingZone | undefined) ?? null,
            };
        });

        const workoutTypeLabels: Record<string, string> = {
            'easy_run': 'Rodagem Leve',
            'long_run': 'Longão',
            'intervals': 'Intervalados',
            'tempo': 'Tempo Run',
            'recovery': 'Recuperação',
            'fartlek': 'Fartlek',
            'progressive': 'Progressivo',
            'repetition': 'Repetições',
            'hill_repeats': 'Subidas',
            'race_simulation': 'Simulado',
            'free_run': 'Corrida Livre',
        };

        const distanceLabel = formatKm(workout.distance_km);
        const rpeFromMetadata = metadata?.perceived_effort
            ? `RPE ${metadata.perceived_effort}`
            : 'RPE 6/10';
        const insight =
            metadata?.scientific_note ||
            workout.objective ||
            'Mantenha o foco e aproveite o treino!';

        return {
            id: workout.id,
            title: `${workoutTypeLabels[workout.type] || workout.type} - ${distanceLabel}km`,
            distance: `${distanceLabel} km`,
            duration: `${Math.round((workout.distance_km || 0) * 6)} min`, // Estimate based on 6 min/km
            rpe: rpeFromMetadata,
            blocks,
            insight,
            zone: (metadata?.zone as TrainingZone | undefined) ?? null,
            phase: (metadata?.week_phase as WorkoutPhase | undefined) ?? null,
            weekNumber: workout.week_number ?? null,
        };
    };

    // Helper: All workouts scheduled for a given day, deterministic order
    // (plan > manual > free). The same day can now legitimately hold more
    // than one entry (e.g. user followed today's plan workout, then logged
    // a free run later in the afternoon), so the calendar renders one card
    // per workout instead of collapsing to a single primary entry.
    const getWorkoutsForDayStr = (dateStr: string) => {
        const sourceRank = (s: string | undefined) =>
            s === 'plan' ? 0 : s === 'manual' ? 1 : s === 'free' ? 2 : 3;
        return workouts
            .filter(w => w.scheduled_date === dateStr)
            .sort((a, b) => sourceRank(a.source) - sourceRank(b.source));
    };

    // ── Atividades tab (manual + free) ──────────────────────────────────────
    // Read from rawWorkouts (ungated) so Free users still see their own logged
    // activities; filtering to manual/free also excludes any orphan plan workout.
    const activityWorkouts = React.useMemo(
        () => rawWorkouts.filter(w => w.source === 'manual' || w.source === 'free'),
        [rawWorkouts],
    );

    const getActivitiesForDayStr = (dateStr: string) => {
        const rank = (s: string | undefined) => (s === 'manual' ? 0 : s === 'free' ? 1 : 2);
        return activityWorkouts
            .filter(w => w.scheduled_date === dateStr)
            .sort((a, b) => rank(a.source) - rank(b.source));
    };

    // Day press from the calendar → select that day (full Date).
    const handleDayPress = (day: Date) => {
        setSelectedDay(day);
    };

    // Calendar navigation: month mode steps by month, week mode by week.
    // Keeps `currentMonth` (the fetch anchor) in sync when a week crosses months.
    const handleCalendarNavigate = (direction: -1 | 1) => {
        if (viewMode === 'month') {
            setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1));
            return;
        }
        const next = startOfDay(selectedDay);
        next.setDate(next.getDate() + direction * 7);
        setSelectedDay(next);
        if (next.getMonth() !== currentMonth.getMonth() || next.getFullYear() !== currentMonth.getFullYear()) {
            setCurrentMonth(new Date(next.getFullYear(), next.getMonth(), 1));
        }
    };

    // "Hoje": return to the current period and select today.
    const handleToday = () => {
        const now = startOfDay(new Date());
        setSelectedDay(now);
        setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    };

    // Per-date status for the calendar dots, keyed by YYYY-MM-DD so the week
    // view can span months (old day-number lookups assumed the visible month).
    // Consolidates the former plan / activity / Free-mock markers. Only the
    // visual representation changed (dots), not this status derivation.
    const getCalendarStatus = (dateStr: string): CalendarDayStatus | null => {
        if (isPlanTease) {
            // Decorative mock behind the glass: rest Sun/Thu, past done, future planned.
            const d = new Date(`${dateStr}T00:00:00`);
            const dow = d.getDay();
            if (dow === 0 || dow === 4) return 'recovery';
            const today = startOfDay(new Date());
            return d.getTime() < today.getTime() ? 'completed' : 'planned';
        }
        if (scope === 'activity') {
            const dayWorkouts = activityWorkouts.filter(w => w.scheduled_date === dateStr);
            if (dayWorkouts.length === 0) return null;
            if (dayWorkouts.some(w => w.status === 'completed')) return 'completed';
            return 'planned';
        }
        // Treinos tab: a plan rest day where a manual/free run was logged stays a
        // rest day here (that run shows on the Atividades tab instead).
        const scheduleDay = schedule.find(s => s.date === dateStr) || null;
        if (!scheduleDay || scheduleDay.type === null) return null;
        if (scheduleDay.type === 'recovery') return 'recovery';
        const src = scheduleDay.workout?.source;
        if (src === 'manual' || src === 'free') return 'recovery';
        if (scheduleDay.status === 'completed') return 'completed';
        if (scheduleDay.status === 'missed') return 'missed';
        if (scheduleDay.status === 'pending') return 'planned';
        return null;
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
            setSelectedRawWorkout(null);
            panY.setValue(0); // Reset pan position
            setShowStartButton(false);
        });
    };

    /**
     * Decide what happens when the user taps "Ver detalhes do treino" on a
     * workout card.
     *
     * - Completed plan workout with feedback → CoachAnalysisScreen
     * - Completed manual / free workout (or plan whose feedback hasn't
     *   generated yet) → RunSummaryScreen
     * - Pending workout → upcoming-workout modal (with the start button only
     *   for today's pending plan/manual workouts)
     */
    const handleWorkoutCardPress = (workout: any) => {
        const status = workout?.status;
        const source: 'plan' | 'manual' | 'free' | undefined = workout?.source;

        if (status === 'completed') {
            if (source === 'plan' && workout.feedback_id) {
                navigation.navigate('CoachAnalysis', {
                    feedbackId: workout.feedback_id,
                    activityId: workout.activity_id ?? undefined,
                });
                return;
            }

            // Sem id, o RunSummary abriria vazio (sem cold-start loading)
            // e o tap pareceria "sem ação". Aborta o redirect.
            if (!workout?.id) return;

            // Dumb redirect: only `workoutId` + `mode` (for the layout
            // branch — manual shows "Planejado vs Executado", free does
            // not). RunSummaryScreen owns hydration and persistence; this
            // tap is just routing.
            const mode = source === 'manual' ? 'manual'
                : source === 'plan' ? 'planned'
                    : 'free';
            navigation.navigate('RunSummary', {
                workoutId: workout.id,
                mode,
            });
            return;
        }

        // Pending → preview modal. Start button only for today's plan/manual
        // workouts (free runs aren't started from the calendar).
        //
        // Anchor "today" to the workout's own scheduled_date, NOT the calendar's
        // currently selected day. Entry points like the "Próximo" card open the
        // modal for tomorrow's workout without changing selectedDate, which used
        // to make isToday=true and incorrectly enable the start button for
        // future workouts.
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);

        let isToday = false;
        if (workout?.scheduled_date) {
            // Parse "YYYY-MM-DD" as local midnight so the comparison matches
            // the user's wall-clock day (same convention as isSelectedDateToday).
            const workoutDateObj = new Date(`${workout.scheduled_date}T00:00:00`);
            workoutDateObj.setHours(0, 0, 0, 0);
            isToday = workoutDateObj.getTime() === todayDate.getTime();
        }

        // Open the dedicated workout-detail screen. Start button only for
        // today's pending plan/manual workouts (free runs aren't started here).
        navigation.navigate('WorkoutDetail', {
            workout,
            showStartButton: isToday && status === 'pending' && source !== 'free',
        });
    };

    // Handle next workout card press — same routing rules as the
    // selected-day card so a "next" workout that is somehow already
    // completed (e.g. user re-opens the calendar after finishing) goes
    // straight to its summary.
    const handleNextWorkoutPress = () => {
        const tomorrowEntry = getTomorrowEntry();
        if (tomorrowEntry?.type !== 'workout' || !tomorrowEntry.workout) return;
        const fullWorkout = workouts.find(w => w.id === tomorrowEntry.workout?.id);
        if (fullWorkout) handleWorkoutCardPress(fullWorkout);
    };

    // Derived: schedule key for the selected day (local YYYY-MM-DD).
    const getSelectedDateStr = () => toLocalDateStr(selectedDay);
    const selectedDateSchedule = schedule.find(s => s.date === getSelectedDateStr()) || null;
    const isSelectedDateRecovery = selectedDateSchedule?.type === 'recovery';
    // Plan-tab recovery: a true recovery day, OR a plan rest day where the user
    // logged a manual/free run (that run appears on the Atividades tab instead).
    const isSelectedPlanRecovery = !!selectedDateSchedule
        && selectedDateSchedule.type !== null
        && (selectedDateSchedule.type === 'recovery'
            || selectedDateSchedule.workout?.source === 'manual'
            || selectedDateSchedule.workout?.source === 'free');
    const isSelectedDateWithinPlan = selectedDateSchedule?.type !== null && selectedDateSchedule?.type !== undefined;
    // Every workout the user has logged or planned for the selected date —
    // the source of truth for the "Treinos do dia" card list. Falls back to
    // the schedule's primary workout (for plan days that the calendar
    // hasn't fetched workouts for yet) so we never render an empty section
    // when there's clearly something planned.
    const selectedDateWorkouts = getWorkoutsForDayStr(getSelectedDateStr());
    const selectedDateTotalKm = selectedDateWorkouts.reduce((sum, w) => sum + (w.distance_km || 0), 0);

    // Day-detail list keyed to the active tab: Treinos shows plan-source
    // workouts (rest stays rest); Atividades shows the day's manual/free runs.
    const planSelectedWorkouts = selectedDateWorkouts.filter(w => w.source === 'plan');
    const activitySelectedWorkouts = getActivitiesForDayStr(getSelectedDateStr());
    const scopedSelectedWorkouts = scope === 'plan' ? planSelectedWorkouts : activitySelectedWorkouts;
    const scopedTotalKm = scopedSelectedWorkouts.reduce((sum, w) => sum + (w.distance_km || 0), 0);

    // Check if selected day is today
    const isSelectedDateToday = () => {
        const today = startOfDay(new Date());
        return startOfDay(selectedDay).getTime() === today.getTime();
    };

    // Format selected date label (Hoje, Amanhã, or weekday)
    const formatSelectedDateLabel = () => {
        const today = startOfDay(new Date());
        const selected = startOfDay(selectedDay);
        if (selected.getTime() === today.getTime()) return 'Hoje';
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (selected.getTime() === tomorrow.getTime()) return 'Amanhã';
        const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        return weekdays[selected.getDay()];
    };

    // Format selected date display (e.g., "7 de JAN")
    const formatSelectedDateDisplay = () => {
        return `${selectedDay.getDate()} de ${monthNames[selectedDay.getMonth()].slice(0, 3).toUpperCase()}`;
    };

    // Get tomorrow's entry
    const tomorrowEntry = getTomorrowEntry();

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const insets = useSafeAreaInsets();

    // Responsividade: phone (isTablet=false) usa o caminho original. Tablet
    // landscape divide o grid (esquerda) e o detalhe do dia (direita).
    const r = useResponsiveTheme();
    const masterDetail = r.isTablet && r.isLandscape;

    return (
        <ScreenContainer>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={r.isTablet ? styles.tabletScrollContent : undefined}
                showsVerticalScrollIndicator={false}
            >
                <View style={r.isTablet ? styles.tabletInner : undefined}>
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
                        onPress={() => navigation.navigate('PlanGoals')}
                        accessibilityRole="button"
                        accessibilityLabel="Abrir metas do plano"
                    >
                        <GoalsIcon size={24} color="#EBEBF5" />
                    </TouchableOpacity>
                </View>

                {/* ── Treinos | Atividades — acima do card de stats ─────────────── */}
                <SegmentedTabs
                    tabs={SCOPE_TABS}
                    activeKey={scope}
                    onChange={setScope}
                    style={styles.scopeTabs}
                />

                <Text style={styles.sectionTitle}>Estatísticas</Text>
                {/* Stats card — Distância/Tempo/Freq + gráfico, escopado por período
                    e pela aba ativa (reage a scope via useWorkoutScopeStore). */}
                <StatsPeriodCard />

                {/* Cold-load skeleton — só no primeiro carregamento sem dados em cache.
                    A grade do calendário é baseada em datas (renderiza na hora), então o
                    skeleton cobre apenas o bloco dependente de dados do plano/treinos. */}
                {isTrainingLoading && rawWorkouts.length === 0 && !plan ? (
                    <View style={{ paddingHorizontal: spacing.lg }}>
                        <CalendarBodySkeleton />
                    </View>
                ) : null}

                <Text style={styles.sectionTitle}>Calendário</Text>
                {/* Master-detail (tablet landscape): mês+grid à esquerda, detalhe
                    do dia à direita. Phone/portrait: empilhado (idêntico). */}
                <View style={masterDetail ? styles.mdRow : undefined}>
                <View style={masterDetail ? styles.mdLeft : undefined}>
                {/* Calendar — Free + Treinos shows a blurred mock plan with the
                    upgrade card floating on top; everyone else sees real data.
                    The nav row / month label now lives inside AgendaCalendar. */}
                {isPlanTease ? (
                    <GlassTeaseOverlay
                        radius={30}
                        premiumBorder={false}
                        style={styles.calendarTease}
                        overlay={
                            <UpgradeProCard
                                variant="medium"
                                heroVariant="headline"
                                showHeader={false}
                                showAnimatedBorder={false}
                                priceLabel="A diferença entre correr e evoluir é um plano."
                                tagline="Deixe o Coach AI montar seu cronograma pra você"
                                ctaLabel="Montar cronograma"
                                style={styles.calendarTeaseCard}
                            />
                        }
                    >
                        <AgendaCalendar
                            disableGlass
                            viewMode={viewMode}
                            onViewModeChange={setViewMode}
                            selectedDay={selectedDay}
                            onSelectDay={handleDayPress}
                            currentMonth={currentMonth}
                            onNavigate={handleCalendarNavigate}
                            onToday={handleToday}
                            getStatus={getCalendarStatus}
                        />
                    </GlassTeaseOverlay>
                ) : (
                    <AgendaCalendar
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        selectedDay={selectedDay}
                        onSelectDay={handleDayPress}
                        currentMonth={currentMonth}
                        onNavigate={handleCalendarNavigate}
                        onToday={handleToday}
                        getStatus={getCalendarStatus}
                        style={styles.calendarWrap}
                    />
                )}
                </View>{/* fim coluna esquerda (master-detail) */}

                {/* Selected Date Section - Reactive to calendar selection */}
                <View
                    key={`selected-date-section-${getSelectedDateStr()}`}
                    style={[styles.todaySection, { minHeight: 200 }, masterDetail && styles.mdRight]}
                >
                    <View style={styles.todaySectionHeader}>
                        <View>
                            <Text style={styles.todayDate}>• {formatSelectedDateLabel()}, {formatSelectedDateDisplay()}</Text>
                            <Text style={styles.todayTitle}>
                                {scope === 'activity'
                                    ? 'Atividades do dia'
                                    : isPlanTease ? 'Treinos do dia'
                                    : !isSelectedDateWithinPlan ? 'Sem Plano Ativo' : isSelectedPlanRecovery ? 'Dia de Recuperação' : 'Treinos do dia'}
                            </Text>
                        </View>
                        {scopedSelectedWorkouts.length > 0 && (
                            <View style={styles.totalKm}>
                                <Text style={styles.totalKmValue}>{formatKm(scopedTotalKm)} <Text style={styles.totalKmUnit}>km</Text></Text>
                                <Text style={styles.totalKmLabel}>total</Text>
                            </View>
                        )}
                    </View>

                    {/* Day detail — keyed to the active tab.
                        Treinos: Free teaser (locked card) → rest stays rest → plan workouts.
                        Atividades: the day's manual/free runs, or a friendly empty card. */}
                    {scope === 'plan' ? (
                        isPlanTease ? (
                            <GlassTeaseOverlay
                                key={`tease-day-${getSelectedDateStr()}`}
                                pressable
                                radius={24}
                                blurIntensity={30}
                                overlay={
                                    <View style={styles.lockedDayOverlay}>
                                        <ProTeaseBadge variant="lock" />
                                        <Text style={styles.lockedDayTitle}>Treino do dia bloqueado</Text>
                                        <Text style={styles.lockedDaySubtitle}>
                                            Ative o Pro para ver o treino que o Coach AI preparou pra você.
                                        </Text>
                                    </View>
                                }
                            >
                                <WorkoutDayCard workout={MOCK_DAY_WORKOUT} onPress={() => {}} />
                            </GlassTeaseOverlay>
                        ) : isSelectedPlanRecovery ? (
                            <View key={`recovery-${getSelectedDateStr()}`} style={styles.recoveryCard}>
                                <View style={styles.recoveryCardHeader}>
                                    <MoonIcon size={48} color="#A78BFA" />
                                    <View style={styles.recoveryCardInfo}>
                                        <Text style={styles.recoveryTitle}>Dia de Recuperação</Text>
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
                        ) : planSelectedWorkouts.length > 0 ? (
                            planSelectedWorkouts.map((w) => (
                                <WorkoutDayCard
                                    key={`plan-${w.id}-${getSelectedDateStr()}`}
                                    workout={w as any}
                                    onPress={handleWorkoutCardPress}
                                />
                            ))
                        ) : !isSelectedDateWithinPlan ? (
                            /* No Plan Active - Show informative message */
                            <View key={`no-plan-${getSelectedDateStr()}`} style={styles.workoutDetailCard}>
                                <View style={styles.cardTopSection}>
                                    <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                        <Ionicons name="calendar-outline" size={40} color="rgba(235, 235, 245, 0.4)" />
                                        <Text style={[styles.workoutTitle, { textAlign: 'center', marginTop: 12 }]}>
                                            Nenhum plano ativo para esta data
                                        </Text>
                                        <Text style={[styles.workoutDescription, { textAlign: 'center', marginTop: 8 }]}>
                                            Seu plano de treino já foi concluído ou ainda não começou
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        ) : (
                            <View key={`rest-day-${getSelectedDateStr()}`} style={styles.workoutDetailCard}>
                                <View style={styles.cardTopSection}>
                                    <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                        <Ionicons name="bed-outline" size={40} color="#A78BFA" />
                                        <Text style={[styles.workoutTitle, { textAlign: 'center', marginTop: 12 }]}>
                                            Hoje é dia de recuperar as energias
                                        </Text>
                                        <Text style={[styles.workoutDescription, { textAlign: 'center', marginTop: 8 }]}>
                                            Nenhum treino agendado para esta data
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        )
                    ) : (
                        activitySelectedWorkouts.length > 0 ? (
                            activitySelectedWorkouts.map((w) => (
                                <WorkoutDayCard
                                    key={`act-${w.id}-${getSelectedDateStr()}`}
                                    workout={w as any}
                                    onPress={handleWorkoutCardPress}
                                />
                            ))
                        ) : (
                            <FriendlyEmptyCard
                                icon="walk-outline"
                                title="Nenhuma atividade neste dia"
                                subtitle="Suas corridas livres e treinos manuais aparecem aqui."
                            />
                        )
                    )}

                    {/* Next Workout Section — plan-only (tomorrow's planned event) */}
                    {scope === 'plan' && tomorrowEntry && tomorrowEntry.type !== null && (
                        <View key={`next-section-${tomorrowEntry.date}`} style={styles.nextWorkoutSection}>
                            <View style={styles.nextWorkoutDivider} />
                            <Text style={styles.nextWorkoutLabel}>
                                Próximo: {(() => {
                                    const date = new Date(tomorrowEntry.date + 'T00:00:00'); // Ensure local date parsing
                                    const days = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];
                                    return days[date.getDay()];
                                })()}
                            </Text>

                            {/* Render based on type: Workout vs Recovery */}
                            {tomorrowEntry.type === 'recovery' ? (
                                <View style={styles.nextWorkoutCard}>
                                    <View style={[styles.nextWorkoutIconContainer, { backgroundColor: 'rgba(167, 139, 250, 0.15)' }]}>
                                        <Ionicons name="bed-outline" size={24} color="#A78BFA" />
                                    </View>
                                    <View style={styles.nextWorkoutInfo}>
                                        <Text style={styles.nextWorkoutTitle}>Dia de Recuperação</Text>
                                        <Text style={styles.nextWorkoutSubtitle}>
                                            Descanso programado
                                        </Text>
                                    </View>
                                </View>
                            ) : tomorrowEntry.workout ? (
                                <TouchableOpacity
                                    key={`next-card-${tomorrowEntry.workout.id}`}
                                    style={styles.nextWorkoutCard}
                                    onPress={handleNextWorkoutPress}
                                    activeOpacity={0.7}
                                >
                                    <ProximoIcon size={47} />
                                    <View style={styles.nextWorkoutInfo}>
                                        <Text style={styles.nextWorkoutTitle}>
                                            {(() => {
                                                const w = tomorrowEntry.workout!;
                                                const labels: Record<string, string> = {
                                                    'easy_run': 'Rodagem Leve',
                                                    'long_run': 'Longão',
                                                    'intervals': 'Intervalados',
                                                    'tempo': 'Tempo Run',
                                                    'recovery': 'Recuperação',
                                                    'free_run': 'Corrida Livre',
                                                };
                                                return `${labels[w.type] || w.type} - ${formatKm(w.distance_km)}km`;
                                            })()}
                                        </Text>
                                        <Text style={styles.nextWorkoutSubtitle}>
                                            {tomorrowEntry.workout.type === 'intervals' || tomorrowEntry.workout.type === 'tempo'
                                                ? 'Corrida de rua - alta intensidade'
                                                : 'Corrida de rua - média intensidade'}
                                        </Text>
                                    </View>
                                    <ArrowRightIcon size={24} color="rgba(235,235,245,0.3)" />
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    )}
                </View>
                </View>{/* fim mdRow (master-detail) */}
                </View>{/* fim tabletInner */}
            </ScrollView>

            {/* Plan Generation Overlay — top layer (below only the floating tab bar) */}
            {isScheduleLocked && <PlanGeneratingOverlay mode="generating" />}
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
    // ── Tablet (aditivo; phone nunca usa) ──────────────────────────────────────
    tabletScrollContent: {
        alignItems: 'center',
    },
    tabletInner: {
        width: '100%',
        maxWidth: 1100,
    },
    // Master-detail (landscape): grid à esquerda, detalhe do dia à direita.
    mdRow: {
        flexDirection: 'row',
        gap: spacing.xl,
        alignItems: 'flex-start',
    },
    mdLeft: {
        flex: 1,
    },
    mdRight: {
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
    scopeTabs: {
        marginHorizontal: spacing.lg,
        marginTop: spacing.md,
    },
    // Section title above each section ("Estatísticas", "Calendário") — mirrors
    // the Home screen's section headers (15px semibold, light).
    sectionTitle: {
        fontFamily: fonts.semibold,
        fontSize: 15,
        color: colors.textLight,
        marginLeft: spacing.lg,
        marginTop: spacing.md,
        marginBottom: spacing.sm,
    },
    // AgendaCalendar card outer margins (the glass card itself carries radius/blur).
    calendarWrap: {
        marginHorizontal: spacing.md,
        marginBottom: spacing.lg,
    },
    // Free teaser: GlassTeaseOverlay carries the outer margin/radius/blur.
    calendarTease: {
        marginHorizontal: spacing.md,
        marginBottom: spacing.lg,
    },
    calendarTeaseCard: {
        width: '100%',
    },
    // Locked "treino do dia" overlay (Free)
    lockedDayOverlay: {
        alignItems: 'center',
        gap: spacing.md,
    },
    lockedDayTitle: {
        color: colors.textLight,
        fontFamily: fonts.bold,
        fontSize: 18,
        textAlign: 'center',
    },
    lockedDaySubtitle: {
        color: colors.proMutedText,
        fontFamily: fonts.regular,
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
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
    sourceBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'transparent',
        borderWidth: 1,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.md,
    },
    sourceBadgeText: {
        fontSize: 10,
        fontWeight: typography.fontWeights.bold as any,
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
    zoneChipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: spacing.sm,
        marginBottom: spacing.md,
    },
    zoneChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    zoneChipDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    zoneChipText: {
        fontSize: typography.fontSizes.xs,
        color: colors.textLight,
        fontWeight: typography.fontWeights.semibold,
        letterSpacing: 0.3,
    },
    phaseChip: {
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: 'rgba(151, 71, 255, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(151, 71, 255, 0.3)',
    },
    phaseChipText: {
        fontSize: typography.fontSizes.xs,
        color: colors.textLight,
        fontWeight: typography.fontWeights.medium,
    },
    blockZoneStrip: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 3,
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
