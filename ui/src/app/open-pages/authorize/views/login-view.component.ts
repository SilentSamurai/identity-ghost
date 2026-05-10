import {Component, EventEmitter, Input, Output} from '@angular/core';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';

/**
 * Presentation-only login view for the Unified Authorization flow.
 *
 * Responsibility: render the email + password form, show the `clientId`
 * being authorized, and emit a `loginSubmit` event when the user submits
 * valid credentials. It does NOT:
 *   - make HTTP calls
 *   - read OAuth parameters from the URL
 *   - navigate or issue redirects
 *
 * All state-changing work — POSTing to `/api/oauth/login`, handling CSRF,
 * redirecting back to `/api/oauth/authorize` — lives in the parent
 * `UnifiedAuthorizeComponent`. This keeps the view compliant with
 * Property 4 (view state closure) and Property 9 (submit-button mutex):
 * the parent drives `inflight` and the button's disabled state reflects it.
 *
 * The `@Output()` is named `loginSubmit` rather than `submit` to avoid
 * colliding with the DOM `submit` event that bubbles up from the `<form>`
 * element — binding `(submit)` on an Angular component selector containing
 * a native `<form>` leads to Angular warning about ambiguous bindings.
 *
 * Requirements: 8.1, 8.2. Correctness: P9.
 */
@Component({
    selector: 'app-login-view',
    template: `
        <div [attr.data-view]="'login'" class="login-view">

            <div class="d-flex justify-content-center mt-2">
                <div class="py-1 px-2 mb-0">Authorizing</div>
            </div>
            <div class="d-flex justify-content-center">
                <div class="h5 py-1 px-2 mb-0" data-client-id>{{ clientId }}</div>
            </div>

            <form
                (ngSubmit)="onFormSubmit()"
                [formGroup]="form"
                class="mt-3"
                novalidate
            >
                <div class="form-group">
                    <label for="login-view-email">Username</label>
                    <div class="input-group">
                        <span class="input-group-text">&#64;</span>
                        <input
                            id="login-view-email"
                            type="text"
                            class="form-control"
                            formControlName="email"
                            placeholder="Enter Username / Email"
                            autocomplete="username"
                            [attr.disabled]="inflight ? true : null"
                            aria-describedby="login-view-email-error"
                        />
                    </div>
                    <div
                        *ngIf="form.get('email')?.errors && (form.get('email')?.touched || form.get('email')?.dirty)"
                        class="alert alert-danger mt-2"
                        role="alert"
                        id="login-view-email-error"
                    >
                        Username is required
                    </div>
                </div>

                <div class="form-group mt-3">
                    <label for="login-view-password">Password</label>
                    <div class="input-group">
                        <input
                            id="login-view-password"
                            [type]="passwordVisible ? 'text' : 'password'"
                            class="form-control"
                            formControlName="password"
                            placeholder="Password"
                            autocomplete="current-password"
                            minlength="6"
                            [attr.disabled]="inflight ? true : null"
                            aria-describedby="login-view-password-error"
                        />
                        <button
                            (click)="passwordVisible = !passwordVisible"
                            class="input-group-text"
                            type="button"
                            [disabled]="inflight"
                            aria-label="Toggle password visibility"
                        >
                            <i class="fa {{ !passwordVisible ? 'fa-eye' : 'fa-eye-slash' }}"></i>
                        </button>
                    </div>
                    <div
                        *ngIf="form.get('password')?.errors && (form.get('password')?.touched || form.get('password')?.dirty)"
                        class="alert alert-danger mt-2"
                        role="alert"
                        id="login-view-password-error"
                    >
                        <div *ngIf="form.get('password')?.errors?.['required']">
                            Password is required
                        </div>
                        <div *ngIf="form.get('password')?.errors?.['minlength']">
                            Password must be at least 6 characters
                        </div>
                    </div>
                </div>

                <div *ngIf="errorMessage" class="alert alert-danger mt-3" role="alert" data-error>
                    {{ errorMessage }}
                </div>

                <div class="form-group d-grid gap-2 py-3">
                    <button
                        type="submit"
                        class="btn btn-primary btn-block btn-lg"
                        [disabled]="form.invalid || inflight"
                        id="login-btn"
                        data-login-submit
                    >
                        <span
                            *ngIf="inflight"
                            class="spinner-border spinner-border-sm me-2"
                            role="status"
                            aria-hidden="true"
                            data-spinner
                        ></span>
                        Login
                    </button>
                </div>
            </form>

            <div class="d-flex justify-content-evenly">
                <a class="mt-1" href="https://silentsamurai.github.io/auth-server">
                    Api Docs
                </a>
                <a
                    id="signup-link"
                    class="mt-1"
                    [routerLink]="['/signup']"
                    [queryParamsHandling]="'merge'"
                >
                    Sign Up
                </a>
            </div>
        </div>
    `,
    styles: [`
        label {
            display: block;
            margin-top: 10px;
        }

        .login-view {
            width: 100%;
        }

        .text-muted {
            color: #6c757d;
        }

        [data-bs-theme="dark"] .form-control {
            background-color: var(--bs-dark, #212529);
            border-color: var(--bs-border-color, #495057);
            color: var(--bs-body-color, #f8f9fa);
        }

        [data-bs-theme="dark"] .form-control:focus {
            background-color: var(--bs-dark, #212529);
            border-color: var(--bs-primary, #0d6efd);
            color: var(--bs-body-color, #f8f9fa);
            box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
        }

        [data-bs-theme="dark"] .input-group-text {
            background-color: var(--bs-dark, #212529);
            border-color: var(--bs-border-color, #495057);
            color: var(--bs-body-color, #f8f9fa);
        }

        [data-bs-theme="dark"] label {
            color: var(--bs-body-color, #f8f9fa);
        }

        [data-bs-theme="dark"] .alert-danger {
            background-color: var(--bs-danger-bg-subtle, rgba(220, 53, 69, 0.15));
            border-color: var(--bs-danger-border-subtle, rgba(220, 53, 69, 0.3));
            color: var(--bs-danger-text-emphasis, #ea868f);
        }

        [data-bs-theme="dark"] .btn-primary {
            background-color: var(--bs-primary, #0d6efd);
            border-color: var(--bs-primary, #0d6efd);
        }
    `],
})
export class LoginViewComponent {
    /**
     * The OAuth `client_id` being authorized, displayed to the user so they
     * know which application they are signing in to (Requirement 8.2).
     */
    @Input() clientId: string = '';

