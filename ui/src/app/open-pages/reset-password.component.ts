import {Component, OnInit} from '@angular/core';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {MessageService} from 'primeng/api';
import {HttpClient} from '@angular/common/http';
import {ActivatedRoute, Router} from '@angular/router';

const API_URL = '/api/oauth';

@Component({
    selector: 'app-reset-password',
    template: `
<app-open-navbar></app-open-navbar>
<app-centered-card
    imageUrl="/assets/logo-img.jpg"
>
    <div *ngIf="loading" class="align-middle text-center" style="padding-top:25%">
        <div class="spinner-border m-5" role="status">
            <span class="sr-only">Loading...</span>
        </div>
    </div>

    <div *ngIf="!isPasswordReset">
        <h2 class="text-center mb-4">Reset Password</h2>
        <p class="text-center mb-4">Please enter your new password below.</p>

        <form
            (ngSubmit)="resetPasswordForm.valid && onSubmit()"
            [formGroup]="resetPasswordForm"
            class="mt-3"
            novalidate
        >
            <div class="form-group">
                <label for="password">New Password</label>
                <div class="input-group">
                    <input
                        [type]="isPasswordVisible ? 'text' : 'password'"
                        class="form-control"
                        formControlName="password"
                        id="password"
                        minlength="6"
                        placeholder="Enter new password"
                    />
                    <button
                        (click)="isPasswordVisible = !isPasswordVisible"
                        class="input-group-text"
                        type="button"
                    >
                        <i class="fa fas {{ !isPasswordVisible ? 'fa-eye' : 'fa-eye-slash' }}"></i>
                    </button>
                </div>
                <div
                    *ngIf="resetPasswordForm.get('password')?.errors && (resetPasswordForm.get('password')?.touched || resetPasswordForm.get('password')?.dirty)"
                    class="alert alert-danger mt-2"
                    role="alert">
                    <div *ngIf="resetPasswordForm.get('password')?.errors?.['required']">
                        Password is required
                    </div>
                    <div *ngIf="resetPasswordForm.get('password')?.errors?.['minlength']">
                        Password must be at least 6 characters
                    </div>
                </div>
            </div>

            <div class="form-group mt-3">
                <label for="confirmPassword">Confirm New Password</label>
                <div class="input-group">
                    <input
                        [type]="isConfirmPasswordVisible ? 'text' : 'password'"
                        class="form-control"
                        formControlName="confirmPassword"
                        id="confirmPassword"
                        placeholder="Confirm new password"
                    />
                    <button
                        (click)="isConfirmPasswordVisible = !isConfirmPasswordVisible"
                        class="input-group-text"
                        type="button"
                    >
                        <i class="fa fas {{ !isConfirmPasswordVisible ? 'fa-eye' : 'fa-eye-slash' }}"></i>
                    </button>
                </div>
                <div
                    *ngIf="resetPasswordForm.get('confirmPassword')?.errors && (resetPasswordForm.get('confirmPassword')?.touched || resetPasswordForm.get('confirmPassword')?.dirty)"
                    class="alert alert-danger mt-2"
                    role="alert">
                    <div *ngIf="resetPasswordForm.get('confirmPassword')?.errors?.['required']">
                        Please confirm your password
                    </div>
                    <div *ngIf="resetPasswordForm.get('confirmPassword')?.errors?.['passwordMismatch']">
                        Passwords do not match
                    </div>
                </div>
            </div>

            <div class="form-group d-grid gap-2 py-3">
                <button [disabled]="resetPasswordForm.invalid"
                        class="btn btn-primary btn-block btn-lg">
                    Reset Password
                </button>
            </div>

            <div *ngIf="errorMessage" class="alert alert-danger" role="alert">
                {{ errorMessage }}
            </div>
        </form>
    </div>

    <div *ngIf="isPasswordReset" class="alert alert-success">
        <h4 class="alert-heading">Password Reset Successful!</h4>
        <p>Your password has been reset successfully.</p>
        <p class="mb-0">You will be redirected to the login page in a few seconds...</p>
    </div>

    <div class="d-flex justify-content-center mt-3">
        <a class="mt-1" routerLink="/login">
            Back to Login
        </a>
    </div>
</app-centered-card>
`,
    styles: [`
.card-container { max-width: 400px; margin: 0 auto; padding: 20px; }
.profile-img-card { width: 96px; height: 96px; margin: 0 auto 10px; display: block; border-radius: 50%; }
.form-group { margin-bottom: 1rem; }
.alert { margin-top: 1rem; }
.btn-block { width: 100%; }
.input-group-text { cursor: pointer; }
[data-bs-theme="dark"] .card { background-color: var(--bs-dark, #212529); border-color: var(--bs-border-color, #495057); box-shadow: 0px 2px 2px rgba(0,0,0,0.5); }
[data-bs-theme="dark"] .form-control { background-color: var(--bs-dark, #212529); border-color: var(--bs-border-color, #495057); color: var(--bs-body-color, #f8f9fa); transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease; }
[data-bs-theme="dark"] .form-control:focus { background-color: var(--bs-dark, #212529); border-color: var(--bs-primary, #0d6efd); color: var(--bs-body-color, #f8f9fa); box-shadow: 0 0 0 0.25rem rgba(13,110,253,0.25); }
[data-bs-theme="dark"] .form-control:hover { border-color: var(--bs-primary, #0d6efd); }
[data-bs-theme="dark"] .input-group-text { background-color: var(--bs-dark, #212529); border-color: var(--bs-border-color, #495057); color: var(--bs-body-color, #f8f9fa); transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease; }
[data-bs-theme="dark"] label { color: var(--bs-body-color, #f8f9fa); transition: color 0.3s ease; }
[data-bs-theme="dark"] .alert-danger { background-color: var(--bs-danger-bg-subtle, rgba(220,53,69,0.15)); border-color: var(--bs-danger-border-subtle, rgba(220,53,69,0.3)); color: var(--bs-danger-text-emphasis, #ea868f); transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease; }
[data-bs-theme="dark"] .alert-success { background-color: var(--bs-success-bg-subtle, rgba(25,135,84,0.15)); border-color: var(--bs-success-border-subtle, rgba(25,135,84,0.3)); color: var(--bs-success-text-emphasis, #75b798); transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease; }
[data-bs-theme="dark"] .btn-primary { background-color: var(--bs-primary, #0d6efd); border-color: var(--bs-primary, #0d6efd); transition: background-color 0.3s ease, border-color 0.3s ease; }
[data-bs-theme="dark"] .btn-primary:hover { background-color: var(--bs-primary-dark, #0b5ed7); border-color: var(--bs-primary-dark, #0b5ed7); }
[data-bs-theme="dark"] .btn-primary:focus { box-shadow: 0 0 0 0.25rem rgba(13,110,253,0.25); }
`],
    providers: [MessageService]
})
export class ResetPasswordComponent implements OnInit {
    resetPasswordForm: FormGroup;
    loading = false;
    isPasswordReset = false;
    errorMessage = '';
    token: string = '';
    isPasswordVisible = false;
    isConfirmPasswordVisible = false;

