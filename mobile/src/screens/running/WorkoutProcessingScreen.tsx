import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    BackHandler,
    Animated,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { SpiralLoader } from '../../components/ui/SpiralLoader';
import { useTrainingStore } from '../../stores/trainingStore';
import { useFeedbackStore } from '../../stores/feedbackStore';
import { saveTreadmillCache } from '../../utils/treadmillCache';
import { colors, fonts } from '../../theme';

/**
 * Post-workout processing screen — the premium, event-driven loader that
 * replaces the inline "Finalizando treino" modal that used to sit on top of
 * the tracking screen. It owns the completion submit + routing so the tracking
 * screen is left behind (no going back to it) and the user always lands on the
 * correct destination:
 *   - plan  → CoachAnalysis (once the AI feedback is ready), else Home
 *   - manual/free → RunSummary (no coach analysis)
 *
 * Offline: the completion is saved locally by the store; here we surface a
 * "conexão fraca" note and route to Home (the pending queue syncs later and
 * the coach card self-heals).
 */

const ONLINE_MESSAGES = [
    'Metrificando seu treino',
    'Calculando pace, splits e elevação',
    'Preparando a análise do treinador…',
];

const OFFLINE_SUBTITLE =
    'Conexão fraca — isso pode levar alguns instantes. Seus dados estão salvos.';

