import {Component, ContentChildren, forwardRef, Injector, Input, QueryList} from '@angular/core';
import {
    ControlValueAccessor,
    FormControl,
    FormControlDirective,
    FormControlName,
    FormGroupDirective,
    NG_VALUE_ACCESSOR,
    NgControl,
    UntypedFormControl,
    Validators
} from '@angular/forms';
import {InputErrorComponent} from './input-error.component';
import {randomId} from '../util/utils';

@Component({
    selector: 'app-password-input',
    template: `
        <div class="form-group row mb-2">
            <label
                *ngIf="showLabel"
                class="col-auto col-md-4 col-form-label form-label fw-semibold text-end  {{ disabled ? 'p-disabled' : '' }}"
                [for]="test_id + '_' + formControlName + '_INPUT'"
            >
                {{ label }}:<span *ngIf="required" class="text-danger">*</span>
            </label>
            <div class="col-auto {{ showLabel ? 'col-md-8' : 'col-md-12' }}" style="position: relative;">
                <div class="input-group mb-3">
                    <input
                        [value]="value"
                        (input)="onInput($event)"
                        (blur)="onTouched()"
                        [disabled]="disabled"
                        class="form-control"
                        [id]="test_id + '_' + formControlName + '_INPUT'"
                        [name]="formControlName"
                        [type]="showPassword ? 'text' : 'password'"
                        [attr.readonly]="readonly ? true : null "
                    />
                    <button type="button" (click)="togglePassword()" class="btn btn-outline-secondary " aria-label="Toggle password visibility">
                        <i class="fa" [ngClass]="showPassword ? 'fa-eye-slash' : 'fa-eye'"></i>
                    </button>
                </div>
            </div>

            <div
                *ngIf="control.invalid && (control.dirty || control.touched)"
                class="text-danger text-end"
                role="alert"
            >
                <div *ngIf="control.hasError('required')">
                    {{ label }} is required.
                </div>
                <div *ngIf="control.hasError('email')">
                    Invalid email address.
                </div>
                <div *ngIf="control.hasError('min')">Invalid Value</div>
                <ng-container *ngFor="let eh of inputErrors">
                    <div *ngIf="control.hasError(eh.field)">
                        <ng-container [ngTemplateOutlet]="eh.template"></ng-container>
                    </div>
                </ng-container>
                <ng-content></ng-content>
            </div>
        </div>
    `,
    styles: [],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => PasswordInputComponent),
            multi: true,
        },
    ],
})
export class PasswordInputComponent implements ControlValueAccessor {
    @Input() test_id: string = randomId();
    @Input() formControlName: string = '';
    @Input() label: string = '';
    @Input() readonly: boolean = false;

    value = '';
    disabled = false;
    showPassword = false;
    formControl!: UntypedFormControl;
    @ContentChildren(InputErrorComponent)
    inputErrors!: QueryList<InputErrorComponent>;

    constructor(private injector: Injector) {
    }

    get showLabel() {
        return this.label != '';
    }

    get required() {
        return this.control.hasValidator && this.control.hasValidator(Validators.required);
    }

    get control() {
        return this.formControl!;
    }

    onTouched = () => {
    };
    onChange = (value: any) => {
    };

    ngOnInit(): void {
        this.setFormControl();
    }

    setFormControl() {
        try {
            const formControl = this.injector.get(NgControl);
            switch (formControl.constructor) {
                case FormControlName:
                    this.formControl = this.injector
                        .get(FormGroupDirective)
                        .getControl(formControl as FormControlName);
                    break;
                default:
                    this.formControl = (formControl as FormControlDirective)
                        .form as FormControl;
                    break;
            }
        } catch (err) {
            this.formControl = new FormControl();
        }
    }

    onInput($event: Event) {
        const input = $event.target as HTMLInputElement;
        this.value = input.value;
        this.onChange(this.value); // trigger validation
    }

    writeToDisplay(value: any) {
        if (value != null) {
            this.value = value;
            this.control?.markAsTouched();
        } else {
            this.control?.markAsUntouched();
        }
    }

    writeValue(value: any): void {
        this.writeToDisplay(value);
    }

    registerOnChange(fn: any): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: any): void {
        this.onTouched = fn;
    }

    setDisabledState?(isDisabled: boolean): void {
        this.disabled = isDisabled;
    }

    togglePassword() {
        this.showPassword = !this.showPassword;
    }
}
