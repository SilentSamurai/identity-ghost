import {Component, OnInit} from '@angular/core';
import {UserService} from '../_services/user.service';
import {SessionService} from '../_services/session.service';
import {ActivatedRoute, Router} from '@angular/router';
import {AuthService} from '../_services/auth.service';
import {AuthDefaultService} from '../_services/auth.default.service';
import {makeLaunchPad} from '../component/tile/models';
import {PermissionService} from '../_services/permission.service';

@Component({
    selector: 'app-home',
    template: `
        <secure-nav-bar *ngIf="!loading"></secure-nav-bar>
        <app-launchpad [groups]="groups"></app-launchpad>
    `,
    styles: [``],
})
export class HomeComponent implements OnInit {
    content?: string;
    user: any;
    loading = true;
    groups: any = [
        {
            name: 'Home',
            tiles: [
                {
                    title: 'Tenant Overview',
                    subtitle: 'View Current Tenant',
                    icon: 'fa-building',
                    command: async () => {
                        const tenant_id = this.user.tenant.id;
                        await this.router.navigate(['/TN02', tenant_id]);
                    },
                    size: 'lg',
                },
                {
                    title: 'Members',
                    subtitle: 'Manage Members',
                    icon: 'fa-users',
                    command: async () => {
                        const tenant_id = this.user.tenant.id;
                        await this.router.navigate(['/TN02', tenant_id], {
                            fragment: 'MEMBERS',
                        });
                    },
                },
                {
                    title: 'Role',
                    subtitle: 'Manage Roles',
                    icon: 'fa-magic',
                    command: async () => {
                        const tenant_id = this.user.tenant.id;
                        await this.router.navigate(['/TN02', tenant_id], {
                            fragment: 'ROLES',
                        });
                    },
                },
                {
                    title: 'Apps',
                    subtitle: 'Manage Apps',
                    icon: 'fa-app',
                    command: async () => {
                        const tenant_id = this.user.tenant.id;
                        await this.router.navigate(['/TN02', tenant_id], {
                            fragment: 'APPS',
                        });
                    },
                },
                {
                    title: 'Subscriptions',
                    subtitle: 'Manage Subscriptions',
                    icon: 'fa-credit-card',
                    command: async () => {
                        const tenant_id = this.user.tenant.id;
                        await this.router.navigate(['/TN02', tenant_id], {
                            fragment: 'SUBSCRIPTIONS',
                        });
                    },
                },
                {
                    title: 'Clients',
                    subtitle: 'Manage OAuth Clients',
                    icon: 'fa-key',
                    command: async () => {
                        const tenant_id = this.user.tenant.id;
                        await this.router.navigate(['/CL01', tenant_id]);
                    },
                },
            ],
        },
    ];

    constructor(
        private userService: UserService,
        private router: Router,
        private route: ActivatedRoute,
        private authService: AuthService,
        private ps: PermissionService,
        private authDefaultService: AuthDefaultService,
        private tokenStorage: SessionService,
    ) {
        this.groups = makeLaunchPad(this.groups, this.ps);
    }

    ngOnInit(): void {
        this.authDefaultService.resetTitle();
        this.startUp();
    }

    async startUp(): Promise<void> {
        // let params = this.route.snapshot.queryParamMap;
        this.user = this.tokenStorage.getUser();
        this.loading = false;
    }

    reloadPage(): void {
        window.location.reload();
    }
}
