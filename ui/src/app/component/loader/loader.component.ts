import {booleanAttribute, Component, Input} from '@angular/core';

@Component({
    selector: 'app-loader',
    template: `
        <div *ngIf="loading" class="align-middle text-center" style="padding-top:25%">
            <div class="spinner-border m-5" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
        </div>
        <div *ngIf="!loading">
            <ng-content></ng-content>
        </div>
    `,
    styles: [`

    `]
})
export class LoaderComponent {
    @Input({transform: booleanAttribute}) loading: boolean = false;
}
