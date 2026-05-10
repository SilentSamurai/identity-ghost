/**
 * `UnifiedAuthorizeComponent`
 *
 * Single entry point for all OAuth authorization UI interactions. Mounted at
 * `/authorize` (Requirement 1.1). Parses OAuth parameters from the URL
 * exactly once in `ngOnInit`, stores them in `Component_State`, and renders
 * the appropriate sub-view based on the `view` query parameter.
 *
 * Design references: `design.md` → "UnifiedAuthorizeComponent" and
 * `requirements.md` Requirements 1–3, 6–9, 11, 13. Correctness properties:
 * P1 (OAuth parameter immutability), P4 (view state closure), P5 (state
 * clearing on destroy), P6 (CSRF token fidelity), P10 (CSRF required for
 * all POSTs).
 *
 * Task 8.1 scope: URL parse, Component_State initialisation, session-info
 * fetch for consent/session-confirm views, and error mapping. The submit
 * handlers (login, consent, session-confirm, tenant-selection) are wired in
 * tasks 8.3–8.5.
 */

import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { from, Subject, takeUntil } from 'rxjs';

import { AuthorizeRedirectBuilder } from './authorize/authorize-redirect.builder';
import { MissingCsrfTokenError, RequestTimeoutError, AuthorizeApi } from './authorize/authorize.api';
import { parseOAuthParametersFromUrl } from './authorize/oauth-params.util';
import { OAuthParameters, TenantInfo, ViewKind } from './authorize/authorize.types';

/**
 * Maps an `OAuthParseError` discriminant to the human-readable message shown
 * in the error view. Matches the error table in `design.md` → "Error
 * Handling".
 */
const ERROR_MESSAGES: Record<string, string> = {
    missing_client_id:
        'Invalid authorization request. Please start over from your application.',
    missing_redirect_uri:
        'Invalid authorization request. Please start over from your application.',
    invalid_query:
        'Invalid authorization request. Please start over from your application.',
    legacy_route:
        'This page no longer exists. Please restart from your application.',
    unknown_view:
        'Invalid authorization request.',
    prompt_none_with_ui_view:
        'This request cannot be satisfied without showing a UI.',
};

/**
 * Whether the given parse error allows a "Start Over" recovery action.
 *
 * Errors that arise because required OAuth parameters are missing (or because
 * the URL is a legacy-route bookmark) cannot produce a valid
 * `/api/oauth/authorize` redirect URL, so the "Start Over" button is
 * suppressed (Req 9.5, 9.6, 10.5).
 */
const NON_RECOVERABLE_ERRORS = new Set([
    'missing_client_id',
    'missing_redirect_uri',
    'invalid_query',
    'legacy_route',
    'prompt_none_with_ui_view',
]);

/**
 * Extracts a human-readable error message from an unknown thrown value.
 *
 * Handles `HttpErrorResponse` (Angular HTTP errors) and plain `Error`
 * objects. Returns `null` when no message can be extracted so callers can
 * fall back to a default string.
 *
 * Used by `onLoginSubmit` and `onTenantSelect` to surface backend 4xx/5xx
 * messages inline on the current view (Req 8.5, 13.2).
 */
function extractErrorMessage(err: unknown): string | null {
    if (err instanceof HttpErrorResponse) {
        // Angular wraps backend JSON error bodies in `error.message` or `error.error`.
        return (
            (err.error as { message?: string })?.message ??
            err.message ??
            null
        );
    }
    if (err instanceof Error) {
        return err.message || null;
    }
    return null;
}

