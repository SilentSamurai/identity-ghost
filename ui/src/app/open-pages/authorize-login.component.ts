import {Component, OnInit} from '@angular/core';
import {AuthService} from '../_services/auth.service';
import {ActivatedRoute} from '@angular/router';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';

@Component({
    selector: 'app-login',
    template: `
        <app-open-navbar></app-open-navbar>
        <app-centered-card
            imageUrl="/assets/logo.svg"
        >
            <div *ngIf="loading" class="align-middle text-center" style="padding-top:25%">
                <div class="spinner-border m-5" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>

            <div *ngIf="!loading && error" class="alert alert-danger mt-3" role="alert">
                {{ error }}
            </div>

            <div *ngIf="!loading && !error" class="d-flex justify-content-center mt-2">
                <div class="py-1 px-2 mb-0">
                    Authorizing
                </div>
            </div>

            <div *ngIf="!loading && !error" class="d-flex justify-content-center">
                <div class="h5 py-1 px-2 mb-0">
                    {{ clientId }}
                </div>
            </div>

            <form
                (ngSubmit)="loginForm.valid && onSubmit()"
                *ngIf="!isLoggedIn && !error"
                [formGroup]="loginForm"
                class="mt-3"
                novalidate
            >
                <div *ngIf="freezeClientId">
                    <div class="form-group">
                        <label for="username">Username</label>
                        <div class="input-group">
                            <span class="input-group-text">&#64;</span>
                            <input
                                class="form-control"
                                formControlName="username"
                                id="username"
                                placeholder="Enter Username / Email"
                                type="text"
                                aria-describedby="username-error"
                            />
                        </div>
                        <div
                            *ngIf="loginForm.get('username')?.errors && (loginForm.get('username')?.touched || loginForm.get('username')?.dirty)"
                            class="alert alert-danger mt-2"
                            role="alert"
                            id="username-error">
                            Username is required
                        </div>
                    </div>

                    <div class="form-group mt-3">
                        <label for="password">Password</label>
                        <div class="input-group">
                            <input
                                [type]="isPasswordVisible ? 'text' : 'password'"
                                class="form-control"
                                formControlName="password"
                                id="password"
                                minlength="6"
                                placeholder="Password"
                                aria-describedby="password-error"
                            />
                            <button
                                (click)="isPasswordVisible = !isPasswordVisible"
                                class="input-group-text"
                                type="button"
                                aria-label="Toggle password visibility"
                            >
                                <i class="fa {{ !isPasswordVisible ? 'fa-eye' : 'fa-eye-slash' }}"></i>
                            </button>
                        </div>
                        <div
                            *ngIf="loginForm.get('password')?.errors && (loginForm.get('password')?.touched || loginForm.get('password')?.dirty)"
                            class="alert alert-danger mt-2"
                            role="alert"
                            id="password-error">
                            <div *ngIf="loginForm.get('password')?.errors?.['required']">
                                Password is required
                            </div>
                            <div *ngIf="loginForm.get('password')?.errors?.['minlength']">
                                Password must be at least 6 characters
                            </div>
                        </div>
                    </div>

                    <div class="form-group d-grid gap-2 py-3">
                        <button [disabled]="loginForm.invalid"
                                class="btn btn-primary btn-block btn-lg"
                                id="login-btn">
                            Login
                        </button>
                    </div>

                    <div *ngIf="isLoginFailed" class="alert alert-danger" role="alert">
                        Login failed: {{ errorMessage }}
                    </div>
                </div>
            </form>

            <div *ngIf="isLoggedIn" class="alert alert-success">
                Logged in as {{ loginForm.value?.username }}.
            </div>

            <div *ngIf="!loading && !error" class="d-flex justify-content-evenly">
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
        </app-centered-card>
    `,
    styles: [`
        label {
            display: block;
            margin-top: 10px;
        }

        .card-container.card {
            max-width: 400px !important;
            padding: 40px 40px;
        }

        .card {
            background-color: var(--bs-card-bg, #f7f7f7);
            padding: 20px 25px 30px;
            margin: 0 auto 25px;
            margin-top: 50px;
            border-radius: 2px;
            box-shadow: 0px 2px 2px rgba(0, 0, 0, 0.3);
            transition: background-color 0.3s ease, box-shadow 0.3s ease;
        }

        [data-bs-theme="dark"] .card {
            background-color: var(--bs-dark, #212529);
            border-color: var(--bs-border-color, #495057);
            box-shadow: 0px 2px 2px rgba(0, 0, 0, 0.5);
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

        [data-bs-theme="dark"] .alert-success {
            background-color: var(--bs-success-bg-subtle, rgba(25, 135, 84, 0.15));
            border-color: var(--bs-success-border-subtle, rgba(25, 135, 84, 0.3));
            color: var(--bs-success-text-emphasis, #75b798);
        }

        [data-bs-theme="dark"] .btn-primary {
            background-color: var(--bs-primary, #0d6efd);
            border-color: var(--bs-primary, #0d6efd);
        }
    `],
})
export class AuthorizeLoginComponent implements OnInit {
    loginForm: FormGroup;
    loading = true;
    isLoggedIn = false;
    isLoginFailed = false;
    errorMessage = '';
    error = '';
    freezeClientId = false;
    isPasswordVisible = false;
    clientId: string = '';