const MESSAGE_INTERVAL = 2000;
// How long we wait for the plan feedback before falling back to Home.
const FEEDBACK_POLL_BUDGET_MS = 20000;
const FEEDBACK_POLL_INTERVAL_MS = 2500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function WorkoutProcessingScreen({ navigation, route }: any) {
    const { mode, submit, summaryParams } = route?.params || {};
    const isPlan = mode === 'planned';

    const completeWorkout = useTrainingStore((s) => s.completeWorkout);
    const completeFreeRun = useTrainingStore((s) => s.completeFreeRun);
    const fetchFeedbackStatus = useFeedbackStore((s) => s.fetchFeedbackStatus);

    const [messageIndex, setMessageIndex] = useState(0);
    const [isOffline, setIsOffline] = useState(false);
    const fadeAnim = useRef(new Animated.Value(1)).current;

    // Guards against double-navigation / work after unmount.
    const doneRef = useRef(false);
    const mountedRef = useRef(true);

    // ── Block returning to the tracking screen ────────────────────────────
    useEffect(() => {
        const goHome = () => {
            if (doneRef.current) return true;
            doneRef.current = true;
            navigation.reset({
                index: 0,
                routes: [{ name: 'Main', params: { initialTab: 'Home' } }],
            });
            return true; // swallow the back press
        };
        const sub = BackHandler.addEventListener('hardwareBackPress', goHome);
        return () => sub.remove();
    }, [navigation]);

    // ── Rotating status messages (fade in/out) ────────────────────────────
    useEffect(() => {
        const interval = setInterval(() => {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }).start(() => {
                setMessageIndex((prev) => (prev + 1) % ONLINE_MESSAGES.length);
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 250,
                    useNativeDriver: true,
                }).start();
            });
        }, MESSAGE_INTERVAL);
        return () => clearInterval(interval);
    }, [fadeAnim]);

    // ── Navigation helpers ────────────────────────────────────────────────
    const goToRunSummary = useCallback(
        (savedLocally: boolean, resolvedWorkoutId?: string) => {
            navigation.reset({
                index: 1,
                routes: [
                    { name: 'Main', params: { initialTab: 'Home' } },
                    {
                        name: 'RunSummary',
                        params: {
                            ...summaryParams,
                            savedLocally,
                            workoutId: resolvedWorkoutId || summaryParams?.workoutId,
                        },
                    },
                ],
            });
        },
        [navigation, summaryParams],
    );

    const goToCoachAnalysis = useCallback(
        (feedbackId: string, activityId?: string) => {
            navigation.reset({
                index: 1,
                routes: [
                    { name: 'Main', params: { initialTab: 'Home' } },
                    { name: 'CoachAnalysis', params: { feedbackId, activityId } },
                ],
            });
        },
        [navigation],
    );

    const goToHome = useCallback(() => {
        navigation.reset({
            index: 0,
            routes: [{ name: 'Main', params: { initialTab: 'Home' } }],
        });
    }, [navigation]);

    // ── Submit + route (runs once on mount) ───────────────────────────────
    useEffect(() => {
        mountedRef.current = true;

        (async () => {
            // Detect offline up front (also reflected by savedLocally below).
            try {
                const net = await NetInfo.fetch();
                if (mountedRef.current && net.isConnected === false) {
                    setIsOffline(true);
                }
            } catch {
                // ignore — savedLocally is the authoritative offline signal
            }

            // 1. Submit completion via the store (save-first happens inside).
            let savedLocally = false;
            let resolvedWorkoutId: string | undefined = summaryParams?.workoutId;
            let activityId: string | undefined;

            try {
                if (submit?.kind === 'free') {
                    const result = await completeFreeRun(submit.payload);
                    savedLocally = result.savedLocally;
                    if (result.workout?.id) resolvedWorkoutId = result.workout.id;
                    activityId = (result.workout as any)?.activity_id ?? undefined;
                } else {
                    const result = await completeWorkout(submit.payload);
                    savedLocally = result.savedLocally;
                    if (result.workout?.id) resolvedWorkoutId = result.workout.id;
                    activityId = result.workout?.activity_id ?? undefined;
                }
            } catch (err) {
                console.error('[WorkoutProcessing] submit error:', err);
                savedLocally = true;
            }

            // Persist treadmill telemetry cache once we know the workout id.
            if (submit?.treadmillCache && resolvedWorkoutId) {
                try {
                    saveTreadmillCache(resolvedWorkoutId, submit.treadmillCache);
                } catch (e) {
                    console.warn('[WorkoutProcessing] saveTreadmillCache warn:', e);
                }
            }

            if (savedLocally && mountedRef.current) setIsOffline(true);
            if (!mountedRef.current || doneRef.current) return;

            // 2. Manual / free → straight to RunSummary (no coach analysis).
            if (!isPlan) {
                doneRef.current = true;
                goToRunSummary(savedLocally, resolvedWorkoutId);
                return;
            }

            // 3. Plan finished offline → can't poll a server-side analysis.
            //    Show the offline note briefly, then Home (card self-heals on
            //    sync via retryPendingWorkouts).
            if (savedLocally) {
                await sleep(1800);
                if (!mountedRef.current || doneRef.current) return;
                doneRef.current = true;
                goToHome();
                return;
            }

            // 4. Plan finished online → poll the feedback lifecycle until the
            //    analysis is ready (→ CoachAnalysis) or the budget elapses
            //    (→ Home, where the coach card shows/opens it later).
            const deadline = Date.now() + FEEDBACK_POLL_BUDGET_MS;
            while (Date.now() < deadline) {
                if (!mountedRef.current || doneRef.current) return;
                const status = await fetchFeedbackStatus({
                    workoutId: resolvedWorkoutId,
                    activityId,
                });
                if (!mountedRef.current || doneRef.current) return;

                if (status.status === 'completed' && status.feedbackId) {
                    doneRef.current = true;
                    goToCoachAnalysis(
                        status.feedbackId,
                        status.activityId ?? activityId,
                    );
                    return;
                }
                if (status.status === 'failed' || status.status === 'skipped') {
                    // No point waiting — Home card surfaces "Tentar novamente".
                    break;
                }
                await sleep(FEEDBACK_POLL_INTERVAL_MS);
            }

            if (!mountedRef.current || doneRef.current) return;
            doneRef.current = true;
            goToHome();
        })();

        return () => {
            mountedRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <View style={styles.content}>
                <SpiralLoader size={80} />

                <View style={styles.textContainer}>
                    <Animated.Text style={[styles.message, { opacity: fadeAnim }]}>
                        {ONLINE_MESSAGES[messageIndex]}
                    </Animated.Text>
                    <Text style={styles.subtitle}>
                        {isOffline
                            ? OFFLINE_SUBTITLE
                            : 'Isso pode levar alguns segundos…'}
                    </Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.cardDark, // #0E0E1F — matches PlanLoadingScreen
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    textContainer: {
        marginTop: 48,
        alignItems: 'center',
        paddingHorizontal: 12,
    },
    message: {
        fontFamily: fonts.bold,
        fontSize: 20,
        color: colors.textLight,
        textAlign: 'center',
        marginBottom: 12,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: colors.proMutedText,
        textAlign: 'center',
        minHeight: 40,
    },
});

export default WorkoutProcessingScreen;
