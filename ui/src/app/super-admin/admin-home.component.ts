import {Component, OnInit} from '@angular/core';
import {makeLaunchPad} from '../component/tile/models';
import {Actions, PermissionService, Subjects} from '../_services/permission.service';
import {AuthDefaultService} from '../_services/auth.default.service';

@Component({
    selector: 'admin-home',
    template: `
        <app-launchpad [groups]="groups"></app-launchpad>
    `,
})
export class AdminHomeComponent implements OnInit {
    groups: any = [
        {
            name: 'Tenants',
            tiles: [
                {
                    title: 'TN01',
                    subtitle: 'Manage All Tenants',
                    icon: 'fa-bars',
                    link: ['/admin/TN01'],
                    canActivate: (ps: PermissionService) =>
                        ps.isAuthorized(Actions.Manage, Subjects.TENANT, 'all'),
                },
                {
                    title: 'TN02',
                    subtitle: 'Display Tenant',
                    icon: 'fa-bars',
                    link: ['/admin/TN02'],
                    canActivate: (ps: PermissionService) =>
                        ps.isAuthorized(Actions.Manage, Subjects.TENANT),
                },
                {
                    title: 'TNRL01',
                    subtitle: 'Manage Role Assignments',
                    icon: 'fa-magic',
                    link: ['/admin/TNRL01'],
                    canActivate: (ps: PermissionService) =>
                        ps.isAuthorized(Actions.Manage, Subjects.TENANT, 'all'),
                },
            ],
        },
        {
            name: 'Users',
            tiles: [
                {
                    title: 'UR01',
                    subtitle: 'Manage Users',
                    icon: 'fa-users',
                    link: ['/admin/UR01'],
                    canActivate: (ps: PermissionService) =>
                        ps.isAuthorized(Actions.Manage, Subjects.USER, 'all'),
                },
                {
                    title: 'UR02',
                    subtitle: 'Display User',
                    icon: 'fa-users',
                    link: ['/admin/UR02'],
                    canActivate: (ps: PermissionService) =>
                        ps.isAuthorized(Actions.Manage, Subjects.USER, 'all'),
                },
            ],
        },
        {
            name: 'Roles',
            tiles: [
                {
                    title: 'RL01',
                    subtitle: 'Manage Roles',
                    icon: 'fa-casl',
                    link: ['/admin/RL01'],
                    canActivate: (ps: PermissionService) =>
                        ps.isAuthorized(Actions.Manage, Subjects.ROLE, 'all'),
                },
                {
                    title: 'RL02',
                    subtitle: 'Display Role',
                    icon: 'fa-role',
                    link: ['/admin/RL02'],
                    canActivate: (ps: PermissionService) =>
                        ps.isAuthorized(Actions.Manage, Subjects.ROLE, 'all'),
                },
            ],
        },
        {
            name: 'Apps',
            tiles: [
                {
                    title: 'AP01',
                    subtitle: 'Manage Apps',
                    icon: 'fa-app',
                    link: ['/admin/AP01'],
                    canActivate: (ps: PermissionService) =>
                        ps.isAuthorized(Actions.Manage, Subjects.APPS, 'all'),
                },
            ],
        },
        {
            name: 'Clients',
            tiles: [
                {
                    title: 'CL01',
                    subtitle: 'Manage Clients',
                    icon: 'fa-key',
                    link: ['/admin/CL01'],
                    canActivate: (ps: PermissionService) =>
                        ps.isAuthorized(Actions.Manage, Subjects.TENANT, 'all'),
                },
                {
                    title: 'CL02',
                    subtitle: 'Display Client',
                    icon: 'fa-key',
                    link: ['/admin/CL02'],
                    canActivate: (ps: PermissionService) =>
                        ps.isAuthorized(Actions.Manage, Subjects.TENANT, 'all'),
                },
            ],
        },
        {
            name: 'Groups',
            tiles: [
                {
                    title: 'GP01',
                    subtitle: 'Manage Groups',
                    icon: 'fa-group',
                    link: ['/admin/GP01'],
                    canActivate: (ps: PermissionService) =>
                        ps.isAuthorized(Actions.Manage, Subjects.GROUP, 'all'),
                },
                {
                    title: 'GP02',
                    subtitle: 'Display Group',
                    icon: 'fa-group',
                    link: ['/admin/GP02'],
                    canActivate: (ps: PermissionService) =>
                        ps.isAuthorized(Actions.Manage, Subjects.GROUP, 'all'),
                },
            ],
        },
    ];

    constructor(private ps: PermissionService, private authDefaultService: AuthDefaultService) {
        this.groups = makeLaunchPad(this.groups, this.ps);
    }

    ngOnInit(): void {
        this.authDefaultService.resetTitle();
    }
}
