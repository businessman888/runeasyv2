/**
 * API Configuration for RunEasy Mobile App
 * 
 * Reads from EXPO_PUBLIC_API_URL environment variable.
 * Falls back to localhost for development.
 * 
 * IMPORTANT: All stores should import BASE_API_URL from this file.
 */

import { Platform } from 'react-native';

/**
 * Get the base URL from environment, with platform-aware fallback.
 */
const getBaseUrl = (): string => {
    const envUrl = process.env.EXPO_PUBLIC_API_URL;

    if (envUrl) {
        // Ensure /api suffix
        return envUrl.endsWith('/api') ? envUrl : `${envUrl}/api`;
    }

    // Dev fallback: Android Emulator uses 10.0.2.2 to reach host machine
    if (__DEV__) {
        const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
        return `http://${host}:3000/api`;
    }

    // Absolute fallback (should never reach here in production)
    return 'https://runeasyv2-production.up.railway.app/api';
};

/**
 * API base URL WITHOUT /api suffix (for special routes like auth)
 */
export const API_URL = getBaseUrl().replace(/\/api$/, '');

/**
 * API base URL WITH /api suffix (for most API calls)
 * Use this in stores for consistency!
 */
export const BASE_API_URL = getBaseUrl();

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
    // Health
    HEALTH: '/api/health',

    // Auth & Users
    USER: (id: string) => `/api/users/${id}`,

    // Readiness
    READINESS_ANALYZE: '/api/readiness/analyze',
    READINESS_STATUS: '/api/readiness/status',
    READINESS_QUESTIONS: '/api/readiness/questions',

    // Training
    TRAINING_PLAN: '/api/training/plan',
    TRAINING_SCHEDULE: '/api/training/schedule',
    TRAINING_WORKOUTS: '/api/training/workouts',
    TRAINING_UPCOMING: '/api/training/workouts/upcoming',

    // Stats
    STATS_SUMMARY: '/api/stats/summary',

    // Gamification
    GAMIFICATION_STATS: '/api/gamification/stats',

    // Notifications
    NOTIFICATIONS_UNREAD: '/api/notifications/unread-count',

    // Feedback
    FEEDBACK_LATEST_SUMMARY: '/api/feedback/latest/summary',
    FEEDBACK_LATEST_ACTIVITY: '/api/feedback/latest/activity',
};

/**
 * Build full API URL for an endpoint
 */
export const buildApiUrl = (endpoint: string): string => {
    return `${API_URL}${endpoint}`;
};
