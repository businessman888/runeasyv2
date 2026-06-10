import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../../database';

/**
 * Authorizes only Pro subscribers. Must run AFTER SupabaseAuthGuard (which is
 * global), so `request.user` is already the validated user. Reads the
 * authenticated user's `subscription_plan` from the DB and throws 403 for
 * anyone who is not 'pro'.
 *
 * Use on endpoints that must be a hard Pro-only block. For flows that should
 * degrade gracefully for Free users (returning a soft "upgrade" response
 * instead of an error), keep the in-handler plan check instead.
 */
@Injectable()
export class ProGuard implements CanActivate {
  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.id;

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const { data } = await this.supabaseService
      .from('users')
      .select('subscription_plan')
      .eq('id', userId)
      .maybeSingle();

    const isPro = (data?.subscription_plan ?? 'free') === 'pro';
    if (!isPro) {
      throw new ForbiddenException('This feature requires a RunEasy Pro plan');
    }

    return true;
  }
}
