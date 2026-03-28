import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {MessageService} from 'primeng/api';
import {AdminTenantService} from '../../_services/admin-tenant.service';
import {UpdateTenantAdminComponent} from './dialogs/update-tenant-admin.component';
import {AddMemberAdminComponent} from './dialogs/add-member-admin.component';
import {AddRoleAdminComponent} from './dialogs/add-role-admin.component';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {ConfirmationService} from '../../component/dialogs/confirmation.service';
import {Location} from '@angular/common';
import {StaticSource} from '../../component/model/StaticSource';
import {AppService} from '../../_services/app.service';
import {CreateAppComponent} from '../apps/dialogs/create-app.component';
import {UpdateAppComponent} from '../apps/dialogs/update-app.component';
import {ModalService} from '../../component/dialogs/modal.service';

@Component({
    selector: 'app-TN02A',
    template: `
        <app-object-page [loading]="loading">
            <app-op-title>
                {{ tenant.name }}
            </app-op-title>
            <app-op-subtitle>
                {{ tenant.domain }}
            </app-op-subtitle>
            <app-op-actions>
                <button
                    (click)="onUpdateTenant()"
                    id="UPDATE_TENANT_BTN"
                    class="btn btn-primary btn-sm"
                >
                    Update
                </button>
                <button
                    (click)="onDeleteTenant()"
                    id="DELETE_TENANT_BTN"
                    class="btn btn-danger btn-sm ms-2"
                >
                    Delete Tenant
                </button>
            </app-op-actions>
            <app-op-header>
                <div class="row">
                    <div class="col-lg-5">
                        <app-attribute label="Tenant Domain">
                            {{ tenant.domain }}
                        </app-attribute>
                        <app-attribute label="Tenant Id">
                            {{ tenant_id }}
                        </app-attribute>
                        <app-attribute label="Tenant Name">
                            {{ tenant.name }}
                        </app-attribute>
                        <app-attribute label="Allow Sign Up">
                            {{ tenant.allowSignUp ? 'Yes' : 'No' }}
                        </app-attribute>
                    </div>
                    <div class="col-lg-7">
                        <app-attribute label="Client Id">
                            <code>
                                <pre class="text-wrap text-break">{{ credentials.clientId }}</pre>
                            </code>
                        </app-attribute>
                        <app-attribute label="Client Secret">
                            <code>
                                <pre class="text-wrap text-break">{{ credentials.clientSecret }}</pre>
                            </code>
                        </app-attribute>
                        <app-attribute label="Public Key">
                            <code>
                                <pre class="text-wrap text-break">{{ credentials.publicKey }}</pre>
                            </code>
                        </app-attribute>
                    </div>
                </div>
            </app-op-header>
            <app-op-tab name="Members">
                <app-op-section name="Members" id="MEMBERS_SECTION_NAV">
                    <app-section-content>
                        <app-table title="Member List" [dataSource]="memberDataModel">
                            <app-table-col label="Name" name="name"></app-table-col>
                            <app-table-col label="Email" name="email"></app-table-col>
                            <app-table-col label="Actions" name="actions"></app-table-col>
                            <app-table-actions>
                                <button
                                    (click)="onAddMember()"
                                    id="OPEN_ADD_MEMBER_DIALOG_BTN"
                                    class="btn btn-primary btn-sm"
                                >
                                    Add
                                </button>
                            </app-table-actions>
                            <ng-template let-user #table_body>
                                <td>{{ user.name }}</td>
                                <td>{{ user.email }}</td>
                                <td>
                                    <button
                                        (click)="removeMember(user)"
                                        class="btn"
                                        [attr.data-cy-id]="user.email"
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
            <app-op-tab name="Roles">
                <app-op-section name="Roles" id="ROLES_SECTION_NAV">
                    <app-section-content>
                        <app-table title="Role List" [dataSource]="rolesDataModel">
                            <app-table-col label="Name" name="name"></app-table-col>
                            <app-table-col label="Description" name="description"></app-table-col>
                            <app-table-col label="Actions" name="actions"></app-table-col>
                            <app-table-actions>
                                <button
                                    (click)="onAddRole()"
                                    id="ADD_ROLE_DIALOG_BTN"
                                    class="btn btn-primary btn-sm"
                                >
                                    Create
                                </button>
                            </app-table-actions>
                            <ng-template let-role #table_body>
                                <td>{{ role.name }}</td>
                                <td>{{ role.description }}</td>
                                <td>
                                    <button
                                        (click)="onRemoveRole(role)"
                                        *ngIf="role.removable"
                                        class="btn btn-sm"
                                        [attr.data-cy-id]="role.name"
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
            <app-op-tab name="Apps">
                <app-op-section name="Apps">
                    <app-section-content>
                        <app-table title="Created Apps" [dataSource]="createdAppsDataModel">
                            <app-table-col label="Name" name="name"></app-table-col>
                            <app-table-col label="Description" name="description"></app-table-col>
                            <app-table-col label="Visibility" name="visibility"></app-table-col>
                            <app-table-col label="Actions" name="actions"></app-table-col>
                            <app-table-actions>
                                <button
                                    (click)="onAddApp()"
                                    id="ADD_APP_DIALOG_BTN"
                                    class="btn btn-primary btn-sm"
                                >
                                    Create
                                </button>
                            </app-table-actions>
                            <ng-template let-app #table_body>
                                <td>{{ app.name }}</td>
                                <td>{{ app.description }}</td>
                                <td>
                                    <span *ngIf="app.isPublic" class="badge bg-success me-2">Public</span>
                                    <span *ngIf="!app.isPublic" class="badge bg-secondary me-2">Private</span>
                                </td>
                                <td>
                                    <button
                                        (click)="onDeleteApp(app)"
                                        class="btn btn-sm"
                                        data-test-id="delete"
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
        </app-object-page>
    `,
    styles: [''],
})
export class TN02AComponent implements OnInit {
    loading = false;
    tenant_id = '';
    tenant: any = {};
    credentials: any = { clientId: 'NA', clientSecret: 'NA', publicKey: 'NA' };
    memberDataModel: StaticSource<any>;
    rolesDataModel: StaticSource<any>;
    createdAppsDataModel: StaticSource<any>;

