import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {MessageService} from 'primeng/api';
import {TenantService} from '../../_services/tenant.service';
import {AdminTenantService} from '../../_services/admin-tenant.service';
import {SessionService} from '../../_services/session.service';
import {UpdateTenantComponent} from './dialogs/update-tenant.component';
import {AddMemberComponent} from './dialogs/add-member.component';
import {AddRoleComponent} from './dialogs/add-role.component';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {ConfirmationService} from '../../component/dialogs/confirmation.service';
import {Location} from '@angular/common';
import {StaticSource} from "../../component/model/StaticSource";
import {AppService} from '../../_services/app.service';
import {CreateAppComponent} from '../apps/dialogs/create-app.component';
import {UpdateAppComponent} from '../apps/dialogs/update-app.component';
import {CreateSubscriptionComponent} from "./dialogs/create-subscription.component";
import {ModalService} from "../../component/dialogs/modal.service";
import {SubscriptionService} from "../../_services/subscription.service";

@Component({
    selector: 'view-tenant',
    template: `
        <secure-nav-bar></secure-nav-bar>
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
                    [disabled]="!isTenantAdmin"
                    id="UPDATE_TENANT_BTN"
                    class="btn btn-primary btn-sm"
                >
                    Update
                </button>
                <button
                    (click)="onDeleteTenant()"
                    [disabled]="!isTenantAdmin"
                    id="DELETE_TENANT_BTN"
                    class="btn btn-danger btn-sm ms-2 "
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
                                <pre class="text-wrap text-break">{{
                                        credentials.clientId
                                    }}</pre>
                            </code>
                        </app-attribute>
                        <app-attribute label="Client Secret">
                            <code>
                                <pre class="text-wrap text-break">{{
                                        credentials.clientSecret
                                    }}</pre>
                            </code>
                        </app-attribute>
                        <app-attribute label="Public Key">
                            <code>
                                <pre class="text-wrap text-break">{{
                                        credentials.publicKey
                                    }}</pre>
                            </code>
                        </app-attribute>
                    </div>
                </div>
            </app-op-header>
            <app-op-tab name="Members">
                <app-op-section name="Members">
                    <app-section-content>
                        <app-table
                            title="Member List"
                            [dataSource]="memberDataModel"
                        >
                            <app-table-col
                                label="Name"
                                name="name"
                            ></app-table-col>
                            <app-table-col
                                label="Email"
                                name="email"
                            ></app-table-col>
                            <app-table-col
                                label="Assigned Roles"
                                name="roles"
                            ></app-table-col>
                            <app-table-col
                                label="Actions"
                                name="actions"
                            ></app-table-col>

                            <app-table-actions>
                                <button
                                    (click)="onAddMember()"
                                    [disabled]="!isTenantAdmin"
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
                                    <a
                                        [routerLink]="[
                                            '/TNRL01/',
                                            tenant_id,
                                            user.id,
                                        ]"
                                        href="javascript:void(0)"
                                    >View Role Assignments
                                    </a>
                                </td>
                                <td class="">
                                    <button
                                        (click)="removeMember(user)"
                                        [disabled]="!isTenantAdmin"
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
                <app-op-section name="Roles">
                    <app-section-content>
                        <app-table
                            title="Role List"
                            [dataSource]="rolesDataModel"
                        >
                            <app-table-col
                                label="Name"
                                name="name"
                            ></app-table-col>
                            <app-table-col
                                label="Description"
                                name="description"
                            ></app-table-col>
                            <app-table-col
                                label="Actions"
                                name="actions"
                            ></app-table-col>

                            <app-table-actions>
                                <button
                                    (click)="onAddRole()"
                                    [disabled]="!isTenantAdmin"
                                    id="ADD_ROLE_DIALOG_BTN"
                                    class="btn btn-primary btn-sm"
                                >
                                    Create
                                </button>
                            </app-table-actions>

                            <ng-template let-role #table_body>
                                <td>
                                    <a
                                        [routerLink]="[
                                            '/RL02',
                                            tenant.id,
                                            role.id,
                                        ]"
                                        href="javascript:void(0)"
                                    >{{ role.name }}
                                    </a>
                                </td>
                                <td>{{ role.description }}</td>
                                <td>
                                    <button
                                        (click)="onRemoveRole(role)"
                                        *ngIf="role.removable"
                                        [disabled]="!isTenantAdmin"
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
                        <app-table
                            title="Created Apps"
                            [dataSource]="createdAppsDataModel"
                        >
                            <app-table-col
                                label="Name"
                                name="name"
                            ></app-table-col>
                            <app-table-col
                                label="Description"
                                name="description"
                            ></app-table-col>
                            <app-table-col
                                label="Visibility"
                                name="visibility"
                            ></app-table-col>
                            <app-table-col
                                label="Actions"
                                name="actions"
                            ></app-table-col>

                            <app-table-actions>
                                <button
                                    (click)="onAddApp()"
                                    [disabled]="!isTenantAdmin"
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
                                        *ngIf="!app.isPublic && isTenantAdmin"
                                        (click)="onPublishApp(app)"
                                        class="btn btn-sm btn-warning me-2"
                                        type="button"
                                    >
                                        <i class="fa fa-bullhorn"></i> Publish
                                    </button>
                                    <button
                                        (click)="onUpdateApp(app)"
                                        [disabled]="!isTenantAdmin"
                                        class="btn btn-sm"
                                        data-test-id="edit"
                                        type="button"
                                    >
                                        <i class="fa fa-solid fa-pencil"></i>
                                    </button>
                                    <button
                                        (click)="onDeleteApp(app)"
                                        [disabled]="!isTenantAdmin"
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

            <app-op-tab name="Subscriptions">
                <app-op-section name="Subscriptions">
                    <app-section-content>
                        <app-table
                            title="Subscribed Apps"
                            [dataSource]="subscribedAppsDataModel"
                        >
                            <app-table-actions>
                                <button
                                    (click)="onCreateSubscription()"
                                    [disabled]="!isTenantAdmin"
                                    id="CREATE_SUBSCRIPTION_BTN"
                                    class="btn btn-success btn-sm ms-2"
                                >
                                    Subscribe App
                                </button>
                            </app-table-actions>
                            <app-table-col
                                label="Name"
                                name="name"
                            ></app-table-col>
                            <app-table-col
                                label="Description"
                                name="description"
                            ></app-table-col>
                            <app-table-col
                                label="Status"
                                name="status"
                            ></app-table-col>
                            <app-table-col
                                label="Message"
                                name="message"
                            ></app-table-col>
                            <app-table-col
                                label="Subscribed At"
                                name="subscribedAt"
                            ></app-table-col>
                            <app-table-col
                                label="Application"
                                name="application"
                            ></app-table-col>
                            <app-table-col
                                label="Actions"
                                name="actions"
                            ></app-table-col>

                            <ng-template let-subscription #table_body>
                                <td>{{ subscription.app.name }}</td>
                                <td>{{ subscription.app.description }}</td>
                                <td>{{ subscription.status }}</td>
                                <td>{{ subscription.message }}</td>
                                <td>{{ subscription.subscribedAt | date }}</td>

                                <td>
                                    <button
                                        (click)="onViewApp(subscription)"
                                        class="btn btn-sm btn-primary me-2"
                                        type="button"
                                    >
                                        View App
                                    </button>
                                </td>

                                <td class="">
                                    <button
                                        (click)="onUnsubscribe(subscription)"
                                        [disabled]="!isTenantAdmin"
                                        class="btn btn-sm btn-danger me-2"
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
export class TN02Component implements OnInit {
    loading: boolean = false;

    tenant_id: string = '';
    tenant: any = {};
    credentials: any = {
        clientId: 'NA',
        clientSecret: 'NA',
        publicKey: 'NA',
    };
    members: any = [];
    isTenantAdmin = false;
    roles: any = [];
    memberDataModel: StaticSource<any>;
    rolesDataModel: StaticSource<any>;
    createdAppsDataModel: StaticSource<any>;
    subscribedAppsDataModel: StaticSource<any>;

    constructor(
        private tenantService: TenantService,
        private adminTenantService: AdminTenantService,
        private tokenStorageService: SessionService,
        private messageService: MessageService,
        private actRoute: ActivatedRoute,
        private router: Router,
        private _location: Location,
        private confirmationService: ConfirmationService,
        private authDefaultService: AuthDefaultService,
        private modalService: ModalService,
        private appService: AppService,
        private subscriptionService: SubscriptionService,
    ) {
        this.memberDataModel = new StaticSource(['id']);
        this.rolesDataModel = new StaticSource(['id']);
        this.createdAppsDataModel = new StaticSource(['id']);
        this.subscribedAppsDataModel = new StaticSource(['id']);
    }

    async ngOnInit() {
        this.loading = true;
        try {
            this.tenant_id = this.actRoute.snapshot.params['tenantId'];
            if (this.tokenStorageService.isTenantAdmin()) {
                this.isTenantAdmin = true;
                this.credentials = await this.tenantService.getTenantCredentials();
            }
            console.log(this.tenant_id);
            this.tenant = await this.tenantService.getTenantDetails();
            this.members = await this.tenantService.getMembers();
            this.roles = await this.tenantService.getTenantRoles();

            const createdApps = await this.appService.getAppCreatedByTenantId();
            const subscribedApps = await this.subscriptionService.getTenantSubscription();

            this.memberDataModel.setData(Array.isArray(this.members) ? this.members : []);
            this.rolesDataModel.setData(Array.isArray(this.roles) ? this.roles : []);
            this.createdAppsDataModel.setData(Array.isArray(createdApps) ? createdApps : []);
            this.subscribedAppsDataModel.setData(Array.isArray(subscribedApps) ? subscribedApps : []);

            this.authDefaultService.setTitle('TN02: ' + this.tenant.name);
        } finally {
            this.loading = false;
        }
    }

    async onUpdateTenant() {
        const modalRef = await this.modalService.open(UpdateTenantComponent, {
            initData: {
                tenant: this.tenant
            }
        });
        if (modalRef.is_ok()) {
            await this.ngOnInit();
        }
    }

    async onAddMember() {
        const modalRef = await this.modalService.open(AddMemberComponent, {
            initData: {tenant: this.tenant}
        });
        if (modalRef.is_ok()) {
            await this.ngOnInit();
        }
    }

    async onAddRole() {
        const modalRef = await this.modalService.open(AddRoleComponent, {
            initData: {
                tenant: this.tenant
            }
        });
        if (modalRef.is_ok()) {
            await this.ngOnInit();
        }
    }

    async onRemoveRole(role: any) {
        const deletedRole = await this.confirmationService.confirm({
            message: `Sure, you want to remove this role "<b>${role.name}</b>" ?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    let deletedRole = await this.tenantService.deleteRole(
                        role.name,
                    );
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'Role Deleted',
                    });
                    return deletedRole;
                } catch (e) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Role Deletion Failed',
                    });
                }
                return null;
            },
        });
        if (deletedRole) {
            await this.ngOnInit();
        }
    }

    async removeMember(user: any) {
        const removedMember = await this.confirmationService.confirm({
            message: `Are you sure you want to remove <b> ${user.email} </b> ?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    const removedMember = await this.tenantService.removeMember(
                        user.email,
                    );
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'Member Removed',
                    });
                    return removedMember;
                } catch (e) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to remove member',
                    });
                }
                return null;
            },
        });
        if (removedMember) {
            await this.ngOnInit();
        }
    }

    async onDeleteTenant() {
        const deletedTenant = await this.confirmationService.confirm({
            message: `Are you sure you want to delete <b> ${this.tenant.domain} </b> ?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    let deletedTenant = this.tokenStorageService.isSuperAdmin()
                        ? await this.adminTenantService.deleteTenant(this.tenant_id)
                        : await this.tenantService.deleteTenant();
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'Tenant Deleted',
                    });
                    return deletedTenant;
                } catch (e) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Tenant Deletion Failed',
                    });
                }
                return null;
            },
        });
        if (deletedTenant) {
            this._location.back();
        }
    }

    async onAddApp() {
        console.log('Opening create app modal with tenantId:', this.tenant?.id);
        if (!this.tenant?.id) {
            console.error('Tenant ID is not available');
            alert('Error: Tenant information is not loaded. Please refresh the page.');
            return;
        }
        const modalRef = await this.modalService.open(CreateAppComponent, {
            initData: {tenantId: this.tenant.id}
        });
        if (modalRef.is_ok()) {
            await this.ngOnInit();
        }
    }

    async onUpdateApp(app: any) {
        const modalRef = await this.modalService.open(UpdateAppComponent, {
            initData: {app}
        });
        if (modalRef.is_ok()) {
            await this.ngOnInit();
        }
    }

    async onDeleteApp(app: any) {
        const deletedApp = await this.confirmationService.confirm({
            message: `Are you sure you want to delete <b>${app.name}</b>?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    await this.appService.deleteApp(app.id);
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'App Deleted'
                    });
                    return app;
                } catch (e) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'App Deletion Failed'
                    });
                }
                return null;
            },
        });
        if (deletedApp) {
            await this.ngOnInit();
        }
    }

    async onCreateSubscription() {
        const result = await this.modalService.open(CreateSubscriptionComponent, {
            initData: {tenant: this.tenant}
        });
        console.log(result, "test");
        if (result.is_ok()) {
            await this.ngOnInit();
        }
    }

    async onUnsubscribe(subscription: any) {
        const unsubscribed = await this.confirmationService.confirm({
            message: `Are you sure you want to unsubscribe from <b>${subscription.app.name}</b>?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    await this.subscriptionService.unsubscribeFromApp(subscription.app.id);
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'Successfully unsubscribed from app'
                    });
                    return true;
                } catch (e) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to unsubscribe from app'
                    });
                }
                return false;
            },
        });
        if (unsubscribed) {
            await this.ngOnInit();
        }
    }

    onViewApp(subscription: any) {
        window.open(subscription.app.appUrl, '_blank');
    }

    async onPublishApp(app: any) {
        const published = await this.confirmationService.confirm({
            message: `Are you sure you want to publish app ${app.name}?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    await this.appService.publishApp(app.id);
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'App published and now visible to other tenants.'
                    });
                    return true;
                } catch (e) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to publish app.'
                    });
                }
                return false;
            },
        });
        if (published) {
            await this.ngOnInit();
        }
    }
}
