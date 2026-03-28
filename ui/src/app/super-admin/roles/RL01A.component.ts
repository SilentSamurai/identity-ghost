import {Component, OnInit, ViewChild} from '@angular/core';
import {UserService} from '../../_services/user.service';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {ActivatedRoute, Router} from '@angular/router';
import {AdminTenantService} from '../../_services/admin-tenant.service';
import {MessageService} from 'primeng/api';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {AppTableComponent} from '../../component/table/app-table.component';
import {RoleService} from '../../_services/role.service';
import {ConfirmationService} from '../../component/dialogs/confirmation.service';
import {DataSource} from '../../component/model/DataSource';
import {Filter} from '../../component/model/Filters';

@Component({
    selector: 'app-RL01A',
    template: `
        <app-page-view>
            <app-page-view-header>
                <div class="d-flex justify-content-between">
                    <span class="h4">Roles</span>
                </div>
                <app-fb (onFilter)="onFilter($event)">
                    <app-fb-col label="Name" name="name"></app-fb-col>
                    <app-fb-col
                        label="Email via Assignment"
                        name="users/email"
                    ></app-fb-col>
                    <app-fb-col
                        label="Tenant Domain"
                        name="tenants/domain"
                    ></app-fb-col>
                </app-fb>
            </app-page-view-header>
            <app-page-view-body>
                <app-table
                    [dataSource]="rolesDM"
                    title="Roles"
                    multi="true"
                    scrollHeight="75vh"
                >
                    <app-table-col
                        label="Role Name"
                        name="name"
                    ></app-table-col>
                    <app-table-col
                        label="Tenant Domain"
                        name="tenants/domain"
                    ></app-table-col>
                    <app-table-col
                        label="Tenant Name"
                        name="tenants/name"
                    ></app-table-col>
                    <app-table-col label="Action" name="action"></app-table-col>

                    <ng-template #table_body let-role>
                        <td>
                            <a
                                [routerLink]="[
                                    '/admin/RL02/',
                                    role.tenant.id,
                                    role.id,
                                ]"
                                href="javascript:void(0)"
                            >{{ role.name }}</a
                            >
                        </td>
                        <td>
                            <a
                                [routerLink]="['/admin/TN02/', role.tenant.id]"
                                href="javascript:void(0)"
                            >{{ role.tenant.domain }}</a
                            >
                        </td>
                        <td>{{ role.tenant.name }}</td>
                        <td class="d-flex ">
                            <button class="btn ">
                                <i class="fa fa-solid fa-eye"></i>
                            </button>
                            <button
                                (click)="openDeleteModal(role)"
                                class="btn "
                                type="button"
                                *ngIf="role.removable"
                            >
                                <i class="fa fa-solid fa-trash"></i>
                            </button>
                        </td>
                    </ng-template>
                </app-table>
            </app-page-view-body>
        </app-page-view>
    `,
    styles: [''],
})
export class RL01AComponent implements OnInit {
    @ViewChild(AppTableComponent)
    table!: AppTableComponent;

    roles: any;
    rolesDM: DataSource<any>;

    constructor(
        private userService: UserService,
        private adminTenantService: AdminTenantService,
        private roleService: RoleService,
        private route: ActivatedRoute,
        private router: Router,
        private messageService: MessageService,
        private authDefaultService: AuthDefaultService,
        private confirmationService: ConfirmationService,
        private modalService: NgbModal,
    ) {
        this.rolesDM = this.roleService.createDataModel();
    }

    async ngOnInit(): Promise<void> {
        this.authDefaultService.setTitle('RL01: Role List');
    }

    onFilter(filters: Filter[]) {
        this.table.filter(filters);
    }

    async openDeleteModal(role: any) {
        await this.confirmationService.confirm({
            message: 'Are you sure you want to continue ?',
            accept: async () => {
                await this.adminTenantService.deleteRole(role.tenant.id, role.name);
                this.messageService.add({
                    severity: 'success',
                    summary: 'Successful',
                    detail: 'Group removed',
                });
            },
        });
        this.ngOnInit();
    }
}
