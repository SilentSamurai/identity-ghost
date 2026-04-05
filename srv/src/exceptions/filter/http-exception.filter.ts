/**
 * HttpExceptionFilter - Global exception filter for HTTP responses.
 * 
 * This filter handles all unhandled exceptions and formats them as JSON responses.
 * It adds RFC 6750 compliant WWW-Authenticate headers for 403 errors on protected
 * resources (insufficient_scope error).
 * 
 * The filter ensures consistent error response format with timestamp, URL, status, and message.
 */
import {ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger, Type,} from "@nestjs/common";
import {Request, Response} from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    static exceptionResolver: Map<Type, Function> = new Map<Type, Function>();
    private static readonly LOGGER = new Logger(HttpExceptionFilter.name);

    static {
    }

    // Exception may not be an HttpException.
    catch(exception: Error, host: ArgumentsHost) {
        const context = host.switchToHttp();
        const request = context.getRequest<Request>();
        const response = context.getResponse<Response>();
        console.error(exception);

        if (exception instanceof HttpException) {
            const httpException = exception as HttpException;
            let error = httpException.getResponse ? httpException.getResponse() : {};

            error["message"] = httpException.message;
            error["url"] = request.url;
            error["timestamp"] = new Date().toISOString();
            error["status"] = httpException.getStatus();

            // RFC 6750 §3: Add WWW-Authenticate header for 403 on protected resource endpoints
            if (httpException.getStatus() === 403 && (request as any)["SECURITY_CONTEXT"]) {
                response.setHeader('WWW-Authenticate', 'Bearer realm="auth-server", error="insufficient_scope"');
            }

            response.status(httpException.getStatus()).json(error);
        } else {
            const message: string = (exception as Error)?.message;
            response.status(500).json({
                message: message,
                status: 500,
                timestamp: new Date().toISOString(),
                url: request.url,
            });
        }
    }
}
