import {Component, OnInit, QueryList, TemplateRef,} from '@angular/core';

import {NgbActiveModal, NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {ActivatedRoute} from '@angular/router';
import {AfterModalInit} from '../dialogs/modal.service';
import {ValueHelpColumnComponent} from '../value-help-input/value-help-column.component';
import {FilterBarColumnComponent} from '../filter-bar/filter-bar.component';
import {DataSource} from '../model/DataSource';

export enum CloseType {
    Cancel,
    Clear,
    Confirm,
}

export class ValueHelpResult {
    selection: any[];
    closeType: CloseType;

    constructor(selection: any[], closeType: CloseType) {
        this.selection = selection;
        this.closeType = closeType;
    }

    public static result(selection: any[], closeType: CloseType) {
        return new ValueHelpResult(selection, closeType);
    }
}

@Component({
    selector: 'app-value-help',
    template: `
        <div class="modal-header py-2 bg-primary-subtle" style="display:block">
            <div class="row ">
                <div class="col d-flex justify-content-between">
                    <div class="h5 mb-0 modal-title">{{ name }}</div>
                    <button
                        (click)="cancel()"
                        aria-label="Close"
                        class="btn btn-sm "
                        type="button"
                    >
                        <span aria-hidden="true">
                            <i class="fa fa-icons fa-close"></i>
                        </span>
                    </button>
                </div>
            </div>
            <div class="row ">
                <div class="col">
                    <app-fb (onFilter)="vhtable.filter($event)" editable="false">
                        <app-fb-col
                            *ngFor="let filter of filters"
                            name="{{ filter.name }}"
                            label="{{ filter.label }}"
                        >
                        </app-fb-col>
                    </app-fb>
                </div>
            </div>
        </div>
        <div class="modal-body p-0 ">
            <app-table #vhtable
                       [dataSource]="dataSource"
                       [multi]="multi"
                       [(selection)]="selectedItem"
            >
                <app-table-col
                    *ngFor="let col of columns"
                    label="{{ col.label }}"
                    name="{{ col.name }}"
                    isId="{{ col.isId }}"
                >
                </app-table-col>
                <ng-template #table_body let-row>
                    <ng-container
                        *ngTemplateOutlet="body; context: {$implicit: row}"
                    ></ng-container>
                </ng-template>
            </app-table>
        </div>
        <div class="modal-footer p-0">
            <button
                (click)="clear()"
                class="btn btn-outline-secondary btn-block btn-sm"
            >
                Clear
            </button>
            <button
                (click)="confirm()"
                id="{{ name }}_VH_SELECT_BTN"
                class="btn btn-primary btn-block btn-sm"
            >
                Select
            </button>
        </div>
    `,
    styles: [``],
})
export class ValueHelpComponent implements OnInit, AfterModalInit {
    name: string = '';
    multi: boolean = true;
    dataSource!: DataSource<any>;

    body: TemplateRef<any> | null = null;

    selectedItem: any[] = [];
    previousSelectedRows: any[] = [];

    columns!: QueryList<ValueHelpColumnComponent>;
    filters!: QueryList<FilterBarColumnComponent>;

    constructor(
        private route: ActivatedRoute,
        private activeModal: NgbActiveModal,
        private modalService: NgbModal,
    ) {
    }

    async ngOnInit(): Promise<void> {
        console.log('multi', this.multi);
    }

    onModalInit(): void {
        this.previousSelectedRows = Array.from(this.selectedItem);
    }

    cancel() {
        this.activeModal.close(
            ValueHelpResult.result(this.previousSelectedRows, CloseType.Cancel),
        );
    }

    confirm() {
        this.activeModal.close(
            ValueHelpResult.result(this.selectedItem, CloseType.Confirm),
        );
    }

    clear() {
        this.activeModal.close(ValueHelpResult.result([], CloseType.Clear));
    }

}
