import {Component, OnInit} from '@angular/core';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {ActivatedRoute} from '@angular/router';
import {MessageService} from 'primeng/api';
import {AuthService} from '../_services/auth.service';


@Component({
    selector: 'app-signup',
    template: `
        <app-open-navbar></app-open-navbar>
        <app-centered-card [title]="signupForm.get('client_id')?.value" imageUrl="/assets/logo-img.jpg">
            <div *ngIf="loading" class="align-middle text-center" style="padding-top:25%">
                <div class="spinner-border m-5" role="status">
                    <span class="sr-only">Loading...</span>
                </div>
            </div>

            <div *ngIf="!loading && error" class="alert alert-danger mt-3" role="alert">
                {{ error }}
            </div>

            <form *ngIf="!isSuccessful && !loading && !error" (ngSubmit)="onSubmit()" [formGroup]="signupForm"
                  class="mt-3" novalidate>
                <!-- Details -->
                <div class="form-group mt-3">
                    <label for="name">Name</label>
                    <div class="input-group">
                        <input class="form-control" formControlName="name" id="name" placeholder="Name" type="text"/>
                    </div>
                    <div
                        *ngIf="signupForm.get('name')?.errors && (signupForm.get('name')?.touched || signupForm.get('name')?.dirty)"
                        class="alert alert-danger mt-2" role="alert">
                        <div *ngIf="signupForm.get('name')?.errors?.['required']">Name is required</div>
                        <div *ngIf="signupForm.get('name')?.errors?.['minlength']">Name must be at least 3
                            characters
                        </div>
                        <div *ngIf="signupForm.get('name')?.errors?.['maxlength']">Name must be at most 20
                            characters
                        </div>
                    </div>
                </div>
                <div class="form-group mt-3">
                    <label for="email">Email</label>
                    <div class="input-group">
                        <input class="form-control" formControlName="email" id="email" placeholder="Email"
                               type="email"/>
                    </div>
                    <div
                        *ngIf="signupForm.get('email')?.errors && (signupForm.get('email')?.touched || signupForm.get('email')?.dirty)"
                        class="alert alert-danger mt-2" role="alert">
                        <div *ngIf="signupForm.get('email')?.errors?.['required']">Email is required</div>
                        <div *ngIf="signupForm.get('email')?.errors?.['email']">Must be a valid email address</div>
                    </div>
                </div>
                <div class="form-group mt-3">
                    <label for="password">Password</label>
                    <div class="input-group">
                        <input [type]="'password'" class="form-control" formControlName="password" id="password"
                               minlength="6"
                               placeholder="Password"/>
                    </div>
                    <div
                        *ngIf="signupForm.get('password')?.errors && (signupForm.get('password')?.touched || signupForm.get('password')?.dirty)"
                        class="alert alert-danger mt-2" role="alert">
                        <div *ngIf="signupForm.get('password')?.errors?.['required']">Password is required</div>
                        <div *ngIf="signupForm.get('password')?.errors?.['minlength']">Password must be at least 6
                            characters
                        </div>
                    </div>
                </div>

                <!-- Actions: Submit -->
                <div class="d-grid gap-2 py-3">
                    <button [disabled]="signupForm.invalid" class="btn btn-primary btn-block btn-lg">Sign Up
                    </button>
                </div>

                <div *ngIf="isSignUpFailed" class="alert alert-warning">
                    Signup failed!<br/>
                    {{ errorMessage }}
                </div>
            </form>

            <div *ngIf="isSuccessful" class="alert alert-success mt-3">
                Sign up successful! Please verify your email, then try logging in again.
            </div>
            <div class="d-flex justify-content-evenly">
                <a class="mt-1" [routerLink]="['/login']">Login</a>
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
export class SignUpComponent implements OnInit {
    signupForm!: FormGroup;
    isSignUpFailed = false;
    errorMessage = '';
    loading = false;
    isSuccessful = false;
    error = '';

    constructor(
        private fb: FormBuilder,
        private actRoute: ActivatedRoute,
        private authService: AuthService,
        private messageService: MessageService
    ) {
    }

    ngOnInit(): void {
        this.loading = true;
        this.signupForm = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(20)]],
            email: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, Validators.minLength(6)]],
            client_id: ['', [Validators.required]]
        });

        const clientIdParam = this.actRoute.snapshot.queryParamMap.get('client_id');
        if (clientIdParam && clientIdParam.length > 0) {
            this.signupForm.patchValue({client_id: clientIdParam});
            this.error = '';
        } else {
            this.error = 'Invalid client_id || client_id not found';
        }
        this.loading = false;
    }

    async onSubmit(): Promise<void> {
        // ensure client_id present; otherwise show error like authorize page
        const ctrl = this.signupForm.get('client_id');
        const clientId = ctrl?.value;
        if (!clientId) {
            this.error = 'Invalid client_id || client_id not found';
            ctrl?.markAsTouched();
            return;
        }

        if (this.signupForm.invalid) return;

        const {name, email, password} = this.signupForm.value;
        this.isSignUpFailed = false;
        this.loading = true;

        try {
            await this.authService.signUp(name, email, password, clientId);

            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Sign up successful! Please verify your email, then try logging in again.'
            });
            this.isSuccessful = true;
        } catch (e: any) {
            console.error(e);
            const msg = e?.error?.message || e?.message || 'Registration failed. Please try again.';
            this.isSignUpFailed = true;
            this.errorMessage = msg;
            this.messageService.add({severity: 'error', summary: 'Error', detail: msg});
        } finally {
            this.loading = false;
        }
    }
}
