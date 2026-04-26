import {Component, Input, OnInit} from '@angular/core';
import {Operator, Operators} from '../model/Operator';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {FilterValueHelpComponent} from './filter-value-help.component';
import {Filter} from '../model/Filters';

export class Condition {
    operator: Operator;
    value: string;

    constructor(operator: Operator, value: string) {
        this.operator = operator;
        this.value = value;
    }
}

export class InternalFilter {
    name!: string;
    label!: string;
    conditions: Condition[] = [new Condition(Operators.MATCHES, '')];

    constructor(name: string, label: string) {
        this.name = name;
        this.label = label;
    }
}

@Component({
    selector: 'app-filter-field',
    template: `
        <div class="" style="width: 300px">
            <div class="text-truncate text-muted">
                <strong>{{ internalFilter.label }}:</strong>
            </div>
            <div class="">
                <div class="input-group-sm input-group">
                    <input
                        class="form-control form-control-sm"
                        id="FILTER_FIELD_{{ internalFilter.name }}"
                        [(ngModel)]="internalFilter.conditions[0].value"
                        type="text"
                    />
                    <button
                        (click)="openValueHelp()"
                        class="input-group-text btn btn-outline-secondary"
                        type="button"
                        aria-label="Open value help"
                    >
                        <i class="fa fas fa-clone"></i>
                    </button>
                </div>
            </div>
        </div>
    `,
    styles: [
        `
            .form-control {
                background-color: var(--bs-body-bg);
                color: var(--bs-body-color);
                border-color: var(--bs-border-color);
                transition: background-color 0.3s ease,
                color 0.3s ease,
                border-color 0.3s ease;
            }

            .form-control:focus {
                background-color: var(--bs-body-bg);
                color: var(--bs-body-color);
                border-color: var(--bs-primary);
                box-shadow: 0 0 0 0.25rem rgba(var(--bs-primary-rgb), 0.25);
            }

            .btn-outline-secondary {
                color: var(--bs-secondary-color);
                border-color: var(--bs-border-color);
                background-color: var(--bs-body-bg);
                transition: color 0.3s ease,
                border-color 0.3s ease,
                background-color 0.3s ease;
            }

            .btn-outline-secondary:hover {
                color: var(--bs-body-color);
                background-color: var(--bs-secondary-bg);
                border-color: var(--bs-secondary-border);
            }

            .text-muted {
                color: var(--bs-secondary-color) !important;
            }

            [data-bs-theme='dark'] .form-control {
                background-color: var(--bs-dark);
                color: var(--bs-body-color);
                border-color: var(--bs-border-color);
            }

            [data-bs-theme='dark'] .btn-outline-secondary {
                color: var(--bs-secondary-color);
                border-color: var(--bs-border-color);
                background-color: var(--bs-dark);
            }
        `,
    ],
})
export class FilterFieldComponent implements OnInit {
    readonly Operators = Operators;

    @Input() label!: string;
    @Input() name!: string;

    internalFilter!: InternalFilter;

    constructor(private modalService: NgbModal) {
    }

    async ngOnInit(): Promise<void> {
        this.internalFilter = new InternalFilter(this.name, this.label);
    }

    async openValueHelp() {
        const modalRef = this.modalService.open(FilterValueHelpComponent, {
            size: 'lg',
            backdrop: true,
        });
        let modalInstance =
            modalRef.componentInstance as FilterValueHelpComponent;
        modalInstance.internalFilter = this.internalFilter;
        let result = await modalRef.result;
        console.log(result);
    }

    getFilters(): Filter[] {
        return this.internalFilter.conditions.map(
            (condition) =>
                new Filter(
                    this.internalFilter.name,
                    this.internalFilter.label,
                    condition.value,
                    condition.operator,
                ),
        );
    }
}
