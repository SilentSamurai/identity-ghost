import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {SessionService} from '../_services/session.service';

@Component({
    selector: 'app-welcome',
    template: `
        <app-open-navbar></app-open-navbar>

        <section class="hero container py-5">
            <div class="row align-items-center">
                <div class="col-lg-7">
                    <h1 class="display-5 fw-semibold mb-3">Production‑ready OAuth Authorization Server</h1>
                    <p class="lead text-muted mb-4">
                        A production‑ready, OAuth Authorization service built with Nest&nbsp;JS and TypeScript.
                    </p>
                    <div class="d-flex gap-2">
                        <a class="btn btn-primary btn-lg" routerLink="/login">Get Started</a>
                        <a class="btn btn-outline-secondary btn-lg" href="https://silentsamurai.github.io/auth-server"
                           target="_blank" rel="noopener">Docs</a>
                    </div>
                </div>
                <div class="col-lg-5 mt-4 mt-lg-0">
                    <div class="card shadow-sm">
                        <div class="card-body">
                            <h5 class="card-title mb-3">What you'll get</h5>
                            <ul class="mb-0">
                                <li>User registration, login, password reset</li>
                                <li>JWT tokens, refresh & revocation</li>
                                <li>Role & permission system (CASL)</li>
                                <li>Deployable via Docker & Helm</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `,
    styles: [`
        .hero {
            min-height: 60vh;
        }

        ul {
            padding-left: 1.2rem;
        }

        :host-context([data-bs-theme="dark"]) .hero {
            color: var(--bs-body-color, #f8f9fa);
        }

        :host-context([data-bs-theme="dark"]) .card {
            background-color: var(--bs-dark, #212529);
            border-color: var(--bs-border-color, #495057);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
        }

        :host-context([data-bs-theme="dark"]) a {
            color: var(--bs-link-color, #0d6efd);
        }

        :host-context([data-bs-theme="dark"]) a:hover {
            color: var(--bs-link-hover-color, #0a58ca);
            text-decoration: underline;
        }

        /* Buttons: ensure contrast and proper hover/focus in dark mode */
        :host-context([data-bs-theme="dark"]) .btn-primary {
            background-color: var(--bs-primary, #0d6efd);
            border-color: var(--bs-primary, #0d6efd);
            color: #fff;
        }

        :host-context([data-bs-theme="dark"]) .btn-primary:hover,
        :host-context([data-bs-theme="dark"]) .btn-primary:focus {
            background-color: var(--bs-primary-hover, #0b5ed7);
            border-color: var(--bs-primary-hover, #0b5ed7);
            color: #fff;
        }

        :host-context([data-bs-theme="dark"]) .btn-primary:active {
            background-color: var(--bs-primary-active, #0a58ca) !important;
            border-color: var(--bs-primary-active, #0a58ca) !important;
            color: #fff !important;
        }

        :host-context([data-bs-theme="dark"]) .btn-outline-primary,
        :host-context([data-bs-theme="dark"]) .btn-outline-secondary {
            color: var(--bs-body-color, #f8f9fa);
            border-color: var(--bs-border-color, #495057);
            background-color: transparent;
        }

        :host-context([data-bs-theme="dark"]) .btn-outline-primary:hover,
        :host-context([data-bs-theme="dark"]) .btn-outline-primary:focus,
        :host-context([data-bs-theme="dark"]) .btn-outline-secondary:hover,
        :host-context([data-bs-theme="dark"]) .btn-outline-secondary:focus {
            color: var(--bs-primary, #0d6efd);
            border-color: var(--bs-primary, #0d6efd);
            background-color: rgba(13, 110, 253, 0.1);
        }

        :host-context([data-bs-theme="dark"]) .btn-outline-primary:active,
        :host-context([data-bs-theme="dark"]) .btn-outline-secondary:active {
            color: var(--bs-primary, #0d6efd) !important;
            border-color: var(--bs-primary, #0d6efd) !important;
            background-color: rgba(13, 110, 253, 0.15) !important;
        }
    `]
})
export class WelcomeComponent implements OnInit {

    constructor(private router: Router, private sessionService: SessionService) {
    }

    ngOnInit(): void {
        if (this.sessionService.isLoggedIn() && !this.sessionService.isTokenExpired()) {
            this.router.navigate(['/home']);
        }
    }

}
