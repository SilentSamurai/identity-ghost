import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {AuthDefaultService} from '../_services/auth.default.service';
import {AuthService} from '../_services/auth.service';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {MessageService} from 'primeng/api';

@Component({
    selector: 'app-register',
    template: `
        <app-open-navbar></app-open-navbar>
        <app-centered-card imageUrl="/assets/logo-img.jpg">
            <div *ngIf="loading" class="align-middle text-center" style="padding-top:25%">
                <div class="spinner-border m-5" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>

            <!-- Show registration form if user has not registered successfully yet -->
            <form (ngSubmit)="onSubmit()" *ngIf="!isSuccessful" [formGroup]="registerForm" class="mt-3" novalidate>
                <!-- STEP 1: Company fields (currentStep=1) -->
                <div>
                    <div class="form-group">
                        <label for="orgName">Organization</label>
                        <div class="input-group">
                            <input class="form-control" formControlName="orgName" id="orgName"
                                   [readonly]="currentStep != 1"
                                   type="text" placeholder="Organization" aria-describedby="orgName-error"/>
                        </div>
                        <div
                            *ngIf="registerForm.get('orgName')?.errors && (registerForm.get('orgName')?.touched || registerForm.get('orgName')?.dirty)"
                            class="alert alert-danger mt-2" role="alert" id="orgName-error">
                            Organization is required
                        </div>
                    </div>
                    <div class="form-group mt-3">
                        <label for="domain">Domain</label>
                        <div class="input-group">
                            <input class="form-control" formControlName="domain" id="domain"
                                   [readonly]="currentStep != 1"
                                   type="text" placeholder="Domain" aria-describedby="domain-error"/>
                        </div>
                        <div
                            *ngIf="registerForm.get('domain')?.errors && (registerForm.get('domain')?.touched || registerForm.get('domain')?.dirty)"
                            class="alert alert-danger mt-2" role="alert" id="domain-error">
                            Domain is required
                        </div>
                    </div>
                    <div *ngIf="currentStep==1" class="d-grid gap-2 py-3">
                        <button (click)="onNextClick()" class="btn btn-primary btn-block btn-lg" type="button">
                            Next
                        </button>
                    </div>
                </div>
                <!-- STEP 2: Username, Email, Password (currentStep=2) -->
                <div *ngIf="currentStep === 2">
                    <div class="form-group">
                        <label for="username">Username</label>
                        <div class="input-group">
                            <input class="form-control" formControlName="username" id="username" type="text"
                                   placeholder="Username" aria-describedby="username-error"/>
                        </div>
                        <div
                            *ngIf="registerForm.get('username')?.errors && (registerForm.get('username')?.touched || registerForm.get('username')?.dirty)"
                            class="alert alert-danger mt-2" role="alert" id="username-error">
                            <div *ngIf="registerForm.get('username')?.errors?.['required']">Username is required</div>
                            <div *ngIf="registerForm.get('username')?.errors?.['minlength']">Username must be at least 3
                                characters
                            </div>
                            <div *ngIf="registerForm.get('username')?.errors?.['maxlength']">Username must be at most 20
                                characters
                            </div>
                        </div>
                    </div>
                    <div class="form-group mt-3">
                        <label for="email">Email</label>
                        <div class="input-group">
                            <input class="form-control" formControlName="email" id="email" type="email"
                                   placeholder="Email" aria-describedby="email-error"/>
                        </div>
                        <div
                            *ngIf="registerForm.get('email')?.errors && (registerForm.get('email')?.touched || registerForm.get('email')?.dirty)"
                            class="alert alert-danger mt-2" role="alert" id="email-error">
                            <div *ngIf="registerForm.get('email')?.errors?.['required']">Email is required</div>
                            <div *ngIf="registerForm.get('email')?.errors?.['email']">Must be a valid email
                                address
                            </div>
                        </div>
                    </div>
                    <div class="form-group mt-3">
                        <label for="password">Password</label>
                        <div class="input-group">
                            <input [type]="'password'" class="form-control" formControlName="password" id="password"
                                   minlength="6" placeholder="Password" aria-describedby="password-error"/>
                        </div>
                        <div
                            *ngIf="registerForm.get('password')?.errors && (registerForm.get('password')?.touched || registerForm.get('password')?.dirty)"
                            class="alert alert-danger mt-2" role="alert" id="password-error">
                            <div *ngIf="registerForm.get('password')?.errors?.['required']">Password is required
                            </div>
                            <div *ngIf="registerForm.get('password')?.errors?.['minlength']">Password must be at
                                least 6 characters
                            </div>
                        </div>
                    </div>
                    <div class="d-grid gap-2 py-3">
                        <button [disabled]="registerForm.invalid || loading" class="btn btn-primary btn-block btn-lg">
                            Create Tenant
                        </button>
                    </div>
                </div>
                <!-- Show error if sign up failed -->
                <div *ngIf="isSignUpFailed" class="alert alert-warning">
                    Registration failed!<br/>
                    {{ errorMessage }}
                </div>
            </form>

            <!-- Show success message if registration succeeded -->
            <div *ngIf="isSuccessful" class="alert alert-success">
                Your registration is successful!
            </div>
            <div class="d-flex justify-content-evenly">
                <a class="mt-1" routerLink="/login">
                    Login
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

        .profile-img-card {
            width: 96px;
            height: 96px;
            margin: 0 auto 10px;
            display: block;
            border-radius: 50%;
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

        [data-bs-theme="dark"] a {
            color: var(--bs-link-color, #0d6efd);
            transition: color 0.3s ease;
        }

        [data-bs-theme="dark"] a:hover {
            color: var(--bs-link-hover-color, #0a58ca);
            text-decoration: underline;
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
export class RegisterComponent implements OnInit {
    // Reactive form
    registerForm!: FormGroup;

    // Additional states
    isSuccessful = false;
    isSignUpFailed = false;
    errorMessage = '';
    loading = false;

    // For multi-step flow
    currentStep = 1;

    constructor(
        private authService: AuthService,
        private authDefaultService: AuthDefaultService,
        private router: Router,
        private fb: FormBuilder,
        private messageService: MessageService
    ) {
    }

    ngOnInit(): void {
        // Initialize form controls with validation
        const controls: any = {
            username: [
                '',
                [
                    Validators.required,
                    Validators.minLength(3),
                    Validators.maxLength(20),
                ],
            ],
            email: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, Validators.minLength(6)]],
            orgName: ['', [Validators.required]],
            domain: ['', [Validators.required]],
        };

        this.registerForm = this.fb.group(controls);
    }

    onNextClick(): void {
        const {orgName, domain} = this.registerForm.value;
        if (
            !orgName ||
            !domain ||
            this.registerForm.get('orgName')!.invalid ||
            this.registerForm.get('domain')!.invalid
        ) {
            this.registerForm.get('orgName')!.markAsTouched();
            this.registerForm.get('domain')!.markAsTouched();
            return; // remain on step 1 if invalid
        }
        this.currentStep = 2;
    }

    async onSubmit(): Promise<void> {
        // If at step 1, move to step 2 first
        if (this.currentStep === 1) {
            this.onNextClick();
            return;
        }

        // Abort if entire form is invalid (step 2 fields are part of the same form)
        if (this.registerForm.invalid) {
            return;
        }

        // Extract form values
        const {username, email, password, orgName, domain} =
            this.registerForm.value;
        this.isSignUpFailed = false;
        this.loading = true;

        try {
            await this.authService.registerTenant(
                username,
                email,
                password,
                orgName,
                domain,
            );

            // Show success toast
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Registration successful! Please check your email for verification.'
            });

            // Sign out or redirect after successful registration
            await this.authDefaultService.signOut('/home');
            this.isSuccessful = false;
        } catch (e: any) {
            console.error(e);
            this.isSignUpFailed = true;
            this.errorMessage = e.error?.message || 'Registration failed';

            // Show error toast
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: e.error?.message || 'Registration failed. Please try again.'
            });
        } finally {
            this.loading = false;
        }
    }

    async onLoginClick(): Promise<void> {
        await this.authDefaultService.signOut('/home');
    }
}
