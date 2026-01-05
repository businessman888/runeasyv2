/**
 * DISABLED: expo-notifications não funciona no Expo Go SDK 53+
 * Para habilitar notificações, use um Development Build ou EAS Build.
 * 
 * Este arquivo contém stubs que não fazem nada, apenas para manter
 * compatibilidade com o resto do código.
 */

// DISABLED IMPORTS:
// import * as Notifications from 'expo-notifications';
// import * as Device from 'expo-device';
// import Constants from 'expo-constants';
// import { Platform } from 'react-native';
// import * as Storage from '../utils/storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

/**
 * Register for push notifications - DISABLED for Expo Go
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
    console.log('[Notifications] DISABLED: expo-notifications não funciona no Expo Go SDK 53+');
    return null;
}

/**
 * Schedule a local notification immediately - DISABLED
 */
export async function sendLocalNotification(
    title: string,
    body: string,
    data?: Record<string, unknown>,
): Promise<string> {
    console.log('[Notifications] DISABLED: sendLocalNotification não disponível no Expo Go');
    return 'disabled';
}

/**
 * Cancel a scheduled notification - DISABLED
 */
export async function cancelNotification(notificationId: string): Promise<void> {
    console.log('[Notifications] DISABLED: cancelNotification não disponível no Expo Go');
}

/**
 * Cancel all scheduled notifications - DISABLED
 */
export async function cancelAllNotifications(): Promise<void> {
    console.log('[Notifications] DISABLED: cancelAllNotifications não disponível no Expo Go');
}

/**
 * Set badge count - DISABLED
 */
export async function setBadgeCount(count: number): Promise<void> {
    console.log('[Notifications] DISABLED: setBadgeCount não disponível no Expo Go');
}

/**
 * Get pending notifications - DISABLED
 */
export async function getPendingNotifications() {
    console.log('[Notifications] DISABLED: getPendingNotifications não disponível no Expo Go');
    return [];
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
} as const;

/**
 * Helper to create feedback ready notification data
 */
export function createFeedbackNotificationData(feedbackId: string, workoutType: string) {
    return {
        type: NotificationTypes.FEEDBACK_READY,
        feedbackId,
        workoutType,
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
    };
}
