import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {AdminTenantService} from '../../_services/admin-tenant.service';
import {SessionService} from '../../_services/session.service';
import {GroupService} from '../../_services/group.service';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {UpdateGroupComponent} from './dialogs/update-group.component';
import {MessageService} from 'primeng/api';
import {ConfirmationService} from '../../component/dialogs/confirmation.service';
import {ModalService} from '../../component/dialogs/modal.service';
import {StaticSource} from '../../component/model/StaticSource';
import {CloseType, ValueHelpResult,} from '../../component/value-help/value-help.component';

@Component({
    selector: 'app-GP02A',
    template: `
        <app-object-page [loading]="loading">
            <app-op-title>{{ group?.name }}</app-op-title>
            <app-op-subtitle>{{ group?.tenant?.name }}</app-op-subtitle>
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
                        <app-attribute label="Group Name">{{ group?.name }}</app-attribute>
                        <app-attribute label="Description">{{ group?.description }}</app-attribute>
                    </div>
                    <div class="col-md">
                        <app-attribute label="Tenant Id">{{ group?.tenant?.id }}</app-attribute>
                        <app-attribute label="Tenant Name">{{ group?.tenant?.name }}</app-attribute>
                    </div>
                </div>
            </app-op-header>

            <app-op-tab name="Roles">
                <app-op-section name="Roles">
                    <app-section-content>
                        <app-table title="Roles" [dataSource]="rolesDM">
                            <app-table-col label="Name" name="name"></app-table-col>
                            <app-table-col label="Description" name="description"></app-table-col>
                            <app-table-col label="Actions" name="actions"></app-table-col>
                            <app-table-actions>
                                <app-value-help-button
                                    name="Roles"
                                    classStyle="btn-primary btn-sm"
                                    [multi]="true"
                                    [dataSource]="tenantRolesDM"
                                    [selection]="selectedRoles"
                                    (onClose)="onAddRoles($event)"
                                >
                                    <app-btn-content>Assign Roles</app-btn-content>
                                    <app-vh-col label="Name" name="name"></app-vh-col>
                                    <ng-template #vh_body let-row>
                                        <td>{{ row.name }}</td>
                                    </ng-template>
                                </app-value-help-button>
                            </app-table-actions>
                            <ng-template let-role #table_body>
                                <td>
                                    <a [routerLink]="['/admin/RL02', group?.tenant?.id, role.id]">
                                        {{ role.name }}
                                    </a>
                                </td>
                                <td>{{ role.description }}</td>
                                <td>
                                    <button
                                        (click)="onRemoveRole(role)"
                                        class="btn btn-sm"
                                        type="button"
                                        aria-label="Remove role"
                                    >
                                        <i class="fa fa-trash"></i>
                                    </button>
                                </td>
                            </ng-template>
                        </app-table>
                    </app-section-content>
                </app-op-section>
            </app-op-tab>

            <app-op-tab name="Users">
                <app-op-section name="Users">
                    <app-section-content>
                        <app-table title="Users" [dataSource]="usersDM">
                            <app-table-col label="Name" name="name"></app-table-col>
                            <app-table-col label="Email" name="email"></app-table-col>
                            <app-table-col label="Assignments" name="assignments"></app-table-col>
                            <app-table-col label="Actions" name="actions"></app-table-col>
                            <app-table-actions>
                                <app-value-help-button
                                    name="Users"
                                    classStyle="btn-primary btn-sm"
                                    [multi]="true"
                                    [dataSource]="membersDM"
                                    [selection]="selectedUsers"
                                    (onClose)="onAddUsers($event)"
                                >
                                    <app-btn-content>Assign Users</app-btn-content>
                                    <app-vh-col label="Email" name="email"></app-vh-col>
                                    <ng-template #vh_body let-row>
                                        <td>{{ row.email }}</td>
                                    </ng-template>
                                </app-value-help-button>
                            </app-table-actions>
                            <ng-template let-user #table_body>
                                <td>{{ user.name }}</td>
                                <td>
                                    <a [routerLink]="['/admin/UR02', user.email]">
                                        {{ user.email }}
                                    </a>
                                </td>
                                <td>
                                    <a [routerLink]="['/admin/TNRL01', group?.tenant?.id, user.email]">
                                        View Assignments
                                    </a>
                                </td>
                                <td>
                                    <button
                                        (click)="onUserRemove(user)"
                                        class="btn btn-sm"
                                        type="button"
                                        aria-label="Remove user"
                                    >
                                        <i class="fa fa-trash"></i>
                                    </button>
                                </td>
                            </ng-template>
                        </app-table>
                    </app-section-content>
                </app-op-section>
            </app-op-tab>
        </app-object-page>
    `,
    styles: [''],
})
export class GP02AComponent implements OnInit {
    loading = true;
    group: any;
    users: any[] = [];
    roles: any[] = [];
    usersDM = new StaticSource(['id']);
    membersDM = new StaticSource(['id']);
    rolesDM = new StaticSource(['id']);
    tenantRolesDM = new StaticSource(['id']);
    selectedRoles: any[] = [];
    selectedUsers: any[] = [];
    private group_id: any;

