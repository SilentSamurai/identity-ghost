import {Component} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {AppService} from '../../../_services/app.service';
import {MessageService} from 'primeng/api';
import {SubscriptionService} from '../../../_services/subscription.service';
import {StaticSource} from '../../../component/model/StaticSource';
import {AfterModalInit} from "../../../component/dialogs/modal.service";

@Component({
    selector: 'app-create-subscription',
    template: `
        <app-standard-dialog title="Subscribe an App" subtitle="Select an app to subscribe">
            <app-dialog-tab name="Select App" *ngIf="!selectedApp">
                <div class="mb-3">
                    <app-table title="Available Apps" [dataSource]="availableAppsDataModel" multi="false">
                        <app-table-col label="Name" name="name"></app-table-col>
                        <app-table-col label="Description" name="description"></app-table-col>
                        <app-table-col label="Actions" name="actions"></app-table-col>

                        <ng-template let-app #table_body>
                            <td>{{ app.name }}</td>
                            <td>{{ app.description }}</td>
                            <td>
                                <button
                                    (click)="selectApp(app)"
                                    class="btn btn-primary btn-sm"
                                    type="button"
                                >
                                    Select
                                </button>
                            </td>
                        </ng-template>
                    </app-table>
                </div>
            </app-dialog-tab>

            <app-dialog-tab name="Configure Subscription" *ngIf="selectedApp">
                <div class="mb-3">
                    <app-attribute label="Selected App">
                        {{ selectedApp.name }}
                    </app-attribute>
                    <app-attribute label="description">
                        {{ selectedApp.description }}
                    </app-attribute>

                    <div class="mb-3">
                        <h6>Configuration</h6>
                        <textarea class="form-control" id="configuration" [(ngModel)]="config" name="description"
                                  rows="3"></textarea>
                    </div>
                </div>
            </app-dialog-tab>

            <app-dialog-footer>
                <button
                    *ngIf="selectedApp"
                    (click)="onSubscribe()"
                    class="btn btn-primary"
                    type="button"
                    id="SUBSCRIBE_BTN"
                >
                    Subscribe
                </button>
                <button
                    (click)="activeModal.close()"
                    class="btn btn-secondary"
                    type="button"
                >
                    Cancel
                </button>
            </app-dialog-footer>
        </app-standard-dialog>
    `,
    styles: ['']
})
export class CreateSubscriptionComponent implements AfterModalInit {
    tenant: any;
    availableApps: any[] = [];
    selectedApp: any = null;
    config: string = "";
    availableAppsDataModel: StaticSource<any>;

    constructor(
        private appService: AppService,
        private subscriptionService: SubscriptionService,
        private messageService: MessageService,
        public activeModal: NgbActiveModal
    ) {
        this.availableAppsDataModel = new StaticSource(['id']);
    }

    async onModalInit() {
        // Get all available apps
        const allApps: any[] = await this.appService.getAvailableApps();
        this.availableAppsDataModel.setData(allApps);
    }

    selectApp(app: any) {
        this.selectedApp = app;
    }

    async onSubscribe() {
        try {
            await this.subscriptionService.subscribeToApp(this.selectedApp.id);
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Successfully subscribed to app'
            });
        } catch (e) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Failed to subscribe to app'
            });
        } finally {
            this.activeModal.close(true);
        }
    }
}
