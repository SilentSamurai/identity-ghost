import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { EditUserModalComponent } from './dialogs/edit-user.modal.component';
import { UserService } from '../../_services/user.service';
import { lastValueFrom } from 'rxjs';
import { ConfirmationService } from '../../component/dialogs/confirmation.service';
import { MessageService } from 'primeng/api';
import { Location } from '@angular/common';
import { AuthDefaultService } from '../../_services/auth.default.service';
import { StaticSource } from "../../component/model/StaticSource";
import { ChangePasswordModalComponent } from './dialogs/change-password.modal.component';

@Component({
    selector: 'app-UR02A',
    template: `
        <app-object-page>
            <app-op-title>
                {{ user.email }}
            </app-op-title>
            <app-op-subtitle>
                {{ user.name }}
            </app-op-subtitle>
            <app-op-header>
                <div class="row">
                    <div class="col">
                        <app-attribute label="Email">
                            {{ user.email }}
                        </app-attribute>
                        <app-attribute label="Name">
                            {{ user.name }}
                        </app-attribute>
                        <app-attribute label="is Verified">
                            {{ user.verified ? 'Yes' : 'No' }}
                        </app-attribute>
                    </div>
                    <div class="col">
                        <app-attribute label="Created At">
                            {{ user.createdAt | date }}
                        </app-attribute>
                        <app-attribute label="Lock Status">
                            {{ user.locked ? 'Locked' : 'Unlocked' }}
                        </app-attribute>
                    </div>
                </div>
            </app-op-header>
            <app-op-actions>
                <button
                    (click)="openUpdateModal()"
                    class="btn btn-sm btn-primary mx-2"
                >
                    Update
                </button>
                <button
                    (click)="openChangePasswordModal()"
                    class="btn btn-sm  btn-primary mx-2"
                >
                    Change Password
                </button>
                <button
                    (click)="onToggleLock()"
                    class="btn btn-sm  btn-primary mx-2"
                >
                    {{ user.locked ? 'Unlock' : 'Lock' }}
                </button>
                <button
                    (click)="onDelete()"
                    class="btn btn-sm  btn-danger mx-2"
                >
                    Delete
                </button>
                <button
                    *ngIf="!user.verified"
                    (click)="onVerifyUser()"
                    class="btn btn-sm btn-success mx-2"
                >
                    Verify User
                </button>
            </app-op-actions>
            <app-op-tab name="Tenants">
                <app-op-section name="Tenants">
                    <app-section-content>
                        <app-table title="Tenant List" [dataSource]="tenantsDM">
                            <app-table-col
                                label="Name"
                                name="name"
                            ></app-table-col>
                            <app-table-col
                                label="Domain"
                                name="domain"
                            ></app-table-col>
                            <app-table-col
                                label="Roles"
                                name="roles"
                            ></app-table-col>

                            <ng-template let-tenant #table_body>
                                <td>{{ tenant.name }}</td>
                                <td>
                                    <a
                                        [routerLink]="['/admin/TN02/', tenant.id]"
                                        href="javascript:void(0)"
                                    >{{ tenant.domain }}</a
                                    >
                                </td>
                                <td>
                                    <a
                                        [routerLink]="[
                                            '/admin/TNRL01/',
                                            tenant.id,
                                            user.id,
                                        ]"
                                        href="javascript:void(0)"
                                    >View Role Assignments
                                    </a>
                                </td>
                            </ng-template>
                        </app-table>
                    </app-section-content>
                </app-op-section>
            </app-op-tab>
        </app-object-page>
    `,
    styles: [],
})
export class UR02AComponent implements OnInit {
    userId: string = '';
    user: any = {
        name: '',
        createdAt: '',
    };
    tenants: any = [];
    tenantsDM = new StaticSource<any>(['id']);
    constructor(
        private userService: UserService,
        private actRoute: ActivatedRoute,
        private confirmationService: ConfirmationService,
        private messageService: MessageService,
        private _location: Location,
        private authDefaultService: AuthDefaultService,
        private modalService: NgbModal,
    ) {
    }

    async ngOnInit(): Promise<void> {
        this.authDefaultService.setTitle('UR02: Manage User');
        this.userId = this.actRoute.snapshot.params['userId'];
        console.log(this.userId);
        this.user = await lastValueFrom(this.userService.getUser(this.userId));
        this.tenants = await lastValueFrom(
            this.userService.getUserTenants(this.userId),
        );
        this.tenantsDM.setData(this.tenants);
    }

    openUpdateModal() {
        const modalRef = this.modalService.open(EditUserModalComponent);
        modalRef.componentInstance.user = this.user;
    }

    openChangePasswordModal() {
        const modalRef = this.modalService.open(ChangePasswordModalComponent);
        modalRef.componentInstance.user = this.user;
    }

    async onDelete() {
        const deletedUser = await this.confirmationService.confirm({
            message: `Are you sure you want to delete ${this.user.email} ?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    let deletedUser = await this.userService.deleteUser(
                        this.user.id,
                    );
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'User Deleted',
                    });
                    return deletedUser;
                } catch (e) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'User Deletion Failed',
                    });
                }
                return null;
            },
        });
        console.log(deletedUser);
        this._location.back();
    }

    async onVerifyUser() {
        const confirmed = await this.confirmationService.confirm({
            message: `Are you sure you want to verify ${this.user.email}?`,
            header: 'Verify User',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    await this.userService.verifyUser(this.user.email, true);
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'User Verified',
                    });
                    await this.ngOnInit();
                } catch (e) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'User Verification Failed',
                    });
                }
            },
        });
    }

    async onToggleLock() {
        const action = this.user.locked ? 'unlock' : 'lock';
        await this.confirmationService.confirm({
            message: `Are you sure you want to ${action} ${this.user.email}?`,
            header: `${action === 'lock' ? 'Lock' : 'Unlock'} User`,
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    if (action === 'lock') {
                        await this.userService.lockUser(this.user.id);
                    } else {
                        await this.userService.unlockUser(this.user.id);
                    }
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: `User ${action}ed`,
                    });
                    await this.ngOnInit();
                } catch (e) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: `Failed to ${action} user`,
                    });
                }
            },
        });
    }
}
