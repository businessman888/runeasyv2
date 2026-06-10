import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

const SLOW_REQUEST_MS = 1000;

/**
 * Logs any request that takes longer than SLOW_REQUEST_MS so performance
 * regressions on hot paths surface in the logs without instrumenting each
 * endpoint.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method, url } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        if (ms > SLOW_REQUEST_MS) {
          this.logger.warn(`SLOW: ${method} ${url} — ${ms}ms`);
        }
      }),
    );
  }
}
