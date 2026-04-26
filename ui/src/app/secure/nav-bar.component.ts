import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {UserService} from '../_services/user.service';
import {AuthDefaultService} from '../_services/auth.default.service';
import {SessionService} from '../_services/session.service';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {ProfileComponent} from '../open-pages/profile.component';

@Component({
    selector: 'secure-nav-bar',
    template: `
        <nav
            class="navbar navbar-expand-lg navbar-dark"
            style="background-color: steelblue;"
        >
            <div class="container-fluid">
                <a
                    class="navbar-brand d-flex align-items-center"
                    routerLink="/home"
                >
                    <img
                        alt="Logo"
                        class="rounded-circle me-2"
                        height="30"
                        src="/assets/logo.svg"
                        width="30"
                    />
                    <span class="text-white">{{ getTitle() }}</span>
                </a>

                <button
                    class="navbar-toggler"
                    type="button"
                    (click)="isCollapsed = !isCollapsed"
                    aria-label="Toggle navigation"
                >
                    <span class="navbar-toggler-icon"></span>
                </button>

                <div
                    [ngbCollapse]="isCollapsed"
                    class="collapse navbar-collapse"
                >
                    <ul class="navbar-nav ms-auto">
                        <li class="nav-item dropdown" ngbDropdown>
                            <a
                                class="nav-link dropdown-toggle text-white"
                                id="dropdownUser1"
                                ngbDropdownToggle
                                role="button"
                            >
                                <span class="me-2">{{ email }}</span>
                            </a>
                            <div
                                class="dropdown-menu dropdown-menu-end"
                                ngbDropdownMenu
                            >
                                <a class="dropdown-item" href="#">Settings</a>
                                <button
                                    class="dropdown-item"
                                    (click)="openProfileModal()"
                                >Profile</button
                                >
                                <div class="dropdown-divider"></div>
                                <a
                                    class="dropdown-item"
                                    href="https://silentsamurai.github.io/auth-server"
                                >API Docs</a
                                >
                                <a
                                    *ngIf="isSuperAdmin"
                                    class="dropdown-item"
                                    routerLink="/admin"
                                >Admin Panel</a
                                >
                                <div class="dropdown-divider"></div>
                                <button
                                    class="dropdown-item"
                                    (click)="logout()"
                                >Sign Out</button
                                >
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
        </nav>
    `,
    styles: [
        `
            .navbar-toggler:focus {
                box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
            }
        `,
    ],
})
export class SecureNavBarComponent implements OnInit {
    isLoggedIn = false;
    email?: string;
    isSuperAdmin = false;
    public isCollapsed = true;

    constructor(
        private userService: UserService,
        private router: Router,
        private modalService: NgbModal,
        private authDefaultService: AuthDefaultService,
        private tokenStorageService: SessionService,
    ) {
    }

    async ngOnInit(): Promise<void> {
        this.isLoggedIn = !!this.tokenStorageService.getToken();

        if (this.tokenStorageService.isLoggedIn()) {
            const user = this.tokenStorageService.getUser()!;
            this.email = user.email;
            this.isSuperAdmin = this.tokenStorageService.isSuperAdmin();
        }
    }

    logout(): void {
        this.authDefaultService.signOut('/home');
    }

    async openProfileModal() {
        const modalRef = this.modalService.open(ProfileComponent);
        const result = await modalRef.result;
        console.log('returned result', result);
        // await this.ngOnInit();
    }

    getTitle() {
        return this.authDefaultService.title;
    }
}
