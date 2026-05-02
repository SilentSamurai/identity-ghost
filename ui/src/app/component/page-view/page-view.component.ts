import {AfterViewInit, Component, Input, OnInit} from '@angular/core';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {ConfirmationService, MessageService} from 'primeng/api';
import {ActivatedRoute} from '@angular/router';
import {firstValueFrom} from 'rxjs';

@Component({
    selector: 'app-page-view',
    template: `
        <div class="container-fluid mb-5 px-0" *ngIf="!loading">
            <div class="card shadow-sm" style="border-radius: 0">
                <div class="{{ containerClass }} mt-4 mb-4 px-4">
                    <div class="row">
                        <div class="col">
                            <ng-content
                                select="app-page-view-header"
                            ></ng-content>
                        </div>
                    </div>
                </div>
            </div>

            <div class="{{ containerClass }} ">
                <div class="row my-2">
                    <div class="col-md-12 ">
                        <ng-content select="app-page-view-body"></ng-content>
                    </div>
                </div>
            </div>
        </div>

        <div class="text-center" *ngIf="loading">
            <div class="spinner-border" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
        </div>
    `,
    styles: [
        `
            .nav-tab-btn:focus {
                border-bottom: 0.25rem solid blue;
            }
        `,
    ],
    providers: [],
})
export class PageViewComponent implements OnInit, AfterViewInit {
    loading = true;
    @Input() fluid: boolean = true;

    @Input() name!: string;

    containerClass: string = 'container-fluid';

    constructor(
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private actRoute: ActivatedRoute,
        private modalService: NgbModal,
    ) {
    }

    async ngOnInit() {
        this.loading = true;
        if (!this.fluid) {
            this.containerClass = 'container';
        }
        this.loading = false;
    }

    async ngAfterViewInit(): Promise<void> {
        const fragment = await firstValueFrom(this.actRoute.fragment);
        if (fragment) {
            setTimeout(() => this.doScroll(fragment.toUpperCase()), 500);
        }
    }

    doScroll(elementId: string) {
        try {
            console.log('scrolling to', elementId);
            let elements = document.getElementById(elementId);
            elements?.scrollIntoView();
        } finally {
        }
    }
}