    // OAuth params parsed from query string — used to construct the redirect URL after login
    private redirectUri = '';
    private state = '';
    private scope = '';
    private responseType = '';
    private codeChallenge = '';
    private codeChallengeMethod = '';
    private nonce = '';
    private resource = '';

    constructor(
        private authService: AuthService,
        private route: ActivatedRoute,
        private fb: FormBuilder,
    ) {
        this.loginForm = this.fb.group({
            username: ['', Validators.required],
            password: ['', Validators.required],
            client_id: ['', Validators.required],
        });
    }

    async ngOnInit(): Promise<void> {
        const params = this.route.snapshot.queryParamMap;

        if (!params.has('redirect_uri')) {
            this.error = 'Invalid redirect_uri || redirect_uri not found';
            this.loading = false;
            return;
        }

        if (!params.has('client_id')) {
            this.error = 'Invalid client_id || client_id not found';
            this.loading = false;
            return;
        }

        // Parse all OAuth params from query string
        this.redirectUri = params.get('redirect_uri')!;
        this.clientId = params.get('client_id')!;
        this.state = params.get('state') || '';
        this.scope = params.get('scope') || '';
        this.responseType = params.get('response_type') || 'code';
        this.codeChallenge = params.get('code_challenge') || '';
        this.codeChallengeMethod = params.get('code_challenge_method') || '';
        this.nonce = params.get('nonce') || '';
        this.resource = params.get('resource') || '';

        this.loginForm.patchValue({client_id: this.clientId});
        if (this.clientId.length > 0) {
            this.freezeClientId = true;
        }

        this.loading = false;
    }

    async onSubmit(): Promise<void> {
        this.loading = true;
        this.isLoginFailed = false;
        const {username, password, client_id} = this.loginForm.value;

        try {
            // Login sets the sid cookie and returns {success: true}
            await this.authService.login(username, password, client_id);

            // Construct redirect URL from OAuth params we already have, append session_confirmed=true
            const authorizeParams = new URLSearchParams();
            authorizeParams.set('client_id', client_id);
            authorizeParams.set('redirect_uri', this.redirectUri);
            authorizeParams.set('response_type', this.responseType || 'code');
            if (this.scope) authorizeParams.set('scope', this.scope);
            if (this.state) authorizeParams.set('state', this.state);
            if (this.codeChallenge) {
                authorizeParams.set('code_challenge', this.codeChallenge);
                authorizeParams.set('code_challenge_method', this.codeChallengeMethod || 'plain');
            }
            if (this.nonce) authorizeParams.set('nonce', this.nonce);
            if (this.resource) authorizeParams.set('resource', this.resource);
            authorizeParams.set('session_confirmed', 'true');

            // Full-page navigation — browser attaches the newly set sid cookie automatically
            window.location.href = `/api/oauth/authorize?${authorizeParams.toString()}`;
        } catch (err: any) {
            console.error(err);
            this.errorMessage = err.error?.message || 'Login failed';
            this.isLoginFailed = true;
            // Clear password field on error
            this.loginForm.patchValue({password: ''});
        } finally {
            this.loading = false;
        }
    }
}
