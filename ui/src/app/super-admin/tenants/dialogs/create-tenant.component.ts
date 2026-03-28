import {Component, EventEmitter, OnInit, Output,} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {lastValueFrom} from 'rxjs';
import {TenantService} from '../../../_services/tenant.service';
import {MessageService} from 'primeng/api';

@Component({
    selector: 'app-create-tenant',
    template: `
        <app-standard-dialog
            title="Create Tenant"
            subtitle="Create a new tenant"
        >
            <app-dialog-tab name="Basic">
                <form
                    #createTenantForm="ngForm"
                    (ngSubmit)="createTenantForm.form.valid && onSubmit()"
                    name="createTenantForm"
                    novalidate
                >
                    <div class="mb-3 form-group">
                        <label
                            class="form-label control-label-required"
                            for="create.tenant.name"
                        >Name:
                        </label>
                        <input
                            #name="ngModel"
                            [(ngModel)]="form.name"
                            class="form-control"
                            id="create.tenant.name"
                            name="name"
                            required
                            type="text"
                        />
                        <div
                            *ngIf="name.errors && createTenantForm.submitted"
                            class="text-danger"
                            role="alert"
                        >
                            Name is required!
                        </div>
                    </div>
                    <div class="mb-3 form-group">
                        <label
                            class="form-label control-label-required"
                            for="create.tenant.domain"
                        >Domain:
                        </label>
                        <input
                            #domain="ngModel"
                            [(ngModel)]="form.domain"
                            aria-describedby="emailHelp"
                            class="form-control"
                            id="create.tenant.domain"
                            name="domain"
                            required
                            type="text"
                        />
                        <div
                            *ngIf="domain.errors && createTenantForm.submitted"
                            class="text-danger"
                            role="alert"
                        >
                            Domain is required!
                        </div>
                    </div>
                </form>
            </app-dialog-tab>
            <app-dialog-footer>
                <button
                    class="btn btn-primary"
                    (click)="createTenantForm.onSubmit(krishna)"
                    type="submit"
                    id="CREATE_TENANT_SUBMIT_BTN"
                >
                    Create
                </button>
            </app-dialog-footer>
        </app-standard-dialog>
    `,
    styles: [''],
})
export class CreateTenantComponent implements OnInit {
    @Output() passEntry: EventEmitter<any> = new EventEmitter();

    form = {
        name: '',
        domain: '',
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
            const createdTenant = await lastValueFrom(
                this.tenantService.createTenant(
                    this.form.name,
                    this.form.domain,
                ),
            );
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Tenant Created',
            });
            this.passEntry.emit(createdTenant);
            this.activeModal.close(createdTenant);
        } catch (e) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Tenant Creation Failed',
            });
        }
    }
}
