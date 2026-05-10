import {Component, EventEmitter, Input, Output} from '@angular/core';

/**
 * Consent view sub-component of `UnifiedAuthorizeComponent`.
 *
 * Purely presentational: renders the "<client_id> is requesting access"
 * screen with the requested scopes and two actions (grant / deny). All state,
 * OAuth parameter handling, and HTTP calls live in the parent component —
 * this child only receives inputs and emits user intent.
 *
 * Design anchors:
 *   - Requirements 6.1, 6.2: show `client_id` and requested `scope`; the user
 *     email is fetched by the parent from `/api/oauth/session-info` and passed
 *     in as `userEmail`.
 *   - Requirement 11.7 / Property 9 (submit-button mutual exclusion): while a
 *     grant or deny request is in flight, the *originating* button is disabled
 *     and shows an in-button spinner; the other button stays enabled so the
 *     user can still cancel or approve mid-flight if the first request times
 *     out. Concretely, `inflightGrant` gates only the grant button and
 *     `inflightDeny` gates only the deny button, but both are disabled while
 *     either is in flight (per-button mutex AND mutual exclusion between the
 *     two buttons so the user cannot double-submit a contradictory decision).
 *   - Requirement 11.8: while `userEmail` is still being fetched (`null`),
 *     render a lightweight placeholder in its slot and keep both buttons
 *     disabled so the user cannot act on data that isn't there yet.
 *   - Property 4 (view state closure): the root element carries
 *     `[data-view]="consent"` so Cypress tests can assert exactly one view is
 *     active at any time.
 *
 * This component makes no HTTP calls, reads no OAuth parameters, and has no
 * router dependency. It is explicitly not `standalone` so that it can be
 * declared in `AppModule` alongside the other open-pages components (see
 * task 9.1).
 */
@Component({
    selector: 'app-consent-view',
    template: `
        <div [attr.data-view]="'consent'">
            <div class="card-header mb-3">
                <h4 class="mb-0">{{ clientId }} is requesting access</h4>
            </div>

            <p class="text-muted mb-3">
                Signed in as
                <ng-container *ngIf="userEmail; else emailPlaceholder">
                    <strong>{{ userEmail }}</strong>
                </ng-container>
                <ng-template #emailPlaceholder>
                    <span class="placeholder-glow" data-email-placeholder>
                        <span class="placeholder col-4"></span>
                    </span>
                </ng-template>
            </p>

            <p class="text-muted mb-4">
                This application is requesting access to the following:
            </p>

            <div class="list-group mb-4" *ngIf="requestedScopes.length > 0">
                <div *ngFor="let s of requestedScopes" class="list-group-item">
                    <div class="d-flex align-items-center">
                        <i class="fa fa-check-circle text-success me-3"></i>
                        <div>
                            <h6 class="mb-0">{{ describeScope(s) }}</h6>
                            <small class="text-muted">{{ s }}</small>
                        </div>
                    </div>
                </div>
            </div>

            <div *ngIf="errorMessage" class="alert alert-danger" role="alert">
                {{ errorMessage }}
            </div>

            <div class="d-grid gap-2">
                <button type="button"
                        class="btn btn-primary btn-lg"
                        [disabled]="isGrantDisabled()"
                        (click)="onGrant()">
                    <span *ngIf="inflightGrant"
                          class="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                          [attr.data-spinner]="'grant'"></span>
                    Approve
                </button>
                <button type="button"
                        class="btn btn-outline-secondary btn-lg"
                        [disabled]="isDenyDisabled()"
                        (click)="onDeny()">
                    <span *ngIf="inflightDeny"
                          class="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                          [attr.data-spinner]="'deny'"></span>
                    Deny
                </button>
            </div>
        </div>
    `,
    styles: [`
        .list-group-item {
            border: 1px solid #dee2e6;
            padding: 12px 16px;
            margin-bottom: 8px;
            border-radius: 4px;
        }

        .me-3 {
            margin-right: 12px;
        }

        .mb-4 {
            margin-bottom: 24px;
        }

        .mb-3 {
            margin-bottom: 16px;
        }

        .mb-0 {
            margin-bottom: 0;
        }

        .text-muted {
            color: #6c757d;
        }

        .text-success {
            color: #198754;
        }

        h6 {
            font-weight: 600;
            font-size: 14px;
        }

        small {
            font-size: 12px;
        }

        [data-bs-theme="dark"] .list-group-item {
            background-color: var(--bs-dark, #212529);
            border-color: var(--bs-border-color, #495057);
        }

        [data-bs-theme="dark"] .text-muted {
            color: var(--bs-secondary-text-emphasis, #adb5bd);
        }

        [data-bs-theme="dark"] h6 {
            color: var(--bs-body-color, #f8f9fa);
        }
    `],
})
export class ConsentViewComponent {
    /**
     * The OAuth `client_id` the user is being asked to grant access to.
     * Displayed verbatim in the header (Req 6.2). Passed from the parent
     * component's `Component_State.oauthParams.client_id`.
     */
    @Input() clientId = '';

