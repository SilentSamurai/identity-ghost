import {Component, OnInit} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {SessionService} from '../_services/session.service';

@Component({
    selector: 'app-profile',
    template: `
        <app-standard-dialog title="Profile" subtitle="{{ currentUser?.name }}">
            <app-dialog-tab>
                <div *ngIf="currentUser; else loggedOut">
                    <ul class="list-group">
                        <li class="list-group-item">
                            Email
                            <div><strong>{{ currentUser.email }}</strong></div>
                        </li>
                        <li class="list-group-item">
                            Name
                            <div><strong>{{ currentUser.name }}</strong></div>
                        </li>
                        <li class="list-group-item">
                            Tenant Id
                            <div><strong>{{ currentUser.tenant.id }}</strong></div>
                        </li>
                        <li class="list-group-item">
                            Tenant Name
                            <div><strong>{{ currentUser.tenant.name }}</strong></div>
                        </li>
                        <li class="list-group-item">
                            Tenant Domain
                            <div><strong>{{ currentUser.tenant.domain }}</strong></div>
                        </li>
                        <li class="list-group-item">
                            Roles
                            <div>
                                <ul>
                                    <li *ngFor="let role of currentUser.roles">
                                        <strong><code>{{ currentUser.tenant.name }}::{{ role }}</code></strong>
                                    </li>
                                </ul>
                            </div>
                        </li>
                    </ul>
                </div>
                <ng-template #loggedOut>
                    Please login.
                </ng-template>
            </app-dialog-tab>

            <app-dialog-footer>
                <button class="btn btn-primary" (click)="activeModal.close()">Close</button>
            </app-dialog-footer>
        </app-standard-dialog>
    `,
    styles: [``],
})
export class ProfileComponent implements OnInit {
    currentUser: any;

    constructor(public activeModal: NgbActiveModal, private tokenStorageService: SessionService) {
    }

    ngOnInit(): void {
        this.currentUser = this.tokenStorageService.getUser();
    }
}
