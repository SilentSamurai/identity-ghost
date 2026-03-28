import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {MessageService} from 'primeng/api';
import {AdminTenantService} from '../../../_services/admin-tenant.service';

@Component({
    selector: 'app-update-tenant-admin',
    template: `
        <app-standard-dialog title="Update Tenant" subtitle="{{ subtitle }}">
            <app-dialog-tab>
                <form
                    #updateTenantForm="ngForm"
                    (ngSubmit)="updateTenantForm.form.valid && onSubmit()"
                    name="updateTenantForm"
                    novalidate
                >
                    <div class="mb-3 form-group">
                        <label class="form-label" for="update.tenant.name">Name</label>
                        <input
                            #name="ngModel"
                            [(ngModel)]="form.name"
                            class="form-control"
                            id="update.tenant.name"
                            name="name"
                            required
                            type="text"
                        />
                        <div
                            *ngIf="name.errors && updateTenantForm.submitted"
                            class="text-danger"
                            role="alert"
                        >
                            Name is required!
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label" for="update.tenant.domain">Domain</label>
                        <input
                            #domain="ngModel"
                            [(ngModel)]="form.domain"
                            class="form-control"
                            id="update.tenant.domain"
                            name="domain"
                            readonly
                            type="text"
                        />
                    </div>
                    <div class="mb-3 form-check">
                        <input
                            type="checkbox"
                            class="form-check-input"
                            id="update.tenant.allowSignUp"
                            name="allowSignUp"
                            [(ngModel)]="form.allowSignUp"
                        />
                        <label class="form-check-label" for="update.tenant.allowSignUp">
                            Allow Sign Up
                        </label>
                    </div>
                </form>
            </app-dialog-tab>
            <app-dialog-footer>
                <button
                    id="UPDATE_TENANT_SAVE_BTN"
                    class="btn btn-primary"
                    type="submit"
                    (click)="updateTenantForm.onSubmit(submitRef)"
                >
                    Update
                </button>
            </app-dialog-footer>
        </app-standard-dialog>
    `,
    styles: [''],
})
export class UpdateTenantAdminComponent implements OnInit {
    @Input() tenant: any;
    @Input() tenantId: string = '';
    @Output() passEntry: EventEmitter<any> = new EventEmitter();

    subtitle = '';
    form = {
        name: '',
        domain: '',
        allowSignUp: false,
    };
    submitRef: any;

    constructor(
        private adminTenantService: AdminTenantService,
        private messageService: MessageService,
        public activeModal: NgbActiveModal,
    ) {
    }

    ngOnInit(): void {
        this.form = {
            name: this.tenant.name,
            domain: this.tenant.domain,
            allowSignUp: this.tenant.allowSignUp,
        };
        this.subtitle = 'Update: ' + this.tenant.name;
    }

    async onSubmit() {
        try {
            const body: any = {};
            if (this.tenant.name !== this.form.name) {
                body.name = this.form.name;
            }
            if (this.tenant.allowSignUp !== this.form.allowSignUp) {
                body.allowSignUp = this.form.allowSignUp;
            }
            if (Object.keys(body).length === 0) {
                this.messageService.add({
                    severity: 'info',
                    summary: 'Info',
                    detail: 'No changes were made to the tenant',
                });
                this.activeModal.close(this.tenant);
                return;
            }
            const updated = await this.adminTenantService.updateTenant(this.tenantId, body);
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Tenant Updated',
            });
            this.passEntry.emit(updated);
            this.activeModal.close(updated);
        } catch (e: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Tenant Update Failed: ' + e.message,
            });
        }
    }
}
