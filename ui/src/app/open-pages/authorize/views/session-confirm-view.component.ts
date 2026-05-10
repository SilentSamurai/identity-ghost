import {Component, EventEmitter, Input, Output} from '@angular/core';

/**
 * Session-confirm sub-view of the Unified OAuth Authorization UI.
 *
 * Rendered when the backend has redirected to `/authorize?view=session-confirm`
 * (Requirements 7.1, 7.2). Pure presentation component — it does NOT:
 *   - read OAuth parameters from the URL
 *   - make any HTTP call
 *   - know anything about `csrf_token`
 *   - issue any navigation
 *
 * Its parent `UnifiedAuthorizeComponent` owns all of the above and handles the
 * two emitted events (see task 8.5).
 *
 * Note on the output name: Angular's template compiler forbids using the
 * reserved JavaScript keyword `continue` as an `@Output()` name (it cannot
 * be referenced in template event bindings like `(continue)="..."`). The
 * output is therefore named `continueSession`; the consuming parent binds
 * to `(continueSession)="onContinue()"`.
 *
 * Spec references:
 *   - Requirement 7.1 — display the session-confirm view when backend directs.
 *   - Requirement 7.2 — show the logged-in user's email.
 *   - Requirement 11.7 / Property 9 — per-button in-flight disable + spinner.
 *   - Requirement 11.8 — lightweight placeholder while async email load pending.
 */
@Component({
    selector: 'app-session-confirm-view',
    template: `
        <div [attr.data-view]="'session-confirm'" class="session-confirm-view">
            <div class="text-center">Logged in as</div>

            <div class="text-center py-2">
                <!--
                    Requirement 11.8: while the session-info email is loading
                    (userEmail === null) render a lightweight placeholder in
                    the area where the email will appear. No interactive
                    controls depend on the unloaded data because both buttons
                    below are disabled under the same condition.
                -->
                <b *ngIf="userEmail; else emailPlaceholder">{{ userEmail }}</b>
                <ng-template #emailPlaceholder>
                    <span class="placeholder-glow" aria-hidden="true">
                        <span class="placeholder col-6"></span>
                    </span>
                    <span class="visually-hidden">Loading user information…</span>
                </ng-template>
            </div>

            <div *ngIf="errorMessage" class="alert alert-danger py-2 my-2" role="alert">
                {{ errorMessage }}
            </div>

            <div class="form-group d-grid gap-2 py-3">
                <button
                    type="button"
                    class="btn btn-primary btn-block btn-lg"
                    [disabled]="continueDisabled"
                    (click)="onContinueClick()"
                >
                    <span
                        *ngIf="inflightContinue"
                        [attr.data-spinner]="'continue'"
                        class="spinner-border spinner-border-sm me-2"
                        role="status"
                        aria-hidden="true"
                    ></span>
                    Continue
                </button>
            </div>

            <hr>

            <div class="form-group d-grid gap-2">
                <button
                    type="button"
                    class="btn btn-danger btn-block btn-lg"
                    [disabled]="logoutDisabled"
                    (click)="onLogoutClick()"
                >
                    <span
                        *ngIf="inflightLogout"
                        [attr.data-spinner]="'logout'"
                        class="spinner-border spinner-border-sm me-2"
                        role="status"
                        aria-hidden="true"
                    ></span>
                    Logout
                </button>
            </div>
        </div>
    `,
    styles: [`
        label {
            display: block;
            margin-top: 10px;
        }

        .placeholder {
            display: inline-block;
            min-width: 8rem;
        }
    `],
})
export class SessionConfirmViewComponent {
    /**
     * The logged-in user's email, resolved by the parent from the
     * session-info endpoint. `null` means the request has not resolved yet;
     * both buttons stay disabled and a placeholder renders in the email slot
     * (Requirement 11.8).
     */
    @Input() userEmail: string | null = null;

    /** True while the continue redirect is in flight. */
    @Input() inflightContinue = false;

    /** True while the logout POST is in flight. */
    @Input() inflightLogout = false;

    /** Optional error message surfaced to the user. */
    @Input() errorMessage: string | null = null;

    /**
     * Emitted when the user clicks "Continue".
     *
     * Named `continueSession` rather than `continue` because `continue` is a
     * reserved JavaScript keyword and Angular's template compiler rejects it
     * as an output binding name.
     */
    @Output() continueSession = new EventEmitter<void>();

    /** Emitted when the user clicks "Logout". */
    @Output() logout = new EventEmitter<void>();

    /**
     * The continue button is disabled while userEmail is unknown (loading)
     * or while its own submit is in flight (Requirement 11.7 / Property 9).
     */
    get continueDisabled(): boolean {
        return this.userEmail === null || this.inflightContinue;
    }

    /**
     * The logout button is disabled while userEmail is unknown (loading)
     * or while its own submit is in flight (Requirement 11.7 / Property 9).
     */
    get logoutDisabled(): boolean {
        return this.userEmail === null || this.inflightLogout;
    }

    onContinueClick(): void {
        if (this.continueDisabled) {
            return;
        }
        this.continueSession.emit();
    }

    onLogoutClick(): void {
        if (this.logoutDisabled) {
            return;
        }
        this.logout.emit();
    }
}
