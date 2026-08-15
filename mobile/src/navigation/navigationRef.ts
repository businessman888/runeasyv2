/**
 * Navigation Reference for global navigation access
 * 
 * This allows navigation from outside React components,
 * such as notification handlers and event callbacks.
 */

import { createNavigationContainerRef } from '@react-navigation/native';
import type { WearableProvider } from '../config/wearables.config';

// Define the navigation param list types
export type RootStackParamList = {
    Landing: undefined;
    Login: undefined;
    Onboarding: undefined;
    Main: { initialTab?: string } | undefined;
    PrePaywall: undefined;
    Retrospective: undefined;
    WeeklyInsight: undefined;
    MesoInsight: undefined;
    CustomizeGoal: {
        retrospectiveId: string;
        goalKind: 'distance' | 'pace';
        manual?: boolean;
    };
    Feedback: { feedbackId: string };
    WorkoutDetail: { workoutId: string };
    // The screen consumes `feedbackId` (+ optional `activityId` for GPS
    // hydration). `analysisId` was a legacy misnomer never read by the screen.
    CoachAnalysis: { feedbackId?: string; activityId?: string };
    WorkoutProcessing: {
        mode: string;
        submit: {
            kind: 'workout' | 'free';
            payload: Record<string, unknown>;
            treadmillCache?: unknown;
        };
        summaryParams: Record<string, unknown>;
    };
    ReadinessQuiz: undefined;
    ReadinessResult: undefined;
    ReadinessSuccess: undefined;
    Notifications: undefined;
    PersonalInfo: undefined;
    TrainingHistory: undefined;
    NotificationSettings: undefined;
    Help: undefined;
    // `onConnected` is supplied only by the onboarding flow: a successful
    // connection advances the quiz step (and the route pops itself). Profile
    // (manage) navigations omit it, so DeviceConnectBody shows the disconnect
    // action instead.
    DeviceConnect: { provider: WearableProvider; onConnected?: () => void };
    DeviceReadMore: { provider: WearableProvider };
    Quiz_Objective: undefined;
    Quiz_Level: undefined;
    Quiz_Frequency: undefined;
    Quiz_Pace: undefined;
    Quiz_Timeframe: undefined;
    Quiz_Limitations: undefined;
    Quiz_PlanPreview: undefined;
    Quiz_PlanLoading: undefined;
    BriefingScreen: undefined;
    PlanPreview: undefined;
};

// Create the navigation ref
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Track if navigation is ready
let _isNavigationReady = false;

/**
 * Check if navigation is ready for use
 */
export function isNavigationReady(): boolean {
    return _isNavigationReady && navigationRef.isReady();
}

/**
 * Set navigation ready state (called from NavigationContainer onReady)
 */
export function setNavigationReady(ready: boolean): void {
    _isNavigationReady = ready;
}

/**
 * Navigate to a screen from anywhere in the app
 * Safe to call even if navigation isn't ready - will log warning
 */
export function navigate<RouteName extends keyof RootStackParamList>(
    name: RouteName,
    params?: RootStackParamList[RouteName]
): void {
    if (isNavigationReady()) {
        // Use type assertion to handle the complex generic constraints
        (navigationRef.navigate as any)(name, params);
    } else {
        console.warn('[Navigation] Attempted to navigate before navigation was ready:', name);
    }
}

/**
 * Go back to previous screen
 */
export function goBack(): void {
    if (isNavigationReady() && navigationRef.canGoBack()) {
        navigationRef.goBack();
    }
}

/**
 * Reset navigation state
 */
export function reset(state: any): void {
    if (isNavigationReady()) {
        navigationRef.reset(state);
    }
}
