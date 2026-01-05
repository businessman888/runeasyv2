// DISABLED: expo-notifications não funciona no Expo Go SDK 53+
// import { useEffect, useRef, useState } from 'react';
// import * as Notifications from 'expo-notifications';
// import { useNavigation } from '@react-navigation/native';
// import {
//     registerForPushNotificationsAsync,
//     NotificationTypes,
// } from '../services/notifications';

// interface NotificationData {
//     type: string;
//     feedbackId?: string;
//     workoutId?: string;
//     [key: string]: unknown;
// }

/**
 * DISABLED: expo-notifications não funciona no Expo Go SDK 53+
 * Para habilitar notificações, use um Development Build ou EAS Build.
 */
export function useNotifications() {
    // Return empty values - notifications disabled for Expo Go
    return {
        expoPushToken: null,
        notification: null,
    };
}

