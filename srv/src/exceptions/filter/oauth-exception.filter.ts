/**
 * OAuthExceptionFilter — RFC 6749 §5.2 compliant error response filter.
 *
 * Applied via @UseFilters on OAuth controllers (token, verification) to ensure
 * every error from those endpoints is returned as:
 *
 *   { "error": "<code>", "error_description": "<human-readable message>" }
 *
 * This filter intentionally strips internal details (stack traces, class names,
 * file paths, timestamps) from the response body. Full details are logged
 * server-side only, so attackers cannot learn about server internals.
 *
 * Exception mapping priority:
 *   1. OAuthException        → uses its errorCode + errorDescription directly
 *   2. BadRequestException   → mapped to "invalid_request"
 *   3. HttpException with { error } body → passed through (legacy shaped errors)
 *   4. UnauthorizedException → mapped to "invalid_client"
 *   5. Everything else       → "server_error" (safe fallback)
 *
 * Response headers follow RFC 6749 §5.1: no-store cache, UTF-8 JSON content type.
 */
import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { OAuthException } from '../oauth-exception';

@Catch()
export class OAuthExceptionFilter implements ExceptionFilter {
  private static readonly LOGGER = new Logger(OAuthExceptionFilter.name);

  catch(exception: Error, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    let error: string;
    let errorDescription: string;
    let statusCode: number;

    // First-class OAuth errors — already carry the correct code and description
    if (exception instanceof OAuthException) {
      error = exception.errorCode;
      errorDescription = exception.errorDescription;
      statusCode = exception.getStatus();

    // NestJS HttpExceptions that weren't thrown as OAuthException
    } else if (exception instanceof HttpException) {
      const body = exception.getResponse();

      // Validation failures and malformed requests → invalid_request
      if (exception instanceof BadRequestException) {
        const msg = typeof body === 'string' ? body : (body as any)?.message;
        error = 'invalid_request';
        errorDescription = typeof msg === 'string' ? msg : 'Bad request';
        statusCode = 400;

      // Legacy errors already shaped as { error, error_description } — pass through
      } else if (typeof body === 'object' && body !== null && 'error' in body) {
        const shaped = body as Record<string, unknown>;
        error = String(shaped.error);
        errorDescription = shaped.error_description != null ? String(shaped.error_description) : '';
        statusCode = exception.getStatus();

      // Auth failures without explicit OAuth shaping → invalid_client
      } else if (exception instanceof UnauthorizedException) {
        error = 'invalid_client';
        errorDescription = 'Client authentication failed';
        statusCode = 401;

      // Any other HttpException — safe generic fallback
      } else {
        error = 'server_error';
        errorDescription = 'An unexpected error occurred';
        statusCode = 400;
      }

    // Non-HTTP exceptions (e.g. TypeORM, runtime errors) — never leak details
    } else {
      error = 'server_error';
      errorDescription = 'An unexpected error occurred';
      statusCode = 400;
    }

    // Full error detail logged server-side for debugging; never sent to the client
    OAuthExceptionFilter.LOGGER.error(
      `OAuth error [${error}]: ${exception.message}`,
      exception.stack,
    );

    // RFC 6749 §5.2: error response with no-store caching
    response
      .status(statusCode)
      .set('Content-Type', 'application/json;charset=UTF-8')
      .set('Cache-Control', 'no-store')
      .set('Pragma', 'no-cache')
      .json({ error, error_description: errorDescription });
  }
}