    constructor(
        private fb: FormBuilder,
        private http: HttpClient,
        private messageService: MessageService,
        private route: ActivatedRoute,
        private router: Router
    ) {
        this.resetPasswordForm = this.fb.group({
            password: ['', [Validators.required, Validators.minLength(6)]],
            confirmPassword: ['', [Validators.required]]
        }, {
            validator: this.passwordMatchValidator
        });
    }

    ngOnInit(): void {
        this.token = this.route.snapshot.params['token'];
        if (!this.token) {
            this.router.navigate(['/login']);
        }
    }

    passwordMatchValidator(form: FormGroup) {
        const password = form.get('password');
        const confirmPassword = form.get('confirmPassword');

        if (password?.value !== confirmPassword?.value) {
            confirmPassword?.setErrors({passwordMismatch: true});
        } else {
            confirmPassword?.setErrors(null);
        }
    }

    async onSubmit() {
        if (this.resetPasswordForm.invalid) return;

        this.loading = true;
        this.errorMessage = '';

        try {
            const response = await this.http.post(
                `${API_URL}/reset-password/${this.token}`,
                {password: this.resetPasswordForm.value.password}
            ).toPromise();

            this.isPasswordReset = true;
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Your password has been reset successfully'
            });

            // Redirect to login after 3 seconds
            setTimeout(() => {
                this.router.navigate(['/login']);
            }, 3000);
        } catch (error: any) {
            this.errorMessage = error.error?.message || 'Failed to reset password';
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: this.errorMessage
            });
        } finally {
            this.loading = false;
        }
    }
}
