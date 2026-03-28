import {Component, Input, OnInit} from '@angular/core';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {MessageService} from 'primeng/api';
import {PolicyService} from '../../_services/policy.service';

@Component({
    selector: 'app-create-policy-modal',
    template: `
        <app-standard-dialog
            [title]="
                viewOnly
                    ? 'View Policy'
                    : policyId
                      ? 'Update Policy'
                      : 'Create Policy'
            "
            [subtitle]="
                viewOnly
                    ? 'View details of this policy'
                    : policyId
                      ? 'Edit the details of this policy'
                      : 'Configure a new policy'
            "
        >
            <app-dialog-tab name="Policy Details">
                <!-- Reactive Form -->
                <form [formGroup]="policyForm" novalidate>
                    <div class="mb-3">
                        <label class="form-label">Effect</label>
                        <select class="form-select" formControlName="effect">
                            <option value="ALLOW">ALLOW</option>
                            <option value="DENY">DENY</option>
                        </select>
                    </div>

                    <div class="mb-3">
                        <label class="form-label">Action</label>
                        <select class="form-select" formControlName="action">
                            <!-- Show default actions plus an 'OTHER' option -->
                            <option *ngFor="let act of possibleActions" [value]="act">
                                {{ act.toUpperCase() }}
                            </option>
                            <option value="OTHER">OTHER (Type Your Own)</option>
                        </select>
                        <div
                            *ngIf="actionCtrl?.touched && actionCtrl?.invalid"
                            class="text-danger"
                            role="alert"
                        >
                            Action is required
                        </div>
                    </div>

                    <!-- Conditionally show a text field for custom action -->
                    <div class="mb-3" *ngIf="actionCtrl?.value === 'OTHER'">
                        <label class="form-label">Custom Action</label>
                        <input
                            type="text"
                            class="form-control"
                            formControlName="customAction"
                            placeholder="Enter a custom action (e.g., 'approve')"
                        />
                        <div
                            *ngIf="
                                policyForm.get('customAction')?.touched &&
                                policyForm.get('customAction')?.invalid
                            "
                            class="text-danger"
                            role="alert"
                        >
                            Custom action is required when selecting "OTHER"
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="form-label">Subject</label>
                        <input
                            type="text"
                            class="form-control"
                            formControlName="subject"
                            placeholder="e.g., 'orders'..."
                        />
                        <div
                            *ngIf="
                                (subjectCtrl?.touched || subjectCtrl?.dirty) &&
                                subjectCtrl?.invalid
                            "
                            class="text-danger"
                            role="alert"
                        >
                            Subject is required
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="form-label">Conditions (JSON)</label>
                        <textarea
                            class="form-control"
                            rows="3"
                            formControlName="conditions"
                        ></textarea>
                    </div>
                </form>
            </app-dialog-tab>

            <app-dialog-footer>
                <button
                    class="btn btn-secondary"
                    type="button"
                    (click)="onCancel()"
                >
                    {{ viewOnly ? 'Close' : 'Cancel' }}
                </button>
                <!-- The type is 'submit' to trigger onSave via (ngSubmit) -->
                <button
                    *ngIf="!viewOnly"
                    class="btn btn-primary"
                    [disabled]="policyForm.invalid"
                    (click)="onSave()"
                    form="createPolicyForm"
                >
                    {{ policyId ? 'Update' : 'Create' }}
                </button>
            </app-dialog-footer>
        </app-standard-dialog>
    `,
})
export class CreatePolicyModalComponent implements OnInit {
    @Input() role_id: string = '';
    @Input() policyId?: string;
    @Input() viewOnly: boolean = false;

    operation: string = 'CREATE';

    public possibleActions: string[] = ['read', 'create', 'update', 'delete'];

    policyForm: FormGroup = this.fb.group({
        effect: ['ALLOW', Validators.required],
        action: ['', Validators.required],
        customAction: [''],
        subject: ['', Validators.required],
        conditions: ['{}'],
    });

    constructor(
        private fb: FormBuilder,
        private policyService: PolicyService,
        private messageService: MessageService,
        public activeModal: NgbActiveModal,
    ) {
    }

    get actionCtrl() {
        return this.policyForm.get('action');
    }

    get subjectCtrl() {
        return this.policyForm.get('subject');
    }

    get effectCtrl() {
        return this.policyForm.get('effect');
    }

    get conditionsCtrl() {
        return this.policyForm.get('conditions');
    }

    ngOnInit(): void {
        if (this.policyId) {
            this.operation = 'UPDATE';
            this.loadPolicy(this.policyId);
        }

        this.policyForm.get('action')?.valueChanges.subscribe((value) => {
            const customActionControl = this.policyForm.get('customAction');
            if (value === 'OTHER') {
                customActionControl?.setValidators([Validators.required]);
            } else {
                customActionControl?.clearValidators();
            }
            customActionControl?.updateValueAndValidity();
        });

        // If viewOnly mode, disable the entire form
        if (this.viewOnly) {
            this.operation = 'VIEW';
            this.policyForm.disable();
        }
    }

    async loadPolicy(pid: string) {
        try {
            const existingPolicy =
                await this.policyService.getAuthorization(pid);
            this.policyForm.patchValue({
                effect: existingPolicy.effect || 'ALLOW',
                action: this.possibleActions.includes(
                    existingPolicy.action || '',
                )
                    ? existingPolicy.action
                    : 'OTHER',
                customAction: this.possibleActions.includes(
                    existingPolicy.action || '',
                )
                    ? ''
                    : existingPolicy.action,
                subject: existingPolicy.subject,
                conditions: JSON.stringify(existingPolicy.conditions || {}),
            });
        } catch (err) {
            this.messageService.add({
                severity: 'error',
                summary: 'Failed loading policy',
                detail: 'Could not load existing policy data',
            });
        }
    }

    onCancel(): void {
        this.activeModal.dismiss('cancel');
    }

    async onSave(): Promise<void> {
        (this.policyForm as any).submitted = true;
        if (this.policyForm.invalid) {
            return;
        }

        try {
            const formValues = this.policyForm.value;
            const chosenAction =
                formValues.action === 'OTHER' && formValues.customAction
                    ? formValues.customAction
                    : formValues.action;
            const conditionsObj = JSON.parse(formValues.conditions || '{}');

            if (this.operation === 'UPDATE') {
                const updatedPolicy =
                    await this.policyService.updateAuthorization(
                        this.policyId!,
                        {
                            effect: formValues.effect,
                            action: chosenAction,
                            subject: formValues.subject,
                            conditions: conditionsObj,
                        },
                    );
                this.messageService.add({
                    severity: 'success',
                    summary: 'Policy updated',
                    detail: `Policy ID: ${updatedPolicy.id}`,
                });
                this.activeModal.close(updatedPolicy);
            } else if (this.operation === 'CREATE') {
                const createdPolicy =
                    await this.policyService.createAuthorization(
                        this.role_id,
                        formValues.effect,
                        chosenAction,
                        formValues.subject,
                        conditionsObj,
                    );

                this.messageService.add({
                    severity: 'success',
                    summary: 'Policy created',
                    detail: `Policy ID: ${createdPolicy.id}`,
                });
                this.activeModal.close(createdPolicy);
            }
        } catch (err: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Failed to create policy',
                detail: err.message,
            });
            console.error('Error creating policy:', err);
        }
    }
}
