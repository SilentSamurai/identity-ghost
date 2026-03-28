import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {MessageService} from 'primeng/api';
import {TenantService} from '../../../_services/tenant.service';

@Component({
    selector: 'app-create-tenant',
    template: `
        <app-standard-dialog title="Add Role">
            <app-dialog-tab>
                <form
                    #addRoleForm="ngForm"
                    (ngSubmit)="addRoleForm.form.valid && onSubmit()"
                    name="addRoleForm"
                    novalidate
                >
                    <div class="mb-3">
                        <label class="form-label" for="add.role.name"
                        >Role Name</label
                        >
                        <input
                            #name="ngModel"
                            [(ngModel)]="form.name"
                            class="form-control"
                            id="add.role.name"
                            name="name"
                            required
                            type="text"
                        />

                        <div
                            *ngIf="name.errors && addRoleForm.submitted"
                            class="alert alert-danger"
                            role="alert"
                        >
                            Role Name is required!
                        </div>
                    </div>
                </form>
            </app-dialog-tab>
            <app-dialog-footer>
                <button
                    class="btn btn-primary"
                    type="submit"
                    (click)="addRoleForm.onSubmit(krishna)"
                    id="ADD_TENANT_ROLE_BTN"
                >
                    Create
                </button>
            </app-dialog-footer>
        </app-standard-dialog>
    `,
    styles: [''],
})
export class AddRoleComponent implements OnInit {
    @Input() readonly tenant: any;
    @Output() passEntry: EventEmitter<any> = new EventEmitter();

    form = {
        name: '',
    };
    krishna: any;

    constructor(
        private tenantService: TenantService,
        private messageService: MessageService,
        public activeModal: NgbActiveModal,
    ) {
    }

    ngOnInit(): void {
    }

    async onSubmit() {
        try {
            const addedRoles = await this.tenantService.createRole(
                this.form.name,
            );
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Role Added',
            });
            this.passEntry.emit(addedRoles);
            this.activeModal.close(addedRoles);
        } catch (e) {
            console.error(e);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Failed to add role',
            });
        }
    }
}
