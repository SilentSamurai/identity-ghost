import {Component, Input} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {RoleService} from '../../_services/role.service';
import {MessageService} from 'primeng/api';

/**
 * Updated version of UpdateRoleModalComponent that uses StandardDialogComponent
 * for consistent layout and styling.
 */
@Component({
    selector: 'app-update-role-modal',
    template: `
        <app-standard-dialog
            [title]="'Update Role'"
            [subtitle]="role?.tenant ? 'Tenant : ' + role.tenant.name : ''"
        >
            <app-dialog-tab name="Main">
                <div class="mb-3">
                    <label for="roleName" class="form-label">Name</label>
                    <input
                        type="text"
                        class="form-control"
                        id="roleName"
                        [(ngModel)]="role.name"
                        name="roleName"
                    />
                </div>
                <div class="mb-3">
                    <label for="roleDescription" class="form-label"
                        >Description</label
                    >
                    <textarea
                        id="roleDescription"
                        class="form-control"
                        rows="3"
                        [(ngModel)]="role.description"
                        name="roleDescription"
                    ></textarea>
                </div>
            </app-dialog-tab>

            <app-dialog-footer>
                <button
                    type="button"
                    class="btn btn-light me-2"
                    (click)="onDismiss()"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    class="btn btn-primary"
                    (click)="onSave()"
                >
                    Save
                </button>
            </app-dialog-footer>
        </app-standard-dialog>
    `,
})
export class UpdateRoleModalComponent {
    @Input() role: any; // minimal shape: { id, name, description, tenantId }
    @Input() tenantId!: string;

    constructor(
        public activeModal: NgbActiveModal,
        private roleService: RoleService,
        private messageService: MessageService,
    ) {
    }

    async onSave() {
        try {
            // Adjust your service call based on your actual backend endpoint.
            await this.roleService.updateRole(
                this.role.id,
                this.role.name,
                this.role.description,
            );
            this.messageService.add({
                severity: 'success',
                summary: 'Role Updated',
                detail: 'Role name/description updated successfully',
            });
            // Return updated role object to the caller
            this.activeModal.close(this.role);
        } catch (e: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Failed',
                detail: 'Could not update role',
            });
        }
    }

    onDismiss() {
        this.activeModal.dismiss('cancel');
    }
}
