import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {AdminTenantService} from '../../_services/admin-tenant.service';
import {MessageService} from 'primeng/api';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {CloseType, ValueHelpResult} from '../../component/value-help/value-help.component';
import {StaticSource} from '../../component/model/StaticSource';

@Component({
    selector: 'app-TNRL01A',
    template: `
        <app-object-page *ngIf="!loading">
            <app-op-title>
                {{ user.email }}
            </app-op-title>
            <app-op-subtitle>
                {{ tenant.name }}
            </app-op-subtitle>

            <app-op-header>
                <div class="row mb-2">
                    <div class="col">
                        <app-attribute label="Email">
                            {{ user.email }}
                        </app-attribute>
                        <app-attribute label="Name">
                            {{ user.name }}
                        </app-attribute>
                    </div>
                    <div class="col">
                        <app-attribute label="Tenant Name">
                            {{ tenant.name }}
                        </app-attribute>
                        <app-attribute label="Tenant Id">
                            {{ tenantId }}
                        </app-attribute>
                    </div>
                </div>
            </app-op-header>

            <app-op-tab name="Roles">
                <app-op-section name="Roles">
                    <app-section-content>
                        <app-table
                            title="Role List"
                            [dataSource]="rolesDataModel"
                        >
                            <app-table-actions>
                                <app-value-help-button
                                    classStyle="btn-sm btn-primary"
                                    [dataSource]="tenantRolesDM"
                                    [multi]="true"
                                    name="Assign Roles"
                                    [selection]="roles"
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
                                label="Actions"
                                name="actions"
                            ></app-table-col>

                            <ng-template let-role #table_body>
                                <td>
                                    <a
                                        [routerLink]="['/admin/RL02', tenantId, role.id]"
                                    >{{ role.name }}</a>
                                </td>
                                <td>{{ role.description }}</td>
                                <td>
                                    <button
                                        *ngIf="role.removable"
                                        (click)="onRemoveAssignment(role)"
                                        class="btn btn-sm"
                                        type="button"
                                        aria-label="Remove role assignment"
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
export class TNRL01AComponent implements OnInit {
    tenantId: string = '';
    userId: string = '';
    roles: any[] = [];
    user: any = {};
    tenant: any = {};
    loading = true;
    rolesDataModel = new StaticSource<any>(['id']);
    tenantRolesDM = new StaticSource<any>(['id']);

    constructor(
        private adminTenantService: AdminTenantService,
        private route: ActivatedRoute,
        private router: Router,
        private messageService: MessageService,
        private authDefaultService: AuthDefaultService,
    ) {
    }

    async ngOnInit(): Promise<void> {
        this.authDefaultService.setTitle('TNRL01: Role Assignment of User');

        this.tenantId = this.route.snapshot.params['tenantId'];
        this.userId = this.route.snapshot.params['userId'];

        if (!this.userId || !this.tenantId) {
            await this.router.navigate(['/admin/TNRL01']);
            return;
        }

        try {
            this.tenant = await this.adminTenantService.getTenantDetails(this.tenantId);
            this.user = await this.adminTenantService.getMemberDetails(this.tenantId, this.userId);
            const tenantRoles = await this.adminTenantService.getTenantRoles(this.tenantId);
            this.tenantRolesDM.setData(Array.isArray(tenantRoles) ? tenantRoles : []);
            await this.loadTable();
            this.loading = false;
        } catch (exception: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Failed',
                detail: exception.error?.message || 'Operation failed',
            });
        }
    }

    async loadTable() {
        const memberRoles: any = await this.adminTenantService.getMemberRoles(this.tenantId, this.userId);
        this.roles = Array.isArray(memberRoles) ? memberRoles : [];
        this.rolesDataModel.setData(this.roles);
    }

    async onAddRoles(valueHelpResult: ValueHelpResult) {
        if (valueHelpResult.closeType !== CloseType.Confirm) {
            return;
        }
        try {
            const roleNames = valueHelpResult.selection.map((r: any) => r.name);
            await this.adminTenantService.setMemberRoles(this.tenantId, this.userId, roleNames);
            this.messageService.add({
                severity: 'success',
                summary: 'Assigned',
                detail: 'Roles assigned successfully',
            });
            await this.loadTable();
        } catch (err: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Failed',
                detail: err?.error?.message || 'Error assigning roles',
            });
        }
    }

    async onRemoveAssignment(role: any) {
        try {
            // Remove the role by setting all roles minus this one
            const remaining = this.roles.filter(r => r.id !== role.id).map(r => r.name);
            await this.adminTenantService.setMemberRoles(this.tenantId, this.userId, remaining);
            this.messageService.add({
                severity: 'success',
                summary: 'Removed',
                detail: `${role.name} removed.`,
            });
            await this.loadTable();
        } catch (err: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Failed',
                detail: err?.error?.message || 'Error removing role',
            });
        }
    }
}
