import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {TenantService} from '../../_services/tenant.service';
import {SessionService} from '../../_services/session.service';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {RoleService} from '../../_services/role.service';
import {MessageService} from 'primeng/api';
import {ConfirmationService} from '../../component/dialogs/confirmation.service';
import {PolicyService} from '../../_services/policy.service';
import {CreatePolicyModalComponent} from './create-policy-modal.component';
import {CloseType, ValueHelpResult,} from '../../component/value-help/value-help.component';
import {UpdateRoleModalComponent} from './update-role-modal.component';
import {ModalResult, ModalService} from '../../component/dialogs/modal.service';
import {StaticSource} from "../../component/model/StaticSource";
import {AppService} from '../../_services/app.service';

@Component({
    selector: 'app-RL02',
    template: `
        <secure-nav-bar></secure-nav-bar>
        <app-object-page *ngIf="!loading">
            <app-op-title>
                {{ role.name }}
            </app-op-title>
            <app-op-subtitle>
                {{ role.tenant.name }}
            </app-op-subtitle>
            <app-op-actions>
                <button
                    (click)="onUpdateRole()"
                    class="btn btn-primary btn-sm me-2"
                >
                    Update
                </button>

                <button (click)="onDeleteRole()" class="btn btn-danger btn-sm">
                    Delete
                </button>
            </app-op-actions>
            <app-op-header>
                <div class="row">
                    <div class="col">
                        <app-attribute label="Name">
                            {{ role.name }}
                        </app-attribute>
                        <app-attribute label="Description">
                            {{ role.description }}
                        </app-attribute>
                    </div>
                    <div class="col">
                        <app-attribute label="Tenant Id">
                            {{ role.tenant.id }}
                        </app-attribute>
                        <app-attribute label="Tenant Name">
                            {{ role.tenant.name }}
                        </app-attribute>
                    </div>
                </div>
                <div class="row mt-2">
                    <div class="col">
                        <app-attribute label="Assigned App">
                            <span *ngIf="role.app">{{ role.app.name }}</span>
                            <span *ngIf="!role.app">No app assigned</span>
                            <app-value-help-button
                                classStyle="btn-sm btn-primary ms-2"
                                [dataSource]="appsDM"
                                [multi]="false"
                                [selection]="role.app ? [role.app] : []"
                                name="Select App"
                                (onOpen)="onAppVhOpen()"
                                (onClose)="onAppVhClose($event)"
                            >
                                <app-btn-content>
                                    Assign App
                                </app-btn-content>
                                <app-vh-col label="Name" name="name"></app-vh-col>
                                <app-vh-col label="Description" name="description"></app-vh-col>
                                <ng-template #vh_body let-row>
                                    <td>{{ row.name }}</td>
                                    <td>{{ row.description }}</td>
                                </ng-template>
                            </app-value-help-button>
                        </app-attribute>
                    </div>
                </div>
            </app-op-header>
            <app-op-tab name="Users">
                <app-op-section name="Users">
                    <app-section-action></app-section-action>
                    <app-section-content>
                        <app-table
                            [dataSource]="usersDM"
                            title="Users"
                            scrollHeight="75vh"
                        >
                            <app-table-actions>
                                <app-value-help-button
                                    classStyle="btn-sm btn-primary"
                                    [dataSource]="usersDM"
                                    [multi]="true"
                                    [selection]="users"
                                    name="Select Users"
                                    (onOpen)="onUserVhOpen()"
                                    (onClose)="onUserVhClose($event)"
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
                            </app-table-actions>

                            <app-table-col
                                label="Name"
                                name="name"
                            ></app-table-col>
                            <app-table-col
                                label="Email"
                                name="email"
                            ></app-table-col>
                            <app-table-col
                                label="Actions"
                                name="actions"
                            ></app-table-col>

                            <ng-template #table_body let-user>
                                <td>{{ user.name }}</td>
                                <td>{{ user.email }}</td>
                                <td>
                                    <button
                                        (click)="onUserRemove(user)"
                                        class="btn btn-sm"
                                        type="button"
                                    >
                                        <i class="fa fa-solid fa-trash"></i>
                                    </button>
                                </td>
                            </ng-template>
                        </app-table>
                    </app-section-content>
                </app-op-section>
            </app-op-tab>

            <app-op-tab name="Policies">
                <app-op-section name="Policies">
                    <app-section-content>
                        <app-table
                            [dataSource]="policiesDM"
                            title="Policies"
                            scrollHeight="75vh"
                        >
                            <app-table-actions>
                                <button
                                    class="btn btn-sm btn-primary"
                                    (click)="openCreatePolicyModal()"
                                >
                                    New Policy
                                </button>
                            </app-table-actions>

                            <app-table-col
                                label="Effect"
                                name="effect"
                            ></app-table-col>
                            <app-table-col
                                label="Action"
                                name="action"
                            ></app-table-col>
                            <app-table-col
                                label="Subject"
                                name="subject"
                            ></app-table-col>
                            <app-table-col
                                label="Conditions"
                                name="conditions"
                            ></app-table-col>
                            <app-table-col
                                label="Actions"
                                name="actions"
                            ></app-table-col>

                            <ng-template #table_body let-policy>
                                <td>{{ policy.effect }}</td>
                                <td>{{ policy.action }}</td>
                                <td>{{ policy.subject }}</td>
                                <td>
                                    {{
                                        isEmpty(policy.conditions)
                                            ? ''
                                            : '{...}'
                                    }}
                                </td>
                                <td>
                                    <button
                                        class="btn btn-sm btn-success me-2"
                                        (click)="openViewPolicyModal(policy.id)"
                                    >
                                        <i class="fa fa-eye"></i>
                                    </button>
                                    <button
                                        class="btn btn-sm btn-warning me-2"
                                        (click)="
                                            openUpdatePolicyModal(policy.id)
                                        "
                                    >
                                        <i class="fa fa-pencil"></i>
                                    </button>
                                    <button
                                        class="btn btn-sm btn-danger"
                                        (click)="onPolicyRemove(policy)"
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

        <div class="text-center mt-5" *ngIf="loading">
            <div class="spinner-border" role="status">
                <span class="sr-only">Loading...</span>
            </div>
        </div>
        <p-confirmDialog></p-confirmDialog>
    `,
    styles: [''],
})
export class RL02Component implements OnInit {
    loading = true;
    role: any;
    users: any[] = [];
    policies: any[] = [];
    newPolicy = {
        action: '',
        subject: '',
        effect: 'ALLOW',
    };
    usersDM = new StaticSource(['id']);
    policiesDM = new StaticSource(['id']);
    appsDM = new StaticSource(['id']);
    private roleId: string = '';
    private tenantId: string = '';

