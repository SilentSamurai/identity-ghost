/**
 * Thin `HttpClient` wrapper exposing exactly the four backend endpoints the
 * `UnifiedAuthorizeComponent` is allowed to talk to:
 *
 *   - `POST /api/oauth/login`        — credential submission
 *   - `POST /api/oauth/consent`      — grant / deny
 *   - `POST /api/oauth/logout`       — session invalidation (UI-initiated)
 *   - `GET  /api/oauth/session-info` — current session's email for the
 *                                      `consent` and `session-confirm` views
 *
 * Design references: `design.md` → "Components and Interfaces →
 * UnifiedAuthorizeApi" and `tasks.md` → task 6.4. Related correctness
 * properties:
 *
 *   - P6  "CSRF token fidelity" — this file never modifies, truncates, or
 *         re-derives `csrfToken`; it is forwarded verbatim to the backend.
 *   - P10 "CSRF token required for all POSTs" — each POST method asserts
 *         `csrfToken` is a non-empty string up front and throws
 *         `MissingCsrfTokenError` before issuing any network request.
 *
 * The wrapper intentionally does NOT know about `Component_State`: callers
 * pass the already-parsed `csrfToken` explicitly. This keeps the service
 * free of component-owned mutable state and makes it trivial to reason about
 * P6.
 *
 * `sid` is a signed, HttpOnly cookie set by the backend. It is attached
 * automatically by the browser thanks to `withCredentials: true` and MUST
 * NEVER be read from, or written to, the request body — most notably for
 * `logout`, where Req 7.4 explicitly forbids the UI from including `sid`
 * in the body.
 */

import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, lastValueFrom, throwError, timeout, TimeoutError } from 'rxjs';

import {
    ConsentBody,
    LoginBody,
    LoginResponse,
} from './authorize.types';

/**
 * Base path for the OAuth HTTP endpoints. Matches the NestJS routes declared
 * by `OAuthTokenController` and `RevocationController` on the backend.
 */
const AUTH_API = '/api/oauth';

/**
 * POST timeout enforced client-side via the RxJS `timeout` operator. Matches
 * the 15 s value called out in `tasks.md` task 6.4 and the error-handling
 * table in `design.md` ("Backend POST timeout (> 15s)").
 */
const POST_TIMEOUT_MS = 15_000;

/**
 * Shared `HttpClient` options for every request the wrapper issues.
 *
 * `withCredentials: true` is the critical piece — it lets the browser attach
 * the signed `sid` and `flow_id` cookies so the backend can resolve the
 * current login session and verify the CSRF token.
 */
const HTTP_OPTIONS = {
    headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
    withCredentials: true,
};

/**
 * Thrown by any POST method when the caller passes a `csrfToken` that is
 * `null`, `undefined`, or the empty string.
 *
 * Exporting this class lets `UnifiedAuthorizeComponent` (and Cypress tests)
 * do a typed `instanceof MissingCsrfTokenError` check to funnel into the
 * "Start Over" error view — see `design.md` → "Error Handling" row for
 * "`csrf_token` missing in `Component_State` on submit" (Req 6.8, 7.6, 8.7)
 * and correctness property P10.
 */
export class MissingCsrfTokenError extends Error {
    constructor(message: string = 'csrf_token is required but was not provided') {
        super(message);
        this.name = 'MissingCsrfTokenError';
    }
}

/**
 * Thrown when a POST request to the auth backend does not complete within
 * `POST_TIMEOUT_MS`. Mapped from RxJS' built-in `TimeoutError` so callers
 * can distinguish "server is slow" from "server said 4xx/5xx" without
 * inspecting the RxJS import.
 *
 * Maps to the "Backend POST timeout (> 15s)" row of the error-handling
 * table in `design.md` and Req 6.7.
 */
export class RequestTimeoutError extends Error {
    constructor(message: string = 'The server did not respond in time') {
        super(message);
        this.name = 'RequestTimeoutError';
    }
}

