import {Component, OnInit} from '@angular/core';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {MessageService} from 'primeng/api';
import {HttpClient} from '@angular/common/http';

const API_URL = '/api/oauth';

@Component({
    selector: 'app-forgot-password',
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

            <div *ngIf="!isEmailSent">
                <h2 class="text-center mb-4">Forgot Password</h2>
                <p class="text-center mb-4">Enter your email address and we'll send you instructions to reset your
                    password.</p>

                <form
                    (ngSubmit)="forgotPasswordForm.valid && onSubmit()"
                    [formGroup]="forgotPasswordForm"
                    class="mt-3"
                    novalidate
                >
                    <div class="form-group">
                        <label for="email">Email</label>
                        <div class="input-group">
                            <span class="input-group-text">&#64;</span>
                            <input
                                class="form-control"
                                formControlName="email"
                                id="email"
                                placeholder="Enter your email"
                                type="email"
                                aria-describedby="email-error"
                            />
                        </div>
                        <div
                            *ngIf="forgotPasswordForm.get('email')?.errors && (forgotPasswordForm.get('email')?.touched || forgotPasswordForm.get('email')?.dirty)"
                            class="alert alert-danger mt-2"
                            role="alert"
                            id="email-error">
                            <div *ngIf="forgotPasswordForm.get('email')?.errors?.['required']">
                                Email is required
                            </div>
                            <div *ngIf="forgotPasswordForm.get('email')?.errors?.['email']">
                                Please enter a valid email address
                            </div>
                        </div>
                    </div>

                    <div class="form-group d-grid gap-2 py-3">
                        <button [disabled]="forgotPasswordForm.invalid"
                                class="btn btn-primary btn-block btn-lg">
                            Send Reset Instructions
                        </button>
                    </div>

                    <div *ngIf="errorMessage" class="alert alert-danger" role="alert">
                        {{ errorMessage }}
                    </div>
                </form>
            </div>

            <div *ngIf="isEmailSent" class="alert alert-success">
                <h4 class="alert-heading">Check Your Email</h4>
                <p>We've sent password reset instructions to your email address.</p>
                <p class="mb-0">Please check your inbox and follow the instructions to reset your password.</p>
            </div>

            <div class="d-flex justify-content-center mt-3">
                <a class="mt-1" routerLink="/login">
                    Back to Login
                </a>
            </div>
        </app-centered-card>
    `,
    styles: [`
        .card-container {
            max-width: 400px;
            margin: 0 auto;
            padding: 20px;
        }

        .profile-img-card {
            width: 96px;
            height: 96px;
            margin: 0 auto 10px;
            display: block;
            border-radius: 50%;
        }

        .form-group {
            margin-bottom: 1rem;
        }

        .alert {
            margin-top: 1rem;
        }

        .btn-block {
            width: 100%;
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

        [data-bs-theme="dark"] .form-control:hover {
            border-color: var(--bs-primary, #0d6efd);
        }

        [data-bs-theme="dark"] .input-group-text {
            background-color: var(--bs-dark, #212529);
            border-color: var(--bs-border-color, #495057);
            color: var(--bs-body-color, #f8f9fa);
            transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
        }

        [data-bs-theme="dark"] label {
            color: var(--bs-body-color, #f8f9fa);
            transition: color 0.3s ease;
        }

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

        [data-bs-theme="dark"] .btn-primary {
            background-color: var(--bs-primary, #0d6efd);
            border-color: var(--bs-primary, #0d6efd);
            transition: background-color 0.3s ease, border-color 0.3s ease;
        }

        [data-bs-theme="dark"] .btn-primary:hover {
            background-color: var(--bs-primary-dark, #0b5ed7);
            border-color: var(--bs-primary-dark, #0b5ed7);
        }

        [data-bs-theme="dark"] .btn-primary:focus {
            box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
        }
    `],
    providers: [MessageService]
})
export class ForgotPasswordComponent implements OnInit {
    forgotPasswordForm: FormGroup;
    loading = false;
    isEmailSent = false;
    errorMessage = '';

    constructor(
        private fb: FormBuilder,
        private http: HttpClient,
        private messageService: MessageService
    ) {
        this.forgotPasswordForm = this.fb.group({
            email: ['', [Validators.required, Validators.email]]
        });
    }

    ngOnInit(): void {
    }

    async onSubmit() {
        if (this.forgotPasswordForm.invalid) return;

        this.loading = true;
        this.errorMessage = '';

        try {
            const response = await this.http.post(
                `${API_URL}/forgot-password`,
                this.forgotPasswordForm.value
            ).toPromise();

            this.isEmailSent = true;
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Password reset instructions have been sent to your email'
            });
        } catch (error: any) {
            this.errorMessage = error.error?.message || 'Failed to send reset email';
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
