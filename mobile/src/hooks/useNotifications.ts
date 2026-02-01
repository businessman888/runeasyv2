/**
 * Push Notifications Hook for RunEasy
 * 
 * This hook manages push notification registration, listeners, and navigation
 * when the user interacts with notifications (foreground and background).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { AppState, AppStateStatus, Platform } from 'react-native';
import {
    registerForPushNotificationsAsync,
    savePushTokenToBackend,
    NotificationTypes,
    NotificationType,
} from '../services/notifications';
import { useAuthStore } from '../stores';

// Define navigation params for type safety
type RootStackParamList = {
    Main: { initialTab?: string };
    Retrospective: undefined;
    Feedback: { feedbackId: string };
    WorkoutDetail: { workoutId: string };
    CoachAnalysis: { analysisId?: string };
    ReadinessQuiz: undefined;
    Notifications: undefined;
};

interface NotificationData {
    type?: NotificationType | string;
    screen?: string;
    feedbackId?: string;
    workoutId?: string;
    retrospectiveId?: string;
    analysisId?: string;
    [key: string]: unknown;
}

interface UseNotificationsReturn {
    expoPushToken: string | null;
    notification: Notifications.Notification | null;
    isRegistered: boolean;
    registerPushNotifications: () => Promise<void>;
}

/**
 * Hook to manage push notifications lifecycle
 */
export function useNotifications(): UseNotificationsReturn {
    const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
    const [notification, setNotification] = useState<Notifications.Notification | null>(null);
    const [isRegistered, setIsRegistered] = useState(false);

    const notificationListener = useRef<Notifications.EventSubscription | null>(null);
    const responseListener = useRef<Notifications.EventSubscription | null>(null);
    const appState = useRef<AppStateStatus>(AppState.currentState);

    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { user, isAuthenticated } = useAuthStore();

    /**
     * Navigate to the appropriate screen based on notification data
     */
    const handleNotificationNavigation = useCallback((data: NotificationData) => {
        console.log('[Notifications] Handling navigation for data:', data);

        const screen = data.screen || data.type;

        switch (screen) {
            case 'Retrospective':
            case NotificationTypes.RETROSPECTIVE_READY:
                console.log('[Notifications] Navigating to Retrospective screen');
                navigation.navigate('Retrospective');
                break;

            case 'Feedback':
            case NotificationTypes.FEEDBACK_READY:
                if (data.feedbackId) {
                    console.log('[Notifications] Navigating to Feedback screen');
                    navigation.navigate('Feedback', { feedbackId: data.feedbackId });
                }
                break;

            case 'WorkoutDetail':
            case NotificationTypes.WORKOUT_REMINDER:
                if (data.workoutId) {
                    console.log('[Notifications] Navigating to WorkoutDetail screen');
                    navigation.navigate('WorkoutDetail', { workoutId: data.workoutId });
                }
                break;

            case 'CoachAnalysis':
            case NotificationTypes.RECOVERY_ANALYSIS:
                console.log('[Notifications] Navigating to CoachAnalysis screen');
                navigation.navigate('CoachAnalysis', { analysisId: data.analysisId as string });
                break;

            case NotificationTypes.BADGE_EARNED:
            case NotificationTypes.LEVEL_UP:
                console.log('[Notifications] Navigating to Evolution tab');
                navigation.navigate('Main', { initialTab: 'Evolution' });
                break;

            case NotificationTypes.STREAK_WARNING:
                console.log('[Notifications] Navigating to Home tab');
                navigation.navigate('Main', { initialTab: 'Home' });
                break;

            default:
                console.log('[Notifications] Unknown notification type, navigating to Notifications screen');
                navigation.navigate('Notifications');
                break;
        }
    }, [navigation]);

    /**
     * Register for push notifications and save token to backend
     */
    const registerPushNotifications = useCallback(async () => {
        if (!isAuthenticated || !user?.id) {
            console.log('[Notifications] Cannot register: user not authenticated');
            return;
        }

        try {
            console.log('[Notifications] Starting push notification registration...');
            const token = await registerForPushNotificationsAsync();

            if (token) {
                setExpoPushToken(token);

                // Save token to backend
                const saved = await savePushTokenToBackend(user.id, token);
                if (saved) {
                    setIsRegistered(true);
                    console.log('[Notifications] Push notifications registered successfully');
                }
            }
        } catch (error) {
            console.error('[Notifications] Registration failed:', error);
        }
    }, [isAuthenticated, user?.id]);

    /**
     * Setup notification listeners
     */
    useEffect(() => {
        // Listener for notifications received while app is foregrounded
        notificationListener.current = Notifications.addNotificationReceivedListener(
            (receivedNotification) => {
                console.log('[Notifications] Notification received in foreground:', receivedNotification);
                setNotification(receivedNotification);
            }
        );

        // Listener for when user interacts with notification (tap)
        responseListener.current = Notifications.addNotificationResponseReceivedListener(
            (response) => {
                console.log('[Notifications] User tapped notification:', response);
                const data = response.notification.request.content.data as NotificationData;

                // Navigate to appropriate screen
                if (data && isAuthenticated) {
                    handleNotificationNavigation(data);
                }
            }
        );

        // Cleanup listeners on unmount
        return () => {
            if (notificationListener.current) {
                notificationListener.current.remove();
            }
            if (responseListener.current) {
                responseListener.current.remove();
            }
        };
    }, [handleNotificationNavigation, isAuthenticated]);

    /**
     * Register push notifications when user authenticates
     */
    useEffect(() => {
        if (isAuthenticated && user?.id && !isRegistered) {
            registerPushNotifications();
        }
    }, [isAuthenticated, user?.id, isRegistered, registerPushNotifications]);

    /**
     * Re-register token when app comes to foreground (handles token refresh)
     */
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === 'active' &&
                isAuthenticated &&
                !isRegistered
            ) {
                console.log('[Notifications] App came to foreground, checking registration...');
                registerPushNotifications();
            }
            appState.current = nextAppState;
        });

        return () => {
            subscription.remove();
        };
    }, [isAuthenticated, isRegistered, registerPushNotifications]);

    /**
     * Check for notification that opened the app (cold start)
     */
    useEffect(() => {
        const checkInitialNotification = async () => {
            const response = await Notifications.getLastNotificationResponseAsync();
            if (response && isAuthenticated) {
                const data = response.notification.request.content.data as NotificationData;
                console.log('[Notifications] App opened from notification (cold start):', data);

                // Small delay to ensure navigation is ready
                setTimeout(() => {
                    handleNotificationNavigation(data);
                }, 500);
            }
        };

        if (isAuthenticated) {
            checkInitialNotification();
        }
    }, [isAuthenticated, handleNotificationNavigation]);

    return {
        expoPushToken,
        notification,
        isRegistered,
        registerPushNotifications,
    };
}