    constructor(
        private adminTenantService: AdminTenantService,
        private messageService: MessageService,
        private actRoute: ActivatedRoute,
        private router: Router,
        private _location: Location,
        private confirmationService: ConfirmationService,
        private authDefaultService: AuthDefaultService,
        private modalService: ModalService,
        private appService: AppService,
    ) {
        this.memberDataModel = new StaticSource(['id']);
        this.rolesDataModel = new StaticSource(['id']);
        this.createdAppsDataModel = new StaticSource(['id']);
    }

    async ngOnInit() {
        this.loading = true;
        try {
            this.tenant_id = this.actRoute.snapshot.params['tenantId'];
            this.credentials = await this.adminTenantService.getTenantCredentials(this.tenant_id);
            this.tenant = await this.adminTenantService.getTenantDetails(this.tenant_id);
            const members = await this.adminTenantService.getMembers(this.tenant_id);
            const roles = await this.adminTenantService.getTenantRoles(this.tenant_id);
            const createdApps = await this.adminTenantService.getCreatedApps(this.tenant_id);

            this.memberDataModel.setData(Array.isArray(members) ? members : []);
            this.rolesDataModel.setData(Array.isArray(roles) ? roles : []);
            this.createdAppsDataModel.setData(Array.isArray(createdApps) ? createdApps : []);

            this.authDefaultService.setTitle('TN02: ' + this.tenant.name);
        } finally {
            this.loading = false;
        }
    }

    async onUpdateTenant() {
        const modalRef = await this.modalService.open(UpdateTenantAdminComponent, {
            initData: { tenant: this.tenant, tenantId: this.tenant_id }
        });
        if (modalRef.is_ok()) {
            await this.ngOnInit();
        }
    }

    async onAddMember() {
        const modalRef = await this.modalService.open(AddMemberAdminComponent, {
            initData: { tenant: this.tenant }
        });
        if (modalRef.is_ok()) {
            await this.ngOnInit();
        }
    }

    async onAddRole() {
        const modalRef = await this.modalService.open(AddRoleAdminComponent, {
            initData: { tenant: this.tenant }
        });
        if (modalRef.is_ok()) {
            await this.ngOnInit();
        }
    }

    async onRemoveRole(role: any) {
        const deleted = await this.confirmationService.confirm({
            message: `Sure, you want to remove this role "<b>${role.name}</b>" ?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    await this.adminTenantService.deleteRole(this.tenant_id, role.name);
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Role Deleted' });
                    return true;
                } catch (e) {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Role Deletion Failed' });
                }
                return null;
            },
        });
        if (deleted) {
            await this.ngOnInit();
        }
    }

    async removeMember(user: any) {
        const removed = await this.confirmationService.confirm({
            message: `Are you sure you want to remove <b>${user.email}</b> ?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    // Admin member removal — use the admin endpoint
                    await this.adminTenantService.removeMember(this.tenant_id, user.email);
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Member Removed' });
                    return true;
                } catch (e) {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to remove member' });
                }
                return null;
            },
        });
        if (removed) {
            await this.ngOnInit();
        }
    }

    async onDeleteTenant() {
        const deleted = await this.confirmationService.confirm({
            message: `Are you sure you want to delete <b>${this.tenant.domain}</b> ?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    await this.adminTenantService.deleteTenant(this.tenant_id);
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Tenant Deleted' });
                    return true;
                } catch (e) {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Tenant Deletion Failed' });
                }
                return null;
            },
        });
        if (deleted) {
            this._location.back();
        }
    }

    async onAddApp() {
        if (!this.tenant?.id) {
            return;
        }
        const modalRef = await this.modalService.open(CreateAppComponent, {
            initData: { tenantId: this.tenant.id }
        });
        if (modalRef.is_ok()) {
            await this.ngOnInit();
        }
    }

    async onDeleteApp(app: any) {
        const deleted = await this.confirmationService.confirm({
            message: `Are you sure you want to delete <b>${app.name}</b>?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    await this.appService.deleteApp(app.id);
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'App Deleted' });
                    return true;
                } catch (e) {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'App Deletion Failed' });
                }
                return null;
            },
        });
        if (deleted) {
            await this.ngOnInit();
        }
    }
}