    /**
     * Space-delimited OAuth `scope` the client is requesting, or `null` when
     * no scope was requested. When present, it is split on whitespace and
     * rendered as a list of individually described scopes. The parent passes
     * the raw string straight from `oauthParams.scope` — this component does
     * not mutate it.
     */
    @Input() scope: string | null = null;

    /**
     * The currently signed-in user's email, fetched by the parent from
     * `GET /api/oauth/session-info`. `null` while the fetch is in flight —
     * the template renders a placeholder and both buttons stay disabled
     * (Req 11.8) so the user cannot grant consent for an identity that
     * hasn't been confirmed yet.
     */
    @Input() userEmail: string | null = null;

    /**
     * True while `POST /api/oauth/consent` with `decision: 'grant'` is in
     * flight. Drives the per-button spinner + disabled state on the grant
     * button (Req 11.7 / Property 9). The deny button is also disabled while
     * this is true so a contradictory second submission cannot race.
     */
    @Input() inflightGrant = false;

    /**
     * True while `POST /api/oauth/consent` with `decision: 'deny'` is in
     * flight. Mirror of `inflightGrant` for the deny button.
     */
    @Input() inflightDeny = false;

    /**
     * Optional error string to render above the action buttons (Req 6.6 for
     * submission failures, Req 2.5/13.x for session-info failures bubbled up
     * by the parent). `null` hides the error block entirely.
     */
    @Input() errorMessage: string | null = null;

    /**
     * Emitted when the user clicks "Approve" and the grant button is
     * currently enabled. Parent is responsible for guarding `csrfToken`
     * (Property 10) and issuing the POST.
     */
    @Output() grant = new EventEmitter<void>();

    /**
     * Emitted when the user clicks "Deny" and the deny button is currently
     * enabled. Same guard/POST responsibilities on the parent.
     */
    @Output() deny = new EventEmitter<void>();

    /**
     * Split the space-delimited `scope` input into an array of individual
     * scope strings, filtering out empty tokens. Computed on each change
     * detection pass — cheap, O(|scope|), and keeps the template free of
     * `| split` pipe wiring.
     */
    get requestedScopes(): string[] {
        if (!this.scope) {
            return [];
        }
        return this.scope.split(' ').filter((s) => s.length > 0);
    }

    /**
     * The grant button is disabled whenever:
     *   - `userEmail` has not been fetched yet (Req 11.8), OR
     *   - a grant request is already in flight (prevent double-submit), OR
     *   - a deny request is in flight (mutual exclusion between the two
     *     decisions so the user cannot submit contradictory answers).
     */
    isGrantDisabled(): boolean {
        return this.userEmail === null || this.inflightGrant || this.inflightDeny;
    }

    /**
     * The deny button is disabled under the same three conditions as the
     * grant button — see `isGrantDisabled` for rationale.
     */
    isDenyDisabled(): boolean {
        return this.userEmail === null || this.inflightGrant || this.inflightDeny;
    }

    /**
     * Map a raw OAuth scope token to a human-readable description for the
     * consent list. Unknown scopes fall back to the raw token so third-party
     * clients with custom scopes still render something meaningful.
     */
    describeScope(scope: string): string {
        const descriptions: { [key: string]: string } = {
            'openid': 'Verify your identity',
            'profile': 'View your profile information (name)',
            'email': 'View your email address',
            'offline_access': 'Maintain access when you are not present',
        };
        return descriptions[scope] || scope;
    }

    /**
     * Forward the grant click to the parent, but only if the grant button is
     * currently enabled. The template already binds `[disabled]`, so this is
     * belt-and-suspenders against synthetic events dispatched by tests.
     */
    onGrant(): void {
        if (this.isGrantDisabled()) {
            return;
        }
        this.grant.emit();
    }

    /**
     * Forward the deny click to the parent, subject to the same enabled-state
     * guard as `onGrant`.
     */
    onDeny(): void {
        if (this.isDenyDisabled()) {
            return;
        }
        this.deny.emit();
    }
}
