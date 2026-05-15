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
import {ModalService} from '../../component/dialogs/modal.service';
import {TestWebhookAdminComponent} from '../apps/dialogs/test-webhook.component';
import {ClientService} from '../../_services/client.service';
import {CreateClientAdminComponent} from '../clients/dialogs/create-client-admin.component';
import {SecretDisplayAdminComponent} from '../clients/dialogs/secret-display-admin.component';
import {GroupService} from '../../_services/group.service';
import {CreateGroupComponent} from '../group/dialogs/create-group.component';

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
                            <span class="text-muted">Secret is only shown at client creation time. Use the Clients tab to rotate secrets.</span>
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
                            <app-table-col label="Assigned Roles" name="roles"></app-table-col>
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
                                    <a
                                        [routerLink]="['/admin/TNRL01', tenant_id, user.id]"
                                    >View Role Assignments</a>
                                </td>
                                <td>
                                    <button
                                        (click)="removeMember(user)"
                                        class="btn"
                                        [attr.data-cy-id]="user.email"
                                        type="button"
                                        aria-label="Remove member"
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
                                        aria-label="Remove role"
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
                                        aria-label="Delete app"
                                    >
                                        <i class="fa fa-solid fa-trash"></i>
                                    </button>
                                    <button
                                        *ngIf="app.onboardingEnabled"
                                        (click)="onTestWebhook(app)"
                                        class="btn btn-sm btn-outline-info ms-1"
                                        type="button"
                                        title="Test onboarding webhook"
                                        aria-label="Test webhook"
                                    >
                                        <i class="fa fa-solid fa-plug"></i>
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
                        <app-table title="Subscribed Apps" [dataSource]="subscribedAppsDataModel">
                            <app-table-col label="Name" name="name"></app-table-col>
                            <app-table-col label="Description" name="description"></app-table-col>
                            <app-table-col label="Status" name="status"></app-table-col>
                            <app-table-col label="Message" name="message"></app-table-col>
                            <app-table-col label="Subscribed At" name="subscribedAt"></app-table-col>
                            <app-table-col label="Actions" name="actions"></app-table-col>
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
                            </ng-template>
                        </app-table>
                    </app-section-content>
                </app-op-section>
            </app-op-tab>
            <app-op-tab name="Clients">
                <app-op-section name="Clients" id="CLIENTS_SECTION_NAV">
                    <app-section-content>
                        <app-table title="Clients" [dataSource]="clientsDataModel">
                            <app-table-col label="Name" name="name"></app-table-col>
                            <app-table-col label="Client ID" name="clientId"></app-table-col>
                            <app-table-col label="Client Type" name="isPublic"></app-table-col>
                            <app-table-col label="Grant Types" name="grantTypes"></app-table-col>
                            <app-table-col label="Actions" name="actions"></app-table-col>
                            <app-table-actions>
                                <button
                                    (click)="onCreateClient()"
                                    id="CREATE_CLIENT_BTN"
                                    class="btn btn-primary btn-sm"
                                >
                                    Create
                                </button>
                            </app-table-actions>
                            <ng-template let-client #table_body>
                                <td>
                                    <a
                                        [routerLink]="['/admin/CL02/', client.clientId]"
                                    >{{ client.name }}</a>
                                </td>
                                <td>{{ client.clientId }}</td>
                                <td>
                                    <span *ngIf="client.isPublic" class="badge bg-info">Public</span>
                                    <span *ngIf="!client.isPublic" class="badge bg-secondary">Confidential</span>
                                </td>
                                <td>{{ client.grantTypes }}</td>
                                <td>
                                    <button
                                        (click)="onDeleteClient(client)"
                                        class="btn btn-sm"
                                        type="button"
                                        aria-label="Delete client"
                                    >
                                        <i class="fa fa-solid fa-trash"></i>
                                    </button>
                                </td>
                            </ng-template>
                        </app-table>
                    </app-section-content>
                </app-op-section>
            </app-op-tab>
            <app-op-tab name="Groups">
                <app-op-section name="Groups" id="GROUPS_SECTION_NAV">
                    <app-section-content>
                        <app-table title="Group List" [dataSource]="groupsDataModel">
                            <app-table-col label="Name" name="name"></app-table-col>
                            <app-table-col label="Actions" name="actions"></app-table-col>
                            <app-table-actions>
                                <button
                                    (click)="onCreateGroup()"
                                    id="CREATE_GROUP_BTN"
                                    class="btn btn-primary btn-sm"
                                >
                                    Create
                                </button>
                            </app-table-actions>
                            <ng-template let-group #table_body>
                                <td>
                                    <a
                                        [routerLink]="['/admin/GP02/', group.id]"
                                    >{{ group.name }}</a>
                                </td>
                                <td>
                                    <button
                                        (click)="onDeleteGroup(group)"
                                        class="btn btn-sm"
                                        type="button"
                                        aria-label="Delete group"
                                    >
                                        <i class="fa fa-solid fa-trash"></i>
                                    </button>
                                </td>
                            </ng-template>
                        </app-table>
                    </app-section-content>
                </app-op-section>
            </app-op-tab>
            <app-op-tab name="Keys">
                <app-op-section name="Keys" id="KEYS_SECTION_NAV">
                    <app-section-content>
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <div>
                                <span
                                    id="ACTIVE_KEY_COUNT"
                                    [class]="activeKeyCount === keyMetadata.maxActiveKeys ? 'text-warning fw-bold' : ''"
                                >
                                    {{ activeKeyCount }} of {{ keyMetadata.maxActiveKeys }} active
                                </span>
                            </div>
                            <div class="d-flex align-items-center gap-2">
                                <code id="JWKS_URL">{{ '/' + tenant.domain + '/.well-known/jwks.json' }}</code>
                                <button
                                    (click)="copyJwksUrl()"
                                    class="btn btn-outline-secondary btn-sm"
                                    id="COPY_JWKS_URL_BTN"
                                    type="button"
                                    title="Copy JWKS URL"
                                    aria-label="Copy JWKS URL"
                                >
                                    <i class="fa fa-copy"></i>
                                </button>
                            </div>
                        </div>
                        <app-table title="Signing Keys" [dataSource]="keysDataModel">
                            <app-table-col label="Version" name="keyVersion"></app-table-col>
                            <app-table-col label="Key ID" name="kid"></app-table-col>
                            <app-table-col label="Status" name="status"></app-table-col>
                            <app-table-col label="Created" name="createdAt"></app-table-col>
                            <app-table-col label="Superseded" name="supersededAt"></app-table-col>
                            <app-table-col label="Deactivated" name="deactivatedAt"></app-table-col>
                            <app-table-actions>
                                <button
                                    (click)="onRotateKey()"
                                    id="ROTATE_KEY_BTN"
                                    class="btn btn-primary btn-sm"
                                >
                                    Rotate Key
                                </button>
                            </app-table-actions>
                            <ng-template let-key #table_body>
                                <td>{{ key.keyVersion }}</td>
                                <td>{{ key.kid ? key.kid.substring(0, 8) + '\u2026' : '' }}</td>
                                <td>
                                    <span *ngIf="key.deactivatedAt" class="badge bg-secondary">Deactivated</span>
                                    <span *ngIf="!key.deactivatedAt && key.isCurrent"
                                          class="badge bg-success">Current</span>
                                    <span *ngIf="!key.deactivatedAt && !key.isCurrent"
                                          class="badge bg-warning text-dark">
                                        Active
                                        <small class="ms-1">{{ getOverlapCountdown(key) }}</small>
                                    </span>
                                </td>
                                <td>{{ key.createdAt | date:'medium' }}</td>
                                <td>{{ key.supersededAt ? (key.supersededAt | date:'medium') : '' }}</td>
                                <td>{{ key.deactivatedAt ? (key.deactivatedAt | date:'medium') : '' }}</td>
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
    credentials: any = {clientId: 'NA', publicKey: 'NA'};
    memberDataModel: StaticSource<any>;
    rolesDataModel: StaticSource<any>;
    createdAppsDataModel: StaticSource<any>;
    subscribedAppsDataModel: StaticSource<any>;
    clientsDataModel: StaticSource<any>;
    groupsDataModel: StaticSource<any>;
    keysDataModel: StaticSource<any>;
    keyMetadata: { maxActiveKeys: number; tokenExpirationSeconds: number } = {
        maxActiveKeys: 3,
        tokenExpirationSeconds: 3600
    };
    activeKeyCount = 0;

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
        private clientService: ClientService,
        private groupService: GroupService,
    ) {
        this.memberDataModel = new StaticSource(['id']);
        this.rolesDataModel = new StaticSource(['id']);
        this.createdAppsDataModel = new StaticSource(['id']);
        this.subscribedAppsDataModel = new StaticSource(['id']);
        this.clientsDataModel = new StaticSource(['id']);
        this.groupsDataModel = new StaticSource(['id']);
        this.keysDataModel = new StaticSource(['id']);
    }

    async ngOnInit() {
        this.tenant_id = this.actRoute.snapshot.params['tenantId'];
        await this.loadData();
    }

    async loadData() {
        this.loading = true;
        try {
            this.credentials = await this.adminTenantService.getTenantCredentials(this.tenant_id);
            this.tenant = await this.adminTenantService.getTenantDetails(this.tenant_id);
            const members = await this.adminTenantService.getMembers(this.tenant_id);
            const roles = await this.adminTenantService.getTenantRoles(this.tenant_id);
            const createdApps = await this.adminTenantService.getCreatedApps(this.tenant_id);
            const subscriptions = await this.adminTenantService.getSubscriptions(this.tenant_id);
            const clients: any = await this.adminTenantService.getClients(this.tenant_id);
            const groups = await this.adminTenantService.getGroups(this.tenant_id);

            this.memberDataModel.setData(Array.isArray(members) ? members : []);
            this.rolesDataModel.setData(Array.isArray(roles) ? roles : []);
            this.createdAppsDataModel.setData(Array.isArray(createdApps) ? createdApps : []);
            this.subscribedAppsDataModel.setData(Array.isArray(subscriptions) ? subscriptions : []);
            this.clientsDataModel.setData(Array.isArray(clients) ? clients : []);
            this.groupsDataModel.setData(Array.isArray(groups) ? groups : []);

            await this.loadKeys();

            this.authDefaultService.setTitle('TN02: ' + this.tenant.name);
        } finally {
            this.loading = false;
        }
    }

    getOverlapCountdown(key: any): string {
        if (!key.supersededAt) return '';
        const supersededAt = new Date(key.supersededAt).getTime();
        const expiryMs = supersededAt + this.keyMetadata.tokenExpirationSeconds * 1000;
        const remaining = expiryMs - Date.now();
        if (remaining <= 0) return 'expiring soon';
        const minutes = Math.ceil(remaining / 60000);
        if (minutes >= 60) {
            const hours = Math.floor(minutes / 60);
            return `expires in ${hours}h ${minutes % 60}m`;
        }
        return `expires in ${minutes} min`;
    }

    async copyJwksUrl() {
        const url = '/' + this.tenant.domain + '/.well-known/jwks.json';
        try {
            await navigator.clipboard.writeText(url);
            this.messageService.add({severity: 'success', summary: 'Copied', detail: 'JWKS URL copied to clipboard'});
        } catch (e) {
            this.messageService.add({severity: 'error', summary: 'Error', detail: 'Copy not supported'});
        }
    }

    async onRotateKey() {
        const rotated = await this.confirmationService.confirm({
            message: `Are you sure you want to rotate the signing key for ${this.tenant.name}?`,
            header: 'Rotate Key',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    await this.adminTenantService.rotateKeys(this.tenant_id);
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'Key rotated successfully'
                    });
                    return true;
                } catch (e) {
                    this.messageService.add({severity: 'error', summary: 'Error', detail: 'Key rotation failed'});
                }
                return null;
            },
        });
        if (rotated) {
            await this.loadKeys();
            this.credentials = await this.adminTenantService.getTenantCredentials(this.tenant_id);
        }
    }

    async onUpdateTenant() {
        const modalRef = await this.modalService.open(UpdateTenantAdminComponent, {
            initData: {tenant: this.tenant, tenantId: this.tenant_id}
        });
        if (modalRef.is_ok()) {
            await this.loadData();
        }
    }

    async onAddMember() {
        const modalRef = await this.modalService.open(AddMemberAdminComponent, {
            initData: {tenant: this.tenant}
        });
        if (modalRef.is_ok()) {
            await this.loadData();
        }
    }

    async onAddRole() {
        const modalRef = await this.modalService.open(AddRoleAdminComponent, {
            initData: {tenant: this.tenant}
        });
        if (modalRef.is_ok()) {
            await this.loadData();
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
                    this.messageService.add({severity: 'success', summary: 'Success', detail: 'Role Deleted'});
                    return true;
                } catch (e) {
                    this.messageService.add({severity: 'error', summary: 'Error', detail: 'Role Deletion Failed'});
                }
                return null;
            },
        });
        if (deleted) {
            await this.loadData();
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
                    this.messageService.add({severity: 'success', summary: 'Success', detail: 'Member Removed'});
                    return true;
                } catch (e) {
                    this.messageService.add({severity: 'error', summary: 'Error', detail: 'Failed to remove member'});
                }
                return null;
            },
        });
        if (removed) {
            await this.loadData();
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
                    this.messageService.add({severity: 'success', summary: 'Success', detail: 'Tenant Deleted'});
                    return true;
                } catch (e) {
                    this.messageService.add({severity: 'error', summary: 'Error', detail: 'Tenant Deletion Failed'});
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
            initData: {tenantId: this.tenant.id}
        });
        if (modalRef.is_ok()) {
            await this.loadData();
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
                    this.messageService.add({severity: 'success', summary: 'Success', detail: 'App Deleted'});
                    return true;
                } catch (e) {
                    this.messageService.add({severity: 'error', summary: 'Error', detail: 'App Deletion Failed'});
                }
                return null;
            },
        });
        if (deleted) {
            await this.loadData();
        }
    }

    async onTestWebhook(app: any) {
        await this.modalService.open(TestWebhookAdminComponent, {initData: {app}});
    }

    onViewApp(subscription: any) {
        window.open(subscription.app.appUrl, '_blank');
    }

    async onCreateClient() {
        const result = await this.modalService.open<{ client: any; clientSecret: string | null }>(CreateClientAdminComponent, {
            initData: {tenantId: this.tenant_id}
        });
        if (result.is_ok()) {
            const data = result.data;
            if (data?.clientSecret) {
                await this.modalService.open(SecretDisplayAdminComponent, {
                    initData: {clientSecret: data.clientSecret}
                });
            }
            await this.loadData();
        }
    }

    async onDeleteClient(client: any) {
        const deleted = await this.confirmationService.confirm({
            message: `Are you sure you want to delete <b>${client.name}</b>?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    await this.clientService.deleteClient(client.clientId);
                    this.messageService.add({severity: 'success', summary: 'Success', detail: 'Client Deleted'});
                    return true;
                } catch (e) {
                    this.messageService.add({severity: 'error', summary: 'Error', detail: 'Client Deletion Failed'});
                }
                return null;
            },
        });
        if (deleted) {
            await this.loadData();
        }
    }

    async onCreateGroup() {
        const result = await this.modalService.open(CreateGroupComponent, {
            initData: {tenantId: this.tenant_id}
        });
        if (result.is_ok()) {
            await this.loadData();
        }
    }

    async onDeleteGroup(group: any) {
        const deleted = await this.confirmationService.confirm({
            message: `Are you sure you want to delete group <b>${group.name}</b>?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    await this.groupService.deleteGroup(group.id);
                    this.messageService.add({severity: 'success', summary: 'Success', detail: 'Group Deleted'});
                    return true;
                } catch (e) {
                    this.messageService.add({severity: 'error', summary: 'Error', detail: 'Group Deletion Failed'});
                }
                return null;
            },
        });
        if (deleted) {
            await this.loadData();
        }
    }

    private async loadKeys() {
        try {
            const result: any = await this.adminTenantService.getKeys(this.tenant_id);
            const keys = Array.isArray(result.keys) ? result.keys : [];
            this.keysDataModel.setData(keys);
            this.keyMetadata = {
                maxActiveKeys: result.maxActiveKeys ?? 3,
                tokenExpirationSeconds: result.tokenExpirationSeconds ?? 3600,
            };
            this.activeKeyCount = keys.filter((k: any) => !k.deactivatedAt).length;
        } catch (e) {
            this.messageService.add({severity: 'error', summary: 'Error', detail: 'Failed to load keys'});
        }
    }
}