@Component({
    selector: 'app-authorize',
    template: `
        <app-open-navbar></app-open-navbar>
        <app-centered-card imageUrl="/assets/logo.svg">
            <ng-container [ngSwitch]="viewKind">

                <app-loading-view *ngSwitchCase="'loading'"></app-loading-view>

                <app-login-view
                    *ngSwitchCase="'login'"
                    [clientId]="clientId"
                    [inflight]="inflight.login"
                    [errorMessage]="errorMessage"
                    (loginSubmit)="onLoginSubmit($event)"
                ></app-login-view>

                <app-consent-view
                    *ngSwitchCase="'consent'"
                    [clientId]="clientId"
                    [scope]="scope"
                    [userEmail]="userEmail"
                    [inflightGrant]="inflight.consentGrant"
                    [inflightDeny]="inflight.consentDeny"
                    [errorMessage]="errorMessage"
                    (grant)="onConsentGrant()"
                    (deny)="onConsentDeny()"
                ></app-consent-view>

                <app-session-confirm-view
                    *ngSwitchCase="'session-confirm'"
                    [userEmail]="userEmail"
                    [inflightContinue]="inflight.continue"
                    [inflightLogout]="inflight.logout"
                    [errorMessage]="errorMessage"
                    (continueSession)="onContinueSession()"
                    (logout)="onLogout()"
                ></app-session-confirm-view>

                <app-tenant-selection-view
                    *ngSwitchCase="'tenant-selection'"
                    [tenants]="pendingTenants"
                    [inflight]="inflight.tenantPick"
                    [errorMessage]="errorMessage"
                    (tenantSelect)="onTenantSelect($event)"
                ></app-tenant-selection-view>

                <app-error-view
                    *ngSwitchCase="'error'"
                    [message]="errorMessage ?? ''"
                    [recoverable]="errorRecoverable"
                    (startOver)="onStartOver()"
                ></app-error-view>

            </ng-container>
        </app-centered-card>
    `,
    styles: [`
        .unified-authorize-host {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 16px;
        }
    `],
    host: {
        // Bind the active view kind onto the host element as `data-view` so
        // Cypress tests can assert exactly one view is active at any time
        // (Property 4: "View state closure", Requirement P4).
        // e.g. cy.get('app-authorize[data-view="login"]')
        '[attr.data-view]': 'viewKind',
    },
})
export class AuthorizeComponent implements OnInit, OnDestroy {
    // -----------------------------------------------------------------------
    // Component_State — private, write-once after ngOnInit (P1)
    // -----------------------------------------------------------------------

    /**
     * Parsed OAuth parameters. Set once in `ngOnInit` and never mutated
     * thereafter (Property 1: "OAuth parameter immutability"). Stored as
     * `Readonly<OAuthParameters>` to make the immutability intent explicit at
     * the type level.
     */
    private oauthParams: Readonly<OAuthParameters> | null = null;

    /**
     * CSRF token captured from the initial URL parse. Forwarded verbatim to
     * every POST body — never modified, truncated, or re-derived (Property 6:
     * "CSRF token fidelity").
     */
    private csrfToken: string | null = null;

    /**
     * Transient credentials held only between a `requires_tenant_selection`
     * login response and the successful re-login with a tenant hint. Cleared
     * immediately after success or on `ngOnDestroy` (Req 3.5, 3.7, P5).
     *
     * Kept private — the template accesses it via the `pendingTenants` getter
     * below. Credentials are never exposed to the template directly (P2).
     */
    private pendingCredentials: { email: string; password: string; clientId: string } | null = null;

    /**
     * Tenant list returned alongside `requires_tenant_selection`. Cleared
     * together with `pendingCredentials` (Req 3.7, P5).
     *
     * Exposed to the template as a read-only array via the getter below so
     * the `<app-tenant-selection-view>` can render the list without the
     * template needing direct access to the private field.
     */
    private _pendingTenants: TenantInfo[] = [];

    // -----------------------------------------------------------------------
    // Template-visible state
    // -----------------------------------------------------------------------

    /** Active view branch. Exactly one of the ViewKind values at all times (P4). */
    viewKind: ViewKind = 'loading';

    /** Error message rendered by `<app-error-view>`. */
    errorMessage: string | null = null;

    /**
     * Whether the current error view should show a "Start Over" button.
     * False for errors where `oauthParams` is null (no valid redirect URL).
     */
    errorRecoverable = false;

