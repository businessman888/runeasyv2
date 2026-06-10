import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Shape of the object SupabaseAuthGuard attaches to `request.user` — the
 * authenticated Supabase user (from `auth.getUser(token)`).
 */
export interface AuthenticatedUser {
  id: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Injects the authenticated user (populated by SupabaseAuthGuard) into a
 * controller method.
 *
 *   @User() user: AuthenticatedUser   // whole user object
 *   @User('id') userId: string        // a single property
 *
 * The value is derived from the validated Bearer token — never from a
 * client-supplied header — so it is safe to trust for ownership checks.
 */
export const User = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
