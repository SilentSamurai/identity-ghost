import {AfterContentInit, Component} from '@angular/core';
import {UserService} from '../../_services/user.service';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {ActivatedRoute, Router} from '@angular/router';
import {TenantService} from '../../_services/tenant.service';
import {lastValueFrom} from 'rxjs';
import {MessageService} from 'primeng/api';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {CloseType, ValueHelpResult,} from '../../component/value-help/value-help.component';
import {StaticSource} from "../../component/model/StaticSource";

@Component({
    selector: 'app-TNRL01',
    template: `
        <secure-nav-bar></secure-nav-bar>
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
                            {{ tenant.id }}
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
                                    classStyle="btn-sm btn-primary "
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
                                        [routerLink]="[
                                            '/RL02',
                                            tenant.id,
                                            role.id,
                                        ]"
                                        href="javascript:void(0)"
                                    >{{ role.name }}</a
                                    >
                                </td>
                                <td>{{ role.description }}</td>
                                <td>
                                    <!-- If role.removable is true, user can remove -->
                                    <button
                                        *ngIf="role.removable"
                                        (click)="onRemoveAssignment(role)"
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
        </app-object-page>
    `,
    styles: [''],
})
export class TNRL01Component implements AfterContentInit {
    tenantId: string = '';
    userId: string = '';
    member: any = {
        roles: [],
    };
    roles: any[] = [];
    user: any;
    tenant: any;
    loading = true;
    tenantRoles: any[] = [];
    rolesDataModel = new StaticSource<any>(['id']);
    tenantRolesDM = new StaticSource<any>(['id']);

    constructor(
        private userService: UserService,
        private tenantService: TenantService,
        private route: ActivatedRoute,
        private router: Router,
        private messageService: MessageService,
        private authDefaultService: AuthDefaultService,
        private modalService: NgbModal,
    ) {
    }

    async ngOnInit(): Promise<void> {
        this.authDefaultService.setTitle('TNRL01: Role Assignment of User');

        this.tenantId = this.route.snapshot.params['tenantId'];
        this.userId = this.route.snapshot.params['userId'];

        // let params = this.route.snapshot.queryParamMap;
        // if (!params.has('email') || !params.has('tenantId')) {
        //     await this.router.navigate(['/role-sel']);
        // }
        // this.email = params.get('email') as string;
        // this.tenantId = params.get('tenantId') as string;
        if (!this.userId || !this.tenantId) {
            await this.router.navigate(['/home']);
        }

        this.tenant = await this.tenantService.getTenantDetails();
        this.user = await lastValueFrom(this.userService.getUser(this.userId));
        try {
            await this.loadTable();
            this.tenantRoles = this.tenant.roles;
            this.tenantRolesDM.setData(this.tenantRoles);
            this.loading = false;
        } catch (exception: any) {
            console.log(exception);
            this.messageService.add({
                severity: 'error',
                summary: 'Failed',
                detail: exception.error.message,
            });
        }
    }

    ngAfterContentInit(): void {
    }

    async loadTable() {
        if (this.tenantId && this.userId) {
            this.member = await this.tenantService.getMemberDetails(
                this.userId,
            );
            // $event.update(this.member, false);
            this.roles = this.member.roles;
            (this.rolesDataModel as any as StaticSource<any>).setData(
                this.roles,
            );
        }
    }

    async onAddRoles(valueHelpResult: ValueHelpResult) {
        if (valueHelpResult.closeType != CloseType.Confirm) {
            return;
        }
        try {
            await this.tenantService.addRolesToMember(
                valueHelpResult.selection,
                this.userId,
            );
            this.messageService.add({
                severity: 'success',
                summary: 'Assigned',
                detail: 'Roles assigned successfully',
            });
            // Reload table
            await this.loadTable();
        } catch (err: any) {
            console.error(err);
            this.messageService.add({
                severity: 'error',
                summary: 'Failed',
                detail: err?.error?.message || 'Error assigning roles',
            });
        }
    }

    async onRemoveAssignment(role: any) {
        try {
            await this.tenantService.removeRolesFromMember(
                [role],
                this.userId,
            );
            this.messageService.add({
                severity: 'success',
                summary: 'Removed',
                detail: `${role.name} removed.`,
            });
            await this.loadTable();
        } catch (err: any) {
            console.error(err);
            this.messageService.add({
                severity: 'error',
                summary: 'Failed',
                detail: err?.error?.message || 'Error removing role',
            });
        }
    }
}
