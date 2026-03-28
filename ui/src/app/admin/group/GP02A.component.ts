import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {AdminTenantService} from '../../_services/admin-tenant.service';
import {SessionService} from '../../_services/session.service';
import {GroupService} from '../../_services/group.service';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {UpdateGroupComponent} from './dialogs/update-group.component';
import {MessageService} from 'primeng/api';
import {ConfirmationService} from '../../component/dialogs/confirmation.service';
import {StaticSource} from '../../component/model/StaticSource';
import {CloseType, ValueHelpResult,} from '../../component/value-help/value-help.component';

@Component({
    selector: 'app-GP02A',
    template: `
        <app-object-page *ngIf="!loading">
            <app-op-title>
                {{ group.name }}
            </app-op-title>
            <app-op-subtitle>
                {{ group.tenant.name }}
            </app-op-subtitle>
            <app-op-actions>
                <button
                    (click)="onUpdateGroup()"
                    class="btn btn-primary btn-sm me-2"
                >
                    Update
                </button>

                <button (click)="onDeleteGroup()" class="btn btn-danger btn-sm">
                    Delete
                </button>
            </app-op-actions>
            <app-op-header>
                <div class="row">
                    <div class="col-md">
                        <app-attribute label="Group Name" valueClass="">
                            {{ group.name }}
                        </app-attribute>
                        <app-attribute label="Description" valueClass="">
                            {{ group.description }}
                        </app-attribute>
                    </div>
                    <div class="col-md">
                        <app-attribute label="Tenant Id">
                            {{ group.tenant.id }}
                        </app-attribute>
                        <app-attribute label="Tenant Name">
                            {{ group.tenant.name }}
                        </app-attribute>
                    </div>
                </div>
            </app-op-header>

            <app-op-tab name="Roles">
                <app-op-section name="Roles">
                    <app-section-content>
                        <p-table [value]="roles" responsiveLayout="scroll">
                            <ng-template pTemplate="caption">
                                <div class="d-flex justify-content-between">
                                    <h5>Roles</h5>
                                    <app-value-help-button
                                        name="Roles"
                                        classStyle="btn-primary btn-sm"
                                        [multi]="true"
                                        [dataSource]="rolesDM"
                                        [selection]="selectedRoles"
                                        (onClose)="onAddRoles($event)"
                                    >
                                        <app-btn-content>
                                            Assign Roles
                                        </app-btn-content>
                                        <app-vh-col
                                            label="Name"
                                            name="name"
                                        ></app-vh-col>
                                        <ng-template #vh_body let-row>
                                            <td>{{ row.name }}</td>
                                        </ng-template>
                                    </app-value-help-button>
                                </div>
                            </ng-template>
                            <ng-template pTemplate="header">
                                <tr>
                                    <th>Name</th>
                                    <th>Description</th>
                                    <th>Actions</th>
                                </tr>
                            </ng-template>
                            <ng-template pTemplate="body" let-role>
                                <tr>
                                    <td>
                                        <a
                                            [routerLink]="[
                                                '/admin/RL02',
                                                group.tenant.id,
                                                role.id,
                                            ]"
                                            href="javascript:void(0)"
                                        >
                                            {{ role.name }}
                                        </a>
                                    </td>
                                    <td>{{ role.description }}</td>
                                    <td>
                                        <button
                                            (click)="onRemoveRole(role)"
                                            class="btn btn-sm"
                                            type="button"
                                        >
                                            <i class="fa fa-solid fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            </ng-template>
                        </p-table>
                    </app-section-content>
                </app-op-section>
            </app-op-tab>

            <!-- Convert 'Users' to an app-op-tab -->
            <app-op-tab name="Users">
                <app-op-section name="Users">
                    <app-section-content>
                        <p-table [value]="users" responsiveLayout="scroll">
                            <ng-template pTemplate="caption">
                                <div class="d-flex justify-content-between">
                                    <h5>Users</h5>
                                    <app-value-help-button
                                        name="Users"
                                        classStyle="btn-primary btn-sm"
                                        [multi]="true"
                                        [dataSource]="usersDM"
                                        [selection]="selectedUsers"
                                        (onClose)="onAddUsers($event)"
                                    >
                                        <app-btn-content>
                                            Assign Users
                                        </app-btn-content>
                                        <app-vh-col
                                            label="Email"
                                            name="email"
                                        ></app-vh-col>
                                        <ng-template #vh_body let-row>
                                            <td>{{ row.email }}</td>
                                        </ng-template>
                                    </app-value-help-button>
                                </div>
                            </ng-template>
                            <ng-template pTemplate="header">
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Assignments</th>
                                    <th>Actions</th>
                                </tr>
                            </ng-template>
                            <ng-template pTemplate="body" let-user>
                                <tr>
                                    <td>{{ user.name }}</td>
                                    <td>
                                        <a
                                            [routerLink]="['/admin/UR02', user.email]"
                                            href="javascript:void(0)"
                                        >{{ user.email }}</a
                                        >
                                    </td>
                                    <td>
                                        <a
                                            [routerLink]="[
                                                '/admin/TNRL01',
                                                group.tenant.id,
                                                user.email,
                                            ]"
                                            href="javascript:void(0)"
                                        >View Assignments</a
                                        >
                                    </td>
                                    <td>
                                        <button
                                            (click)="onUserRemove(user)"
                                            class="btn btn-sm"
                                            type="button"
                                        >
                                            <i class="fa fa-solid fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            </ng-template>
                        </p-table>
                    </app-section-content>
                </app-op-section>
            </app-op-tab>
        </app-object-page>
        <div class="text-center" *ngIf="loading">
            <div class="spinner-border" role="status">
                <span class="sr-only">Loading...</span>
            </div>
        </div>
        <p-confirmDialog></p-confirmDialog>
    `,
    styles: [''],
    providers: [],
})
export class GP02AComponent implements OnInit {
    loading = true;
    group: any;
    users: any[] = [];
    usersDM = new StaticSource(['id']);
    roles: any[] = [];
    rolesDM = new StaticSource(['id']);
    selectedRoles: any[] = [];
    selectedUsers: any[] = [];
    private group_id: any;

