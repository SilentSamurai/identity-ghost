import {Component, OnInit} from '@angular/core';
import {AuthService} from '../_services/auth.service';
import {SessionService} from '../_services/session.service';
import {ActivatedRoute, Router} from '@angular/router';
import {lastValueFrom} from 'rxjs';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {MessageService} from 'primeng/api';

@Component({
    selector: 'app-login',
    template: `
<app-open-navbar></app-open-navbar>
<app-centered-card
    [title]="client_id"
    imageUrl="/assets/logo-img.jpg"
>
    <div *ngIf="loading" class="align-middle text-center" style="padding-top:25%">
        <div class="spinner-border m-5" role="status">
            <span class="visually-hidden">Loading...</span>
        </div>
    </div>

    <form
        (ngSubmit)="loginForm.valid && onSubmit()"
        *ngIf="!isLoggedIn"
        [formGroup]="loginForm"
        class="mt-3"
        novalidate
    >
        <!-- Step 1: Ask for Client ID when not frozen -->
        <div *ngIf="!freezeClientId">
            <div class="form-group">
                <label for="client_id">Client Id</label>
                <input
                    class="form-control"
                    formControlName="client_id"
                    id="client_id"
                    placeholder="Enter Client ID"
                    type="text"
                />
            </div>
            <div
                *ngIf="loginForm.get('client_id')?.invalid && (loginForm.get('client_id')?.touched || loginForm.get('client_id')?.dirty)"
                class="alert alert-danger mt-2"
                role="alert">
                Client Id is required.
            </div>

            <div class="form-group d-grid gap-2 py-3">
                <button
                    (click)="onContinue()"
                    [disabled]="loginForm.get('client_id')?.invalid"
                    class="btn btn-primary btn-block btn-lg"
                    id="continue-btn"
                    type="button"
                >
                    Continue
                </button>
            </div>
        </div>

        <!-- Step 2: After freezing client id, show credentials -->
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
                    />
                </div>
                <div
                    *ngIf="loginForm.get('username')?.errors && (loginForm.get('username')?.touched || loginForm.get('username')?.dirty)"
                    class="alert alert-danger mt-2"
                    role="alert">
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
                    />
                    <button
                        (click)="isPasswordVisible = !isPasswordVisible"
                        class="input-group-text"
                        type="button"
                    >
                        <i class="fas {{ !isPasswordVisible ? 'fa-eye' : 'fa-eye-slash' }}"></i>
                    </button>
                </div>
                <div
                    *ngIf="loginForm.get('password')?.errors && (loginForm.get('password')?.touched || loginForm.get('password')?.dirty)"
                    class="alert alert-danger mt-2"
                    role="alert">
                    <div *ngIf="loginForm.get('password')?.errors?.['required']">
                        Password is required
                    </div>
                    <div *ngIf="loginForm.get('password')?.errors?.['minlength']">
                        Password must be at least 6 characters
                    </div>
                </div>
            </div>

            <!-- Client Id input removed on step 2; displayed above under image -->

            <div class="form-group d-grid gap-2 py-3">
                <button [disabled]="loginForm.invalid"
                        class="btn btn-primary btn-block btn-lg"
                        type="submit"
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

    <div class="d-flex justify-content-between">
        <a class="mt-1" routerLink="/forgot-password">
            Forgot Password
        </a>

        <a class="mt-1" [routerLink]="['/signup']"
        [queryParams]="{ client_id: (client_id || loginForm.get('client_id')?.value) }"
        [queryParamsHandling]="'merge'">
            Sign Up
        </a>
    </div>
</app-centered-card>
`,
    styles: [`
label { display: block; margin-top: 10px; }
.card-container.card { max-width: 400px !important; padding: 40px 40px; }
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
    transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
}
[data-bs-theme="dark"] .form-control:focus {
    background-color: var(--bs-dark, #212529);
    border-color: var(--bs-primary, #0d6efd);
    color: var(--bs-body-color, #f8f9fa);
    box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
}
[data-bs-theme="dark"] .form-control:hover { border-color: var(--bs-primary, #0d6efd); }
[data-bs-theme="dark"] .input-group-text {
    background-color: var(--bs-dark, #212529);
    border-color: var(--bs-border-color, #495057);
    color: var(--bs-body-color, #f8f9fa);
    transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
}
[data-bs-theme="dark"] label { color: var(--bs-body-color, #f8f9fa); transition: color 0.3s ease; }
[data-bs-theme="dark"] .alert-danger {
    background-color: var(--bs-danger-bg-subtle, rgba(220, 53, 69, 0.15));
    border-color: var(--bs-danger-border-subtle, rgba(220, 53, 69, 0.3));
    color: var(--bs-danger-text-emphasis, #ea868f);
    transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
}
[data-bs-theme="dark"] .alert-success {
    background-color: var(--bs-success-bg-subtle, rgba(25, 135, 84, 0.15));
    border-color: var(--bs-success-border-subtle, rgba(25, 135, 84, 0.3));
    color: var(--bs-success-text-emphasis, #75b798);
    transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
}
[data-bs-theme="dark"] a { color: var(--bs-link-color, #0d6efd); transition: color 0.3s ease; }
[data-bs-theme="dark"] a:hover { color: var(--bs-link-hover-color, #0a58ca); text-decoration: underline; }
[data-bs-theme="dark"] .btn-primary {
    background-color: var(--bs-primary, #0d6efd);
    border-color: var(--bs-primary, #0d6efd);
    transition: background-color 0.3s ease, border-color 0.3s ease;
}
[data-bs-theme="dark"] .btn-primary:hover { background-color: var(--bs-primary-dark, #0b5ed7); border-color: var(--bs-primary-dark, #0b5ed7); }
[data-bs-theme="dark"] .btn-primary:focus { box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25); }
`],
})
export class LoginComponent implements OnInit {
    loginForm: FormGroup;
    loading = true;
    isLoggedIn = false;
    isLoginFailed = false;
    errorMessage = '';
    freezeClientId = false;
    isPasswordVisible = false;
    code_challenge_method: string = 'plain';
    client_id: string = '';

