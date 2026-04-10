import {Component, Input, OnInit} from '@angular/core';
import {Operators} from '../model/Operator';
import {Filter} from '../model/Filters';

export interface FilterSelectOption {
    label: string;
    value: string;
}

@Component({
    selector: 'app-filter-select-field',
    template: `
        <div class="" style="width: 300px">
            <div class="text-truncate text-muted">
                <strong>{{ label }}:</strong>
            </div>
            <div class="">
                <div class="input-group-sm input-group">
                    <select
                        class="form-select form-select-sm"
                        id="FILTER_FIELD_{{ name }}"
                        [(ngModel)]="selectedValue"
                    >
                        <option *ngFor="let opt of options" [value]="opt.value">{{ opt.label }}</option>
                    </select>
                </div>
            </div>
        </div>
    `,
    styles: [
        `
            .form-select {
                background-color: var(--bs-body-bg);
                color: var(--bs-body-color);
                border-color: var(--bs-border-color);
                transition: background-color 0.3s ease,
                    color 0.3s ease,
                    border-color 0.3s ease;
            }

            .form-select:focus {
                background-color: var(--bs-body-bg);
                color: var(--bs-body-color);
                border-color: var(--bs-primary);
                box-shadow: 0 0 0 0.25rem rgba(var(--bs-primary-rgb), 0.25);
            }

            .text-muted {
                color: var(--bs-secondary-color) !important;
            }

            [data-bs-theme='dark'] .form-select {
                background-color: var(--bs-dark);
                color: var(--bs-body-color);
                border-color: var(--bs-border-color);
            }
        `,
    ],
})
export class FilterSelectFieldComponent implements OnInit {
    @Input() label!: string;
    @Input() name!: string;
    @Input() options: FilterSelectOption[] = [];

    selectedValue = '';

    ngOnInit(): void {
        if (this.options.length > 0) {
            this.selectedValue = this.options[0].value;
        }
    }

    getFilters(): Filter[] {
        return [
            new Filter(
                this.name,
                this.label,
                this.selectedValue,
                Operators.EQ,
            ),
        ];
    }
}