    /**
     * Email fetched from `GET /api/oauth/session-info` for the `consent` and
     * `session-confirm` views. `null` while the request is in flight — the
     * sub-views render a placeholder and keep their buttons disabled (Req 11.8).
     */
    userEmail: string | null = null;

    /**
     * Per-button in-flight tracking. Each flag drives the disabled state and
     * in-button spinner for exactly one submit button (Property 9:
     * "Submit-button mutual exclusion", Req 11.7).
     */
    inflight: {
        login: boolean;
        tenantPick: boolean;
        consentGrant: boolean;
        consentDeny: boolean;
        logout: boolean;
        continue: boolean;
    } = {
        login: false,
        tenantPick: false,
        consentGrant: false,
        consentDeny: false,
        logout: false,
        continue: false,
    };

    // -----------------------------------------------------------------------
    // Destroy signal — used with takeUntil to cancel in-flight observables
    // -----------------------------------------------------------------------

    private readonly destroy$ = new Subject<void>();

    // -----------------------------------------------------------------------
    // Template-visible tenant list (read-only proxy for the private field)
    // -----------------------------------------------------------------------

    /**
     * Read-only view of the pending tenant list for the template.
     * The underlying `_pendingTenants` array is private so tasks 8.3–8.5
     * can mutate it without the template having write access.
     */
    get pendingTenants(): TenantInfo[] {
        return this._pendingTenants;
    }

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    constructor(
        private readonly route: ActivatedRoute,
        private readonly api: AuthorizeApi,
        private readonly redirectBuilder: AuthorizeRedirectBuilder,
    ) {}

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    /**
     * Parse the URL exactly once and initialise `Component_State`.
     *
     * The URL is read from `ActivatedRoute.snapshot.queryParamMap` — a
     * snapshot, not an observable — so it is consumed once and never
     * re-read during the component's lifetime (P1, Req 1.2, 1.5).
     *
     * After a successful parse:
     *   - `oauthParams` and `csrfToken` are stored as private fields.
     *   - `viewKind` is set from the parsed `view` value.
     *   - If `viewKind` is `consent` or `session-confirm`, `sessionInfo()` is
     *     called immediately and `userEmail` is populated when it resolves;
     *     the sub-view renders a placeholder until then (Req 11.8).
     *
     * On any parse error, `viewKind` is set to `'error'` with the mapped
     * message from the design's error table and no view-specific UI is
     * rendered (Req 1.3, 13.4).
     */
    ngOnInit(): void {
        const queryMap = this.route.snapshot.queryParamMap;
        const result = parseOAuthParametersFromUrl(queryMap);

        if (result.error) {
            const message = ERROR_MESSAGES[result.error] ?? 'Invalid authorization request.';
            const recoverable = !NON_RECOVERABLE_ERRORS.has(result.error);
            // Store params if available so "Start Over" can rebuild the URL
            if (result.params) {
                this.oauthParams = Object.freeze({ ...result.params });
            }
            this.showError(message, recoverable);
            return;
        }

        // Successful parse — store immutable copies (P1)
        this.oauthParams = Object.freeze({ ...result.params! });
        this.csrfToken = result.csrfToken;

        const view = result.view as ViewKind;
        this.viewKind = view;

        // For consent and session-confirm, fetch the user's email immediately
        // so the sub-view can render it. The view stays in its initial state
        // (buttons disabled, placeholder shown) until the promise resolves
        // (Req 11.8, Req 6.1, Req 7.1).
        if (view === 'consent' || view === 'session-confirm') {
            this.fetchSessionInfo();
        }
    }

