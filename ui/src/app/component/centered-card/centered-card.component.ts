import {Component, Input} from '@angular/core';

@Component({
    selector: 'app-centered-card',
    template: `
        <div class="container">
            <div class="row align-items-center">
                <div class="col-md-12 vh-80">
                    <div class="card card-container">
                        <img
                            *ngIf="imageUrl"
                            [src]="imageUrl"
                            alt=""
                            class="profile-img-card"
                            id="profile-img"
                        />

                        <div *ngIf="title" class="text-center strong">{{ title }}</div>

                        <div class="card-content">
                            <ng-content></ng-content>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,
    styles: [`
        .vh-80 {
            min-height: 80vh;
        }

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
            -moz-border-radius: 2px;
            -webkit-border-radius: 2px;
            border-radius: 2px;
            -moz-box-shadow: 0px 2px 2px rgba(0, 0, 0, 0.3);
            -webkit-box-shadow: 0px 2px 2px rgba(0, 0, 0, 0.3);
            box-shadow: 0px 2px 2px rgba(0, 0, 0, 0.3);
            transition: background-color 0.3s ease, box-shadow 0.3s ease;
        }

        .profile-img-card {
            width: 96px;
            height: 96px;
            margin: 0 auto 10px;
            display: block;
            -moz-border-radius: 50%;
            -webkit-border-radius: 50%;
            border-radius: 50%;
        }

        :host-context([data-bs-theme="dark"]) {
            .card {
                background-color: var(--bs-dark, #212529);
                border-color: var(--bs-border-color, #495057);
                box-shadow: 0px 2px 2px rgba(0, 0, 0, 0.5);
            }

            .form-control {
                background-color: var(--bs-dark, #212529);
                border-color: var(--bs-border-color, #495057);
                color: var(--bs-body-color, #f8f9fa);
                transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;

                &:focus {
                    background-color: var(--bs-dark, #212529);
                    border-color: var(--bs-primary, #0d6efd);
                    color: var(--bs-body-color, #f8f9fa);
                    box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
                }

                &:hover {
                    border-color: var(--bs-primary, #0d6efd);
                }
            }

            .input-group-text {
                background-color: var(--bs-dark, #212529);
                border-color: var(--bs-border-color, #495057);
                color: var(--bs-body-color, #f8f9fa);
                transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
            }

            label {
                color: var(--bs-body-color, #f8f9fa);
                transition: color 0.3s ease;
            }

            .alert-danger {
                background-color: var(--bs-danger-bg-subtle, rgba(220, 53, 69, 0.15));
                border-color: var(--bs-danger-border-subtle, rgba(220, 53, 69, 0.3));
                color: var(--bs-danger-text-emphasis, #ea868f);
                transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
            }

            .alert-success {
                background-color: var(--bs-success-bg-subtle, rgba(25, 135, 84, 0.15));
                border-color: var(--bs-success-border-subtle, rgba(25, 135, 84, 0.3));
                color: var(--bs-success-text-emphasis, #75b798);
                transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
            }

            a {
                color: var(--bs-link-color, #0d6efd);
                transition: color 0.3s ease;

                &:hover {
                    color: var(--bs-link-hover-color, #0a58ca);
                    text-decoration: underline;
                }
            }

            .btn-primary {
                background-color: var(--bs-primary, #0d6efd);
                border-color: var(--bs-primary, #0d6efd);
                transition: background-color 0.3s ease, border-color 0.3s ease;

                &:hover {
                    background-color: var(--bs-primary-dark, #0b5ed7);
                    border-color: var(--bs-primary-dark, #0b5ed7);
                }

                &:focus {
                    box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
                }
            }
        }

    `]
})
export class CenteredCardComponent {
    @Input() title?: string;
    @Input() imageUrl?: string;
}