    /**
     * True while the parent has a login POST in flight. Disables the submit
     * button and renders an in-button spinner to satisfy P9
     * (submit-button mutex).
     */
    @Input() inflight: boolean = false;

    /**
     * Error message surfaced from the parent (e.g., invalid credentials,
     * backend 4xx). Rendered above the submit button. `null` or empty hides
     * the alert.
     */
    @Input() errorMessage: string | null = null;

    /**
     * Emits when the user submits the form with valid credentials.
     *
     * Named `loginSubmit` (not `submit`) because `submit` is a native DOM
     * event that bubbles from `<form>` elements; naming an `@Output()`
     * `submit` collides with it and produces unreliable bindings in the
     * parent template.
     */
    @Output() loginSubmit = new EventEmitter<{ email: string; password: string }>();

    /** Reactive form matching the rest of the open-pages conventions. */
    readonly form: FormGroup;

    /** Toggles plain-text vs masked password rendering. Local UI state only. */
    passwordVisible = false;

    constructor(fb: FormBuilder) {
        this.form = fb.group({
            email: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, Validators.minLength(6)]],
        });
    }

    /**
     * Template handler for `(ngSubmit)`. Guards against submission while
     * inflight or invalid — the button's `[disabled]` already covers this,
     * but Enter-to-submit can still fire the event when fields are valid.
     */
    onFormSubmit(): void {
        if (this.inflight || this.form.invalid) {
            return;
        }
        const {email, password} = this.form.value;
        this.loginSubmit.emit({email, password});
    }
}
