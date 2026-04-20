import {Component, ContentChildren, Inject, Injector, Input, OnInit, QueryList,} from '@angular/core';
import {
    ControlValueAccessor,
    FormControl,
    FormControlDirective,
    FormControlName,
    FormGroupDirective,
    NG_VALUE_ACCESSOR,
    NgControl,
    UntypedFormControl,
    Validators,
} from '@angular/forms';
import {Subject} from 'rxjs';
import {InputErrorComponent} from "./input-error.component";
import {randomId} from "../util/utils";

@Component({
    selector: 'app-text-input',
    template: `
        <div class="form-group row mb-2">
            <label
                *ngIf="showLabel"
                class="col-auto col-md-4 col-form-label form-label fw-semibold text-end  {{
                    disabled ? 'p-disabled' : ''
                }}"
                for="{{ test_id }}_{{ formControlName }}_INPUT"
            >
                {{ label }}:<span *ngIf="required" class="text-danger">*</span>
            </label>
            <div class="col-auto {{ showLabel ? 'col-md-8' : 'col-md-12' }}">
                <input
                    [value]="value"
                    (input)="onInput($event)"
                    (blur)="onTouched()"
                    [disabled]="disabled"
                    class="form-control"
                    id="{{ test_id }}_{{ formControlName }}_INPUT"
                    name="{{ formControlName }}"
                    type="{{ type }}"
                    [attr.readonly]="readonly ? true : null "
                />
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
                        <ng-container
                            [ngTemplateOutlet]="eh.template"
                        ></ng-container>
                    </div>
                </ng-container>
            </div>
        </div>
    `,
    styles: [],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: TextInputComponent,
            multi: true,
        },
    ],
})
export class TextInputComponent implements OnInit, ControlValueAccessor {
    @Input() test_id: string = randomId();
    @Input({required: true}) formControlName: string = '';
    @Input() label: string = '';
    @Input() type: string = 'text';

    value = '';
    disabled = false;
    formControl!: UntypedFormControl;
    @ContentChildren(InputErrorComponent)
    inputErrors!: QueryList<InputErrorComponent>;
    @Input() readonly: boolean = false;
    private _destroy$ = new Subject<void>();

    constructor(@Inject(Injector) private injector: Injector) {
    }

    get showLabel() {
        return this.label != '';
    }

    get required() {
        return this.control.hasValidator(Validators.required);
    }

    get control() {
        return this.formControl!;
    }

    onTouched = () => {
    };

    onChange = (value: any) => {
    };

    async ngOnInit(): Promise<void> {
        // console.log("pool: ", this.disabled)
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
            console.error(err);
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
        // this.value = value;
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
}