    /**
     * Clear all sensitive data from `Component_State` (P5, Req 11.5, 11.6).
     *
     * After this method returns, no reference to OAuth parameters, CSRF
     * token, or user credentials is reachable through this component instance.
     * In-flight HTTP observables are cancelled via `destroy$`.
     */
    ngOnDestroy(): void {
        // Signal all takeUntil operators to complete, cancelling any
        // in-flight HTTP observables so they cannot write to the component
        // after it has been destroyed.
        this.destroy$.next();
        this.destroy$.complete();

        // Clear all sensitive fields (P5)
        this.oauthParams = null;
        this.csrfToken = null;
        this.pendingCredentials = null;
        this._pendingTenants = [];
        this.errorMessage = null;
        this.userEmail = null;

        // Reset inflight flags
        this.inflight = {
            login: false,
            tenantPick: false,
            consentGrant: false,
            consentDeny: false,
            logout: false,
            continue: false,
        };

        // Reset view to loading (neutral state)
        this.viewKind = 'loading';
    }

    // -----------------------------------------------------------------------
    // Template accessors — expose private state to the template in a
    // controlled, read-only manner
    // -----------------------------------------------------------------------

    /** The parsed OAuth `client_id`, or empty string before parse completes. */
    get clientId(): string {
        return this.oauthParams?.client_id ?? '';
    }

    /** The parsed OAuth `scope`, or null when absent. */
    get scope(): string | null {
        return this.oauthParams?.scope ?? null;
    }

    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------

    /**
     * Centralised error renderer. Sets `viewKind = 'error'` and records the
     * message and recoverability flag. All error paths in the component funnel
     * through this method so no view-specific partial recovery occurs
     * (Req 13.6, task 8.7).
     *
     * @param message     Human-readable error string from the design's error table.
     * @param recoverable When true, the error view shows a "Start Over" button.
     */
    private showError(message: string, recoverable: boolean): void {
        this.viewKind = 'error';
        this.errorMessage = message;
        this.errorRecoverable = recoverable;
    }

    /**
     * Handler for `ErrorViewComponent.startOver`. Redirects to
     * `GET /api/oauth/authorize` with the preserved OAuth parameters so the
     * backend can restart the flow (Req 13.5). If `oauthParams` is null
     * (e.g., missing required params), the button is not shown, so this
     * handler is a no-op in that case.
     */
    onStartOver(): void {
        if (!this.oauthParams) {
            return;
        }
        window.location.href = this.redirectBuilder.toAuthorizeEndpoint(this.oauthParams);
    }

    // -----------------------------------------------------------------------
    // Login and tenant-selection handlers (task 8.3)
    // -----------------------------------------------------------------------

