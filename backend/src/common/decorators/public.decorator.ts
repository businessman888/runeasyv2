import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key checked by SupabaseAuthGuard to skip authentication.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or whole controller) as public, bypassing the global
 * SupabaseAuthGuard. Use only for endpoints that legitimately must be reachable
 * without a Supabase access token (login, token refresh, health check, and
 * webhooks that carry their own signature/secret verification).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