    constructor(
        private adminTenantService: AdminTenantService,
        private sessionService: SessionService,
        private messageService: MessageService,
        private groupService: GroupService,
        private actRoute: ActivatedRoute,
        private router: Router,
        private authDefaultService: AuthDefaultService,
        private confirmationService: ConfirmationService,
        private modalService: ModalService,
    ) {}

    async ngOnInit() {
        this.loading = true;
        try {
            this.authDefaultService.setTitle('Group Details');
            if (!this.actRoute.snapshot.params.hasOwnProperty('groupId')) {
                await this.router.navigate(['/admin/GP02']);
                return;
            }

            this.group_id = this.actRoute.snapshot.params['groupId'];

            const response = await this.groupService.getGroupDetail(this.group_id);
            this.group = response.group;
            this.users = response.users;
            this.roles = response.roles;

            this.usersDM.setData(this.users);
            this.rolesDM.setData(this.roles);

            const members = await this.adminTenantService.getMembers(this.group.tenant.id);
            this.membersDM.setData(members);
            const tenantRoles = await this.adminTenantService.getTenantRoles(this.group.tenant.id);
            this.tenantRolesDM.setData(tenantRoles);

            this.authDefaultService.setTitle('Group: ' + this.group.name);
        } finally {
            this.loading = false;
        }
    }

    async onUpdateGroup() {
        const result = await this.modalService.open(UpdateGroupComponent, {
            initData: {groupId: this.group_id, form: {name: this.group.name}},
        });
        if (result.is_ok()) {
            await this.ngOnInit();
        }
    }

    async onDeleteGroup() {
        const deleted = await this.confirmationService.confirm({
            message: `Are you sure you want to delete group <b>${this.group.name}</b>?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    await this.groupService.deleteGroup(this.group_id);
                    this.messageService.add({severity: 'success', summary: 'Success', detail: 'Group Deleted'});
                    return true;
                } catch (e) {
                    this.messageService.add({severity: 'error', summary: 'Error', detail: 'Group Deletion Failed'});
                }
                return null;
            },
        });
        if (deleted) {
            await this.router.navigate(['/admin/GP01']);
        }
    }

    async onUserRemove(user: any) {
        await this.confirmationService.confirm({
            message: `Remove <b>${user.email}</b> from this group?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                await this.groupService.removeUser(this.group_id, [user.email]);
                this.messageService.add({severity: 'info', summary: 'Success', detail: 'User removed'});
                await this.ngOnInit();
            },
        });
    }

    async onAddUsers(result: ValueHelpResult) {
        if (result.closeType === CloseType.Confirm && result.selection.length > 0) {
            await this.groupService.addUser(this.group_id, result.selection.map((r) => r.email));
            await this.ngOnInit();
        }
    }

    async onAddRoles(result: ValueHelpResult) {
        if (result.closeType === CloseType.Confirm && result.selection.length > 0) {
            await this.groupService.addRoles(this.group_id, result.selection.map((r) => r.name));
            await this.ngOnInit();
        }
    }

    async onRemoveRole(role: any) {
        await this.confirmationService.confirm({
            message: `Remove role <b>${role.name}</b> from this group?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                await this.groupService.removeRoles(this.group_id, [role.name]);
                this.messageService.add({severity: 'info', summary: 'Success', detail: 'Role removed'});
                await this.ngOnInit();
            },
        });
    }
}
