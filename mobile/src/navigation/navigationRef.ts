/**
 * Navigation Reference for global navigation access
 * 
 * This allows navigation from outside React components,
 * such as notification handlers and event callbacks.
 */

import { createNavigationContainerRef } from '@react-navigation/native';

// Define the navigation param list types
export type RootStackParamList = {
    Login: undefined;
    Onboarding: undefined;
    Main: { initialTab?: string };
    Retrospective: undefined;
    Feedback: { feedbackId: string };
    WorkoutDetail: { workoutId: string };
    CoachAnalysis: { analysisId?: string };
    ReadinessQuiz: undefined;
    ReadinessResult: undefined;
    ReadinessSuccess: undefined;
    Notifications: undefined;
    PersonalInfo: undefined;
    TrainingHistory: undefined;
    NotificationSettings: undefined;
    Help: undefined;
    Quiz_Objective: undefined;
    Quiz_Level: undefined;
    Quiz_Frequency: undefined;
    Quiz_Pace: undefined;
    Quiz_Timeframe: undefined;
    Quiz_Limitations: undefined;
    Quiz_PlanPreview: undefined;
    Quiz_PlanLoading: undefined;
    SmartPlan: undefined;
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