    constructor(
        private tenantService: TenantService,
        private tokenStorageService: SessionService,
        private messageService: MessageService,
        private roleService: RoleService,
        private actRoute: ActivatedRoute,
        private router: Router,
        private authDefaultService: AuthDefaultService,
        private confirmationService: ConfirmationService,
        private modalService: ModalService,
        private policyService: PolicyService,
        private appService: AppService,
    ) {
    }

    async ngOnInit() {
        this.loading = true;

        if (
            !this.actRoute.snapshot.params.hasOwnProperty('roleId') ||
            !this.actRoute.snapshot.params.hasOwnProperty('tenantId')
        ) {
            await this.router.navigate(['/RL01']);
        }

        this.roleId = this.actRoute.snapshot.params['roleId'];
        this.tenantId = this.actRoute.snapshot.params['tenantId'];

        await this.loadRoleAndUser();
        await this.reloadPolicies();

        this.authDefaultService.setTitle('RL02: ' + this.role.name);

        this.loading = false;
    }

    async onUpdateRole() {
        const modalResult: ModalResult<any> = await this.modalService.open(
            UpdateRoleModalComponent,
            {
                initData: {
                    role: {...this.role},
                    tenantId: this.tenantId,
                },
            },
        );

        if (modalResult.is_ok()) {
            const updatedRole = modalResult.data;
            if (updatedRole) {
                this.role.name = updatedRole.name;
                this.role.description = updatedRole.description;
            }
        }
    }

    async onDeleteRole() {
        await this.confirmationService.confirm({
            message: 'Are you sure you want to proceed?',
            accept: async () => {
                await this.tenantService.deleteRole(
                    this.role.name,
                );
                this.messageService.add({
                    severity: 'info',
                    summary: 'Successful',
                    detail: 'Group removed',
                });
                await this.router.navigate(['/RL01']);
            },
        });
    }

    async loadRoleAndUser() {
        try {
            let response = await this.roleService.getRoleDetails(
                this.tenantId,
                this.roleId,
            );
            this.role = response.role;
            this.users = response.users;
            this.usersDM.setData(this.users);
        } catch (e: any) {
            console.error('Error reloading users:', e);
            this.messageService.add({
                severity: 'error',
                summary: 'Failed',
                detail: 'Could not load users',
            });
        }
    }

