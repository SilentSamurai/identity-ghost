import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {DataSource} from '../../component/model/DataSource';
import {RestApiModel} from '../../component/model/RestApiModel';
import {HttpClient} from '@angular/common/http';
import {query} from '../../component/model/Query';

@Component({
    selector: 'app-CL02A-sel',
    template: `
        <div class="container-fluid">
            <div class="row">
                <div class="h4 py-2">Display Client</div>
                <div class="col-4">
                    <form class="form-group g-3">
                        <label class="col-3 col-form-label" for="ClientId">
                            Client
                        </label>
                        <app-value-help-input
                            [dataSource]="clientsDM"
                            [(selection)]="selectedClient"
                            class="col-3"
                            labelField="name"
                            multi="false"
                            name="ClientId"
                        >
                            <app-fb-col name="name" label="Name"></app-fb-col>
                            <app-fb-col name="clientId" label="Client ID"></app-fb-col>

                            <app-vh-col name="name" label="Name"></app-vh-col>
                            <app-vh-col name="clientId" label="Client ID"></app-vh-col>

                            <ng-template #vh_body let-row>
                                <td>{{ row.name }}</td>
                                <td>{{ row.clientId }}</td>
                            </ng-template>
                        </app-value-help-input>

                        <div class="d-grid gap-2 py-3 d-flex justify-content-end">
                            <button
                                (click)="continue()"
                                class="btn btn-primary btn-block btn-sm"
                            >
                                Continue
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `,
    styles: [''],
})
export class CL02ASelectionComponent implements OnInit {
    selectedClient: any[] = [];
    clientsDM: DataSource<any>;

    constructor(
        private router: Router,
        private authDefaultService: AuthDefaultService,
        private http: HttpClient,
    ) {
        this.clientsDM = new RestApiModel(
            this.http,
            '/api/search/Clients',
            ['id'],
            query({expand: ['tenant']}),
        );
    }

    async ngOnInit() {
        this.authDefaultService.setTitle('CL02: Select Client');
    }

    async continue() {
        if (this.selectedClient.length > 0) {
            await this.router.navigate(['/admin/CL02', this.selectedClient[0].clientId]);
        }
    }
}
