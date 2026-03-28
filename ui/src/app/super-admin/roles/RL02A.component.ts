import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {MessageService} from 'primeng/api';
import {AdminTenantService} from '../../_services/admin-tenant.service';
import {RoleService} from '../../_services/role.service';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {ConfirmationService} from '../../component/dialogs/confirmation.service';
import {Location} from '@angular/common';
import {StaticSource} from '../../component/model/StaticSource';
import {UpdateRoleModalComponent} from './update-role-modal.component';
import {ModalService} from '../../component/dialogs/modal.service';

@Component({
    selector: 'app-RL02A',
    template: `
        <app-object-page [loading]="loading">
            <app-op-title>
                {{ role.name }}
            </app-op-title>
            <app-op-subtitle>
                {{ tenantDomain }}
            </app-op-subtitle>
            <app-op-actions>
                <button
                    (click)="onUpdateRole()"
                    id="UPDATE_ROLE_BTN"
                    class="btn btn-primary btn-sm"
                >
                    Update
                </button>
                <button
                    (click)="onDeleteRole()"
                    id="DELETE_ROLE_BTN"
                    class="btn btn-danger btn-sm ms-2"
                    *ngIf="role.removable"
                >
                    Delete Role
                </button>
            </app-op-actions>
            <app-op-header>
                <div class="row">
                    <div class="col-lg-5">
                        <app-attribute label="Role Name">
                            {{ role.name }}
                        </app-attribute>
                        <app-attribute label="Description">
                            {{ role.description || '—' }}
                        </app-attribute>
                    </div>
                    <div class="col-lg-5">
                        <app-attribute label="Tenant">
                            <a
                                [routerLink]="['/admin/TN02/', tenantId]"
                                href="javascript:void(0)"
                            >{{ tenantDomain }}</a>
                        </app-attribute>
                        <app-attribute label="Created At">
                            {{ role.createdAt | date }}
                        </app-attribute>
                    </div>
                </div>
            </app-op-header>
            <app-op-tab name="Assigned Users">
                <app-op-section name="Users" id="USERS_SECTION_NAV">
                    <app-section-content>
                        <app-table
                            [dataSource]="usersDM"
                            title="Assigned Users"
                        >
                            <app-table-col
                                label="Email"
                                name="email"
                            ></app-table-col>
                            <app-table-col
                                label="Name"
                                name="name"
                            ></app-table-col>

                            <ng-template #table_body let-user>
                                <td>
                                    <a
                                        [routerLink]="['/admin/UR02/', user.id]"
                                        href="javascript:void(0)"
                                    >{{ user.email }}</a>
                                </td>
                                <td>{{ user.name }}</td>
                            </ng-template>
                        </app-table>
                    </app-section-content>
                </app-op-section>
            </app-op-tab>
        </app-object-page>
    `,
    styles: [''],
})
export class RL02AComponent implements OnInit {
    loading = false;
    tenantId = '';
    roleId = '';
    role: any = {};
    tenantDomain = '';
    usersDM: StaticSource<any>;

    constructor(
        private adminTenantService: AdminTenantService,
        private roleService: RoleService,
        private messageService: MessageService,
        private actRoute: ActivatedRoute,
        private router: Router,
        private _location: Location,
        private confirmationService: ConfirmationService,
        private authDefaultService: AuthDefaultService,
        private modalService: ModalService,
    ) {
        this.usersDM = new StaticSource(['id']);
    }

    async ngOnInit() {
        this.loading = true;
        try {
            this.tenantId = this.actRoute.snapshot.params['tenantId'];
            this.roleId = this.actRoute.snapshot.params['roleId'];

            const result = await this.roleService.getRoleDetails(this.tenantId, this.roleId);
            this.role = result.role || {};
            this.tenantDomain = this.role.tenant?.domain || '';
            const users = result.users || [];
            this.usersDM.setData(Array.isArray(users) ? users : []);

            this.authDefaultService.setTitle('RL02: ' + this.role.name);
        } finally {
            this.loading = false;
        }
    }

    async onUpdateRole() {
        const result = await this.modalService.open(UpdateRoleModalComponent, {
            initData: {
                role: {...this.role},
                tenantId: this.tenantId,
            },
        });
        if (result.is_ok()) {
            await this.ngOnInit();
        }
    }

    async onDeleteRole() {
        await this.confirmationService.confirm({
            message: `Are you sure you want to delete role "${this.role.name}"?`,
            accept: async () => {
                try {
                    await this.adminTenantService.deleteRole(this.tenantId, this.role.name);
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Successful',
                        detail: 'Role deleted',
                    });
                    this._location.back();
                } catch (e) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Role deletion failed',
                    });
                }
            },
        });
    }
}