    /**
     * Handler for `LoginViewComponent.loginSubmit`.
     *
     * Guards the CSRF token (P10): if `csrfToken` is null/empty, sets
     * `viewKind = 'error'` and does NOT issue any network request.
     *
     * Sets `inflight.login = true` before the POST and resets it on every
     * exit path (P9, Req 11.7).
     *
     * On `{ success: true }`: clears `pendingCredentials` and redirects to
     * `GET /api/oauth/authorize` with no one-shot flags (Req 3.7).
     *
     * On `{ requires_tenant_selection: true, tenants }`: stores credentials
     * and tenant list in `Component_State` ONLY — never in Router state,
     * localStorage, sessionStorage, or cookies (P2, Req 3.4, 3.5) — and
     * switches to the tenant-selection view (Req 3.1, 3.3).
     *
     * On backend error: keeps `csrfToken` unchanged (P6), re-enables the
     * submit button, and renders the error message on the login view (Req 8.5).
     *
     * On timeout: shows the error view via `showError` (Req 6.7).
     *
     * Requirements: 3.1–3.6, 8.1–8.7, 11.1–11.3, 11.7, 13.2, P2, P6, P9, P10.
     */
    async onLoginSubmit(credentials: { email: string; password: string }): Promise<void> {
        // P10: guard — if csrfToken is absent, show error and do not POST.
        if (!this.csrfToken) {
            this.showError(
                'Your session could not be verified. Start over.',
                /* recoverable */ !!this.oauthParams,
            );
            return;
        }

        // P9: set inflight flag to disable the submit button and show spinner.
        this.inflight.login = true;
        // Clear any previous inline error message.
        this.errorMessage = null;

        const loginBody = {
            email: credentials.email,
            password: credentials.password,
            client_id: this.oauthParams?.client_id ?? '',
            // csrf_token is forwarded verbatim by the API wrapper (P6).
            // We include it here to satisfy the LoginBody type; the API
            // merges it explicitly as the second argument.
            csrf_token: this.csrfToken,
            // subscriber_tenant_hint is not set on the initial login attempt;
            // it is added only on the tenant-selection re-POST (Req 3.2).
        };

        try {
            // P6: csrfToken is forwarded verbatim — never modified or re-derived.
            const response = await this.api.login(loginBody, this.csrfToken);

            if ('success' in response && response.success === true) {
                // Successful login — clear any transient credentials (Req 3.7)
                // and redirect back to the backend authorize endpoint so it can
                // choose the next view (consent, session-confirm, or issue code).
                this.pendingCredentials = null;
                this._pendingTenants = [];

                // After login the session is fresh — skip session-confirm.
                window.location.href = this.redirectBuilder.toAuthorizeEndpoint(this.oauthParams!, { session_confirmed: true });
            } else if ('requires_tenant_selection' in response && response.requires_tenant_selection === true) {
                // The user belongs to multiple tenants for this client.
                // Store credentials and tenant list in Component_State ONLY —
                // never in Router state, localStorage, sessionStorage, or cookies
                // (P2, Req 3.4, 3.5).
                this.pendingCredentials = {
                    email: credentials.email,
                    password: credentials.password,
                    clientId: this.oauthParams?.client_id ?? '',
                };
                this._pendingTenants = response.tenants;

                // Switch to the tenant-selection view (Req 3.1, 3.3).
                this.viewKind = 'tenant-selection';
                // P9: re-enable the login inflight flag now that we've transitioned.
                this.inflight.login = false;
            }
        } catch (err) {
            // P9: re-enable the submit button on any error path.
            this.inflight.login = false;

            if (err instanceof MissingCsrfTokenError) {
                // P10: CSRF token was missing — show error view (Req 8.7).
                this.showError(
                    'Your session could not be verified. Start over.',
                    /* recoverable */ !!this.oauthParams,
                );
            } else if (err instanceof RequestTimeoutError) {
                // Req 6.7: timeout — show error view via shared helper.
                this.showError(
                    'The server is not responding. Please try again.',
                    /* recoverable */ !!this.oauthParams,
                );
            } else {
                // Req 8.5: backend 4xx/5xx — keep csrfToken unchanged (P6),
                // render the error message on the current login view rather
                // than switching to the error view.
                this.errorMessage = extractErrorMessage(err) ?? 'Login failed. Please try again.';
                // viewKind stays as 'login' so the error renders inline.
            }
        }
    }

