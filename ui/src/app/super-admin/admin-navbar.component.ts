import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {AuthDefaultService} from '../_services/auth.default.service';
import {SessionService} from '../_services/session.service';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {ProfileComponent} from '../open-pages/profile.component';

@Component({
    selector: 'admin-nav-bar',
    template: `
        <nav
            class="navbar navbar-expand-lg navbar-dark"
            style="background-color: steelblue;"
        >
            <div class="container-fluid">
                <a
                    class="navbar-brand d-flex align-items-center"
                    routerLink="/admin"
                >
                    <img
                        alt="Logo"
                        class="rounded-circle me-2"
                        height="30"
                        src="/assets/logo-img.jpg"
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
                    <ul class="navbar-nav me-auto">
                        <li class="nav-item">
                            <a class="nav-link text-white" routerLink="/admin/TN01" routerLinkActive="active">Tenants</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link text-white" routerLink="/admin/UR01" routerLinkActive="active">Users</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link text-white" routerLink="/admin/RL01" routerLinkActive="active">Roles</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link text-white" routerLink="/admin/GP01" routerLinkActive="active">Groups</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link text-white" routerLink="/admin/AP01" routerLinkActive="active">Apps</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link text-white" routerLink="/admin/CL01" routerLinkActive="active">Clients</a>
                        </li>
                    </ul>

                    <ul class="navbar-nav ms-auto">
                        <li class="nav-item dropdown" ngbDropdown>
                            <a
                                class="nav-link dropdown-toggle text-white"
                                id="adminDropdownUser"
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
                                <a
                                    class="dropdown-item"
                                    href="javascript:void(0)"
                                    (click)="openProfileModal()"
                                >Profile</a>
                                <div class="dropdown-divider"></div>
                                <a
                                    class="dropdown-item"
                                    routerLink="/home"
                                >User Section</a>
                                <a
                                    class="dropdown-item"
                                    href="https://silentsamurai.github.io/auth-server"
                                >API Docs</a>
                                <div class="dropdown-divider"></div>
                                <a
                                    class="dropdown-item"
                                    href="javascript:void(0)"
                                    (click)="logout()"
                                >Sign Out</a>
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
export class AdminNavBarComponent implements OnInit {
    isLoggedIn = false;
    email?: string;
    public isCollapsed = true;

    constructor(
        private router: Router,
        private modalService: NgbModal,
        private authDefaultService: AuthDefaultService,
        private sessionService: SessionService,
    ) {
    }

    async ngOnInit(): Promise<void> {
        this.isLoggedIn = !!this.sessionService.getToken();

        if (this.sessionService.isLoggedIn()) {
            const user = this.sessionService.getUser()!;
            this.email = user.email;
        }
    }

    logout(): void {
        this.authDefaultService.signOut('/admin');
    }

    async openProfileModal() {
        const modalRef = this.modalService.open(ProfileComponent);
        const result = await modalRef.result;
        console.log('returned result', result);
    }

    getTitle() {
        return this.authDefaultService.title;
    }
}
