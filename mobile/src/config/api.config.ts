/**
 * API Configuration for RunEasy Mobile App
 * 
 * Uses __DEV__ to determine which API URL to use:
 * - Development: Cloudflare tunnel or localhost
 * - Production: Railway deployed API
 * 
 * IMPORTANT: All stores should import BASE_API_URL from this file
 */

// Production API URL (Railway deployment)
const PRODUCTION_BASE = 'https://runeasy-production.up.railway.app';

// Development API URL (from .env or fallback to localhost)
const DEVELOPMENT_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Get the appropriate base URL (without /api suffix)
 */
const getBaseUrl = (): string => {
    let url = __DEV__ ? DEVELOPMENT_BASE : PRODUCTION_BASE;
    // Remove /api suffix if present (we'll add it in BASE_API_URL)
    if (url.endsWith('/api')) {
        url = url.slice(0, -4);
    }
    return url;
};

/**
 * API base URL WITHOUT /api suffix (for special routes like auth)
 */
export const API_URL = getBaseUrl();

/**
 * API base URL WITH /api suffix (for most API calls)
 * Use this in stores for consistency!
 */
export const BASE_API_URL = `${getBaseUrl()}/api`;

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