    constructor(
        private adminTenantService: AdminTenantService,
        private tokenStorageService: SessionService,
        private messageService: MessageService,
        private groupService: GroupService,
        private actRoute: ActivatedRoute,
        private router: Router,
        private authDefaultService: AuthDefaultService,
        private confirmationService: ConfirmationService,
        private modalService: NgbModal,
    ) {
    }

    async ngOnInit() {
        this.loading = true;
        this.authDefaultService.setTitle('Group Details');
        if (!this.actRoute.snapshot.params.hasOwnProperty('groupId')) {
            await this.router.navigate(['/admin/GP02']);
        }

        this.group_id = this.actRoute.snapshot.params['groupId'];

        let response = await this.groupService.getGroupDetail(this.group_id);

        this.group = response.group;
        this.users = response.users;
        this.roles = response.roles;
        let members = await this.adminTenantService.getMembers(this.group.tenant.id);
        this.usersDM.setData(members);
        let tenantRoles = await this.adminTenantService.getTenantRoles(this.group.tenant.id);
        this.rolesDM.setData(tenantRoles);

        this.authDefaultService.setTitle('Group: ' + this.group.name);

        this.loading = false;
    }

    async onUpdateGroup() {
        const modalRef = this.modalService.open(UpdateGroupComponent);
        modalRef.componentInstance.groupId = this.group_id;
        modalRef.componentInstance.form.name = this.group.name;
        const group = await modalRef.result;
        console.log(group);
        this.ngOnInit();
    }

    onDeleteGroup() {
        this.confirmationService.confirm({
            message: 'Are you sure you want to proceed?',
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                await this.groupService.deleteGroup(this.group_id);
                this.messageService.add({
                    severity: 'info',
                    summary: 'Successful',
                    detail: 'Group removed',
                });
                await this.router.navigate(['/admin/GP01']);
            },
        });
    }

    onUserRemove(user: any) {
        this.confirmationService.confirm({
            message: 'Are you sure you want to proceed?',
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                await this.groupService.removeUser(this.group_id, [user.email]);
                this.messageService.add({
                    severity: 'info',
                    summary: 'Successful',
                    detail: 'User removed',
                });
                await this.ngOnInit();
            },
        });
    }

    async onAddUsers(result: ValueHelpResult) {
        if (result.closeType === CloseType.Confirm) {
            const selectedUsers = result.selection;
            if (selectedUsers.length > 0) {
                await this.groupService.addUser(
                    this.group_id,
                    selectedUsers.map((r) => r.email),
                );
                await this.ngOnInit();
            }
        }
    }

    async onAddRoles(result: ValueHelpResult) {
        if (result.closeType === CloseType.Confirm) {
            const selectedRoles = result.selection;
            if (selectedRoles.length > 0) {
                await this.groupService.addRoles(
                    this.group_id,
                    selectedRoles.map((r) => r.name),
                );
                await this.ngOnInit();
            }
        }
    }

    async onRemoveRole(role: any) {
        await this.confirmationService.confirm({
            message: 'Are you sure you want to proceed?',
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                await this.groupService.removeRoles(this.group_id, [role.name]);
                this.messageService.add({
                    severity: 'info',
                    summary: 'Successful',
                    detail: 'Role removed',
                });
                await this.ngOnInit();
            },
        });
    }
}
