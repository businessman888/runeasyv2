import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter. Produces a consistent JSON error shape and never
 * leaks stack traces / internal messages to clients in production. Unhandled
 * (non-HTTP) errors are logged in full server-side but surfaced as a generic
 * 500 to the caller.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isProduction = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // If the response was already sent (e.g. webhooks that res.send() early),
    // don't try to write again.
    if (response.headersSent) {
      this.logger.error(
        `Exception after response sent on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      return;
    }

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // Derive a safe message. HttpExceptions carry a client-safe message; any
    // other error is masked in production.
    let message: string | string[] = 'Internal server error';
    if (isHttp) {
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : ((res as { message?: string | string[] }).message ??
            exception.message);
    } else if (!this.isProduction && exception instanceof Error) {
      message = exception.message;
    }

    // Server-side logging: 5xx at error (with stack), 4xx at warn.
    const logContext = `${request.method} ${request.url}`;
    if (status >= 500) {
      this.logger.error(
        `${status} ${logContext}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${status} ${logContext} — ${JSON.stringify(message)}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