    /**
     * Handler for `TenantSelectionViewComponent.tenantSelect`.
     *
     * Re-POSTs the stored credentials with `subscriber_tenant_hint` set to
     * the selected tenant's domain. Reuses the SAME `csrfToken` (P6, Req 3.6).
     *
     * On success: clears `pendingCredentials` and `pendingTenants` before
     * redirecting (Req 3.7).
     *
     * On backend error: keeps the tenant-selection view active and renders
     * the error message inline (Req 8.5). `csrfToken` is never modified (P6).
     *
     * On timeout: shows the error view via `showError` (Req 6.7).
     *
     * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, P2, P6, P9, P10.
     */
    async onTenantSelect(tenant: TenantInfo): Promise<void> {
        // P10: guard — if csrfToken is absent, show error and do not POST.
        if (!this.csrfToken) {
            this.showError(
                'Your session could not be verified. Start over.',
                /* recoverable */ !!this.oauthParams,
            );
            return;
        }

        // pendingCredentials must be present to re-POST; if somehow missing,
        // treat it as a session error.
        if (!this.pendingCredentials) {
            this.showError(
                'Your session could not be verified. Start over.',
                /* recoverable */ !!this.oauthParams,
            );
            return;
        }

        // P9: set inflight flag to disable all tenant buttons and show spinners.
        this.inflight.tenantPick = true;
        this.errorMessage = null;

        const loginBody = {
            email: this.pendingCredentials.email,
            password: this.pendingCredentials.password,
            client_id: this.pendingCredentials.clientId,
            // csrf_token is forwarded verbatim by the API wrapper (P6).
            csrf_token: this.csrfToken,
            // Req 3.2: set subscriber_tenant_hint from the selected tenant's domain.
            subscriber_tenant_hint: tenant.domain,
        };

        try {
            // P6: same csrfToken forwarded verbatim — never re-derived.
            const response = await this.api.login(loginBody, this.csrfToken);

            if ('success' in response && response.success === true) {
                // Req 3.7: clear pendingCredentials and pendingTenants before
                // redirecting so they are not reachable after navigation.
                this.pendingCredentials = null;
                this._pendingTenants = [];

                // After login the session is fresh — skip session-confirm.
                window.location.href = this.redirectBuilder.toAuthorizeEndpoint(this.oauthParams!, { session_confirmed: true });
            } else {
                // Unexpected response shape — treat as an error.
                this.inflight.tenantPick = false;
                this.errorMessage = 'An unexpected response was received. Please try again.';
            }
        } catch (err) {
            // P9: re-enable tenant buttons on any error path.
            this.inflight.tenantPick = false;

            if (err instanceof MissingCsrfTokenError) {
                // P10: CSRF token was missing — show error view.
                this.showError(
                    'Your session could not be verified. Start over.',
                    /* recoverable */ !!this.oauthParams,
                );
            } else if (err instanceof RequestTimeoutError) {
                // Req 6.7: timeout — show error view.
                this.showError(
                    'The server is not responding. Please try again.',
                    /* recoverable */ !!this.oauthParams,
                );
            } else {
                // Req 8.5: backend 4xx/5xx — render error inline on the
                // tenant-selection view; csrfToken stays unchanged (P6).
                this.errorMessage = extractErrorMessage(err) ?? 'Login failed. Please try again.';
                // viewKind stays as 'tenant-selection'.
            }
        }
    }

    // -----------------------------------------------------------------------
    // Session-confirm handlers (task 8.5)
    // -----------------------------------------------------------------------

    /**
     * Handler for `SessionConfirmViewComponent.continueSession`.
     *
     * Redirects to `GET /api/oauth/authorize` with `session_confirmed=true`
     * appended as a one-shot flag (Req 7.8, P8). This is the ONLY code path
     * that sets `session_confirmed`; the flag is never stored in
     * `Component_State`.
     *
     * `inflight.continue` is set to true before the redirect so the button
     * is disabled while the browser navigates away (P9, Req 11.7).
     */
    onContinueSession(): void {
        if (!this.oauthParams) {
            this.showError(
                'Your session could not be verified. Start over to continue.',
                /* recoverable */ false,
            );
            return;
        }

        // Disable the button for the duration of the navigation (P9)
        this.inflight.continue = true;

        // session_confirmed is the ONLY extras flag set here (P8, Req 7.8).
        // It is never stored in Component_State — it is only appended to the
        // redirect URL at the moment of navigation.
        window.location.href = this.redirectBuilder.toAuthorizeEndpoint(
            this.oauthParams,
            { session_confirmed: true },
        );
    }