    constructor(
        private authService: AuthService,
        private router: Router,
        private route: ActivatedRoute,
        private fb: FormBuilder,
        private tokenStorage: SessionService,
        private messageService: MessageService,
    ) {
        this.loginForm = this.fb.group({
            client_id: ['', Validators.required],
            username: ['', Validators.required],
            password: ['', [Validators.required, Validators.minLength(6)]],
        });
    }

    async ngOnInit(): Promise<void> {
        let params = this.route.snapshot.queryParamMap;
        
        // Check if user was redirected after email verification
        if (params.has('verified')) {
            const verified = params.get('verified') === 'true';
            if (verified) {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Email Verified',
                    detail: 'Your email has been verified successfully. You can now login.'
                });
            } else {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Verification Failed',
                    detail: 'Email verification failed. Please try again or contact support.'
                });
            }
        }
        
        if (params.has('client_id')) {
            this.client_id = params.get('client_id')!;
            this.loginForm.get('client_id')?.setValue(this.client_id);
            if (this.client_id && this.client_id.length > 0) {
                this.freezeClientId = true;
            }
        }

        const code_challenge = await this.tokenStorage.getCodeChallenge(this.code_challenge_method);

        // if auth code is present, then redirect
        // verify auth-code
        const authCode = this.tokenStorage.getAuthCode();
        if (authCode) {
            const clientId = this.client_id || this.loginForm.get('client_id')?.value;
            if (clientId) {
                await this.redirect(authCode, clientId);
            }
        }
        // else if (this.tokenStorage.isLoggedIn() && !externalLogin) {
        //     await this.router.navigateByUrl("/home");
        // }
        this.loading = false;
    }

    // redirection to home page might not work sometime,
    // check if internally anything is nav-ing to login page again
    async onSubmit(): Promise<void> {
        this.loading = true;
        const {username, password} = this.loginForm.value;
        const clientId = this.client_id || this.loginForm.get('client_id')?.value;
        if (!clientId) {
            this.loginForm.get('client_id')?.markAsTouched();
            this.loading = false;
            return;
        }
        const code_challenge = await this.tokenStorage.getCodeChallenge(this.code_challenge_method);
        try {
            const data = await this.authService.login(
                username,
                password,
                clientId,
                code_challenge,
                this.code_challenge_method,
            );
            let authenticationCode = data.authentication_code;
            this.isLoginFailed = false;
            this.isLoggedIn = true;
            this.tokenStorage.saveAuthCode(authenticationCode);
            await this.redirect(authenticationCode, clientId);
        } catch (err: any) {
            console.error(err);
            this.errorMessage = err.error.message;
            this.isLoginFailed = true;
        } finally {
            this.loading = false;
        }
    }

    async redirect(code: string, clientId: string) {
        await this.setAccessToken(code, clientId);
        await this.router.navigate(["/home"], {
            queryParams: { client_id: clientId },
        });
    }

    onContinue() {
        const clientIdCtrl = this.loginForm.get('client_id');
        const clientId = (clientIdCtrl?.value || '').trim();
        if (!clientId) {
            clientIdCtrl?.markAsTouched();
            return;
        }
        this.client_id = clientId;
        this.freezeClientId = true;
        // Update URL with client_id without reloading the component
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { client_id: clientId },
            queryParamsHandling: 'merge',
        });
    }

    async onSigUpClick() {
        const clientId = this.client_id || this.loginForm.get('client_id')?.value;
        await this.router.navigate(['/register'], {
            queryParams: {
                client_id: clientId,
            },
        });
    }

    private async setAccessToken(code: string, clientId: string) {
        try {
            let verifier = this.tokenStorage.getCodeVerifier();
            const data = await lastValueFrom(
                this.authService.fetchAccessToken(code, verifier, clientId),
            );
            this.tokenStorage.saveToken(data.access_token);
            if (data.refresh_token) {
                this.tokenStorage.saveRefreshToken(data.refresh_token);
            }
            const [rules, profile] = await Promise.all([
                this.authService.fetchPermissions(),
                this.authService.fetchMyProfile(),
            ]);
            this.tokenStorage.saveUserProfile({
                email: profile.email,
                name: profile.name,
                id: profile.id,
            });
            this.tokenStorage.savePermissions(rules);
        } catch (e: any) {
            console.error(e);
            this.messageService.add({
                severity: 'error',
                summary: 'Authentication Error',
                detail: 'Failed to fetch access token. Please try logging in again.',
                life: 5000
            });
        }
    }
}
