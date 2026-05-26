import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Throttler keyed by the `x-user-id` header so the limit is per authenticated
 * user instead of per source IP. Falls back to IP for unauthenticated requests
 * (which shouldn't reach the throttled endpoint anyway — the controller rejects
 * missing user-id before the handler runs).
 */
@Injectable()
export class UserIdThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const headerVal = req.headers?.['x-user-id'];
    const userId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
    if (typeof userId === 'string' && userId.length > 0) {
      return `user:${userId}`;
    }
    return `ip:${req.ip ?? 'unknown'}`;
  }
}
