import {Component} from '@angular/core';

@Component({
    selector: 'app-open-navbar',
    template: `
        <nav class="navbar navbar-expand-lg navbar-light bg-light border-bottom">
            <div class="container-fluid">
                <a class="navbar-brand d-flex align-items-center gap-2" routerLink="/welcome">
                    <img src="/assets/logo.svg" alt="Logo" width="28" height="28" class="rounded-circle"/>
                    <span>Auth Server</span>
                </a>

                <div class="d-flex ms-auto gap-2">
                    <a class="btn btn-outline-primary" routerLink="/login" [queryParamsHandling]="'merge'">Login</a>
                    <a class="btn btn-outline-secondary" routerLink="/register">Register Domain</a>
                    <a class="btn btn-primary" routerLink="/signup" [queryParamsHandling]="'merge'">Sign Up</a>
                </div>
            </div>
        </nav>
    `,
    styles: [`
        /* Navbar component styles (inherits Bootstrap) */
        :host-context([data-bs-theme="dark"]) .navbar.bg-light {
            background-color: var(--bs-dark, #212529) !important;
            border-color: var(--bs-border-color, #495057) !important;
        }

        :host-context([data-bs-theme="dark"]) .navbar .navbar-brand {
            color: var(--bs-body-color, #f8f9fa);
        }

        :host-context([data-bs-theme="dark"]) .navbar .btn.btn-outline-primary,
        :host-context([data-bs-theme="dark"]) .navbar .btn.btn-outline-secondary {
            color: var(--bs-body-color, #f8f9fa);
            border-color: var(--bs-border-color, #495057);
        }

        :host-context([data-bs-theme="dark"]) .navbar .btn.btn-outline-primary:hover,
        :host-context([data-bs-theme="dark"]) .navbar .btn.btn-outline-secondary:hover {
            border-color: var(--bs-primary, #0d6efd);
            color: var(--bs-primary, #0d6efd);
        }

        /* Buttons: ensure contrast and proper hover/focus in dark mode */
        .btn-primary {
            background-color: var(--bs-primary, #0d6efd);
            border-color: var(--bs-primary, #0d6efd);
            color: #fff;
        }

        .btn-primary:hover,
        .btn-primary:focus {
            background-color: var(--bs-primary-hover, #0b5ed7);
            border-color: var(--bs-primary-hover, #0b5ed7);
            color: #fff;
        }

        .btn-primary:active {
            background-color: var(--bs-primary-active, #0a58ca) !important;
            border-color: var(--bs-primary-active, #0a58ca) !important;
            color: #fff !important;
        }

        .btn-outline-primary,
        .btn-outline-secondary {
            color: var(--bs-body-color, #f8f9fa);
            border-color: var(--bs-border-color, #495057);
            background-color: transparent;
        }

        .btn-outline-primary:hover,
        .btn-outline-primary:focus,
        .btn-outline-secondary:hover,
        .btn-outline-secondary:focus {
            color: var(--bs-primary, #0d6efd);
            border-color: var(--bs-primary, #0d6efd);
            background-color: rgba(13, 110, 253, 0.1);
        }

        .btn-outline-primary:active,
        .btn-outline-secondary:active {
            color: var(--bs-primary, #0d6efd) !important;
            border-color: var(--bs-primary, #0d6efd) !important;
            background-color: rgba(13, 110, 253, 0.15) !important;
        }
    `]
})
export class OpenNavbarComponent {
}
