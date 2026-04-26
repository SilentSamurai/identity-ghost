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
                        *ngIf="internalFilter.conditions.length <= 1"
                        class="form-control form-control-sm"
                        id="FILTER_FIELD_{{ internalFilter.name }}"
                        [(ngModel)]="internalFilter.conditions[0].value"
                        type="text"
                    />
                    <div
                        *ngIf="internalFilter.conditions.length > 1"
                        class="form-control form-control-sm d-flex align-items-center gap-1"
                        style="cursor: pointer; height: calc(1.5em + 0.5rem + 2px); padding: 0.15rem 0.35rem; overflow-x: auto; overflow-y: hidden; flex-wrap: nowrap;"
                        (click)="openValueHelp()"
                    >
                        <p-chip
                            *ngFor="let c of internalFilter.conditions; index as i"
                            [removable]="true"
                            (onRemove)="removeCondition(i)"
                            label="{{ c.operator.symbol }} {{ c.value }}"
                            styleClass="filter-chip"
                        ></p-chip>
                    </div>
                    <button
                        (click)="openValueHelp()"
                        class="input-group-text btn btn-outline-secondary"
                        type="button"
                        aria-label="Open value help"
                    >
                        <i class="fa fa-clone"></i>
                    </button>
                </div>
            </div>
        </div>
    `,
    styles: [
        `
            :host ::ng-deep .filter-chip {
                font-size: 0.75rem;
                background-color: var(--bs-primary);
                color: #fff;
                padding: 0.1rem 0.4rem;
                border-radius: 4px;
            }

            :host ::ng-deep .filter-chip .p-chip-text {
                line-height: 1.2;
            }

            :host ::ng-deep .filter-chip .p-chip-remove-icon {
                color: #fff;
                font-size: 0.65rem;
            }

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

    removeCondition(index: number) {
        if (this.internalFilter.conditions.length > 1) {
            this.internalFilter.conditions.splice(index, 1);
        }
    }

    getFilters(): Filter[] {
        return this.internalFilter.conditions
            .filter(condition => condition.value.trim() !== '')
            .map(
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
