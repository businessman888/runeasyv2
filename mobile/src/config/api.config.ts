/**
 * API Configuration for RunEasy Mobile App
 * 
 * FORCED PRODUCTION MODE: Always connects to Railway server
 * To switch back to dev mode, uncomment the __DEV__ logic below
 * 
 * IMPORTANT: All stores should import BASE_API_URL from this file
 */

// Production API URL (Railway deployment) - includes /api suffix
const PRODUCTION_BASE = 'https://runeasy-production.up.railway.app/api';

// Development API URL (currently unused - production forced)
// const DEVELOPMENT_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

/**
 * Get the API base URL
 * Currently FORCED to production - ignores __DEV__
 */
const getBaseUrl = (): string => {
    // FORCED PRODUCTION MODE
    return PRODUCTION_BASE;

    // To restore dev mode, uncomment below and comment the line above:
    // return __DEV__ ? DEVELOPMENT_BASE : PRODUCTION_BASE;
};

/**
 * API base URL WITHOUT /api suffix (for special routes like auth)
 * Note: Since PRODUCTION_BASE already includes /api, we strip it here
 */
export const API_URL = PRODUCTION_BASE.replace('/api', '');

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
