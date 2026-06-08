/**
 * Environment configuration for RunEasy Mobile.
 *
 * Single source of truth for "which environment am I running in?". The actual
 * connection values (Supabase URL/key, API URL) keep being read from
 * `EXPO_PUBLIC_*` by their respective modules (services/supabase.ts,
 * config/api.config.ts) — those vars are injected per build:
 *   - EAS builds → `env` block of the matching profile in eas.json
 *   - Local runs → .env (production by default), optionally overlaid by
 *     .env.staging when APP_ENV=staging (see app.config.js)
 *
 * This module only derives the *variant* from EXPO_PUBLIC_APP_VARIANT so the UI
 * (env badge, dev tooling) can react to it without re-reading raw env vars.
 */

export type AppVariant = 'development' | 'preview' | 'staging' | 'production';

const RAW_VARIANT = process.env.EXPO_PUBLIC_APP_VARIANT as AppVariant | undefined;

/**
 * Current environment. Falls back to 'development' in a JS dev build and
 * 'production' otherwise, so a build that forgot to set APP_VARIANT never
 * accidentally renders the staging badge in the store build.
 */
export const APP_VARIANT: AppVariant =
    RAW_VARIANT ?? (__DEV__ ? 'development' : 'production');

export const IS_PRODUCTION = APP_VARIANT === 'production';
export const IS_STAGING = APP_VARIANT === 'staging';
export const IS_PREVIEW = APP_VARIANT === 'preview';
export const IS_DEVELOPMENT = APP_VARIANT === 'development';

/**
 * Show the environment badge on any non-production build (staging, preview,
 * dev). It is NEVER shown in production, so the store build stays clean.
 */
export const SHOW_ENV_BADGE = !IS_PRODUCTION;

/** Short, uppercase label rendered inside the badge. */
export const ENV_LABEL: Record<AppVariant, string> = {
    development: 'DEV',
    preview: 'PREVIEW',
    staging: 'STAGING',
    production: 'PROD',
};