    async onUserRemove(user: any) {
        await this.confirmationService.confirm({
            message: 'Are you sure you want to proceed?',
            accept: async () => {
                await this.tenantService.removeRolesFromMember(
                    [this.role],
                    user.id,
                );
                this.messageService.add({
                    severity: 'info',
                    summary: 'Successful',
                    detail: 'User removed',
                });
            },
        });
        await this.ngOnInit();
    }

    async onUserVhOpen() {
        try {
            const members = await this.tenantService.getMembers();
            this.usersDM.setData(members);
        } catch (e) {
            this.messageService.add({
                severity: 'error',
                summary: 'Member Load Failed',
                detail: 'Could not load member',
            });
        }
    }

    async onUserVhClose(valueHelpResult: ValueHelpResult): Promise<void> {
        if (valueHelpResult.closeType === CloseType.Confirm) {
            try {
                const selectedUser = valueHelpResult.selection;
                for (let user of selectedUser) {
                    await this.tenantService.addRolesToMember(
                        [this.role],
                        user.id,
                    );
                }
                const response = await this.roleService.getRoleDetails(
                    this.tenantId,
                    this.roleId,
                );
                this.users = response.users;
                this.usersDM.setData(this.users);
            } catch (e) {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Refresh Failed',
                    detail: 'Could not update user list',
                });
            }
        }
    }

    async openCreatePolicyModal(): Promise<void> {
        const modalResult: ModalResult<any> = await this.modalService.open(
            CreatePolicyModalComponent,
            {
                initData: {
                    role_id: this.role.id,
                },
            },
        );

        if (modalResult.is_ok()) {
            const createdPolicy = modalResult.data;
            if (createdPolicy) {
                await this.reloadPolicies();
            }
        }
    }

    async openUpdatePolicyModal(policyId: string): Promise<void> {
        const modalResult: ModalResult<any> = await this.modalService.open(
            CreatePolicyModalComponent,
            {
                initData: {
                    role_id: this.role.id,
                    policyId: policyId,
                },
            },
        );

        if (modalResult.is_ok()) {
            const updatedPolicy = modalResult.data;
            if (updatedPolicy) {
                await this.reloadPolicies();
            }
        }
    }

    async onPolicyRemove(policy: any) {
        await this.confirmationService.confirm({
            message: `Are you sure you want to delete this policy?  [${policy.effect}] [${policy.action}] on [${policy.subject}].`,
            accept: async () => {
                try {
                    await this.policyService.deleteAuthorization(policy.id);
                    this.messageService.add({
                        severity: 'info',
                        summary: 'Policy Deleted',
                        detail: `Policy [${policy.id}] was removed.`,
                    });
                    await this.reloadPolicies();
                } catch (err: any) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Failed to delete policy',
                        detail: err.message,
                    });
                }
            },
        });
    }

    async reloadPolicies() {
        try {
            this.policies = await this.policyService.getRoleAuthorizations(
                this.role.id,
            );
            this.policiesDM.setData(this.policies);
        } catch (e: any) {
            console.error('Error reloading policies:', e);
            this.messageService.add({
                severity: 'error',
                summary: 'Failed',
                detail: 'Could not reload policies',
            });
        }
    }

    async openViewPolicyModal(policyId: string): Promise<void> {
        const modalResult: ModalResult<any> = await this.modalService.open(
            CreatePolicyModalComponent,
            {
                initData: {
                    policyId: policyId,
                    viewOnly: true,
                },
            },
        );
    }

    async onAppVhOpen() {
        try {
            const apps = await this.appService.getAppCreatedByTenantId();
            this.appsDM.setData(apps);
        } catch (e) {
            this.messageService.add({
                severity: 'error',
                summary: 'App Load Failed',
                detail: 'Could not load apps',
            });
        }
    }

    async onAppVhClose(valueHelpResult: ValueHelpResult): Promise<void> {
        if (valueHelpResult.closeType === CloseType.Confirm) {
            try {
                const selectedApp = valueHelpResult.selection;
                for (let app of selectedApp) {
                    await this.roleService.updateRole(
                        this.role.id,
                        this.role.name,
                        this.role.description || "",
                        app.id
                    );
                }
                const response = await this.roleService.getRoleDetails(this.tenantId, this.roleId);
                this.role = response.role;
                this.messageService.add({
                    severity: 'info',
                    summary: 'App Assigned',
                    detail: selectedApp.length > 0 ? `App [${selectedApp[0].name}] assigned to role.` : 'App assignment cleared.',
                });
            } catch (e) {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Refresh Failed',
                    detail: 'Could not update role details',
                });
            }
        }
    }

    isEmpty(obj: any) {
        for (const prop in obj) {
            return false;
        }
        return true;
    }
}