/**
 * Guard run at the top of every POST method. Kept as a standalone helper so
 * the three POST sites stay short and the "never send a POST with an empty
 * csrf_token" invariant has a single implementation (P10).
 */
function assertCsrfToken(csrfToken: string): void {
    if (typeof csrfToken !== 'string' || csrfToken.length === 0) {
        throw new MissingCsrfTokenError();
    }
}

@Injectable({ providedIn: 'root' })
export class AuthorizeApi {
    constructor(private readonly http: HttpClient) {
    }

    /**
     * Submit credentials to `POST /api/oauth/login`.
     *
     * The backend will either:
     *   - set the signed `sid` cookie and return `{ success: true }`, or
     *   - return `{ requires_tenant_selection: true, tenants }` so the UI can
     *     render the tenant-selection view. No `sid` is set in that case.
     *
     * `csrfToken` must be the verbatim value parsed from the initial
     * `/authorize?csrf_token=...` URL (Property 6). It is merged into the
     * request body as `csrf_token` exactly once — the caller MUST NOT
     * pre-set it in `body`.
     */
    async login(body: LoginBody, csrfToken: string): Promise<LoginResponse> {
        assertCsrfToken(csrfToken);

        const request$ = this.http.post<LoginResponse>(
            `${AUTH_API}/login`,
            { ...body, csrf_token: csrfToken },
            HTTP_OPTIONS,
        ).pipe(
            timeout(POST_TIMEOUT_MS),
            catchError((err) => throwError(() => mapTimeoutError(err))),
        );

        return await lastValueFrom(request$);
    }

    /**
     * Submit a consent decision to `POST /api/oauth/consent`.
     *
     * The backend records the grant (or records the deny and cleans up) and
     * returns `{ success: true }`. The UI then bounces through
     * `GET /api/oauth/authorize` which issues the authorization code or the
     * `access_denied` OAuth error redirect (Req 4.4, 6.5).
     */
    async consent(body: ConsentBody, csrfToken: string): Promise<{ success: true }> {
        assertCsrfToken(csrfToken);

        const request$ = this.http.post<{ success: true }>(
            `${AUTH_API}/consent`,
            { ...body, csrf_token: csrfToken },
            HTTP_OPTIONS,
        ).pipe(
            timeout(POST_TIMEOUT_MS),
            catchError((err) => throwError(() => mapTimeoutError(err))),
        );

        return await lastValueFrom(request$);
    }

    /**
     * Invalidate the current session via `POST /api/oauth/logout`.
     *
     * Req 7.4 is emphatic: the body carries ONLY `{ csrf_token }`. The
     * backend reads `sid` from the signed cookie alone — the UI never
     * includes it in the request body.
     */
    async logout(csrfToken: string): Promise<void> {
        assertCsrfToken(csrfToken);

        const request$ = this.http.post<void>(
            `${AUTH_API}/logout`,
            { csrf_token: csrfToken },
            HTTP_OPTIONS,
        ).pipe(
            timeout(POST_TIMEOUT_MS),
            catchError((err) => throwError(() => mapTimeoutError(err))),
        );

        await lastValueFrom(request$);
    }

    /**
     * Fetch the signed-in user's email for display on the `consent` and
     * `session-confirm` views. No CSRF token is needed: this is a read-only
     * GET whose authorisation is entirely carried by the `sid` cookie.
     */
    async sessionInfo(): Promise<{ email: string }> {
        return await lastValueFrom(
            this.http.get<{ email: string }>(
                `${AUTH_API}/session-info`,
                { withCredentials: true },
            ),
        );
    }
}

/**
 * Translate RxJS' `TimeoutError` into our typed `RequestTimeoutError`;
 * leave every other error untouched so existing backend 4xx/5xx responses
 * keep their original `HttpErrorResponse` shape for the component's error
 * handling.
 */
function mapTimeoutError(err: unknown): unknown {
    if (err instanceof TimeoutError) {
        return new RequestTimeoutError();
    }
    return err;
}
