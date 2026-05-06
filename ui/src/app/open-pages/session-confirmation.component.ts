import {Component, OnInit} from '@angular/core';
import {UserService} from '../_services/user.service';
import {SessionService} from '../_services/session.service';
import {ActivatedRoute, Router} from '@angular/router';
import {AuthService} from '../_services/auth.service';
import {AuthDefaultService} from '../_services/auth.default.service';

@Component({
    selector: 'session-confirm',
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

            <div>
                <div class="text-center">
                    Logged in as
                </div>

                <div class="text-center py-2">
                    <b>{{ username }}</b>
                </div>

                <div class="form-group d-grid gap-2 py-3 ">
                    <button (click)="onContinue()" class="btn btn-primary btn-block btn-lg">
                        Continue
                    </button>
                </div>

                <hr>

                <div class="form-group d-grid gap-2 ">
                    <button (click)="onLogout()" class="btn btn-danger btn-block btn-lg">
                        Logout
                    </button>
                </div>
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
})
export class SessionConfirmationComponent implements OnInit {
    content?: string;
    user: any;
    loading = true;
    authCode = '';
    redirectUri = '';
    username = '';
    code_challenge = '';
    client_id = '';
    state = '';

    constructor(
        private userService: UserService,
        private router: Router,
        private route: ActivatedRoute,
        private authService: AuthService,
        private authDefaultService: AuthDefaultService,
        private tokenStorage: SessionService,
    ) {
    }

    async ngOnInit(): Promise<void> {
        let params = this.route.snapshot.queryParamMap;
        this.redirectUri = params.get('redirect_uri')!;
        this.client_id = params.get('client_id')!;
        this.code_challenge = params.get('code_challenge')!;
        this.state = params.get('state') || '';

        const authCode = this.tokenStorage.getAuthCode();
        if (authCode) {
            // if auth code is present, then redirect
            // verify auth-code
            try {
                const data = await this.authService.validateAuthCode(authCode, this.client_id);
                this.authCode = authCode;
                this.username = data.email;
            } catch (e: any) {
                console.error(e);
            }
        }

        this.loading = false;
    }

    async onContinue() {
        try {
            const decoded = this.tokenStorage.getDecodedToken();
            if (!decoded || !decoded.sub || !decoded.tenant?.id) {
                // No valid session token — clear and redirect to login
                this.tokenStorage.clearSession();
                await this.router.navigate(['authorize'], {
                    queryParams: {
                        redirect_uri: this.redirectUri,
                        client_id: this.client_id,
                        code_challenge: this.code_challenge,
                        state: this.state,
                    },
                });
                return;
            }

            // Always request a fresh authorization code via silent-auth
            const data = await this.authService.silentAuth({
                client_id: this.client_id,
                user_id: decoded.sub,
                tenant_id: decoded.tenant.id,
                code_challenge: this.code_challenge,
                code_challenge_method: 'S256',
            });

            if (data.authentication_code) {
                this.tokenStorage.saveAuthCode(data.authentication_code);
                await this.redirect(data.authentication_code);
            } else {
                // silent-auth did not return a code — clear session and redirect to login
                this.tokenStorage.clearSession();
                await this.router.navigate(['authorize'], {
                    queryParams: {
                        redirect_uri: this.redirectUri,
                        client_id: this.client_id,
                        code_challenge: this.code_challenge,
                        state: this.state,
                    },
                });
            }
        } catch (e: any) {
            console.error('silent-auth failed on Continue:', e);
            // On failure: clear session and navigate to authorize page
            this.tokenStorage.clearSession();
            await this.router.navigate(['authorize'], {
                queryParams: {
                    redirect_uri: this.redirectUri,
                    client_id: this.client_id,
                    code_challenge: this.code_challenge,
                    state: this.state,
                },
            });
        }
    }

    async onLogout() {
        this.tokenStorage.clearSession();
        await this.router.navigate(['authorize'], {
            queryParams: {
                redirect_uri: this.redirectUri,
                client_id: this.client_id,
                code_challenge: this.code_challenge,
                state: this.state,
            },
        });
    }

    async redirect(code: string) {
        if (this.isAbsoluteUrl(this.redirectUri)) {
            const redirectUrl = new URL(this.redirectUri);
            redirectUrl.searchParams.append('code', code);
            if (this.state) {
                redirectUrl.searchParams.append('state', this.state);
            }
            window.location.href = redirectUrl.toString();
        } else {
            const queryParams: any = {code};
            if (this.state) {
                queryParams.state = this.state;
            }
            await this.router.navigate([this.redirectUri], {queryParams});
        }
    }

    protected isAbsoluteUrl(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch (error) {
            return false;
        }
    }
}
