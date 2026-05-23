import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../../database';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token required');
    }

    try {
      const {
        data: { user },
        error,
      } = await this.supabaseService.auth.getUser(token);

      if (error || !user) {
        throw new UnauthorizedException('Invalid authentication token');
      }

      // Attach user to request object
      request.user = user;

      // Also enforce consistency if x-user-id header is present
      const headerUserId = request.headers['x-user-id'];
      if (headerUserId && headerUserId !== user.id) {
        throw new UnauthorizedException('User ID mismatch');
      }

      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
