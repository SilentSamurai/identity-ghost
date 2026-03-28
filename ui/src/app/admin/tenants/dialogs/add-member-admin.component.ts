import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {MessageService} from 'primeng/api';
import {AdminTenantService} from '../../../_services/admin-tenant.service';

@Component({
    selector: 'app-add-member-admin',
    template: `
        <app-standard-dialog title="Add Member">
            <app-dialog-tab>
                <form
                    #addMemberForm="ngForm"
                    (ngSubmit)="addMemberForm.form.valid && onSubmit()"
                    name="addMemberForm"
                    novalidate
                >
                    <div class="mb-3 form-group">
                        <label class="form-label" for="add.member.name">Email</label>
                        <input
                            #email="ngModel"
                            [(ngModel)]="form.email"
                            class="form-control"
                            id="add.member.name"
                            name="email"
                            required
                            type="email"
                        />
                        <div
                            *ngIf="email.errors && addMemberForm.submitted"
                            class="alert alert-danger"
                            role="alert"
                        >
                            Email is required!
                        </div>
                    </div>
                </form>
            </app-dialog-tab>
            <app-dialog-footer>
                <button
                    class="btn btn-primary"
                    type="submit"
                    id="ADD_TENANT_MEMBER_BTN"
                    (click)="addMemberForm.onSubmit(submitRef)"
                >
                    Add Member
                </button>
            </app-dialog-footer>
        </app-standard-dialog>
    `,
    styles: [''],
})
export class AddMemberAdminComponent implements OnInit {
    @Input() readonly tenant: any;
    @Output() passEntry: EventEmitter<any> = new EventEmitter();

    form = {
        email: '',
    };
    submitRef: any;

    constructor(
        private adminTenantService: AdminTenantService,
        private messageService: MessageService,
        public activeModal: NgbActiveModal,
    ) {
    }

    ngOnInit(): void {
    }

    async onSubmit() {
        try {
            const result = await this.adminTenantService.addMember(
                this.tenant.id,
                [this.form.email],
            );
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Member Added',
            });
            this.passEntry.emit(result);
            this.activeModal.close(result);
        } catch (e) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Failed to add member',
            });
        }
    }
}