    /**
     * Handler for `SessionConfirmViewComponent.logout`.
     *
     * Guards `csrfToken` (P10, Req 7.6): if null/empty, shows the error view
     * without issuing any network request.
     *
     * On success: redirects to `GET /api/oauth/authorize` with
     * `from_logout=true` (Req 7.5, P8). This is the ONLY code path that sets
     * `from_logout`; the flag is never stored in `Component_State`.
     *
     * On failure (network error, 4xx/5xx, timeout): shows the error view via
     * `showError` (Req 13.2, 13.3).
     *
     * The body sent to the backend contains ONLY `{ csrf_token }` — `sid` is
     * never included (Req 7.4).
     */
    async onLogout(): Promise<void> {
        // P10: guard csrfToken before issuing any network request
        if (!this.csrfToken) {
            this.showError(
                'Your session could not be verified. Start over.',
                /* recoverable */ true,
            );
            return;
        }

        if (!this.oauthParams) {
            this.showError(
                'Your session could not be verified. Start over to continue.',
                /* recoverable */ false,
            );
            return;
        }

        this.inflight.logout = true;

        try {
            // api.logout sends only { csrf_token } in the body (Req 7.4).
            // The backend reads sid from the signed cookie.
            await this.api.logout(this.csrfToken);

            // from_logout is the ONLY extras flag set here (P8, Req 7.5).
            // It is never stored in Component_State — only appended to the
            // redirect URL at the moment of navigation.
            window.location.href = this.redirectBuilder.toAuthorizeEndpoint(
                this.oauthParams,
                { from_logout: true },
            );
        } catch (err) {
            this.inflight.logout = false;

            if (err instanceof MissingCsrfTokenError) {
                // Should not happen given the guard above, but handle
                // defensively (P10)
                this.showError(
                    'Your session could not be verified. Start over.',
                    /* recoverable */ true,
                );
            } else if (err instanceof RequestTimeoutError) {
                this.showError(
                    'The server is not responding. Please try again.',
                    /* recoverable */ true,
                );
            } else {
                // 403 CSRF failure or other 4xx/5xx (Req 13.2, 13.3)
                const httpErr = err as { status?: number; error?: { message?: string } };
                if (httpErr?.status === 403) {
                    this.showError(
                        'Your session has expired or been tampered with. Start over to continue.',
                        /* recoverable */ true,
                    );
                } else {
                    const message =
                        httpErr?.error?.message ??
                        'An unexpected error occurred. Please try again.';
                    this.showError(message, /* recoverable */ true);
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Consent handlers (task 8.4)
    // -----------------------------------------------------------------------

    /**
     * Handler for `ConsentViewComponent.grant`.
     *
     * Guards `csrfToken` (P10, Req 6.8): if absent, shows the error view
     * immediately without issuing any network request. Otherwise sets
     * `inflight.consentGrant`, POSTs `decision: 'grant'` to
     * `/api/oauth/consent`, and on success redirects to
     * `GET /api/oauth/authorize` so the backend can issue the authorization
     * code (Req 4.3, 4.4, 6.3, 6.5).
     *
     * Error handling:
     *   - `MissingCsrfTokenError` (csrfToken null/empty in Component_State):
     *     error view with "Start Over" (Req 6.8, P10).
     *   - HTTP 403 (CSRF rejected by backend): error view with "Start Over"
     *     (Req 13.3).
     *   - `RequestTimeoutError` (> 15 s): inline error on the consent view
     *     (Req 6.7).
     *   - Any other HTTP error: inline error on the consent view (Req 6.6,
     *     13.2).
     */
    onConsentGrant(): void {
        this.submitConsent('grant');
    }

    /**
     * Handler for `ConsentViewComponent.deny`.
     *
     * Identical flow to `onConsentGrant` but posts `decision: 'deny'` and
     * tracks `inflight.consentDeny`. On success the backend redirects to
     * External_Client with `error=access_denied` — the UI does not need to
     * distinguish grant from deny for the redirect (Req 4.4, 6.5).
     */
    onConsentDeny(): void {
        this.submitConsent('deny');
    }

    /**
     * Shared implementation for grant and deny. Extracted to avoid
     * duplicating the inflight/error/redirect logic.
     *
     * @param decision `'grant'` or `'deny'` forwarded verbatim to the backend.
     */
    private submitConsent(decision: 'grant' | 'deny'): void {
        // P10 / Req 6.8: guard csrfToken before issuing any network request.
        if (!this.csrfToken) {
            this.showError(
                'Your session could not be verified. Start over.',
                /* recoverable */ true,
            );
            return;
        }

        // oauthParams is always set when viewKind === 'consent', but guard
        // defensively so TypeScript is satisfied and the redirect below is safe.
        if (!this.oauthParams) {
            this.showError(
                'Invalid authorization request. Please start over from your application.',
                /* recoverable */ false,
            );
            return;
        }

        // Snapshot the values we need before the async boundary so that even
        // if the component is destroyed mid-flight the closure still holds
        // valid references.
        const csrfToken = this.csrfToken;
        const oauthParams = this.oauthParams;

        // Set the appropriate inflight flag (P9, Req 11.7).
        if (decision === 'grant') {
            this.inflight.consentGrant = true;
        } else {
            this.inflight.consentDeny = true;
        }

        // Clear any previous inline error on the consent view so the user
        // sees a clean state while the request is in flight.
        this.errorMessage = null;

        from(
            this.api.consent(
                {
                    decision,
                    client_id: oauthParams.client_id,
                    scope: oauthParams.scope ?? '',
                    csrf_token: csrfToken,
                },
                csrfToken,
            ),
        )
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: () => {
                    // Re-enable the button before navigating away (belt-and-suspenders).
                    if (decision === 'grant') {
                        this.inflight.consentGrant = false;
                    } else {
                        this.inflight.consentDeny = false;
                    }

                    // Req 4.3, 4.4, 6.5: redirect to the backend authorize
                    // endpoint with the preserved OAuth params. The backend
                    // decides whether to issue the code or the access_denied
                    // error redirect to External_Client.
                    window.location.href = this.redirectBuilder.toAuthorizeEndpoint(oauthParams);
                },
                error: (err: unknown) => {
                    // Re-enable the button regardless of error type (P9, Req 11.7).
                    if (decision === 'grant') {
                        this.inflight.consentGrant = false;
                    } else {
                        this.inflight.consentDeny = false;
                    }

                    if (err instanceof MissingCsrfTokenError) {
                        // csrfToken was null/empty — show the full error view
                        // with "Start Over" (P10, Req 6.8).
                        this.showError(
                            'Your session could not be verified. Start over.',
                            /* recoverable */ true,
                        );
                        return;
                    }

                    if (err instanceof HttpErrorResponse && err.status === 403) {
                        // Backend rejected the CSRF token — show the full
                        // error view with "Start Over" (Req 13.3).
                        this.showError(
                            'Your session has expired or been tampered with. Start over to continue.',
                            /* recoverable */ true,
                        );
                        return;
                    }

                    if (err instanceof RequestTimeoutError) {
                        // Request timed out — show inline error on the consent
                        // view so the user can retry (Req 6.7).
                        this.errorMessage =
                            'The server is not responding. Please try again.';
                        return;
                    }

                    // Any other HTTP error — show inline error on the consent
                    // view (Req 6.6, 13.2). Extract the backend message when
                    // available, otherwise fall back to a generic string.
                    if (err instanceof HttpErrorResponse && err.error?.message) {
                        this.errorMessage = err.error.message;
                    } else {
                        this.errorMessage =
                            'Something went wrong. Please try again or start over.';
                    }
                },
            });
    }

    // -----------------------------------------------------------------------
    // Session info fetch
    // -----------------------------------------------------------------------

    /**
     * Fetch the signed-in user's email from `GET /api/oauth/session-info`.
     * Called immediately after `ngOnInit` sets `viewKind` to `consent` or
     * `session-confirm` (Req 6.1, 7.1, 11.8).
     *
     * On success: `userEmail` is populated and the sub-view becomes
     * interactive.
     * On failure: the error view is shown with a "Start Over" option
     * (Req 2.5, 13.1).
     *
     * The Promise is wrapped in `from()` and piped through
     * `takeUntil(this.destroy$)` so that if the component is destroyed while
     * the request is in flight, the callback is suppressed and no write
     * occurs to the already-destroyed component instance (P5, Req 11.3).
     */
    private fetchSessionInfo(): void {
        from(this.api.sessionInfo())
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (info) => {
                    this.userEmail = info.email;
                },
                error: () => {
                    this.showError(
                        'Your session could not be verified. Start over to continue.',
                        /* recoverable */ true,
                    );
                },
            });
    }
}
