/**
 * Push Notifications Service for RunEasy
 * 
 * This module handles push notification registration, token management,
 * and sending local notifications. Works with EAS/Development builds.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { BASE_API_URL } from '../config/api.config';

const API_URL = BASE_API_URL;

// Configure notification behavior
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

/**
 * Request notification permissions and get the native FCM Push Token
 * @returns The FCM push token string or null if permissions denied/unavailable
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
    let token: string | null = null;

    // Check if running on a physical device (required for push notifications)
    if (!Device.isDevice) {
        console.log('[Notifications] Push notifications require a physical device');
        return null;
    }

    try {
        // Check existing permissions
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        // Request permissions if not already granted
        if (existingStatus !== 'granted') {
            console.log('[Notifications] Requesting notification permissions...');
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.log('[Notifications] Permission denied for push notifications');
            return null;
        }

        // Get the native FCM token (for Android) or APNs token (for iOS)
        // This is the token that Firebase/APNs uses directly
        console.log('[Notifications] Getting native device push token...');
        const tokenResponse = await Notifications.getDevicePushTokenAsync();
        token = tokenResponse.data;
        console.log('[Notifications] FCM token obtained:', token.substring(0, 30) + '...');

    } catch (error) {
        console.error('[Notifications] Error getting push token:', error);
        return null;
    }

    // Configure Android notification channel
    if (Platform.OS === 'android') {
        await setupAndroidChannels();
    }

    return token;
}

/**
 * Setup Android notification channels for different notification types
 */
async function setupAndroidChannels(): Promise<void> {
    // Default channel for general notifications
    await Notifications.setNotificationChannelAsync('default', {
        name: 'Geral',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF6B35',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
    });

    // Workout reminders channel
    await Notifications.setNotificationChannelAsync('workout-reminder', {
        name: 'Lembretes de Treino',
        description: 'Notificações para lembrar você dos seus treinos',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#FF6B35',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
    });

    // Achievements channel
    await Notifications.setNotificationChannelAsync('achievement', {
        name: 'Conquistas',
        description: 'Notificações de badges e conquistas',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#FFD700',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
    });

    // Retrospective/Analysis channel
    await Notifications.setNotificationChannelAsync('retrospective', {
        name: 'Retrospectivas',
        description: 'Notificações quando sua retrospectiva está pronta',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4CAF50',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
    });

    console.log('[Notifications] Android channels configured');
}

/**
 * Save push token to the backend
 * @param userId - The user's ID
 * @param token - The Expo push token
 */
export async function savePushTokenToBackend(userId: string, token: string): Promise<boolean> {
    try {
        const response = await fetch(`${API_URL}/notifications/push-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': userId,
            },
            body: JSON.stringify({ pushToken: token }),
        });

        if (!response.ok) {
            console.error('[Notifications] Failed to save push token:', response.status);
            return false;
        }

        console.log('[Notifications] Push token saved to backend successfully');
        return true;
    } catch (error) {
        console.error('[Notifications] Error saving push token to backend:', error);
        return false;
    }
}

/**
 * Send a local notification immediately
 */
export async function sendLocalNotification(
    title: string,
    body: string,
    data?: Record<string, unknown>,
): Promise<string> {
    const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            data: data || {},
            sound: 'default',
        },
        trigger: null, // null = immediate
    });

    console.log('[Notifications] Local notification sent:', notificationId);
    return notificationId;
}

/**
 * Schedule a notification for a specific time
 */
export async function scheduleNotification(
    title: string,
    body: string,
    triggerDate: Date,
    data?: Record<string, unknown>,
    channelId?: string,
): Promise<string> {
    const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            data: data || {},
            sound: 'default',
            ...(Platform.OS === 'android' && channelId ? { channelId } : {}),
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: triggerDate,
        },
    });

    console.log('[Notifications] Notification scheduled for:', triggerDate, notificationId);
    return notificationId;
}

/**
 * Cancel a scheduled notification
 */
export async function cancelNotification(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log('[Notifications] Notification cancelled:', notificationId);
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('[Notifications] All notifications cancelled');
}

/**
 * Set badge count (iOS only, Android uses channels)
 */
export async function setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
}

/**
 * Get all pending notifications
 */
export async function getPendingNotifications() {
    return await Notifications.getAllScheduledNotificationsAsync();
}

/**
 * Notification types for RunEasy
 */
export const NotificationTypes = {
    FEEDBACK_READY: 'feedback_ready',
    WORKOUT_REMINDER: 'workout_reminder',
    STREAK_WARNING: 'streak_warning',
    BADGE_EARNED: 'badge_earned',
    LEVEL_UP: 'level_up',
    RETROSPECTIVE_READY: 'retrospective_ready',
    RECOVERY_ANALYSIS: 'recovery_analysis',
} as const;

export type NotificationType = typeof NotificationTypes[keyof typeof NotificationTypes];

/**
 * Helper to create feedback ready notification data
 */
export function createFeedbackNotificationData(feedbackId: string, workoutType: string) {
    return {
        type: NotificationTypes.FEEDBACK_READY,
        feedbackId,
        workoutType,
        screen: 'Feedback',
    };
}

/**
 * Helper to create workout reminder notification data
 */
export function createWorkoutReminderData(workoutId: string, workoutType: string) {
    return {
        type: NotificationTypes.WORKOUT_REMINDER,
        workoutId,
        workoutType,
        screen: 'WorkoutDetail',
    };
}

/**
 * Helper to create retrospective notification data
 */
export function createRetrospectiveNotificationData(retrospectiveId: string) {
    return {
        type: NotificationTypes.RETROSPECTIVE_READY,
        retrospectiveId,
        screen: 'Retrospective',
    };
}
